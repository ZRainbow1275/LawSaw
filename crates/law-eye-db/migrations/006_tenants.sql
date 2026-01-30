-- 006_tenants.sql
-- Multi-tenant isolation (tenant_id + RLS)

-- Tenants
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed a default tenant for existing single-tenant deployments.
INSERT INTO tenants (slug, name)
VALUES ('default', 'Default Tenant')
ON CONFLICT (slug) DO NOTHING;

-- Helper: fetch default tenant id
-- (Used in UPDATE statements below; keep as scalar subquery to avoid relying on psql vars)

-- Users (explicit tenant_id; keep users readable without RLS during auth bootstrap)
ALTER TABLE users ADD COLUMN tenant_id UUID;
UPDATE users
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE users
    ADD CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);

-- Sources
ALTER TABLE sources ADD COLUMN tenant_id UUID;
UPDATE sources
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE sources ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sources
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE sources
    ADD CONSTRAINT sources_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sources
    ADD CONSTRAINT sources_tenant_id_id_key UNIQUE (tenant_id, id);
CREATE INDEX idx_sources_tenant_id ON sources(tenant_id);

-- Articles
ALTER TABLE articles ADD COLUMN tenant_id UUID;
UPDATE articles a
SET tenant_id = s.tenant_id
FROM sources s
WHERE a.source_id = s.id AND a.tenant_id IS NULL;
UPDATE articles
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE articles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE articles
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE articles
    ADD CONSTRAINT articles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE articles
    ADD CONSTRAINT articles_tenant_id_id_key UNIQUE (tenant_id, id);
CREATE INDEX idx_articles_tenant_id ON articles(tenant_id);

-- Ensure article.tenant_id always matches its source.tenant_id
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_source_id_fkey;
ALTER TABLE articles
    ADD CONSTRAINT articles_source_tenant_fkey
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES sources(tenant_id, id)
    ON DELETE RESTRICT;

-- Make link uniqueness tenant-scoped
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_link_key;
CREATE UNIQUE INDEX idx_articles_tenant_link_unique ON articles(tenant_id, link);

-- Article chunks (vector search)
ALTER TABLE article_chunks ADD COLUMN tenant_id UUID;
UPDATE article_chunks c
SET tenant_id = a.tenant_id
FROM articles a
WHERE c.article_id = a.id AND c.tenant_id IS NULL;
UPDATE article_chunks
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE article_chunks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE article_chunks
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE article_chunks
    ADD CONSTRAINT article_chunks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE article_chunks
    ADD CONSTRAINT article_chunks_tenant_article_fkey
    FOREIGN KEY (tenant_id, article_id)
    REFERENCES articles(tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE article_chunks DROP CONSTRAINT IF EXISTS article_chunks_article_id_chunk_index_key;
ALTER TABLE article_chunks
    ADD CONSTRAINT article_chunks_tenant_article_chunk_key UNIQUE (tenant_id, article_id, chunk_index);
CREATE INDEX idx_article_chunks_tenant_id ON article_chunks(tenant_id);

-- Feedbacks
ALTER TABLE feedbacks ADD COLUMN tenant_id UUID;
UPDATE feedbacks f
SET tenant_id = u.tenant_id
FROM users u
WHERE f.user_id = u.id AND f.tenant_id IS NULL;
UPDATE feedbacks
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE feedbacks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE feedbacks
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE feedbacks
    ADD CONSTRAINT feedbacks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE feedbacks
    ADD CONSTRAINT feedbacks_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id)
    ON DELETE SET NULL;
CREATE INDEX idx_feedbacks_tenant_id ON feedbacks(tenant_id);

-- Knowledge graph
ALTER TABLE entities ADD COLUMN tenant_id UUID;
UPDATE entities
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE entities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entities
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE entities
    ADD CONSTRAINT entities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE entities
    ADD CONSTRAINT entities_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_name_entity_type_key;
ALTER TABLE entities
    ADD CONSTRAINT entities_tenant_name_type_key UNIQUE (tenant_id, name, entity_type);
CREATE INDEX idx_entities_tenant_id ON entities(tenant_id);

ALTER TABLE entity_relations ADD COLUMN tenant_id UUID;
UPDATE entity_relations
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE entity_relations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entity_relations
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE entity_relations
    ADD CONSTRAINT entity_relations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE entity_relations DROP CONSTRAINT IF EXISTS entity_relations_source_entity_id_target_entity_id_relation_type_key;
ALTER TABLE entity_relations
    ADD CONSTRAINT entity_relations_tenant_unique UNIQUE (tenant_id, source_entity_id, target_entity_id, relation_type);

-- Enforce relations stay within tenant
ALTER TABLE entity_relations DROP CONSTRAINT IF EXISTS entity_relations_source_entity_id_fkey;
ALTER TABLE entity_relations DROP CONSTRAINT IF EXISTS entity_relations_target_entity_id_fkey;
ALTER TABLE entity_relations
    ADD CONSTRAINT entity_relations_source_tenant_fkey
    FOREIGN KEY (tenant_id, source_entity_id)
    REFERENCES entities(tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE entity_relations
    ADD CONSTRAINT entity_relations_target_tenant_fkey
    FOREIGN KEY (tenant_id, target_entity_id)
    REFERENCES entities(tenant_id, id)
    ON DELETE CASCADE;
CREATE INDEX idx_entity_relations_tenant_id ON entity_relations(tenant_id);

ALTER TABLE article_entities ADD COLUMN tenant_id UUID;
UPDATE article_entities ae
SET tenant_id = a.tenant_id
FROM articles a
WHERE ae.article_id = a.id AND ae.tenant_id IS NULL;
UPDATE article_entities
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE article_entities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE article_entities
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE article_entities
    ADD CONSTRAINT article_entities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE article_entities DROP CONSTRAINT IF EXISTS article_entities_article_id_entity_id_key;
ALTER TABLE article_entities
    ADD CONSTRAINT article_entities_tenant_unique UNIQUE (tenant_id, article_id, entity_id);

-- Enforce linkage stays within tenant
ALTER TABLE article_entities DROP CONSTRAINT IF EXISTS article_entities_article_id_fkey;
ALTER TABLE article_entities DROP CONSTRAINT IF EXISTS article_entities_entity_id_fkey;
ALTER TABLE article_entities
    ADD CONSTRAINT article_entities_article_tenant_fkey
    FOREIGN KEY (tenant_id, article_id)
    REFERENCES articles(tenant_id, id)
    ON DELETE CASCADE;
ALTER TABLE article_entities
    ADD CONSTRAINT article_entities_entity_tenant_fkey
    FOREIGN KEY (tenant_id, entity_id)
    REFERENCES entities(tenant_id, id)
    ON DELETE CASCADE;
CREATE INDEX idx_article_entities_tenant_id ON article_entities(tenant_id);

-- Audit logs: tenant_id for partitioning and future tamper-proof hashing (AUDIT-301 will extend this table)
ALTER TABLE audit_logs ADD COLUMN tenant_id UUID;
UPDATE audit_logs al
SET tenant_id = u.tenant_id
FROM users u
WHERE al.user_id = u.id AND al.tenant_id IS NULL;
UPDATE audit_logs
SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default')
WHERE tenant_id IS NULL;
ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_logs
    ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id')::uuid;
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_tenant_user_fkey
    FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id)
    ON DELETE SET NULL;
CREATE INDEX idx_audit_tenant_id ON audit_logs(tenant_id);

-- =========================
-- Row Level Security (RLS)
-- =========================

-- Policy helper expression: deny by default when tenant context is missing.
-- Using ::text comparison avoids casting NULL to uuid.

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources FORCE ROW LEVEL SECURITY;
CREATE POLICY sources_tenant_isolation
    ON sources
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles FORCE ROW LEVEL SECURITY;
CREATE POLICY articles_tenant_isolation
    ON articles
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE article_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY article_chunks_tenant_isolation
    ON article_chunks
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks FORCE ROW LEVEL SECURITY;
CREATE POLICY feedbacks_tenant_isolation
    ON feedbacks
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
CREATE POLICY entities_tenant_isolation
    ON entities
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE entity_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relations FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_relations_tenant_isolation
    ON entity_relations
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE article_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY article_entities_tenant_isolation
    ON article_entities
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_tenant_isolation
    ON audit_logs
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
