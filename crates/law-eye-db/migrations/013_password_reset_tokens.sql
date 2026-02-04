-- 013_password_reset_tokens.sql
-- Password reset tokens (per-tenant, short-lived, single-use).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    requested_ip INET,
    requested_user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_tenant_user_active
    ON password_reset_tokens(tenant_id, user_id)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_tenant_prefix_active
    ON password_reset_tokens(tenant_id, token_prefix)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON password_reset_tokens(expires_at);

-- RLS tenant isolation (deny-by-default when tenant context is missing)
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_tokens_tenant_isolation ON password_reset_tokens;
CREATE POLICY password_reset_tokens_tenant_isolation
    ON password_reset_tokens
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

