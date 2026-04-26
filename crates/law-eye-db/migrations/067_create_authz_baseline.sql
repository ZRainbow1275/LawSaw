-- 067_create_authz_baseline.sql
--
-- Phase B.6a: belated CREATE TABLE for auth_relations + channel_access_policies.
--
-- Background: migration 050 (rebac_phase_a) is a `SELECT 1` placeholder, but
-- 056_authz_channel_alignment ALTERs both tables. Existing deployments started
-- from a baseline that already contained these tables; this migration adds the
-- idempotent CREATE so environments missing them can populate. Includes the
-- legacy `(min_role, allow_source_meta, allow_export)` columns on
-- channel_access_policies because 056 backfills the new `(subject_*, can_*)`
-- columns from them.
--
-- NOTE: runs after 056, so cannot fix fresh-DB bootstrap breakage upstream of
-- this fix. See Task #16 / B.6b for the proper baseline reconstruction.

SET search_path TO public;

CREATE TABLE IF NOT EXISTS auth_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    resource_id UUID NOT NULL,
    relation TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    -- Nullable: only populated when subject_type = 'user' (056 alignment relaxed
    -- this to NULL so role/group subjects don't have to fake a UUID).
    subject_id UUID,
    -- Free-form subject identifier; for 'user' subjects this duplicates
    -- subject_id::text, for 'role'/'group' subjects this is the role_name / group_id.
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
    -- Legacy shape (kept for 056 backfill; new code reads subject_* + can_*).
    min_role TEXT,
    allow_source_meta BOOLEAN NOT NULL DEFAULT false,
    allow_export BOOLEAN NOT NULL DEFAULT false,
    -- Current shape (056 alignment populates these from the legacy columns).
    subject_type TEXT,
    subject_key TEXT,
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

COMMENT ON TABLE auth_relations IS 'Zanzibar-style relationship tuples (resource ↔ relation ↔ subject). Phase-A ReBAC baseline.';
COMMENT ON TABLE channel_access_policies IS 'Per-channel subject access matrix overriding the global role-tier baseline.';
