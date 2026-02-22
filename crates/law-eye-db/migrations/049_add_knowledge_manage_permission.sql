-- 049_add_knowledge_manage_permission.sql
--
-- Ensure `knowledge:manage` is present for privileged roles.
-- Compatible with both:
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
                UNION ALL SELECT 'knowledge:manage'
            ) t
        )
        WHERE name IN ('admin', 'editor')
          AND NOT (COALESCE(permissions, '[]'::jsonb) ? '*')
          AND NOT (COALESCE(permissions, '[]'::jsonb) ? 'knowledge:manage');

    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'role_permissions'
    ) THEN
        INSERT INTO role_permissions (role, permission)
        VALUES
            ('admin', 'knowledge:manage'),
            ('editor', 'knowledge:manage')
        ON CONFLICT (role, permission) DO NOTHING;
    END IF;
END $$;
