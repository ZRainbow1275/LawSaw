-- 008_feedbacks_encryption.sql
-- Sensitive field encryption (ENC-301)
--
-- Store Vault Transit ciphertext in `feedbacks.content/contact_email` and track state via
-- `encryption_version` to support safe migrations/backfills.

ALTER TABLE feedbacks
    ADD COLUMN encryption_version SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE feedbacks
    ADD CONSTRAINT feedbacks_encryption_version_check
    CHECK (encryption_version IN (0, 1));

