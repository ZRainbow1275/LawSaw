-- 044_add_feedbacks_read_permission.sql
--
-- Fix: The `feedbacks:read` permission was missing from role seed data.
-- This migration is schema-compatible with both permission storage variants:
-- 1) roles.permissions JSONB array (current schema)
-- 2) role_permissions(role, permission) bridge table (legacy variants)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'roles'
    ) THEN
        UPDATE roles
        SET permissions = (
            SELECT to_jsonb(array_agg(DISTINCT perm))
            FROM (
                SELECT jsonb_array_elements_text(COALESCE(roles.permissions, '[]'::jsonb)) AS perm
                UNION ALL SELECT 'feedbacks:read'
            ) t
        )
        WHERE name IN ('admin', 'editor', 'viewer')
          AND NOT (COALESCE(permissions, '[]'::jsonb) ? 'feedbacks:read');

    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'role_permissions'
    ) THEN
        INSERT INTO role_permissions (role, permission)
        VALUES
            ('admin', 'feedbacks:read'),
            ('editor', 'feedbacks:read'),
            ('viewer', 'feedbacks:read')
        ON CONFLICT (role, permission) DO NOTHING;
    END IF;
END $$;
