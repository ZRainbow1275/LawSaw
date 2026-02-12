# 命题6：性能设计 — 执行摘要

> **最后更新**: 2026-02-13
> **总体进度**: 索引优化 + 缓存层 **已完成**, 第二轮审计修复 **已完成**

---

## 实施完成状态

### 已交付: Migration 034 -- 综合索引优化

- **034_index_optimization.sql** -- 已创建并就绪 (注: 迁移编号从原计划的 032 调整为 034, 避免与 RLS 迁移冲突)
- **删除了冲突文件**: 原 `034_statistics_indexes.sql` 与 `034_index_optimization.sql` 内容重叠, 已删除前者保留后者
- **25+ 个精准覆盖索引**, 按功能分组:
  1. **全文搜索 GIN 索引** (P0): `idx_articles_search_fts` -- 表达式 GIN 索引, 匹配 `to_tsvector('simple', title || ' ' || COALESCE(content, ''))` 查询, 条件 `deleted_at IS NULL`
  2. **游标分页索引**: `idx_articles_tenant_cursor` (tenant_id, created_at DESC, id DESC) + `idx_articles_tenant_published_cursor` (tenant_id, status, published_at DESC)
  3. **统计维度索引** (7 维): region_code / domain_root / importance / authority_level / issuer / created_at / effective_date -- 全部含 tenant_id 前缀 + WHERE 条件过滤
  4. **知识图谱索引**: entities (type, name) + entity_relations (source, target) + article_entities (article, entity) -- 6 个索引
  5. **审计日志索引**: (tenant_id, created_at DESC) + (tenant_id, user_id, action)
  6. **爬虫日志索引**: (tenant_id, source_id, started_at DESC) + (tenant_id, status, started_at DESC)
  7. **认证索引**: users (email) + user_roles (user) + api_keys (active, expires_at)
  8. **去重索引**: articles (content_hash) -- 租户级唯一性
  9. **分类索引**: articles (category_id) -- 替换旧的非租户索引
  10. **源监控索引**: sources (is_active, next_crawl_at)
  11. **Webhook/推送索引**: webhook_endpoints (is_active) + web_push_subscriptions (user_id)
  12. **反馈/事件索引**: feedbacks (article_id) + domain_events (aggregate_type, created_at)

### 已交付: CacheService (Redis 缓存层)

- **CacheService** (`crates/law-eye-common/src/cache.rs`) -- 已实现
  - Cache-Aside 模式: `get` -> miss -> 查 DB -> `set`
  - 缓存键规范: `cache:{tenant_id}:{resource}:{params_hash}` (SHA-256 参数哈希)
  - 预定义 TTL:
    - Articles 列表: 30s
    - Statistics 聚合: 5min
    - Knowledge Graph: 10min
    - Overview 概览: 2min
    - Categories: 10min
  - 失效方法: `invalidate(key)` + `invalidate_pattern(pattern)`
  - 基于 `deadpool-redis` 连接池, 可配置超时

- **统计 API 缓存集成**: `law-eye-api/src/routes/statistics/handlers.rs` 已使用 CacheService
- **AppState 注册**: `cache_service: Option<Arc<CacheService>>` 已在 state.rs 中注册

### 新增/修改文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `crates/law-eye-db/migrations/034_index_optimization.sql` | 新增 | 25+ 索引迁移 |
| `crates/law-eye-common/src/cache.rs` | 新增 | CacheService 实现 |
| `crates/law-eye-api/src/routes/statistics/handlers.rs` | 修改 | 集成缓存 |
| `crates/law-eye-api/src/state.rs` | 修改 | 注册 CacheService |
| ~~`crates/law-eye-db/migrations/034_statistics_indexes.sql`~~ | 删除 | 与 034_index_optimization.sql 冲突, 已移除 |

---

## 现状评估

### 已有基础设施
| 组件 | 状态 | 评价 |
|------|------|------|
| PostgreSQL + pgvector | 已部署 | SCRAM 认证、TDE 就绪 |
| Redis | 已部署 | AOF 持久化、端口 6380 |
| Prometheus 指标 | 已集成 | `http_requests_total`, `http_request_duration_seconds` |
| ETag + Cache-Control | 已实现 | 弱 ETag、条件请求、304 |
| Rate Limiting | 已实现 | 基于 IP 的 API 限流 |
| Connection Pool | sqlx PgPool | 已配置但未调优 |
| **CacheService** | **已实现** | **Redis Cache-Aside, 5 类 TTL** |
| **25+ 覆盖索引** | **已创建** | **全维度覆盖** |

### 识别的关键性能缺陷

#### P0 -- 致命 (已修复)
1. **全文搜索无 GIN 索引** -> 每次搜索全表扫描
   - **已修复**: `034_index_optimization.sql` 创建表达式 GIN 索引
   - 影响: 搜索延迟从 O(n) 降至 O(log n)

#### P1 -- 严重 (已修复)
2. **缺少租户维度复合索引** -> 分页查询无法走索引
   - **已修复**: `034_index_optimization.sql` 新增 25+ 覆盖索引
3. **无 Redis 缓存层** -> 每次请求直达数据库
   - **已修复**: CacheService 实现 Cache-Aside 模式
4. **统计查询无优化** -> 大表实时聚合延迟高
   - **已修复**: 统计 API 缓存 (TTL 5min) + 维度索引

#### P2 -- 中等
5. **连接池参数未调优** -> 默认配置不适合生产
6. **无查询超时控制** -> 慢查询可拖垮连接池
7. **无数据库连接健康检查** -> 僵尸连接占用资源

## 性能目标 (SLA)

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 列表 API p95 | < 100ms | Prometheus histogram |
| 搜索 API p95 | < 200ms | Prometheus histogram |
| 统计 API p95 | < 500ms | Prometheus histogram |
| 连接池利用率 | < 80% | PgPool metrics |
| Redis 命中率 | > 85% | Redis INFO stats |
| 全文搜索性能 | 50K+ 文章 < 100ms | EXPLAIN ANALYZE |

## 待办项

- [ ] Redis 缓存层集成测试
- [ ] 连接池参数调优 (基于负载测试)
- [ ] 慢查询日志与告警
- [ ] 物化视图方案评估

### 审计修复记录 (2026-02-13 第二轮)

| 问题 | 严重度 | 修复内容 | 文件 |
|------|--------|----------|------|
| 连接池缺少 idle_timeout / min_connections / max_lifetime | P1 | 添加 `min_connections(1)` + `idle_timeout(600s)` + `max_lifetime(1800s)` | `law-eye-db/src/lib.rs` |
| upsert_many 无批量大小限制 (PG $65535 参数上限) | P1 | 添加 `UPSERT_BATCH_SIZE = 500` 分批逻辑; 新增 `upsert_many_batch` 辅助方法 | `law-eye-core/src/article/service.rs` |
| 文章写操作无缓存失效 | P0 | 在 update/delete/restore/publish/archive/batch_update_status 添加 `invalidate_resource("statistics"/"overview")` | `law-eye-api/src/routes/articles.rs` |
