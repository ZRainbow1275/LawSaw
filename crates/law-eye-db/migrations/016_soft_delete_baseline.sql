-- 016_soft_delete_baseline.sql
-- Soft delete baseline across core tables.
--
-- Goals:
-- - Provide recoverability for accidental deletes ("soft delete" via deleted_at).
-- - Keep query performance with tenant-scoped deleted_at indexes.
-- - Avoid breaking existing ON CONFLICT upserts (e.g. articles link uniqueness).
--
-- Notes:
-- - We intentionally keep article link uniqueness global across active + deleted rows,
--   because ArticleService relies on ON CONFLICT (tenant_id, link) for idempotent upserts.
-- - For objects, uniqueness is scoped to non-deleted rows to allow key reuse after deletion.

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sources_tenant_deleted_at
    ON sources(tenant_id, deleted_at);

ALTER TABLE objects
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_objects_tenant_deleted_at
    ON objects(tenant_id, deleted_at);

DROP INDEX IF EXISTS idx_objects_tenant_bucket_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_tenant_bucket_key_unique
    ON objects(tenant_id, bucket, object_key)
    WHERE deleted_at IS NULL;

ALTER TABLE feedbacks
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_deleted_at
    ON feedbacks(tenant_id, deleted_at);

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_categories_deleted_at
    ON categories(deleted_at);

ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_entities_tenant_deleted_at
    ON entities(tenant_id, deleted_at);

ALTER TABLE entity_relations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_entity_relations_tenant_deleted_at
    ON entity_relations(tenant_id, deleted_at);

ALTER TABLE article_entities
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_article_entities_tenant_deleted_at
    ON article_entities(tenant_id, deleted_at);

ALTER TABLE article_chunks
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_article_chunks_tenant_deleted_at
    ON article_chunks(tenant_id, deleted_at);

