-- 083_article_source_reactions.sql
-- W8 / Stream C-1: per-user reactions (like / dislike) on articles and sources.
--
-- Decisions locked in the wave-8 reactions spec:
--   a) target = article + source (single table, polymorphic via target_type enum)
--   b) state  = three-state (like / dislike / none) — `none` is represented by
--      the absence of a row, not a third enum value, so that flipping to none
--      simply DELETEs the row and admin counts can compute likes/dislikes via
--      a single GROUP BY kind.
--   c) authn  = login required (no anon reactions). The tenant_id default is
--      derived from `app.tenant_id` — `with_tenant_tx` sets that before every
--      INSERT, mirroring article_reads / annotations.
--   d) one row per (user_id, target_type, target_id) — UNIQUE constraint
--      enforces the "one reaction per object per user" invariant; UPSERT is
--      used to flip like<->dislike without triggering ON CONFLICT errors.
--   e) admin insights — index strategy below covers the eight stat endpoints
--      (top score, controversy, trend, by-category, source-health, top-users,
--      cold-start, negative-signal) without table scans on the hot paths.

-- Both target tables ship UUID primary keys (verified against migration 001):
--   articles.id  UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   sources.id   UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- so the polymorphic target_id column is plain UUID — no per-target FK can be
-- declared (Postgres has no polymorphic FK), but tenant-scoped RLS plus the
-- service-layer existence check on insert keeps orphans out.

CREATE TYPE reaction_target AS ENUM ('article', 'source');
CREATE TYPE reaction_kind AS ENUM ('like', 'dislike');

CREATE TABLE IF NOT EXISTS reactions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    target_type reaction_target NOT NULL,
    target_id UUID NOT NULL,
    kind reaction_kind NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reactions_user_fkey
        FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT reactions_unique_user_target UNIQUE (tenant_id, user_id, target_type, target_id)
);

ALTER TABLE reactions
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;

-- (target_type, target_id, kind): supports COUNT(*) FILTER (WHERE kind = 'like')
-- aggregates for ReactionSummary computation and the top-score / controversy
-- admin endpoints.
CREATE INDEX IF NOT EXISTS idx_reactions_target_kind
    ON reactions (tenant_id, target_type, target_id, kind);

-- (user_id, target_type, target_id): batch viewer-state lookup ("which of
-- these N target ids has the current viewer reacted to?") used by the GET
-- /reactions/summary batch endpoint and ArticleDetail/SourceDetail.
CREATE INDEX IF NOT EXISTS idx_reactions_user_target
    ON reactions (tenant_id, user_id, target_type, target_id);

-- created_at DESC: time-window aggregates (7d/30d trends + cold-start lookup).
CREATE INDEX IF NOT EXISTS idx_reactions_created_at
    ON reactions (tenant_id, created_at DESC);

-- Reuse the project-wide updated_at trigger from migration 001.
DROP TRIGGER IF EXISTS update_reactions_updated_at ON reactions;
CREATE TRIGGER update_reactions_updated_at
    BEFORE UPDATE ON reactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Tenant-scoped RLS, mirrors article_reads (072) and annotations (077).
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reactions_tenant_isolation ON reactions;
CREATE POLICY reactions_tenant_isolation
    ON reactions
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
