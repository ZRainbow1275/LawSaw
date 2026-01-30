-- [AUDIT-301] Verify audit_logs hash chain integrity (per-tenant).
--
-- Usage:
--   psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -f scripts/enterprise/audit-verify.sql
--
-- Optional:
--   psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -v tenant_id='<uuid>' -f scripts/enterprise/audit-verify.sql
--
-- Notes:
-- - Requires the DB function `audit_log_compute_hash(...)` (installed by migration 009_audit_logs_tamper_proof.sql).
-- - This script validates:
--   1) seq is contiguous per tenant (starts at 1, no gaps)
--   2) prev_hash matches the previous row's hash
--   3) hash matches the deterministic recomputation based on row contents + expected_prev_hash

\\set ON_ERROR_STOP on

\\if :{?tenant_id}
\\else
\\set tenant_id ''
\\endif

WITH ordered AS (
    SELECT
        tenant_id,
        seq,
        id,
        user_id,
        action,
        resource,
        resource_id,
        old_value,
        new_value,
        ip_address,
        user_agent,
        created_at,
        prev_hash,
        hash,
        lag(hash) OVER (PARTITION BY tenant_id ORDER BY seq) AS expected_prev_hash,
        lag(seq) OVER (PARTITION BY tenant_id ORDER BY seq) AS prev_seq
    FROM audit_logs
    WHERE (:'tenant_id' = '' OR tenant_id::text = :'tenant_id')
),
checks AS (
    SELECT
        *,
        (seq = coalesce(prev_seq, 0) + 1) AS seq_ok,
        (prev_hash IS NOT DISTINCT FROM expected_prev_hash) AS prev_ok,
        (
            hash = audit_log_compute_hash(
                tenant_id,
                seq,
                expected_prev_hash,
                id,
                user_id,
                action,
                resource,
                resource_id,
                old_value,
                new_value,
                ip_address,
                user_agent,
                created_at
            )
        ) AS hash_ok
    FROM ordered
)
SELECT
    tenant_id::text AS tenant_id,
    COUNT(*)::bigint AS total,
    SUM(CASE WHEN NOT seq_ok THEN 1 ELSE 0 END)::bigint AS seq_errors,
    SUM(CASE WHEN NOT prev_ok THEN 1 ELSE 0 END)::bigint AS prev_hash_errors,
    SUM(CASE WHEN NOT hash_ok THEN 1 ELSE 0 END)::bigint AS hash_errors
FROM checks
GROUP BY tenant_id
ORDER BY tenant_id;

WITH ordered AS (
    SELECT
        tenant_id,
        seq,
        id,
        user_id,
        action,
        resource,
        resource_id,
        old_value,
        new_value,
        ip_address,
        user_agent,
        created_at,
        prev_hash,
        hash,
        lag(hash) OVER (PARTITION BY tenant_id ORDER BY seq) AS expected_prev_hash,
        lag(seq) OVER (PARTITION BY tenant_id ORDER BY seq) AS prev_seq
    FROM audit_logs
    WHERE (:'tenant_id' = '' OR tenant_id::text = :'tenant_id')
),
checks AS (
    SELECT
        *,
        (seq = coalesce(prev_seq, 0) + 1) AS seq_ok,
        (prev_hash IS NOT DISTINCT FROM expected_prev_hash) AS prev_ok,
        (
            hash = audit_log_compute_hash(
                tenant_id,
                seq,
                expected_prev_hash,
                id,
                user_id,
                action,
                resource,
                resource_id,
                old_value,
                new_value,
                ip_address,
                user_agent,
                created_at
            )
        ) AS hash_ok
    FROM ordered
)
SELECT
    tenant_id::text AS tenant_id,
    seq,
    id,
    seq_ok,
    prev_ok,
    hash_ok
FROM checks
WHERE NOT (seq_ok AND prev_ok AND hash_ok)
ORDER BY tenant_id, seq
LIMIT 50;

DO $$
DECLARE
    bad bigint;
BEGIN
    WITH ordered AS (
        SELECT
            tenant_id,
            seq,
            id,
            user_id,
            action,
            resource,
            resource_id,
            old_value,
            new_value,
            ip_address,
            user_agent,
            created_at,
            prev_hash,
            hash,
            lag(hash) OVER (PARTITION BY tenant_id ORDER BY seq) AS expected_prev_hash,
            lag(seq) OVER (PARTITION BY tenant_id ORDER BY seq) AS prev_seq
        FROM audit_logs
        WHERE (:'tenant_id' = '' OR tenant_id::text = :'tenant_id')
    ),
    checks AS (
        SELECT
            *,
            (seq = coalesce(prev_seq, 0) + 1) AS seq_ok,
            (prev_hash IS NOT DISTINCT FROM expected_prev_hash) AS prev_ok,
            (
                hash = audit_log_compute_hash(
                    tenant_id,
                    seq,
                    expected_prev_hash,
                    id,
                    user_id,
                    action,
                    resource,
                    resource_id,
                    old_value,
                    new_value,
                    ip_address,
                    user_agent,
                    created_at
                )
            ) AS hash_ok
        FROM ordered
    )
    SELECT COUNT(*)::bigint
    INTO bad
    FROM checks
    WHERE NOT (seq_ok AND prev_ok AND hash_ok);

    IF bad > 0 THEN
        RAISE EXCEPTION 'AUDIT CHAIN BROKEN: % rows mismatch', bad;
    END IF;
END
$$;
