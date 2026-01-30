-- 009_audit_logs_tamper_proof.sql
-- [AUDIT-301] Tamper-proof audit logs:
-- - Append-only enforcement (block UPDATE/DELETE)
-- - Per-tenant hash chain (seq / prev_hash / hash)
--
-- Notes:
-- - Hash input uses deterministic string encoding (UTC timestamp, jsonb::text canonical form).
-- - seq allocation is serialized per tenant by row-locking the tenants table.

-- 1) Add columns (nullable first for backfill)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS seq BIGINT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash BYTEA;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS hash BYTEA;

-- 2) Deterministic hash function shared by backfill + trigger
CREATE OR REPLACE FUNCTION audit_log_compute_hash(
    p_tenant_id uuid,
    p_seq bigint,
    p_prev_hash bytea,
    p_id uuid,
    p_user_id uuid,
    p_action text,
    p_resource text,
    p_resource_id uuid,
    p_old_value jsonb,
    p_new_value jsonb,
    p_ip_address inet,
    p_user_agent text,
    p_created_at timestamptz
) RETURNS bytea AS $$
    SELECT digest(
        concat_ws('|',
            p_tenant_id::text,
            p_seq::text,
            encode(coalesce(p_prev_hash, ''::bytea), 'hex'),
            p_id::text,
            coalesce(p_user_id::text, ''),
            coalesce(p_action, ''),
            coalesce(p_resource, ''),
            coalesce(p_resource_id::text, ''),
            coalesce(p_old_value::text, ''),
            coalesce(p_new_value::text, ''),
            coalesce(p_ip_address::text, ''),
            coalesce(p_user_agent, ''),
            to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        ),
        'sha256'
    );
$$ LANGUAGE SQL IMMUTABLE;

-- 3) Backfill seq for existing rows (stable ordering per tenant)
WITH ordered AS (
    SELECT
        id,
        tenant_id,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS new_seq
    FROM audit_logs
    WHERE seq IS NULL
)
UPDATE audit_logs al
SET seq = ordered.new_seq
FROM ordered
WHERE al.id = ordered.id;

-- 4) Backfill hash chain for existing rows (recursive per tenant)
WITH RECURSIVE chain AS (
    SELECT
        al.tenant_id,
        al.seq,
        al.id,
        al.user_id,
        al.action,
        al.resource,
        al.resource_id,
        al.old_value,
        al.new_value,
        al.ip_address,
        al.user_agent,
        al.created_at,
        NULL::bytea AS prev_hash,
        audit_log_compute_hash(
            al.tenant_id,
            al.seq,
            NULL,
            al.id,
            al.user_id,
            al.action,
            al.resource,
            al.resource_id,
            al.old_value,
            al.new_value,
            al.ip_address,
            al.user_agent,
            al.created_at
        ) AS hash
    FROM audit_logs al
    WHERE al.seq = 1 AND al.hash IS NULL

    UNION ALL

    SELECT
        al.tenant_id,
        al.seq,
        al.id,
        al.user_id,
        al.action,
        al.resource,
        al.resource_id,
        al.old_value,
        al.new_value,
        al.ip_address,
        al.user_agent,
        al.created_at,
        chain.hash AS prev_hash,
        audit_log_compute_hash(
            al.tenant_id,
            al.seq,
            chain.hash,
            al.id,
            al.user_id,
            al.action,
            al.resource,
            al.resource_id,
            al.old_value,
            al.new_value,
            al.ip_address,
            al.user_agent,
            al.created_at
        ) AS hash
    FROM audit_logs al
    JOIN chain
      ON al.tenant_id = chain.tenant_id
     AND al.seq = chain.seq + 1
    WHERE al.hash IS NULL
)
UPDATE audit_logs al
SET prev_hash = chain.prev_hash,
    hash = chain.hash
FROM chain
WHERE al.id = chain.id;

-- 5) Enforce constraints after backfill
ALTER TABLE audit_logs ALTER COLUMN seq SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN hash SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'audit_logs_tenant_seq_key'
    ) THEN
        ALTER TABLE audit_logs
            ADD CONSTRAINT audit_logs_tenant_seq_key UNIQUE (tenant_id, seq);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_tenant_seq ON audit_logs (tenant_id, seq);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_hash ON audit_logs (tenant_id, hash);

-- 6) Append-only enforcement (block UPDATE/DELETE)
CREATE OR REPLACE FUNCTION audit_logs_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;

CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_append_only();

-- 7) Before-insert: auto-set id/created_at/seq/prev_hash/hash (per tenant chain)
CREATE OR REPLACE FUNCTION audit_logs_set_chain_fields()
RETURNS TRIGGER AS $$
DECLARE
    last_seq bigint;
    last_hash bytea;
BEGIN
    IF NEW.id IS NULL THEN
        NEW.id := gen_random_uuid();
    END IF;

    IF NEW.created_at IS NULL THEN
        NEW.created_at := NOW();
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := current_setting('app.tenant_id')::uuid;
    END IF;

    -- Serialize per tenant to avoid seq races.
    PERFORM 1 FROM tenants WHERE id = NEW.tenant_id FOR UPDATE;

    SELECT seq, hash
    INTO last_seq, last_hash
    FROM audit_logs
    WHERE tenant_id = NEW.tenant_id
    ORDER BY seq DESC
    LIMIT 1;

    NEW.seq := coalesce(last_seq, 0) + 1;
    NEW.prev_hash := last_hash;
    NEW.hash := audit_log_compute_hash(
        NEW.tenant_id,
        NEW.seq,
        NEW.prev_hash,
        NEW.id,
        NEW.user_id,
        NEW.action,
        NEW.resource,
        NEW.resource_id,
        NEW.old_value,
        NEW.new_value,
        NEW.ip_address,
        NEW.user_agent,
        NEW.created_at
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_before_insert ON audit_logs;
CREATE TRIGGER audit_logs_before_insert
    BEFORE INSERT ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_logs_set_chain_fields();

