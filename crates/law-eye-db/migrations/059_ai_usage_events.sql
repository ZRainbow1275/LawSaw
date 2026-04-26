SET search_path TO public;

CREATE TABLE IF NOT EXISTS ai_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT current_setting('app.tenant_id')::uuid REFERENCES tenants(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_scope TEXT NOT NULL,
    operation TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_category TEXT,
    error_message TEXT,
    latency_ms BIGINT NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
    prompt_tokens BIGINT CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
    completion_tokens BIGINT CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
    total_tokens BIGINT CHECK (total_tokens IS NULL OR total_tokens >= 0),
    estimated_input_tokens BIGINT CHECK (estimated_input_tokens IS NULL OR estimated_input_tokens >= 0),
    trace_id TEXT,
    request_id TEXT,
    dedupe_key TEXT,
    attempt INTEGER,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_usage_events_operation_check CHECK (operation IN ('chat', 'embedding', 'rerank'))
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_occurred_at
    ON ai_usage_events (tenant_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_operation_occurred_at
    ON ai_usage_events (tenant_id, operation, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_scope_occurred_at
    ON ai_usage_events (tenant_id, request_scope, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_success_occurred_at
    ON ai_usage_events (tenant_id, success, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_user_occurred_at
    ON ai_usage_events (tenant_id, user_id, occurred_at DESC, id DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_article_occurred_at
    ON ai_usage_events (tenant_id, article_id, occurred_at DESC, id DESC)
    WHERE article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_report_occurred_at
    ON ai_usage_events (tenant_id, report_id, occurred_at DESC, id DESC)
    WHERE report_id IS NOT NULL;

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_events_tenant_isolation ON ai_usage_events;
CREATE POLICY ai_usage_events_tenant_isolation
    ON ai_usage_events
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
