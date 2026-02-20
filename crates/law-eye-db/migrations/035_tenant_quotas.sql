-- Tenant configuration table: quotas, feature flags, branding
CREATE TABLE IF NOT EXISTS tenant_configs (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    -- Quota settings
    max_users INT NOT NULL DEFAULT 50,
    max_articles INT NOT NULL DEFAULT 100000,
    max_sources INT NOT NULL DEFAULT 100,
    max_storage_mb BIGINT NOT NULL DEFAULT 10240,  -- 10GB
    max_reports_per_month INT NOT NULL DEFAULT 100,
    -- Feature flags
    feature_ai_enabled BOOLEAN NOT NULL DEFAULT true,
    feature_knowledge_graph BOOLEAN NOT NULL DEFAULT true,
    feature_report_generation BOOLEAN NOT NULL DEFAULT true,
    feature_webhook BOOLEAN NOT NULL DEFAULT true,
    -- Branding
    logo_url TEXT,
    primary_color TEXT DEFAULT '#1a56db',
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant usage statistics (cache table, refreshed periodically from actual counts)
CREATE TABLE IF NOT EXISTS tenant_usage (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    current_users INT NOT NULL DEFAULT 0,
    current_articles INT NOT NULL DEFAULT 0,
    current_sources INT NOT NULL DEFAULT 0,
    current_storage_mb BIGINT NOT NULL DEFAULT 0,
    current_reports_this_month INT NOT NULL DEFAULT 0,
    last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-provision default config for existing tenants
INSERT INTO tenant_configs (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Auto-provision default usage for existing tenants
INSERT INTO tenant_usage (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;
