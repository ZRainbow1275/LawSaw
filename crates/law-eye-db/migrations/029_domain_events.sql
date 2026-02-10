-- 026_domain_events.sql
-- Minimal domain event store for event sourcing (append-only + tenant isolated).

CREATE TABLE IF NOT EXISTS domain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    event_version INT NOT NULL DEFAULT 1,
    dedupe_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT domain_events_aggregate_version_check CHECK (aggregate_version > 0),
    CONSTRAINT domain_events_event_version_check CHECK (event_version > 0)
);

ALTER TABLE domain_events
    ADD CONSTRAINT domain_events_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_dedupe
    ON domain_events (tenant_id, dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_stream_version
    ON domain_events (tenant_id, aggregate_type, aggregate_id, aggregate_version);

CREATE INDEX IF NOT EXISTS idx_domain_events_stream_desc
    ON domain_events (tenant_id, aggregate_type, aggregate_id, aggregate_version DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_occurred_at
    ON domain_events (tenant_id, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION domain_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'domain_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS domain_events_no_update ON domain_events;
DROP TRIGGER IF EXISTS domain_events_no_delete ON domain_events;

CREATE TRIGGER domain_events_no_update
    BEFORE UPDATE ON domain_events
    FOR EACH ROW
    EXECUTE FUNCTION domain_events_append_only();

CREATE TRIGGER domain_events_no_delete
    BEFORE DELETE ON domain_events
    FOR EACH ROW
    EXECUTE FUNCTION domain_events_append_only();

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_events_tenant_isolation ON domain_events;
CREATE POLICY domain_events_tenant_isolation
    ON domain_events
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
