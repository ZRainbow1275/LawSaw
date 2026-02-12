-- 030_crawler_enhancement.sql
-- Crawler enhancement: legal domain fields for articles, monitoring fields for sources,
-- crawl_logs table for observability.
--
-- Goals:
-- - Add law-specific metadata fields to articles (domain classification, issuer, etc.)
-- - Add source health monitoring fields (consecutive_failures, render_mode, encoding)
-- - Create crawl_logs table to track per-crawl statistics
-- - Add performance indexes for new query patterns
--
-- Safety:
-- - All ALTER TABLE uses IF NOT EXISTS to be idempotent
-- - No data migration required (all new columns are nullable or have defaults)
-- - No existing constraint/index modifications

-- =============================================================================
-- 1. Enhance articles table: legal domain metadata
-- =============================================================================

-- Legal domain classification (eight major domains)
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS domain_root TEXT;
COMMENT ON COLUMN articles.domain_root IS 'Primary legal domain: legislation, regulation, enforcement, industry, compliance, technology, academic, international';

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS domain_sub TEXT;
COMMENT ON COLUMN articles.domain_sub IS 'Secondary domain classification within domain_root';

-- Legal authority and origin
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS authority_level INT CHECK (authority_level BETWEEN 1 AND 10);
COMMENT ON COLUMN articles.authority_level IS 'Legal authority hierarchy: 1=Constitution, 2=NPC Law, 3=State Council Regulation, ..., 10=Informal';

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS issuer TEXT;
COMMENT ON COLUMN articles.issuer IS 'Publishing authority name, e.g. 国务院, 最高人民法院, 中国证监会';

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS doc_number TEXT;
COMMENT ON COLUMN articles.doc_number IS 'Official document number, e.g. 国发〔2026〕1号';

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS effective_date DATE;
COMMENT ON COLUMN articles.effective_date IS 'Date when the legal document takes effect';

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS region_code TEXT;
COMMENT ON COLUMN articles.region_code IS 'Administrative region code (GB/T 2260), e.g. 110000 for Beijing';

-- Content deduplication hash
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS content_hash TEXT;
COMMENT ON COLUMN articles.content_hash IS 'SHA-256 hash of cleaned content for deduplication';

-- Structured AI summary (fact/core/impact)
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS summary_struct JSONB;
COMMENT ON COLUMN articles.summary_struct IS 'Structured summary: {"fact":"...", "core":"...", "impact":"..."}';

-- External reference ID (e.g. original database ID from source)
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS source_ref TEXT;
COMMENT ON COLUMN articles.source_ref IS 'External reference ID from original data source';

-- =============================================================================
-- 2. Enhance sources table: health monitoring and rendering config
-- =============================================================================

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown'));
COMMENT ON COLUMN sources.health_status IS 'Source health: healthy (3+ consecutive successes), degraded (1-2 failures), unhealthy (3+ failures), unknown (never fetched)';

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN sources.consecutive_failures IS 'Number of consecutive fetch failures; reset to 0 on success';

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS total_articles_fetched BIGINT NOT NULL DEFAULT 0;
COMMENT ON COLUMN sources.total_articles_fetched IS 'Lifetime count of articles successfully fetched from this source';

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS avg_fetch_duration_ms INT;
COMMENT ON COLUMN sources.avg_fetch_duration_ms IS 'Exponential moving average of fetch duration in milliseconds';

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS render_mode TEXT NOT NULL DEFAULT 'static'
        CHECK (render_mode IN ('static', 'dynamic'));
COMMENT ON COLUMN sources.render_mode IS 'Page rendering mode: static (reqwest) or dynamic (headless browser)';

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS encoding TEXT;
COMMENT ON COLUMN sources.encoding IS 'Expected character encoding override (e.g. gbk, gb2312); NULL = auto-detect';

-- =============================================================================
-- 3. Create crawl_logs table (per-crawl execution record)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crawl_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'partial', 'failed')),
    articles_found INT NOT NULL DEFAULT 0,
    articles_new INT NOT NULL DEFAULT 0,
    articles_updated INT NOT NULL DEFAULT 0,
    articles_skipped INT NOT NULL DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce tenant-source coherence
    CONSTRAINT crawl_logs_source_tenant_fkey
        FOREIGN KEY (tenant_id, source_id)
        REFERENCES sources(tenant_id, id)
        ON DELETE CASCADE
);

COMMENT ON TABLE crawl_logs IS 'Per-crawl execution log with statistics for observability';

-- RLS for crawl_logs
ALTER TABLE crawl_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY crawl_logs_tenant_isolation
    ON crawl_logs
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- =============================================================================
-- 4. Indexes for new query patterns
-- =============================================================================

-- Crawl logs: recent logs per source
CREATE INDEX IF NOT EXISTS idx_crawl_logs_source_started
    ON crawl_logs(tenant_id, source_id, started_at DESC);

-- Crawl logs: failed crawls for alerting
CREATE INDEX IF NOT EXISTS idx_crawl_logs_failed
    ON crawl_logs(tenant_id, status)
    WHERE status IN ('failed', 'partial');

-- Articles: content deduplication lookup
CREATE INDEX IF NOT EXISTS idx_articles_content_hash
    ON articles(tenant_id, content_hash)
    WHERE content_hash IS NOT NULL AND deleted_at IS NULL;

-- Articles: legal domain filtering
CREATE INDEX IF NOT EXISTS idx_articles_domain
    ON articles(tenant_id, domain_root, domain_sub)
    WHERE deleted_at IS NULL;

-- Articles: authority level queries
CREATE INDEX IF NOT EXISTS idx_articles_authority
    ON articles(tenant_id, authority_level)
    WHERE authority_level IS NOT NULL AND deleted_at IS NULL;

-- Articles: regional filtering
CREATE INDEX IF NOT EXISTS idx_articles_region
    ON articles(tenant_id, region_code)
    WHERE region_code IS NOT NULL AND deleted_at IS NULL;

-- Articles: effective date range queries
CREATE INDEX IF NOT EXISTS idx_articles_effective_date
    ON articles(tenant_id, effective_date DESC)
    WHERE effective_date IS NOT NULL AND deleted_at IS NULL;

-- Sources: health status monitoring
CREATE INDEX IF NOT EXISTS idx_sources_health
    ON sources(tenant_id, health_status)
    WHERE deleted_at IS NULL;

-- Sources: render mode for worker dispatching
CREATE INDEX IF NOT EXISTS idx_sources_render_mode
    ON sources(tenant_id, render_mode)
    WHERE is_active = true AND deleted_at IS NULL;
