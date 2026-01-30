-- 010_objects.sql
-- [OBJ-301] Object storage metadata (S3/MinIO)
--
-- Stores metadata for objects written to external object storage.
-- The application can use this table to:
-- - reference objects by UUID
-- - enforce tenant isolation (RLS)
-- - attach objects to owners (e.g. user avatars)

CREATE TABLE IF NOT EXISTS objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    owner_user_id UUID,
    kind TEXT NOT NULL,
    bucket TEXT NOT NULL,
    object_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256 BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE objects
    ADD CONSTRAINT objects_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Ensure owner user belongs to the same tenant
ALTER TABLE objects
    ADD CONSTRAINT objects_tenant_owner_user_fkey
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_tenant_bucket_key_unique
    ON objects(tenant_id, bucket, object_key);

CREATE INDEX IF NOT EXISTS idx_objects_tenant_id
    ON objects(tenant_id);

CREATE INDEX IF NOT EXISTS idx_objects_tenant_owner_kind
    ON objects(tenant_id, owner_user_id, kind);

-- RLS tenant isolation (deny-by-default when tenant context is missing)
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objects_tenant_isolation ON objects;
CREATE POLICY objects_tenant_isolation
    ON objects
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

