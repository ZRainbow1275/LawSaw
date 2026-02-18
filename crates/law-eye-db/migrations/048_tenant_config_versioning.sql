-- 048_tenant_config_versioning.sql
-- 租户配置 optimistic locking：tenant_configs 增加 version 列并约束为正整数

ALTER TABLE tenant_configs
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

UPDATE tenant_configs
SET version = 1
WHERE version < 1;

DO $$
BEGIN
    ALTER TABLE tenant_configs
        ADD CONSTRAINT tenant_configs_version_positive CHECK (version > 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;
