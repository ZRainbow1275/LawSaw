-- 044_add_feedbacks_read_permission.sql
--
-- Fix: The `feedbacks:read` permission was missing from the seed data.
-- Routes use `require_permissions("feedbacks:read", "feedbacks:write")`, meaning
-- GET requests require `feedbacks:read`. Without this permission, non-admin users
-- (editor, viewer) are blocked from reading their own feedback via GET /feedbacks/my.
--
-- admin already has `*` (wildcard), so it is unaffected. We still insert for
-- completeness and forward-compatibility.

INSERT INTO role_permissions (role, permission)
VALUES
    ('admin',   'feedbacks:read'),
    ('editor',  'feedbacks:read'),
    ('viewer',  'feedbacks:read')
ON CONFLICT (role, permission) DO NOTHING;
