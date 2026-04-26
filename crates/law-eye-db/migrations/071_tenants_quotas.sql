-- 071_tenants_quotas.sql
-- Phase F.5: extend `tenants` for super-admin CRUD + quotas + status + feature flags.
--
-- Notes:
--   * `deleted_at` is added here (tenants table previously had no soft-delete column).
--   * Quota columns mirror the per-resource quotas already present in
--     `tenant_configs` for backwards compatibility, but are exposed at the
--     tenant level so the super-admin list view can show them without a join.
--   * `feature_flags` is JSONB for forward-compatibility with arbitrary
--     boolean flags (the four canonical flags still live in `tenant_configs`).
--   * `status` is one of: 'active', 'suspended', 'pending'. 'active' is the
--     default so existing tenants stay usable.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_status_check;

ALTER TABLE tenants
    ADD CONSTRAINT tenants_status_check
    CHECK (status IN ('active', 'suspended', 'pending'));

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS quota_users INTEGER NOT NULL DEFAULT 100;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS quota_storage_mb BIGINT NOT NULL DEFAULT 10240;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS quota_ai_tokens_monthly BIGINT NOT NULL DEFAULT 1000000;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tenants_status_live
    ON tenants(status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_slug_search
    ON tenants(slug)
    WHERE deleted_at IS NULL;
