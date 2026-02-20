-- 041_fix_broken_indexes_and_session_tenants_update.sql
--
-- Fixes:
-- 1. Drop 5 indexes from 034 that reference non-existent or misnamed columns
--    and recreate corrected versions where possible.
-- 2. Add the missing UPDATE policy on session_tenants, required by
--    TenantService::bind_session_tenant (ON CONFLICT DO UPDATE).

-- =============================================================================
-- 1. Drop broken indexes from 034
-- =============================================================================

-- 034 line 112: sources.next_crawl_at does not exist
DROP INDEX IF EXISTS idx_sources_tenant_active_schedule;

-- 034 line 140: users has no deleted_at column
DROP INDEX IF EXISTS idx_users_tenant_email;

-- 034 line 147: api_keys has no deleted_at column
DROP INDEX IF EXISTS idx_api_keys_tenant_active;

-- 034 line 163: feedbacks has no article_id column
DROP INDEX IF EXISTS idx_feedbacks_tenant_article;

-- 034 line 177: webhook_endpoints uses "enabled" not "is_active", and has deleted_at
DROP INDEX IF EXISTS idx_webhook_endpoints_tenant_active;

-- =============================================================================
-- 2. Recreate corrected indexes
-- =============================================================================

-- Users email lookup (without deleted_at filter since users has no soft-delete)
CREATE INDEX IF NOT EXISTS idx_users_tenant_email
    ON users (tenant_id, email);

-- API keys active lookup (without deleted_at filter since api_keys has no soft-delete)
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_active
    ON api_keys (tenant_id, is_active, expires_at);

-- Sources active schedule (without next_crawl_at since it doesn't exist;
-- use last_fetch for scheduling priority)
CREATE INDEX IF NOT EXISTS idx_sources_tenant_active_schedule
    ON sources (tenant_id, is_active, last_fetch NULLS FIRST)
    WHERE deleted_at IS NULL;

-- Feedbacks by user (article_id doesn't exist; use user_id which is the
-- actual foreign key)
CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_user
    ON feedbacks (tenant_id, user_id)
    WHERE deleted_at IS NULL;

-- Webhook endpoints: correct column is "enabled", not "is_active"
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_enabled
    ON webhook_endpoints (tenant_id, enabled)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 3. Add missing session_tenants UPDATE policy
-- =============================================================================
-- bind_session_tenant uses: INSERT INTO session_tenants ... ON CONFLICT (session_id) DO UPDATE SET
-- Without an UPDATE policy, the ON CONFLICT DO UPDATE branch is silently blocked by RLS.

DROP POLICY IF EXISTS session_tenants_update_policy ON session_tenants;
CREATE POLICY session_tenants_update_policy
    ON session_tenants
    FOR UPDATE
    USING (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- =============================================================================
-- 4. Ensure permissions
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;
