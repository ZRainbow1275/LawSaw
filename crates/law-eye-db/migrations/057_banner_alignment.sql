SET search_path TO public;

ALTER TABLE banners ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

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

ALTER TABLE banner_targets ADD COLUMN IF NOT EXISTS target_channel_id UUID;
UPDATE banner_targets SET target_channel_id = channel_id WHERE target_channel_id IS NULL AND channel_id IS NOT NULL;
ALTER TABLE banner_targets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE banner_targets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_banner_targets_banner_id
    ON banner_targets (banner_id, sort_order ASC, created_at ASC);

ALTER TABLE banner_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_targets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS banner_targets_tenant_isolation ON banner_targets;
CREATE POLICY banner_targets_tenant_isolation
    ON banner_targets
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
