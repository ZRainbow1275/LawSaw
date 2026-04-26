-- Phase A — ReBAC core tables (auth_relations + channel_access_policies).
-- Rewritten in Phase B.6c to fix fresh-DB bootstrap: this migration now creates
-- the final-shape schema directly so 056_authz_channel_alignment.sql becomes
-- a no-op on fresh databases (ALTERs are idempotent via IF NOT EXISTS).
SET search_path TO public;

CREATE TABLE IF NOT EXISTS auth_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    resource_id UUID NOT NULL,
    relation TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id UUID,
    subject_key TEXT NOT NULL,
    subject_relation TEXT,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_relations_resource
    ON auth_relations (tenant_id, resource_type, resource_id, relation);
CREATE INDEX IF NOT EXISTS idx_auth_relations_subject
    ON auth_relations (tenant_id, subject_type, subject_key, relation);

ALTER TABLE auth_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_relations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_relations_tenant_isolation ON auth_relations;
CREATE POLICY auth_relations_tenant_isolation
    ON auth_relations
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS channel_access_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL,
    -- Legacy columns kept for backwards compatibility with rows created before 056.
    min_role TEXT,
    allow_source_meta BOOLEAN NOT NULL DEFAULT false,
    allow_export BOOLEAN NOT NULL DEFAULT false,
    -- Current ReBAC columns (matches ChannelAccessPolicy struct in law-eye-db/src/models.rs).
    subject_type TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    can_read BOOLEAN NOT NULL DEFAULT true,
    can_read_source_meta BOOLEAN NOT NULL DEFAULT false,
    can_access_reports BOOLEAN NOT NULL DEFAULT false,
    priority INTEGER NOT NULL DEFAULT 100,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_access_policies_lookup
    ON channel_access_policies (tenant_id, channel_id, subject_type, subject_key);

ALTER TABLE channel_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_access_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_access_policies_tenant_isolation ON channel_access_policies;
CREATE POLICY channel_access_policies_tenant_isolation
    ON channel_access_policies
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
