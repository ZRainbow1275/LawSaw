-- Migration 037: Ensure JSONB columns have NOT NULL constraints
-- These columns have DEFAULT '{}' but lack NOT NULL, causing Rust deserialization failures.
-- When sqlx FromRow maps a SQL NULL to serde_json::Value (non-Option), it panics.
--
-- Affected columns:
--   articles.ai_metadata        (001_initial.sql)
--   entities.properties          (004_knowledge_graph.sql)
--   entity_relations.properties  (004_knowledge_graph.sql)
--   crawl_logs.metadata          (030_crawler_enhancement.sql)
--
-- Strategy:
--   1. Backfill any existing NULL values to the column default ('{}')
--   2. Add NOT NULL constraints idempotently (skip if already NOT NULL)

-- Step 1: Backfill existing NULL values to the default empty JSON object
UPDATE articles SET ai_metadata = '{}' WHERE ai_metadata IS NULL;
UPDATE entities SET properties = '{}' WHERE properties IS NULL;
UPDATE entity_relations SET properties = '{}' WHERE properties IS NULL;
UPDATE crawl_logs SET metadata = '{}' WHERE metadata IS NULL;

-- Step 2: Add NOT NULL constraints (idempotent via information_schema check)
DO $$
BEGIN
    -- articles.ai_metadata
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'articles' AND column_name = 'ai_metadata' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE articles ALTER COLUMN ai_metadata SET NOT NULL;
    END IF;

    -- entities.properties
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'entities' AND column_name = 'properties' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE entities ALTER COLUMN properties SET NOT NULL;
    END IF;

    -- entity_relations.properties
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'entity_relations' AND column_name = 'properties' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE entity_relations ALTER COLUMN properties SET NOT NULL;
    END IF;

    -- crawl_logs.metadata
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'crawl_logs' AND column_name = 'metadata' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE crawl_logs ALTER COLUMN metadata SET NOT NULL;
    END IF;
END $$;
