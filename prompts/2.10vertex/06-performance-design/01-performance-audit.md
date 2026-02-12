# 性能审计报告 — 现状分析

## 1. 概述

本报告审计 LawSaw 平台当前的性能基础设施，识别瓶颈与优化机会。

**审计范围**: Redis 连接池、PostgreSQL 连接池、数据库索引、缓存策略、API 中间件链。

---

## 2. Redis 现状

### 2.1 连接池分布

当前 Redis 连接池存在 **多实例冗余** 问题:

| 位置 | 连接池类型 | 用途 | 问题 |
|------|-----------|------|------|
| `law-eye-queue/TaskQueue` | deadpool-redis | 消息队列 | 独立池 |
| `rate_limit.rs` | deadpool-redis | API 限流 | **每个 RateLimitLayer 创建独立池** |
| `tower-sessions-redis-store` | fred client | 会话存储 | 独立客户端 |

**问题**: 限流模块 `redis_pool_from_env()` 在每次 `RateLimitLayer::new()` 调用时创建独立 Redis 池。API 调用 `RateLimitLayer::api()` 等 5 种限流策略，可能产生 5 个独立 Redis 连接池。

### 2.2 缓存策略

**现状**: 无应用层缓存。所有 API 请求直接命中 PostgreSQL。

已有的 HTTP 缓存仅限于:
- `Cache-Control: private, max-age=30, must-revalidate` (由 `apply_conditional_cache_headers` 中间件添加)
- 基于 Content-Length 的弱 ETag (无法感知数据变更)

### 2.3 超时配置

```
pool_wait_timeout:    2,000ms (默认)
pool_create_timeout:  2,000ms (默认)
pool_recycle_timeout: 2,000ms (默认)
```

## 3. PostgreSQL 现状

### 3.1 连接池配置

```toml
[database]
max_connections = 10  # 默认值
```

- 生产环境推荐: `(CPU * 2) + 有效磁盘数` ≈ 20-50
- 当前值偏保守，适合开发环境

### 3.2 索引审计

**已有索引** (articles 表):

| 索引名 | 列 | 条件 | 覆盖查询 |
|--------|-----|------|---------|
| idx_articles_category | category_id | - | 分类过滤 |
| idx_articles_status | status | - | 状态过滤 |
| idx_articles_published | published_at DESC | - | 发布时间排序 |
| idx_articles_created | created_at DESC | - | 创建时间排序 |
| idx_articles_source | source_id | - | 来源过滤 |
| idx_articles_tenant_id | tenant_id | - | 租户过滤 |
| idx_articles_tenant_deleted_at | tenant_id, deleted_at | - | 软删除过滤 |
| idx_articles_content_hash | tenant_id, content_hash | deleted_at IS NULL | 去重 |
| idx_articles_domain | tenant_id, domain_root, domain_sub | deleted_at IS NULL | 领域过滤 |
| idx_articles_authority | tenant_id, authority_level | authority IS NOT NULL | 效力层级 |
| idx_articles_region | tenant_id, region_code | region IS NOT NULL | 地区过滤 |

**缺失索引** (statistics 查询需要):

Statistics 聚合查询模式: `WHERE tenant_id = $1 AND deleted_at IS NULL AND {dim} IS NOT NULL AND created_at >= $2 AND created_at < $3 GROUP BY {dim}`

现有索引不覆盖 `created_at` 日期范围过滤 + 维度分组的复合查询，导致:
- 需要 Index Scan + Filter 而非纯 Index Only Scan
- 日期范围过滤在扫描后才执行 (row filtering)

**需要补充的复合索引**:
- `(tenant_id, created_at DESC, region_code)` WHERE deleted_at IS NULL AND region_code IS NOT NULL
- `(tenant_id, created_at DESC, domain_root)` WHERE deleted_at IS NULL AND domain_root IS NOT NULL
- `(tenant_id, created_at DESC, importance)` WHERE deleted_at IS NULL AND importance IS NOT NULL
- `(tenant_id, created_at DESC, authority_level)` WHERE deleted_at IS NULL AND authority_level IS NOT NULL
- `(tenant_id, created_at DESC, issuer)` WHERE deleted_at IS NULL AND issuer IS NOT NULL
- `(tenant_id, created_at DESC, risk_score)` WHERE deleted_at IS NULL AND risk_score IS NOT NULL
- `(tenant_id, created_at DESC, sentiment)` WHERE deleted_at IS NULL AND sentiment IS NOT NULL

## 4. API 性能链路分析

请求路径: Client -> CORS -> Security Headers -> Request ID -> Trace -> Auth -> CSRF -> Idempotency -> Rate Limit -> Route Handler -> DB

**热点**:
- Statistics API: 8 个端点，每次请求执行 1-3 次 SQL 聚合查询
- Knowledge Graph: 复杂 JOIN 查询
- Articles 列表: 高频读取

## 5. 优化优先级

| 优先级 | 项目 | 预期收益 | 复杂度 |
|--------|------|---------|--------|
| P0 | Redis 缓存层 (statistics) | 消除 90%+ 重复 DB 查询 | 中 |
| P0 | Statistics 索引补全 | 聚合查询提速 5-10x | 低 |
| P1 | 连接池合并 | 减少 Redis 连接数 40% | 中 |
| P2 | PgPool 调优 | 提升并发吞吐量 | 低 |
