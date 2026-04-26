-- 074_tenant_exports.sql
-- Phase F.7: super-admin async tenant export job tracking table.
--
-- The /api/v1/super/tenants/{id}/export handler INSERTs a row here with
-- status='queued', then enqueues ExportTenantTask { export_id = id, ... }
-- onto queue:tenant_export. The worker (Task #38) UPDATEs this row through
-- queued → running → completed / failed, writing download_url / size_bytes
-- on success or error_message on failure.

SET search_path TO public;

CREATE TABLE IF NOT EXISTS tenant_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','completed','failed')),
    job_id UUID,
    download_url TEXT,
    size_bytes BIGINT,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_exports_tenant_status
    ON tenant_exports (tenant_id, status, created_at DESC);

ALTER TABLE tenant_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_exports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_exports_isolation ON tenant_exports;
CREATE POLICY tenant_exports_isolation ON tenant_exports
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
