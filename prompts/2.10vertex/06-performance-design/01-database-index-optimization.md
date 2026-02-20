# 数据库索引优化设计文档

## 1. 背景

ArticleService 是系统核心数据访问层，提供列表、搜索、统计等 20+ 个查询方法。在初始迁移（001）和后续迁移（030）中已创建了部分索引，但随着业务演进，大量查询模式缺乏索引支持。

## 2. 现有索引审计

### 初始迁移 (001_initial.sql) 中的索引
| 索引名 | 列 | 类型 |
|--------|-----|------|
| idx_articles_category | category_id | B-tree |
| idx_articles_status | status | B-tree |
| idx_articles_published | published_at DESC | B-tree |
| idx_articles_created | created_at DESC | B-tree |
| idx_articles_source | source_id | B-tree |
| idx_sources_active | is_active | B-tree |

### 爬虫迁移 (030_crawler_enhancement.sql) 中的索引
| 索引名 | 列 | 类型 |
|--------|-----|------|
| idx_articles_domain_root | domain_root | B-tree |
| idx_articles_authority_level | authority_level | B-tree |
| idx_articles_region_code | region_code | B-tree |
| idx_articles_effective_date | effective_date | B-tree |
| idx_articles_content_hash | content_hash | B-tree |
| idx_sources_health_status | health_status | B-tree |
| idx_sources_render_mode | render_mode | B-tree |

### 问题分析

1. **所有索引都是单列索引** — 不适合多条件 WHERE + ORDER BY 查询
2. **没有租户维度前缀** — RLS 过滤 tenant_id 后无法利用索引
3. **没有部分索引 (WHERE deleted_at IS NULL)** — 软删除记录也被索引
4. **没有全文搜索索引** — 最关键的缺陷

## 3. 查询模式分析

### ArticleService 查询模式

| 方法 | 关键 WHERE | ORDER BY | 需要的索引 |
|------|-----------|----------|-----------|
| `list` | deleted_at IS NULL | created_at DESC | (tenant_id, created_at DESC, id DESC) |
| `list_filtered_cursor` | status, category_id, deleted_at | created_at DESC, id DESC | (tenant_id, status, published_at DESC, id DESC) |
| `search` | FTS @@ | created_at DESC | GIN(to_tsvector(...)) |
| `search_ranked` | FTS @@ | rank DESC | GIN(to_tsvector(...)) |
| `list_by_category` | category_id, deleted_at | created_at DESC | (tenant_id, category_id) |
| `exists_by_link` | link, deleted_at | — | (tenant_id, link) 已有 unique |

### StatisticsService 查询模式

| 方法 | GROUP BY | WHERE | 需要的索引 |
|------|----------|-------|-----------|
| `regional_distribution` | region_code | region_code IS NOT NULL | (tenant_id, region_code) |
| `industry_distribution` | domain_root | domain_root IS NOT NULL | (tenant_id, domain_root) |
| `importance_distribution` | importance | importance IS NOT NULL | (tenant_id, importance) |
| `authority_distribution` | authority_level | authority_level IS NOT NULL | (tenant_id, authority_level) |
| `issuer_distribution` | issuer | issuer IS NOT NULL | (tenant_id, issuer) |
| `timeline_by_dimension` | date_trunc(created_at) | time range | (tenant_id, created_at) |

## 4. 索引设计原则

1. **租户前缀原则**: 所有索引以 `tenant_id` 为第一列，确保 RLS 过滤能走索引
2. **部分索引原则**: 所有软删除表加 `WHERE deleted_at IS NULL` 条件
3. **覆盖排序原则**: 索引列顺序与 ORDER BY 一致，避免 filesort
4. **空值过滤原则**: 统计维度索引排除 NULL 值，减少索引大小

## 5. 实施方案

已在 `032_index_optimization.sql` 中实现 25+ 个精准覆盖索引：

### 全文搜索（最高优先级）
```sql
CREATE INDEX idx_articles_search_fts
    ON articles USING gin (
        to_tsvector('simple', title || ' ' || COALESCE(content, ''))
    )
    WHERE deleted_at IS NULL;
```
**注意**: 表达式必须与查询中的 `to_tsvector` 完全匹配才能被优化器识别。

### 游标分页
```sql
CREATE INDEX idx_articles_tenant_cursor
    ON articles (tenant_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
```

### 统计维度
每个统计维度一个部分索引，仅包含非 NULL 记录。

## 6. 预期性能提升

| 查询类型 | 优化前 | 优化后 | 提升 |
|----------|--------|--------|------|
| 全文搜索 (50K rows) | ~2000ms (Seq Scan) | ~20ms (GIN Scan) | 100x |
| 分页列表 (100K rows) | ~500ms (Sort + Filter) | ~5ms (Index Scan) | 100x |
| 统计聚合 (100K rows) | ~1000ms (Seq Scan + Agg) | ~50ms (Index Scan + Agg) | 20x |
| 知识图谱遍历 | ~200ms (Seq Scan) | ~10ms (Index Scan) | 20x |

## 7. 维护建议

1. **定期 VACUUM ANALYZE**: 确保索引统计信息准确
2. **监控索引使用率**: 通过 `pg_stat_user_indexes` 检查未使用的索引
3. **索引膨胀监控**: 通过 `pgstattuple` 检查索引膨胀率
4. **生产部署**: 建议在低峰期执行迁移，因为创建大型索引会锁表
