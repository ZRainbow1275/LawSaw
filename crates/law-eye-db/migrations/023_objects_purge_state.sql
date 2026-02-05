-- 023_objects_purge_state.sql
-- [V26-H021] Orphan object cleanup support (purge state tracking)
--
-- Adds purge bookkeeping columns to the `objects` table so the worker can:
-- - safely purge soft-deleted objects from S3/MinIO with retries
-- - avoid concurrent purges across multiple workers

ALTER TABLE objects
    ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

ALTER TABLE objects
    ADD COLUMN IF NOT EXISTS purge_attempts INT NOT NULL DEFAULT 0;

ALTER TABLE objects
    ADD COLUMN IF NOT EXISTS purge_last_error TEXT;

ALTER TABLE objects
    ADD COLUMN IF NOT EXISTS purge_locked_at TIMESTAMPTZ;

ALTER TABLE objects
    ADD COLUMN IF NOT EXISTS purge_locked_by UUID;

CREATE INDEX IF NOT EXISTS idx_objects_tenant_purge_candidates
    ON objects(tenant_id, deleted_at)
    WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_objects_tenant_bucket_key_not_purged
    ON objects(tenant_id, bucket, object_key)
    WHERE purged_at IS NULL;

