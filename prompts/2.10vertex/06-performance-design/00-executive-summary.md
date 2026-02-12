# 命题6：性能设计 — 执行摘要

> **最后更新**: 2026-02-13
> **总体进度**: 索引优化 + 缓存层 + 连接池加固 + 批量写入保护 + CircuitBreaker + 输入校验常量 + Docker 依赖完善 **全部完成**, R1-R6 审计修复 **已完成**

---

## 实施完成状态

### 完成度总览

| 模块 | 状态 | 说明 |
|------|------|------|
| 25+ 覆盖索引 (034) | **已完成** | 全文搜索 GIN + 游标分页 + 7 维统计 + 知识图谱等 |
| CacheService (Redis Cache-Aside) | **已完成** | fail-open 模式, 5 类 TTL, SHA-256 参数哈希 |
| 6 处冗余 overview 缓存失效移除 | **已完成** | articles 写操作仅 invalidate "statistics", 移除多余 "overview" |
| 连接池加固 | **已完成** | min_connections(1) + idle_timeout(600s) + max_lifetime(1800s) |
| 批量 upsert 限制 | **已完成** | UPSERT_BATCH_SIZE = 500, 防止 PG $65535 参数溢出 |
| CircuitBreaker | **已完成** | 通用断路器实现 (law-eye-common), AI gateway 集成 |
| 输入校验常量 (reports/templates) | **已完成** | title/content 非空, 内置模板保护 |
| Docker: worker->browserless 依赖 | **已完成** | worker service 添加 browserless 健康检查依赖 |
| Docker: 环境变量完整性 | **已完成** | BROWSERLESS_URL/TIMEOUT_MS 等配置就绪 |

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
  - **Cache-Aside 模式**: `get` -> miss -> 查 DB -> `set`, **fail-open 语义**: Redis 连接失败时静默返回 None / 忽略写入, 业务不受影响
  - 缓存键规范: `cache:{tenant_id}:{resource}:{params_hash}` (SHA-256 参数哈希)
  - 预定义 TTL:
    - Articles 列表: 30s
    - Statistics 聚合: 5min
    - Knowledge Graph: 10min
    - Overview 概览: 2min
    - Categories: 10min
  - 失效方法: `invalidate(key)` + `invalidate_pattern(pattern)` + `invalidate_resource(tenant_id, resource)`
  - 基于 `deadpool-redis` 连接池, 可配置超时
  - **fail-open 日志**: 所有 Redis 故障均以 `warn!` 级别记录 (含 key/pattern 上下文), 不影响请求处理

- **统计 API 缓存集成**: `law-eye-api/src/routes/statistics/handlers.rs` 已使用 CacheService
- **AppState 注册**: `cache_service: Option<Arc<CacheService>>` 已在 state.rs 中注册

### 已交付: 冗余缓存失效清理

- **6 处冗余 overview 缓存失效已移除**: 文章写操作 (update/delete/restore/publish/archive/batch_update_status) 中的 `invalidate_resource(tenant_id, "statistics")` 调用已精简, 移除了不必要的 "overview" 重复失效
- 当前 articles.rs 中保留 6 处 `invalidate_resource(tenant_id, "statistics")` (一次性失效统计 + 概览缓存)

### 已交付: 连接池加固

- **min_connections(1)**: 保持最小连接数, 避免冷启动延迟
- **idle_timeout(Duration::from_secs(600))**: 10 分钟空闲超时, 释放长期不用的连接
- **max_lifetime(Duration::from_secs(1800))**: 30 分钟最大生命周期, 防止连接老化导致的各种 PG 状态问题
- 实现位置: `crates/law-eye-db/src/lib.rs`

### 已交付: 批量 upsert 限制

- **UPSERT_BATCH_SIZE = 500**: 防止单次 INSERT/ON CONFLICT 语句超过 PG $65535 参数上限
- 新增 `upsert_many_batch` 辅助方法: 自动将大批量拆分为 500 条一组的子批次
- 实现位置: `crates/law-eye-core/src/article/service.rs`

### 已交付: CircuitBreaker 断路器

- **通用 CircuitBreaker 实现** (`crates/law-eye-common/src/circuit_breaker.rs`):
  - `CircuitBreakerConfig`: failure_threshold / success_threshold / open_duration 可配置
  - `CircuitBreakerState`: Closed / Open / HalfOpen 三态
  - `CircuitBreakerCheck`: 调用前检查是否允许通过
  - 导出自 `crates/law-eye-common/src/lib.rs`
- **AI Gateway 集成** (`crates/law-eye-ai/src/gateway.rs`): AI 调用使用 CircuitBreaker 保护, 防止外部 API 故障级联

### 已交付: 输入校验常量 (reports/templates)

- 报告 API handler 中实施严格输入校验:
  - title 非空检查
  - 更新操作字段非空检查
  - 内置模板不可修改/删除保护
  - 导出前 content 非空检查 (`report.content != json!({})`)
- 实现位置: `crates/law-eye-api/src/routes/reports/handlers.rs`

### 已交付: Docker 配置完善

- **worker -> browserless 依赖**: docker-compose.yml 中 worker service 添加 `browserless: condition: service_healthy` (required: false), 确保报告 PDF 导出所需的 browserless 容器在 worker 启动前就绪
- **环境变量完整性**:
  - `LAW_EYE__BROWSERLESS__URL`: `http://browserless:3000`
  - `LAW_EYE__BROWSERLESS__TIMEOUT_MS`: `30000`
  - browserless profiles 扩展: `["crawler", "worker", "report"]`

### 新增/修改文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `crates/law-eye-db/migrations/034_index_optimization.sql` | 新增 | 25+ 索引迁移 |
| `crates/law-eye-common/src/cache.rs` | 新增 | CacheService 实现 (fail-open) |
| `crates/law-eye-common/src/circuit_breaker.rs` | 新增 | CircuitBreaker 通用断路器 |
| `crates/law-eye-common/src/lib.rs` | 修改 | 导出 cache + circuit_breaker 模块 |
| `crates/law-eye-ai/src/gateway.rs` | 修改 | AI Gateway 集成 CircuitBreaker |
| `crates/law-eye-db/src/lib.rs` | 修改 | 连接池加固 (min_connections/idle_timeout/max_lifetime) |
| `crates/law-eye-core/src/article/service.rs` | 修改 | UPSERT_BATCH_SIZE=500 分批逻辑 |
| `crates/law-eye-api/src/routes/statistics/handlers.rs` | 修改 | 集成缓存 |
| `crates/law-eye-api/src/routes/articles.rs` | 修改 | 6 处写操作缓存失效 (精简为仅 statistics) |
| `crates/law-eye-api/src/routes/reports/handlers.rs` | 修改 | 输入校验常量 |
| `crates/law-eye-api/src/state.rs` | 修改 | 注册 CacheService |
| `docker-compose.yml` | 修改 | worker->browserless 依赖 + 环境变量 |
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
| **Connection Pool** | **已加固** | **min_connections(1) + idle_timeout(600s) + max_lifetime(1800s)** |
| **CacheService** | **已实现** | **Redis Cache-Aside (fail-open), 5 类 TTL** |
| **CircuitBreaker** | **已实现** | **通用断路器, AI Gateway 已集成** |
| **25+ 覆盖索引** | **已创建** | **全维度覆盖** |
| **Batch upsert 保护** | **已实现** | **UPSERT_BATCH_SIZE=500** |

### 识别的关键性能缺陷

#### P0 -- 致命 (已修复)
1. **全文搜索无 GIN 索引** -> 每次搜索全表扫描
   - **已修复**: `034_index_optimization.sql` 创建表达式 GIN 索引
   - 影响: 搜索延迟从 O(n) 降至 O(log n)

#### P1 -- 严重 (已修复)
2. **缺少租户维度复合索引** -> 分页查询无法走索引
   - **已修复**: `034_index_optimization.sql` 新增 25+ 覆盖索引
3. **无 Redis 缓存层** -> 每次请求直达数据库
   - **已修复**: CacheService 实现 Cache-Aside 模式 (fail-open)
4. **统计查询无优化** -> 大表实时聚合延迟高
   - **已修复**: 统计 API 缓存 (TTL 5min) + 维度索引
5. **连接池参数未调优** -> 默认配置不适合生产
   - **已修复**: min_connections(1) + idle_timeout(600s) + max_lifetime(1800s)
6. **无查询超时控制 / 批量溢出** -> 大批量 upsert 可能触发 PG $65535 参数上限
   - **已修复**: UPSERT_BATCH_SIZE = 500 分批逻辑
7. **文章写操作无缓存失效** -> 修改后数据陈旧
   - **已修复**: 6 个写操作 handler 添加 `invalidate_resource`
8. **冗余缓存失效** -> 不必要的 overview 缓存失效调用
   - **已修复**: 精简为仅 invalidate "statistics"

#### P2 -- 中等 (已修复)
9. **外部 API 无断路器** -> AI 服务故障级联
   - **已修复**: CircuitBreaker 实现 + AI Gateway 集成

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

- [x] ~~Redis 缓存层 (Cache-Aside + fail-open)~~ **已完成**
- [x] ~~连接池参数调优~~ **已完成**
- [x] ~~批量 upsert 保护~~ **已完成**
- [x] ~~CircuitBreaker 断路器~~ **已完成**
- [x] ~~冗余缓存失效清理~~ **已完成**
- [x] ~~Docker worker->browserless 依赖~~ **已完成**
- [ ] Redis 缓存层集成测试
- [ ] 慢查询日志与告警
- [ ] 物化视图方案评估

### 审计修复记录 (2026-02-13 R1-R6)

| # | 问题 | 严重度 | 修复内容 | 文件 |
|---|------|--------|----------|------|
| 1 | 连接池缺少 idle_timeout / min_connections / max_lifetime | P1 | 添加 `min_connections(1)` + `idle_timeout(600s)` + `max_lifetime(1800s)` | `law-eye-db/src/lib.rs` |
| 2 | upsert_many 无批量大小限制 (PG $65535 参数上限) | P1 | 添加 `UPSERT_BATCH_SIZE = 500` 分批逻辑; 新增 `upsert_many_batch` 辅助方法 | `law-eye-core/src/article/service.rs` |
| 3 | 文章写操作无缓存失效 | P0 | 在 update/delete/restore/publish/archive/batch_update_status 添加 `invalidate_resource("statistics")` | `law-eye-api/src/routes/articles.rs` |
| 4 | 6 处冗余 overview 缓存失效 | P2 | 移除不必要的 "overview" 重复失效, 统一为 "statistics" | `law-eye-api/src/routes/articles.rs` |
| 5 | 外部 AI API 无断路器保护 | P2 | 实现 CircuitBreaker (common) + AI Gateway 集成 | `law-eye-common/src/circuit_breaker.rs`, `law-eye-ai/src/gateway.rs` |
| 6 | Docker worker 缺少 browserless 依赖 | P2 | worker depends_on 添加 browserless (required: false) + 环境变量 | `docker-compose.yml` |
| 7 | 报告输入缺少校验 | P2 | title/content 非空检查, 内置模板保护, 导出前内容检查 | `law-eye-api/src/routes/reports/handlers.rs` |
