-- Migration 032: Comprehensive index optimization for enterprise-grade query performance
-- Addresses: full-text search, cursor pagination, statistics aggregations, tenant-scoped lookups
-- Analysis: covers all query patterns in ArticleService, StatisticsService, KnowledgeService

-- =============================================================================
-- 1. CRITICAL: GIN expression index for full-text search (to_tsvector)
-- Without this, every search query triggers a full sequential scan.
-- Expression index approach: no schema change, matches query expressions exactly.
-- The expression MUST match queries in ArticleService::search* methods.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_articles_search_fts
    ON articles USING gin (
        to_tsvector('simple', title || ' ' || COALESCE(content, ''))
    )
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 2. Cursor pagination indexes (tenant-scoped, DESC for latest-first)
-- Used by: list_filtered_cursor, list_recent, default listing
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_articles_tenant_cursor
    ON articles (tenant_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_tenant_published_cursor
    ON articles (tenant_id, status, published_at DESC NULLS LAST, id DESC)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 3. Statistics query indexes (dimension-specific for aggregation performance)
-- Used by: StatisticsService regional/industry/importance/authority/issuer/timeline
-- =============================================================================

-- Regional distribution
CREATE INDEX IF NOT EXISTS idx_articles_tenant_region
    ON articles (tenant_id, region_code)
    WHERE region_code IS NOT NULL AND deleted_at IS NULL;

-- Industry distribution (domain_root)
CREATE INDEX IF NOT EXISTS idx_articles_tenant_domain_root
    ON articles (tenant_id, domain_root)
    WHERE domain_root IS NOT NULL AND deleted_at IS NULL;

-- Importance distribution
CREATE INDEX IF NOT EXISTS idx_articles_tenant_importance
    ON articles (tenant_id, importance)
    WHERE importance IS NOT NULL AND deleted_at IS NULL;

-- Authority level distribution
CREATE INDEX IF NOT EXISTS idx_articles_tenant_authority
    ON articles (tenant_id, authority_level)
    WHERE authority_level IS NOT NULL AND deleted_at IS NULL;

-- Issuer distribution
CREATE INDEX IF NOT EXISTS idx_articles_tenant_issuer
    ON articles (tenant_id, issuer)
    WHERE issuer IS NOT NULL AND deleted_at IS NULL;

-- Timeline queries (cross-dimensional with time)
CREATE INDEX IF NOT EXISTS idx_articles_tenant_created_at
    ON articles (tenant_id, created_at)
    WHERE deleted_at IS NULL;

-- Effective date range queries (legal document effective date)
CREATE INDEX IF NOT EXISTS idx_articles_tenant_effective_date
    ON articles (tenant_id, effective_date)
    WHERE effective_date IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- 4. Category-scoped queries (replace non-tenant-scoped legacy index)
-- =============================================================================

-- Drop the old non-tenant-scoped category index if it exists
DROP INDEX IF EXISTS idx_articles_category;

CREATE INDEX IF NOT EXISTS idx_articles_tenant_category
    ON articles (tenant_id, category_id)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 5. Knowledge graph indexes (entity lookups and relation traversal)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_entities_tenant_type
    ON entities (tenant_id, entity_type)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entities_tenant_name
    ON entities (tenant_id, name)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entity_relations_tenant_source
    ON entity_relations (tenant_id, source_entity_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entity_relations_tenant_target
    ON entity_relations (tenant_id, target_entity_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_article_entities_tenant_article
    ON article_entities (tenant_id, article_id);

CREATE INDEX IF NOT EXISTS idx_article_entities_tenant_entity
    ON article_entities (tenant_id, entity_id);

-- =============================================================================
-- 6. Source health monitoring indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_sources_tenant_active_schedule
    ON sources (tenant_id, is_active, next_crawl_at NULLS FIRST)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 7. Audit log indexes for compliance queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
    ON audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_user_action
    ON audit_logs (tenant_id, user_id, action);

-- =============================================================================
-- 8. Crawl log indexes for monitoring dashboard
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_crawl_logs_tenant_source_started
    ON crawl_logs (tenant_id, source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_tenant_status
    ON crawl_logs (tenant_id, status, started_at DESC);

-- =============================================================================
-- 9. User and auth indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_email
    ON users (tenant_id, email)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user
    ON user_roles (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_active
    ON api_keys (tenant_id, is_active, expires_at)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 10. Content deduplication index (content_hash)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_articles_tenant_content_hash
    ON articles (tenant_id, content_hash)
    WHERE content_hash IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- 11. Feedback and domain event indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_article
    ON feedbacks (tenant_id, article_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_aggregate
    ON domain_events (tenant_id, aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_created
    ON domain_events (tenant_id, created_at DESC);

-- =============================================================================
-- 12. Webhook and push subscription indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_active
    ON webhook_endpoints (tenant_id, is_active)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_tenant_user
    ON web_push_subscriptions (tenant_id, user_id);
