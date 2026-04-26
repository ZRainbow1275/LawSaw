-- 068_users_notification_last_seen_seq.sql
--
-- Phase B.6a: replace placeholder migration 054 (user_notification_state) with
-- the actual ALTER. Adds a per-user "last seen audit-log seq" cursor used by
-- the `/me/notifications` endpoint to compute unread counts. Default 0 means
-- "everything is unread"; the seen-marker endpoint UPDATEs this column to the
-- max audit_log seq the user has acknowledged.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notification_last_seen_seq BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.notification_last_seen_seq IS
    'Highest audit_logs.seq the user has acknowledged. Drives unread-count math in /me/notifications.';
