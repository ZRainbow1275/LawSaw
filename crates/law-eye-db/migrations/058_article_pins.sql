-- Note: article_pins is now created in 051_banner_and_pins_phase_b.sql (Phase B.6c rewrite).
-- This migration is kept for ordering / checksum compatibility on existing dev DBs.
-- All statements use IF NOT EXISTS so they are no-ops on fresh databases where 051 already created the table.
SET search_path TO public;

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
