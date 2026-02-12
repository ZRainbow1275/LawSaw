-- 036: Add RLS to tenant_configs and tenant_usage tables
-- These tables were created in 035 but missed RLS coverage.
-- Since their PK is tenant_id (1:1 with tenants), the RLS policy
-- simply checks that tenant_id matches the current app context.

-- ── tenant_configs ────────────────────────────────────────────────────

ALTER TABLE tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tenant_configs' AND policyname = 'tenant_configs_tenant_isolation'
    ) THEN
        CREATE POLICY tenant_configs_tenant_isolation ON tenant_configs
            USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_configs TO law_eye_app;

-- ── tenant_usage ──────────────────────────────────────────────────────

ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tenant_usage' AND policyname = 'tenant_usage_tenant_isolation'
    ) THEN
        CREATE POLICY tenant_usage_tenant_isolation ON tenant_usage
            USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_usage TO law_eye_app;
