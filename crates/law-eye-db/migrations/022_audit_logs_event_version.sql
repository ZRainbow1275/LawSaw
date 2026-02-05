-- 022_audit_logs_event_version.sql
-- Add explicit event_version for forward-compatible audit/event schema evolution.
--
-- Note: audit_logs is append-only. We keep existing hash-chain computation stable to avoid
-- invalidating historical verification; event_version is therefore not part of the hash input.

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS event_version INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_audit_event_version
    ON audit_logs(tenant_id, event_version, seq DESC);
