-- 020_queue_outbox.sql
-- DB outbox for Redis enqueue operations.
--
-- Motivation: when Postgres writes succeed but Redis enqueue fails (network/redis outage),
-- downstream tasks can be silently lost. This outbox keeps a durable, tenant-scoped backlog that
-- the worker can flush with retry/backoff.

CREATE TABLE IF NOT EXISTS queue_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid,
    queue TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE queue_outbox
    ADD CONSTRAINT queue_outbox_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE TRIGGER update_queue_outbox_updated_at
    BEFORE UPDATE ON queue_outbox
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_outbox_dedupe_pending
    ON queue_outbox(tenant_id, queue, dedupe_key)
    WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_outbox_pending
    ON queue_outbox(tenant_id, queue, next_attempt_at, created_at)
    WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_outbox_locked
    ON queue_outbox(tenant_id, locked_at)
    WHERE delivered_at IS NULL;

-- RLS tenant isolation (deny-by-default when tenant context is missing)
ALTER TABLE queue_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS queue_outbox_tenant_isolation ON queue_outbox;
CREATE POLICY queue_outbox_tenant_isolation
    ON queue_outbox
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

