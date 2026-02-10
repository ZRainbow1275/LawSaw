-- 025_webhook_endpoints_events.sql
-- Tenant-scoped outbound webhook subscriptions and durable event outbox.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    timeout_ms INT NOT NULL DEFAULT 10000,
    max_retries INT NOT NULL DEFAULT 5,
    created_by UUID,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_status_code INT,
    last_error TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_timeout_ms_check
    CHECK (timeout_ms BETWEEN 1000 AND 60000);

ALTER TABLE webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_max_retries_check
    CHECK (max_retries BETWEEN 0 AND 20);

-- Validate no blank event names via a trigger instead of CHECK (subqueries not allowed in CHECK).
CREATE OR REPLACE FUNCTION webhook_endpoints_validate_events()
    RETURNS TRIGGER AS $$
BEGIN
    IF array_length(NEW.events, 1) IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM unnest(NEW.events) AS event_name
            WHERE btrim(event_name) = ''
        ) THEN
            RAISE EXCEPTION 'webhook_endpoints.events must not contain blank strings';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_endpoints_events_validate
    BEFORE INSERT OR UPDATE ON webhook_endpoints
    FOR EACH ROW
    EXECUTE FUNCTION webhook_endpoints_validate_events();

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_endpoints_name_active
    ON webhook_endpoints (tenant_id, lower(name))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active
    ON webhook_endpoints (tenant_id, enabled)
    WHERE deleted_at IS NULL;

CREATE TRIGGER update_webhook_endpoints_updated_at
    BEFORE UPDATE ON webhook_endpoints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_tenant_isolation ON webhook_endpoints;
CREATE POLICY webhook_endpoints_tenant_isolation
    ON webhook_endpoints
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    endpoint_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    dedupe_key TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_endpoint_id_fkey
    FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE;

ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_attempts_check
    CHECK (attempts >= 0);

ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_max_retries_check
    CHECK (max_retries BETWEEN 0 AND 20);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedupe_pending
    ON webhook_events (tenant_id, endpoint_id, dedupe_key)
    WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
    ON webhook_events (tenant_id, endpoint_id, next_attempt_at, created_at)
    WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_locked
    ON webhook_events (tenant_id, locked_at)
    WHERE delivered_at IS NULL;

CREATE TRIGGER update_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_events_tenant_isolation ON webhook_events;
CREATE POLICY webhook_events_tenant_isolation
    ON webhook_events
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
