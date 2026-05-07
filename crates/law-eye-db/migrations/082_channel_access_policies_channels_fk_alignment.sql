SET search_path TO public;

ALTER TABLE channel_access_policies DISABLE ROW LEVEL SECURITY;

DELETE FROM channel_access_policies p
WHERE NOT EXISTS (
    SELECT 1
    FROM channels c
    WHERE c.id = p.channel_id
      AND c.tenant_id = p.tenant_id
);

WITH ranked AS (
    SELECT
        ctid,
        row_number() OVER (
            PARTITION BY tenant_id, channel_id, subject_type, subject_key
            ORDER BY updated_at DESC, created_at DESC, id
        ) AS rn
    FROM channel_access_policies
)
DELETE FROM channel_access_policies p
USING ranked r
WHERE p.ctid = r.ctid
  AND r.rn > 1;

ALTER TABLE channel_access_policies
    DROP CONSTRAINT IF EXISTS channel_access_policies_channel_id_fkey;

ALTER TABLE channel_access_policies
    DROP CONSTRAINT IF EXISTS channel_access_policies_tenant_channel_key;

DROP INDEX IF EXISTS idx_channel_access_policies_subject_unique;
CREATE UNIQUE INDEX idx_channel_access_policies_subject_unique
    ON channel_access_policies (tenant_id, channel_id, subject_type, subject_key);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'channel_access_policies_channel_id_fkey'
          AND conrelid = 'channel_access_policies'::regclass
    ) THEN
        ALTER TABLE channel_access_policies
            ADD CONSTRAINT channel_access_policies_channel_id_fkey
            FOREIGN KEY (channel_id)
            REFERENCES channels(id)
            ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE channel_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_access_policies FORCE ROW LEVEL SECURITY;
