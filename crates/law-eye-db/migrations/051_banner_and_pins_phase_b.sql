-- Phase B — Banners + article pins baseline tables.
-- Rewritten in Phase B.6c to fix fresh-DB bootstrap: this migration now creates
-- the final-shape schema directly so 057_banner_alignment.sql / 058_article_pins.sql
-- become no-ops on fresh databases (ALTERs / CREATEs are idempotent via IF NOT EXISTS).
SET search_path TO public;

CREATE TABLE IF NOT EXISTS banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    -- Optional structural columns from the original Phase B spec; nullable so existing
    -- INSERTs (BannerService.create) that don't bind these still succeed.
    slug TEXT,
    surface TEXT,
    tier_visibility TEXT,
    title TEXT NOT NULL,
    body TEXT,
    image_url TEXT,
    cta_label TEXT,
    cta_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    priority INTEGER NOT NULL DEFAULT 100,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    target_type TEXT NOT NULL,
    -- Legacy column kept for backwards compatibility with rows created before 057.
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

CREATE TABLE IF NOT EXISTS article_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 100,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT article_pins_unique UNIQUE (tenant_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_pins_active_window
    ON article_pins (tenant_id, priority DESC, starts_at, ends_at, created_at DESC)
    WHERE deleted_at IS NULL;

ALTER TABLE article_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_pins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS article_pins_tenant_isolation ON article_pins;
CREATE POLICY article_pins_tenant_isolation
    ON article_pins
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
