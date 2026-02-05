-- 021_idempotency_keys.sql
-- API idempotency keys (Idempotency-Key header).
--
-- Motivation: clients (and proxies) can retry POST/PATCH/DELETE requests; without an idempotency
-- key, the API may execute side-effects multiple times (double enqueue / double create).

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    scope TEXT NOT NULL,
    idem_key TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    request_hash BYTEA NOT NULL,
    response_status INT,
    response_content_type TEXT,
    response_body BYTEA,
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE idempotency_keys
    ADD CONSTRAINT idempotency_keys_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE TRIGGER update_idempotency_keys_updated_at
    BEFORE UPDATE ON idempotency_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique
    ON idempotency_keys(tenant_id, scope, idem_key);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
    ON idempotency_keys(tenant_id, expires_at);

-- RLS tenant isolation (deny-by-default when tenant context is missing)
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys;
CREATE POLICY idempotency_keys_tenant_isolation
    ON idempotency_keys
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
