-- 012_role_permissions_apikeys_manage.sql
-- Ensure default roles can manage their own API keys via /api/v1/apikeys.

DO $$
BEGIN
    -- roles.permissions is a jsonb array of strings.
    -- Add apikeys:manage to the built-in roles if missing.
    UPDATE roles
    SET permissions = (
        SELECT to_jsonb(array_agg(DISTINCT perm))
        FROM (
            SELECT jsonb_array_elements_text(roles.permissions) AS perm
            UNION ALL
            SELECT 'apikeys:manage'
        ) t
    )
    WHERE name IN ('admin', 'editor', 'viewer')
      AND NOT (permissions ? 'apikeys:manage');
END $$;

