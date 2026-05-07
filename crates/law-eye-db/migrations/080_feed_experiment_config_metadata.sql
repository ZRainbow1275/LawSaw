-- 080_feed_experiment_config_metadata.sql
-- SPEC-03 AI governance: persist feed experiment config metadata used by /admin/ai/experiments.

ALTER TABLE feed_experiment_configs
    ADD COLUMN IF NOT EXISTS rollback_variant TEXT NOT NULL DEFAULT 'control',
    ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE feed_experiment_configs
SET
    rollback_variant = COALESCE(NULLIF(rollback_variant, ''), 'control'),
    config = COALESCE(config, '{}'::jsonb);

ALTER TABLE feed_experiment_configs
    ALTER COLUMN rollback_variant SET DEFAULT 'control',
    ALTER COLUMN rollback_variant SET NOT NULL,
    ALTER COLUMN config SET DEFAULT '{}'::jsonb,
    ALTER COLUMN config SET NOT NULL;
