-- 011_audit_logs_block_truncate.sql
-- Block TRUNCATE on audit_logs to preserve tamper-proof guarantees.
--
-- Rationale:
-- - 009_audit_logs_tamper_proof.sql enforces append-only via UPDATE/DELETE triggers,
--   but TRUNCATE would still wipe the table instantly.
-- - This trigger hard-blocks TRUNCATE at the DB layer.

CREATE OR REPLACE FUNCTION audit_logs_block_truncate()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs cannot be truncated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION audit_logs_block_truncate();

