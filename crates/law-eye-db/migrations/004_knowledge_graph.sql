-- Knowledge Graph Entities
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- person, organization, law, event, location, concept
    aliases TEXT[] DEFAULT '{}',
    properties JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    mention_count INT NOT NULL DEFAULT 1,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, entity_type)
);

-- Entity Relationships
CREATE TABLE IF NOT EXISTS entity_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL, -- mentions, related_to, part_of, affects, etc.
    weight FLOAT NOT NULL DEFAULT 1.0,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_entity_id, target_entity_id, relation_type)
);

-- Article-Entity linkage
CREATE TABLE IF NOT EXISTS article_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    mention_count INT NOT NULL DEFAULT 1,
    relevance_score FLOAT,
    context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, entity_id)
);

-- API Keys for open platform
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL, -- First 8 chars for identification
    permissions JSONB DEFAULT '["read"]',
    rate_limit INT NOT NULL DEFAULT 100, -- requests per minute
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON entities USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Indexes for relations
CREATE INDEX IF NOT EXISTS idx_relations_source ON entity_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_type ON entity_relations(relation_type);

-- Indexes for article entities
CREATE INDEX IF NOT EXISTS idx_article_entities_article ON article_entities(article_id);
CREATE INDEX IF NOT EXISTS idx_article_entities_entity ON article_entities(entity_id);

-- Indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
