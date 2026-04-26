-- Phase F.3 — Crawler run history for admin sources page.
-- Records each crawl attempt against a source with start/finish/status/articles_ingested/error.
SET search_path TO public;

CREATE TABLE IF NOT EXISTS source_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    job_id UUID,
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    trigger_kind TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'queued',
    articles_ingested INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT source_runs_status_check CHECK (status IN ('queued', 'running', 'success', 'fail', 'skipped')),
    CONSTRAINT source_runs_trigger_kind_check CHECK (trigger_kind IN ('manual', 'scheduled', 'retry'))
);

CREATE INDEX IF NOT EXISTS idx_source_runs_source_created
    ON source_runs (tenant_id, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_runs_tenant_status
    ON source_runs (tenant_id, status, created_at DESC);

ALTER TABLE source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS source_runs_tenant_isolation ON source_runs;
CREATE POLICY source_runs_tenant_isolation
    ON source_runs
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
