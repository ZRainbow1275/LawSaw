-- 072_article_reads.sql
-- Phase E.6: track per-user article reading for personalization.
--
-- Notes:
--   * Same-day duplicate reads are merged via the unique key on
--     (tenant_id, user_id, article_id, day) so the application layer can
--     issue an UPSERT that keeps max(dwell_ms), max(scroll_pct) and OR(finished).
--   * RLS: tenant_id-scoped, mirrors articles/feedbacks pattern.
--   * No partition strategy yet (the table is expected to stay <100M rows for
--     the MVP horizon); we revisit when row counts exceed that threshold.

CREATE TABLE IF NOT EXISTS article_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    article_id UUID NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_day DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::date,
    dwell_ms INTEGER NOT NULL DEFAULT 0 CHECK (dwell_ms >= 0),
    scroll_pct INTEGER NOT NULL DEFAULT 0 CHECK (scroll_pct BETWEEN 0 AND 100),
    finished BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT article_reads_user_fkey
        FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT article_reads_article_fkey
        FOREIGN KEY (tenant_id, article_id) REFERENCES articles(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT article_reads_user_article_day_unique
        UNIQUE (tenant_id, user_id, article_id, read_day)
);

ALTER TABLE article_reads
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;

CREATE INDEX IF NOT EXISTS idx_article_reads_user_finished_recent
    ON article_reads (tenant_id, user_id, read_at DESC)
    WHERE finished = true;

CREATE INDEX IF NOT EXISTS idx_article_reads_article
    ON article_reads (tenant_id, article_id);

-- Row-level security: scope every read/write to the tenant.
ALTER TABLE article_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_reads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS article_reads_tenant_isolation ON article_reads;
CREATE POLICY article_reads_tenant_isolation
    ON article_reads
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
