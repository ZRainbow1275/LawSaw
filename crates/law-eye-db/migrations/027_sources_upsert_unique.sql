-- 027_sources_upsert_unique.sql
-- Ensure source creation can use tenant-scoped upsert semantics.

-- Keep one active row per (tenant_id, url) so partial unique index can be created safely.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY tenant_id, url
            ORDER BY
                (deleted_at IS NULL) DESC,
                updated_at DESC,
                created_at DESC,
                id DESC
        ) AS rn
    FROM sources
)
UPDATE sources s
SET
    deleted_at = COALESCE(s.deleted_at, NOW()),
    is_active = false,
    updated_at = NOW()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1
  AND s.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_tenant_url_active_unique
    ON sources(tenant_id, url)
    WHERE deleted_at IS NULL;
