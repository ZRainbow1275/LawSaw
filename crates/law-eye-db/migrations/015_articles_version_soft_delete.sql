-- 015_articles_version_soft_delete.sql
-- Articles: optimistic concurrency (version) + soft delete (deleted_at)

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Helpful for filtering active rows.
CREATE INDEX IF NOT EXISTS idx_articles_tenant_deleted_at
    ON articles(tenant_id, deleted_at);

CREATE OR REPLACE FUNCTION bump_version_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_articles_version ON articles;
CREATE TRIGGER update_articles_version
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

