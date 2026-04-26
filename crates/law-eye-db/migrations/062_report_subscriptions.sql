-- 062_report_subscriptions.sql
-- 报告订阅：为用户提供周期性报告订阅配置与手动触发入口。

CREATE TABLE IF NOT EXISTS report_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id uuid NOT NULL,
    name text NOT NULL,
    template_id uuid NOT NULL,
    period_type text NOT NULL
        CHECK (period_type IN ('weekly', 'monthly', 'quarterly')),
    delivery_channel text NOT NULL
        CHECK (delivery_channel IN ('in_app', 'web_push')),
    export_format text NOT NULL
        CHECK (export_format IN ('pdf', 'docx', 'html')),
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    last_triggered_at timestamptz NULL,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL,
    CONSTRAINT report_subscriptions_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT report_subscriptions_tenant_user_fkey
        FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT report_subscriptions_template_id_fkey
        FOREIGN KEY (template_id) REFERENCES report_templates(id) ON DELETE RESTRICT,
    CONSTRAINT report_subscriptions_filters_object_check
        CHECK (jsonb_typeof(filters) = 'object')
);

COMMENT ON TABLE report_subscriptions IS '报告订阅：用户定义周期、模板、投递方式与过滤条件，并可触发真实报告生成链路';
COMMENT ON COLUMN report_subscriptions.filters IS '订阅过滤器，必须为 JSON object';
COMMENT ON COLUMN report_subscriptions.delivery_channel IS '交付方式：站内 in_app 或浏览器 web_push';

CREATE INDEX IF NOT EXISTS report_subscriptions_user_active_idx
    ON report_subscriptions (tenant_id, user_id, is_active, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS report_subscriptions_template_idx
    ON report_subscriptions (tenant_id, template_id)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_report_subscriptions_updated_at ON report_subscriptions;
CREATE TRIGGER update_report_subscriptions_updated_at
    BEFORE UPDATE ON report_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE report_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_subscriptions_tenant_isolation ON report_subscriptions;
CREATE POLICY report_subscriptions_tenant_isolation
    ON report_subscriptions
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
