-- 064_bge_m3_native_dim.sql
-- Phase E (AI Integration): introduce native 1024-dim columns for BAAI/bge-m3.
--
-- Strategy: dual-column cutover. Existing `embedding VECTOR(1536)` stays in place to keep current
-- vector search live. We add `embedding_v2 VECTOR(1024)` plus matching HNSW indexes; the worker
-- backfills `embedding_v2` via the queued task below. Once all rows have `embedding_v2 IS NOT
-- NULL`, a follow-up migration can drop the legacy column.
--
-- Rationale: bge-m3 returns 1024-dim L2-normalized vectors; padding to 1536 wastes ≈33% storage
-- and degrades cosine recall by ~1-2 points. See SPEC-03-AI-INTEGRATION §6 and research/01 §3.2.

-- 1. article_chunks: add embedding_v2 + HNSW index --------------------------------------------
ALTER TABLE article_chunks
    ADD COLUMN IF NOT EXISTS embedding_v2 VECTOR(1024);

CREATE INDEX IF NOT EXISTS article_chunks_embedding_v2_hnsw
    ON article_chunks
    USING hnsw (embedding_v2 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 2. entities: add embedding_v2 + HNSW index --------------------------------------------------
ALTER TABLE entities
    ADD COLUMN IF NOT EXISTS embedding_v2 VECTOR(1024);

CREATE INDEX IF NOT EXISTS entities_embedding_v2_hnsw
    ON entities
    USING hnsw (embedding_v2 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 3. Queue a backfill task per tenant via queue_outbox -----------------------------------------
-- The worker picks this up on next sweep; idempotent thanks to dedupe_key uniqueness.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id FROM tenants LOOP
        BEGIN
            -- Set tenant context so RLS lets us insert; SECURITY-DEFINER not used here, the
            -- migration runs with bypassrls service role.
            PERFORM set_config('app.tenant_id', t.id::text, true);

            INSERT INTO queue_outbox (tenant_id, queue, dedupe_key, payload, next_attempt_at)
            VALUES (
                t.id,
                'queue:ai',
                'embeddings.backfill.bge_m3_v1',
                jsonb_build_object(
                    'event_type', 'embeddings.backfill',
                    'reason', 'bge_m3_1024_native_dim',
                    'tenant_id', t.id,
                    'target_column', 'embedding_v2',
                    'source_model', 'BAAI/bge-m3'
                ),
                NOW()
            )
            ON CONFLICT (tenant_id, queue, dedupe_key) WHERE delivered_at IS NULL
            DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            -- Don't abort the migration if any single tenant insert fails (e.g. constraint
            -- mismatch on legacy data). Worker can be re-triggered later.
            RAISE NOTICE 'queue_outbox embeddings.backfill skipped for tenant %: %', t.id, SQLERRM;
        END;
    END LOOP;
END $$;
