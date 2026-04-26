SET search_path TO public;

CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    linked_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'restricted',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT channels_visibility_check CHECK (visibility IN ('public', 'restricted', 'verified', 'premium')),
    CONSTRAINT channels_tenant_slug_unique UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_channels_tenant_deleted_at
    ON channels (tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_channels_tenant_visibility
    ON channels (tenant_id, visibility)
    WHERE deleted_at IS NULL;

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channels_tenant_isolation ON channels;
CREATE POLICY channels_tenant_isolation
    ON channels
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE auth_relations ADD COLUMN IF NOT EXISTS subject_key TEXT;
UPDATE auth_relations SET subject_key = subject_id::text WHERE subject_key IS NULL;
ALTER TABLE auth_relations ALTER COLUMN subject_key SET NOT NULL;
ALTER TABLE auth_relations ADD COLUMN IF NOT EXISTS subject_relation TEXT;
ALTER TABLE auth_relations ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE auth_relations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE auth_relations ALTER COLUMN subject_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_relations_resource
    ON auth_relations (tenant_id, resource_type, resource_id, relation);
CREATE INDEX IF NOT EXISTS idx_auth_relations_subject
    ON auth_relations (tenant_id, subject_type, subject_key, relation);

ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS subject_type TEXT;
UPDATE channel_access_policies SET subject_type = 'role' WHERE subject_type IS NULL;
ALTER TABLE channel_access_policies ALTER COLUMN subject_type SET NOT NULL;
ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS subject_key TEXT;
UPDATE channel_access_policies SET subject_key = min_role WHERE subject_key IS NULL;
ALTER TABLE channel_access_policies ALTER COLUMN subject_key SET NOT NULL;
ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS can_read BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS can_read_source_meta BOOLEAN NOT NULL DEFAULT false;
UPDATE channel_access_policies SET can_read_source_meta = allow_source_meta WHERE can_read_source_meta = false;
ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS can_access_reports BOOLEAN NOT NULL DEFAULT false;
UPDATE channel_access_policies SET can_access_reports = allow_export WHERE can_access_reports = false;
ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE channel_access_policies ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_channel_access_policies_lookup
    ON channel_access_policies (tenant_id, channel_id, subject_type, subject_key);
