-- Phase B / notifications — Per-user notification cursor columns on users.
-- Rewritten in Phase B.6c to fix fresh-DB bootstrap. Idempotent via IF NOT EXISTS.
SET search_path TO public;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notification_last_seen_seq BIGINT NOT NULL DEFAULT 0;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notification_seq BIGINT NOT NULL DEFAULT 0;
