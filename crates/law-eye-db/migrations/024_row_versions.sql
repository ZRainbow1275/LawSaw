-- 024_row_versions.sql
-- Add row-level versions for optimistic concurrency control.
--
-- Note: `bump_version_column()` is introduced in 015, but we defensively re-create it here
-- to keep future migration sequences robust.

CREATE OR REPLACE FUNCTION bump_version_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_users_version ON users;
CREATE TRIGGER update_users_version
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

-- Feedbacks
ALTER TABLE feedbacks
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_feedbacks_version ON feedbacks;
CREATE TRIGGER update_feedbacks_version
    BEFORE UPDATE ON feedbacks
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

-- Sources
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_sources_version ON sources;
CREATE TRIGGER update_sources_version
    BEFORE UPDATE ON sources
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

-- Web push subscriptions
ALTER TABLE web_push_subscriptions
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_web_push_subscriptions_version ON web_push_subscriptions;
CREATE TRIGGER update_web_push_subscriptions_version
    BEFORE UPDATE ON web_push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

-- Tenants
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_tenants_version ON tenants;
CREATE TRIGGER update_tenants_version
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

-- Knowledge graph entities
ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_entities_version ON entities;
CREATE TRIGGER update_entities_version
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

-- API keys
ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS update_api_keys_version ON api_keys;
CREATE TRIGGER update_api_keys_version
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION bump_version_column();

