-- 043_query_performance_audit.sql
-- Database & query performance audit fixes (2026-02-15)
--
-- Findings:
-- 1. feedbacks cursor pagination queries lack composite indexes for (tenant_id, created_at, id)
-- 2. feedbacks user-scoped cursor pagination lacks composite index
-- 3. articles.get_stats executes 5 separate COUNT queries — addressed in application code
-- 4. feedbacks queries missing deleted_at IS NULL filter — addressed in application code
-- 5. reports table missing (tenant_id, author_id) composite index for author-scoped queries
-- 6. reports table missing (tenant_id, created_at DESC) index for default listing
-- 7. audit_logs missing composite index for (tenant_id, resource, resource_id) lookups

-- =============================================================================
-- 1. Feedbacks: cursor pagination composite indexes
-- =============================================================================

-- Admin list_all cursor pagination: ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_cursor
    ON feedbacks (tenant_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

-- User-scoped list_by_user cursor pagination: WHERE user_id = $1 ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_feedbacks_tenant_user_cursor
    ON feedbacks (tenant_id, user_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 2. Reports: additional query pattern indexes
-- =============================================================================

-- Author-scoped report listing
CREATE INDEX IF NOT EXISTS idx_reports_tenant_author
    ON reports (tenant_id, author_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Default report listing by created_at
CREATE INDEX IF NOT EXISTS idx_reports_tenant_created
    ON reports (tenant_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- =============================================================================
-- 3. Audit logs: resource lookup composite index
-- =============================================================================

-- Lookup audit entries by resource type + resource_id within tenant
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_resource
    ON audit_logs (tenant_id, resource, resource_id)
    WHERE resource_id IS NOT NULL;

-- =============================================================================
-- 4. Articles: risk_score index for high-risk count queries
-- =============================================================================

-- get_stats queries COUNT(*) WHERE risk_score > 70
CREATE INDEX IF NOT EXISTS idx_articles_tenant_risk_score
    ON articles (tenant_id, risk_score)
    WHERE risk_score IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- 5. Permissions
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;
