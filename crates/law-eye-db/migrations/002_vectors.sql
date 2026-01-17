-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Article chunks for vector search
CREATE TABLE IF NOT EXISTS article_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    token_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(article_id, chunk_index)
);

-- Create HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON article_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for article lookup
CREATE INDEX IF NOT EXISTS idx_chunks_article ON article_chunks(article_id);

-- Add AI metadata columns to articles if not exists
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;
