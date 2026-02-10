-- 028_tenant_scoped_roles_sessions.sql
-- [V26-L012] Tenant-scope roles and session ownership mapping.

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key;

ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE user_roles
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

WITH canonical_default AS (
    SELECT id
    FROM tenants
    WHERE slug = 'default'
    ORDER BY created_at ASC
    LIMIT 1
), fallback_tenant AS (
    SELECT id
    FROM tenants
    ORDER BY created_at ASC
    LIMIT 1
), selected_tenant AS (
    SELECT id FROM canonical_default
    UNION ALL
    SELECT id FROM fallback_tenant
    LIMIT 1
)
UPDATE roles r
SET tenant_id = (SELECT id FROM selected_tenant)
WHERE r.tenant_id IS NULL;

WITH template_tenant AS (
    SELECT tenant_id
    FROM roles
    WHERE tenant_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
), template_roles AS (
    SELECT name, permissions, description
    FROM roles
    WHERE tenant_id = (SELECT tenant_id FROM template_tenant)
), tenant_list AS (
    SELECT id AS tenant_id
    FROM tenants
)
INSERT INTO roles (id, tenant_id, name, permissions, description, created_at)
SELECT
    gen_random_uuid(),
    t.tenant_id,
    tr.name,
    tr.permissions,
    tr.description,
    NOW()
FROM tenant_list t
CROSS JOIN template_roles tr
WHERE NOT EXISTS (
    SELECT 1
    FROM roles existing
    WHERE existing.tenant_id = t.tenant_id
      AND existing.name = tr.name
);

WITH mapped AS (
    SELECT
        ur.user_id,
        ur.role_id AS old_role_id,
        u.tenant_id,
        r.name AS role_name
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    JOIN roles r ON r.id = ur.role_id
), target AS (
    SELECT
        m.user_id,
        m.old_role_id,
        m.tenant_id,
        r2.id AS new_role_id
    FROM mapped m
    JOIN roles r2
      ON r2.tenant_id = m.tenant_id
     AND r2.name = m.role_name
)
UPDATE user_roles ur
SET role_id = t.new_role_id,
    tenant_id = t.tenant_id
FROM target t
WHERE ur.user_id = t.user_id
  AND ur.role_id = t.old_role_id;

UPDATE user_roles ur
SET tenant_id = u.tenant_id
FROM users u
WHERE ur.user_id = u.id
  AND ur.tenant_id IS NULL;

DELETE FROM user_roles a
USING user_roles b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.user_id = b.user_id
  AND a.role_id = b.role_id;

ALTER TABLE roles
    ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE user_roles
    ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
    ALTER TABLE roles
        ADD CONSTRAINT roles_tenant_name_key UNIQUE (tenant_id, name);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_roles_tenant_name
    ON roles(tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user
    ON user_roles(tenant_id, user_id);

DO $$
BEGIN
    ALTER TABLE roles
        ADD CONSTRAINT roles_id_tenant_key UNIQUE (id, tenant_id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE users
        ADD CONSTRAINT users_id_tenant_key UNIQUE (id, tenant_id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;
ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (tenant_id, user_id, role_id);

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_id_fkey;
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

DO $$
BEGIN
    ALTER TABLE user_roles
        ADD CONSTRAINT user_roles_user_tenant_fkey
        FOREIGN KEY (user_id, tenant_id)
        REFERENCES users(id, tenant_id)
        ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE user_roles
        ADD CONSTRAINT user_roles_role_tenant_fkey
        FOREIGN KEY (role_id, tenant_id)
        REFERENCES roles(id, tenant_id)
        ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS session_tenants (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_tenants_tenant_id
    ON session_tenants(tenant_id);

CREATE INDEX IF NOT EXISTS idx_session_tenants_user_id
    ON session_tenants(user_id);
