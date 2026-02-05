-- 018_web_push_subscriptions.sql
-- Store browser Web Push subscriptions per user/tenant.

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    expiration_time timestamptz NULL,
    user_agent text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL,
    CONSTRAINT web_push_subscriptions_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT web_push_subscriptions_tenant_user_fkey
        FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS web_push_subscriptions_unique_active
    ON web_push_subscriptions (tenant_id, user_id, endpoint)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_active_idx
    ON web_push_subscriptions (tenant_id, user_id)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_web_push_subscriptions_updated_at ON web_push_subscriptions;
CREATE TRIGGER update_web_push_subscriptions_updated_at
    BEFORE UPDATE ON web_push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_push_subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_push_subscriptions_tenant_isolation ON web_push_subscriptions;
CREATE POLICY web_push_subscriptions_tenant_isolation
    ON web_push_subscriptions
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
