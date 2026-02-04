-- 014_role_permissions_v2_6_policy.sql
-- Baseline permissions required by route-level permission guard (v2.6).
--
-- Notes:
-- - Admin already has "*", but we still union these permissions for clarity.
-- - These permissions gate access to core user-facing features such as feedback,
--   profile/avatar, and object downloads.

DO $$
BEGIN
    UPDATE roles
    SET permissions = (
        SELECT to_jsonb(array_agg(DISTINCT perm))
        FROM (
            SELECT jsonb_array_elements_text(roles.permissions) AS perm
            UNION ALL SELECT 'categories:read'
            UNION ALL SELECT 'feedbacks:write'
            UNION ALL SELECT 'users:read'
            UNION ALL SELECT 'objects:read'
        ) t
    )
    WHERE name IN ('admin', 'editor', 'viewer');
END $$;

