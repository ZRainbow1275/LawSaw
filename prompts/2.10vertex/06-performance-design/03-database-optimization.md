# 数据库优化方案

## 1. 索引优化

### 1.1 新增索引 (migration 034)

为 statistics 聚合查询添加复合条件索引。所有索引使用 `CREATE INDEX CONCURRENTLY` 避免锁表。

| 索引名 | 列 | 条件过滤 | 覆盖查询 |
|--------|-----|---------|---------|
| idx_articles_stats_region | (tenant_id, created_at DESC, region_code) | deleted_at IS NULL AND region_code IS NOT NULL | 地区分布统计 |
| idx_articles_stats_domain | (tenant_id, created_at DESC, domain_root) | deleted_at IS NULL AND domain_root IS NOT NULL | 行业分布统计 |
| idx_articles_stats_domain_sub | (tenant_id, domain_root, domain_sub) | deleted_at IS NULL AND domain_root/sub IS NOT NULL | 子领域分布 |
| idx_articles_stats_importance | (tenant_id, created_at DESC, importance) | deleted_at IS NULL AND importance IS NOT NULL | 重要性分布 |
| idx_articles_stats_authority | (tenant_id, created_at DESC, authority_level) | deleted_at IS NULL AND authority_level IS NOT NULL | 效力层级分布 |
| idx_articles_stats_issuer | (tenant_id, created_at DESC, issuer) | deleted_at IS NULL AND issuer IS NOT NULL | 发文机关统计 |
| idx_articles_stats_risk | (tenant_id, created_at DESC, risk_score) | deleted_at IS NULL AND risk_score IS NOT NULL | 风险评分分析 |
| idx_articles_stats_sentiment | (tenant_id, created_at DESC, sentiment) | deleted_at IS NULL AND sentiment IS NOT NULL | 情感分析交叉查询 |

### 1.2 索引设计原则

- **三列复合索引**: `(tenant_id, created_at DESC, dimension)` — 先按租户隔离 (RLS)，再按时间范围过滤 (B-tree range scan)，最后按维度分组
- **条件索引 (partial index)**: `WHERE deleted_at IS NULL AND dim IS NOT NULL` — 减少索引体积，仅索引有效数据
- **CONCURRENTLY**: 避免在生产环境加锁

### 1.3 预期收益

以 10 万文章量估算:
- 原查询: Seq Scan + Filter → ~500ms
- 新索引: Index Scan (range) → ~10-50ms
- 加缓存: ~1ms (命中时)

## 2. 连接池优化

### 2.1 PostgreSQL 连接池建议

| 参数 | 当前值 | 建议值 (生产) | 说明 |
|------|--------|-------------|------|
| max_connections | 10 | 20-50 | 取决于 CPU 核数和并发量 |
| statement_cache_capacity | (sqlx 默认 100) | 保持 | sqlx 自动管理 |
| idle_timeout | (未配置) | 10min | 释放长期空闲连接 |

### 2.2 Redis 连接池建议

当前多处独立创建 Redis 池，建议:
1. 缓存服务独立池 (已实现)
2. 未来: 合并 RateLimitLayer 的 Redis 池到共享池

| 参数 | 当前值 | 建议值 | 说明 |
|------|--------|--------|------|
| pool_wait_timeout | 2,000ms | 1,000ms (缓存) | 缓存操作应快速失败 |
| pool_create_timeout | 2,000ms | 1,000ms (缓存) | 快速 fail-open |
| pool_recycle_timeout | 2,000ms | 1,000ms (缓存) | 快速回收检测 |

## 3. 查询优化建议

### 3.1 统计 Overview 查询

当前 overview 查询使用 6 个 `COUNT(*) FILTER (WHERE ...)` 在单次全表扫描中完成，这是已经优化过的模式。

### 3.2 Timeline 查询

当前使用 `generate_series` + `LEFT JOIN` 模式填充无数据的日期，此模式是标准最佳实践。

### 3.3 Cross-dimensional 查询

使用动态 SQL 拼接列名 (经过白名单验证)，注意:
- 列名白名单已在 `dimension_to_column` 中实现，防止 SQL 注入
- 建议添加 `LIMIT` 默认值 (已有 200 默认值)
