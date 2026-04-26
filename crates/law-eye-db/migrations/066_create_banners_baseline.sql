-- 066_create_banners_baseline.sql
--
-- Phase B.6a: belated CREATE TABLE for banners + banner_targets.
--
-- Background: migration 051 (banner_and_pins_phase_b) is currently a
-- `SELECT 1` placeholder, while 057_banner_alignment ALTERs banners /
-- banner_targets. Existing deployments started from a baseline that already
-- contained these tables; this migration adds an idempotent CREATE so any
-- environment missing the tables can populate them. All columns are NULL-able
-- or defaulted so 057's `ADD COLUMN IF NOT EXISTS` calls remain no-ops on
-- fully-populated DBs.
--
-- NOTE: this migration runs *after* 057, so it cannot fix `relation does not
-- exist` failures on a fresh DB that hits 057 first. Fresh-DB bootstrap is
-- broken upstream of this fix; tracking via Task #16 / B.6b.

SET search_path TO public;

CREATE TABLE IF NOT EXISTS banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    image_url TEXT,
    cta_label TEXT,
    cta_url TEXT,
    -- Lifecycle: draft → scheduled → active → expired → archived.
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'active', 'expired', 'archived')),
    priority INTEGER NOT NULL DEFAULT 100,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_banners_tenant_status_priority
    ON banners (tenant_id, status, priority DESC, created_at DESC)
    WHERE deleted_at IS NULL;

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS banners_tenant_isolation ON banners;
CREATE POLICY banners_tenant_isolation
    ON banners
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS banner_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
    -- 'global' (no channel filter), 'channel' (specific channel_id), or 'category'.
    target_type TEXT NOT NULL CHECK (target_type IN ('global', 'channel', 'category')),
    -- Legacy column kept for the 057 backfill; renamed to target_channel_id below.
    channel_id UUID,
    target_channel_id UUID,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banner_targets_banner_id
    ON banner_targets (banner_id, sort_order ASC, created_at ASC);

ALTER TABLE banner_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_targets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS banner_targets_tenant_isolation ON banner_targets;
CREATE POLICY banner_targets_tenant_isolation
    ON banner_targets
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMENT ON TABLE banners IS 'Tenant-scoped marketing/announcement banners with lifecycle workflow.';
COMMENT ON TABLE banner_targets IS 'Banner placement targets — global, per-channel, or per-category.';
