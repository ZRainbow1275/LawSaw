-- 077_annotations.sql
-- W8 / SPEC-04 §3.4: per-user article annotations & highlights.
--
-- Each row is a span of text the user marked on an article. The reader UI
-- persists the character offset range so it can re-render highlights on
-- subsequent visits, and stores an optional note (markdown, sanitized
-- client-side) plus a color tag.
--
-- RLS strategy: tenant_id-scoped policy mirrors article_reads (072). The
-- spec asks for owner-only visibility but `app.user_id` is not set anywhere
-- in `with_tenant_tx`, so owner enforcement happens at the service layer
-- via explicit `WHERE owner_id = $user_id` filters. The tenant policy still
-- prevents cross-tenant leakage.

CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    article_id UUID NOT NULL,
    range_start INTEGER NOT NULL CHECK (range_start >= 0),
    range_end INTEGER NOT NULL CHECK (range_end >= 0),
    body TEXT,
    color TEXT NOT NULL DEFAULT 'yellow'
        CHECK (color IN ('yellow', 'green', 'blue', 'pink', 'purple')),
    quote TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT annotations_range_valid CHECK (range_end >= range_start),
    CONSTRAINT annotations_owner_fkey
        FOREIGN KEY (tenant_id, owner_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT annotations_article_fkey
        FOREIGN KEY (tenant_id, article_id) REFERENCES articles(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE annotations
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;

CREATE INDEX IF NOT EXISTS idx_annotations_tenant_owner_article
    ON annotations (tenant_id, owner_id, article_id);

CREATE INDEX IF NOT EXISTS idx_annotations_article
    ON annotations (article_id);

ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS annotations_tenant_isolation ON annotations;
CREATE POLICY annotations_tenant_isolation
    ON annotations
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
