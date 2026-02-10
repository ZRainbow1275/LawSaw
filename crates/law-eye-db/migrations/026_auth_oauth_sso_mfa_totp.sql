-- 026_auth_oauth_sso_mfa_totp.sql
-- Minimal OAuth/SSO + MFA(TOTP) backend primitives.

CREATE TABLE IF NOT EXISTS oauth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_email TEXT NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oauth_identities
    ADD CONSTRAINT oauth_identities_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE oauth_identities
    ADD CONSTRAINT oauth_identities_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE oauth_identities
    ADD CONSTRAINT oauth_identities_provider_format_check
    CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identities_provider_subject_unique
    ON oauth_identities(tenant_id, provider, provider_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identities_user_provider_unique
    ON oauth_identities(tenant_id, user_id, provider);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_provider_email
    ON oauth_identities(tenant_id, lower(provider_email));

ALTER TABLE oauth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_identities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_identities_tenant_isolation ON oauth_identities;
CREATE POLICY oauth_identities_tenant_isolation
    ON oauth_identities
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS oauth_state_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    provider TEXT NOT NULL,
    state_hash TEXT NOT NULL,
    state_prefix TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oauth_state_tokens
    ADD CONSTRAINT oauth_state_tokens_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE oauth_state_tokens
    ADD CONSTRAINT oauth_state_tokens_provider_format_check
    CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$');

ALTER TABLE oauth_state_tokens
    ADD CONSTRAINT oauth_state_tokens_state_prefix_check
    CHECK (char_length(state_prefix) >= 8);

CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_active_lookup
    ON oauth_state_tokens(tenant_id, provider, state_prefix)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_state_tokens_expires_at
    ON oauth_state_tokens(expires_at);

ALTER TABLE oauth_state_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_state_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_state_tokens_tenant_isolation ON oauth_state_tokens;
CREATE POLICY oauth_state_tokens_tenant_isolation
    ON oauth_state_tokens
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS user_mfa_totp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id UUID NOT NULL,
    issuer TEXT NOT NULL DEFAULT 'LawSaw',
    secret_ciphertext TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_mfa_totp
    ADD CONSTRAINT user_mfa_totp_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE user_mfa_totp
    ADD CONSTRAINT user_mfa_totp_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mfa_totp_tenant_user_unique
    ON user_mfa_totp(tenant_id, user_id);

CREATE TRIGGER update_user_mfa_totp_updated_at
    BEFORE UPDATE ON user_mfa_totp
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_mfa_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa_totp FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_mfa_totp_tenant_isolation ON user_mfa_totp;
CREATE POLICY user_mfa_totp_tenant_isolation
    ON user_mfa_totp
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS mfa_login_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id UUID NOT NULL,
    challenge_hash TEXT NOT NULL,
    challenge_prefix TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mfa_login_challenges
    ADD CONSTRAINT mfa_login_challenges_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE mfa_login_challenges
    ADD CONSTRAINT mfa_login_challenges_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE mfa_login_challenges
    ADD CONSTRAINT mfa_login_challenges_prefix_check
    CHECK (char_length(challenge_prefix) >= 8);

CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_active_by_user
    ON mfa_login_challenges(tenant_id, user_id)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_active_lookup
    ON mfa_login_challenges(tenant_id, challenge_prefix)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_expires_at
    ON mfa_login_challenges(expires_at);

ALTER TABLE mfa_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_login_challenges FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfa_login_challenges_tenant_isolation ON mfa_login_challenges;
CREATE POLICY mfa_login_challenges_tenant_isolation
    ON mfa_login_challenges
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
