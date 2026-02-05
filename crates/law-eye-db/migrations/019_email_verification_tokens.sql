-- 019_email_verification_tokens.sql
-- Email verification tokens (per-tenant, short-lived, single-use).

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Backwards-compat: treat pre-existing accounts as verified to avoid breaking deployments that
-- predate this feature.
UPDATE users
SET email_verified_at = created_at
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id UUID NOT NULL,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    requested_ip INET,
    requested_user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_tenant_user_active
    ON email_verification_tokens(tenant_id, user_id)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_tenant_prefix_active
    ON email_verification_tokens(tenant_id, token_prefix)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
    ON email_verification_tokens(expires_at);

-- RLS tenant isolation (deny-by-default when tenant context is missing)
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_verification_tokens_tenant_isolation ON email_verification_tokens;
CREATE POLICY email_verification_tokens_tenant_isolation
    ON email_verification_tokens
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

