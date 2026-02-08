# Phase 4: Platform Capabilities Implementation Plan

> **维护状态（2026-02-08）**
> - 本文档属于 2025-01 的历史规划归档，主要用于追溯早期决策背景。
> - 当前系统交付状态请以 `prompt/audit-report.md`（v2.6 修复清单）与 `prompts/audit/2.6audit.md`（审计基线）为准。
> - 研发规范请参考 `.trellis/spec/`（`backend/`、`frontend/`、`guides/`）。
> - 若本文内容与现行代码冲突，请以代码与上述“真相源”文档为准。


> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement knowledge graph, RAG Q&A system, and open API platform

**Architecture:**
- Knowledge graph stores entities (people, organizations, laws, events) extracted from articles with relationships
- RAG system uses pgvector for semantic search combined with LLM for answer generation
- Open API with documentation and API key management

**Tech Stack:** Rust, Axum, PostgreSQL/pgvector, async-openai, utoipa (OpenAPI)

---

## Task 1: Knowledge Graph Database Design

**Files:**
- Create: `crates/law-eye-db/migrations/004_knowledge_graph.sql`
- Modify: `crates/law-eye-db/src/models.rs`

**Step 1: Create knowledge graph migration**

```sql
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON entities USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_relations_source ON entity_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_article_entities_article ON article_entities(article_id);
CREATE INDEX IF NOT EXISTS idx_article_entities_entity ON article_entities(entity_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
```

**Step 2: Add models to models.rs**

```rust
// ========== Knowledge Graph Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Entity {
    pub id: Uuid,
    pub name: String,
    pub entity_type: String,
    pub aliases: Vec<String>,
    pub properties: serde_json::Value,
    #[sqlx(skip)]
    pub embedding: Option<Vec<f32>>,
    pub mention_count: i32,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntity {
    pub name: String,
    pub entity_type: String,
    pub aliases: Option<Vec<String>>,
    pub properties: Option<serde_json::Value>,
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EntityRelation {
    pub id: Uuid,
    pub source_entity_id: Uuid,
    pub target_entity_id: Uuid,
    pub relation_type: String,
    pub weight: f64,
    pub properties: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntityRelation {
    pub source_entity_id: Uuid,
    pub target_entity_id: Uuid,
    pub relation_type: String,
    pub weight: Option<f64>,
    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArticleEntity {
    pub id: Uuid,
    pub article_id: Uuid,
    pub entity_id: Uuid,
    pub mention_count: i32,
    pub relevance_score: Option<f64>,
    pub context: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ========== API Key Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub key_hash: String,
    pub key_prefix: String,
    pub permissions: serde_json::Value,
    pub rate_limit: i32,
    pub is_active: bool,
    pub last_used: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateApiKey {
    pub user_id: Option<Uuid>,
    pub name: String,
    pub permissions: Option<Vec<String>>,
    pub rate_limit: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
}
```

**Step 3: Run migration and verify**

Run: `cargo build -p law-eye-db`
Expected: SUCCESS

---

## Task 2: Entity Extraction Service

**Files:**
- Create: `crates/law-eye-ai/src/entity.rs`
- Modify: `crates/law-eye-ai/src/lib.rs`

**Step 1: Create entity extractor**

```rust
use crate::LlmGateway;
use law_eye_common::Result;
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub name: String,
    pub entity_type: String,
    pub aliases: Vec<String>,
    pub context: String,
    pub relevance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedRelation {
    pub source: String,
    pub target: String,
    pub relation_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityExtractionResult {
    pub entities: Vec<ExtractedEntity>,
    pub relations: Vec<ExtractedRelation>,
}

pub struct EntityExtractor {
    gateway: LlmGateway,
}

impl EntityExtractor {
    pub fn new(gateway: LlmGateway) -> Self {
        Self { gateway }
    }

    pub async fn extract(&self, title: &str, content: &str) -> Result<EntityExtractionResult> {
        let system_prompt = r#"You are a legal information entity extraction expert.
Extract entities and their relationships from the given legal news article.

Entity types:
- person: Names of individuals (officials, lawyers, judges, etc.)
- organization: Companies, government agencies, courts, law firms
- law: Laws, regulations, legal provisions
- event: Legal events, cases, trials
- location: Places, jurisdictions
- concept: Legal concepts, terms

Output JSON format:
{
  "entities": [
    {
      "name": "Entity name",
      "entity_type": "person|organization|law|event|location|concept",
      "aliases": ["Alternative names"],
      "context": "Brief context of mention",
      "relevance": 0.0-1.0
    }
  ],
  "relations": [
    {
      "source": "Source entity name",
      "target": "Target entity name",
      "relation_type": "mentions|related_to|part_of|affects|prosecutes|represents|regulates",
      "description": "Brief description"
    }
  ]
}

Extract only significant entities. Focus on legal relevance."#;

        let user_prompt = format!("Title: {}\n\nContent:\n{}", title, content);

        let result: EntityExtractionResult = self.gateway.chat_json(system_prompt, &user_prompt).await?;

        info!(
            "Extracted {} entities and {} relations",
            result.entities.len(),
            result.relations.len()
        );

        Ok(result)
    }
}
```

**Step 2: Update lib.rs exports**

Add to lib.rs:
```rust
pub mod entity;
pub use entity::{EntityExtractor, ExtractedEntity, ExtractedRelation, EntityExtractionResult};
```

**Step 3: Verify build**

Run: `cargo build -p law-eye-ai`
Expected: SUCCESS

---

## Task 3: Knowledge Graph Service

**Files:**
- Create: `crates/law-eye-core/src/knowledge.rs`
- Modify: `crates/law-eye-core/src/lib.rs`

**Step 1: Create knowledge graph service**

```rust
use law_eye_ai::{EntityExtractionResult, EntityExtractor, ExtractedEntity, LlmGateway, Embedder};
use law_eye_common::{Error, Result};
use law_eye_db::{Entity, CreateEntity, EntityRelation, CreateEntityRelation};
use sqlx::PgPool;
use uuid::Uuid;
use tracing::info;

pub struct KnowledgeService {
    pool: PgPool,
    entity_extractor: EntityExtractor,
    embedder: Embedder,
}

impl KnowledgeService {
    pub fn new(pool: PgPool, gateway: LlmGateway) -> Self {
        Self {
            pool: pool.clone(),
            entity_extractor: EntityExtractor::new(gateway.clone()),
            embedder: Embedder::new(gateway),
        }
    }

    /// Extract and store entities from an article
    pub async fn process_article(&self, article_id: Uuid, title: &str, content: &str) -> Result<Vec<Uuid>> {
        let extraction = self.entity_extractor.extract(title, content).await?;
        let mut entity_ids = Vec::new();

        // Process entities
        for extracted in &extraction.entities {
            let entity_id = self.upsert_entity(extracted).await?;
            self.link_article_entity(article_id, entity_id, extracted).await?;
            entity_ids.push(entity_id);
        }

        // Process relations
        for relation in &extraction.relations {
            self.upsert_relation(relation, &extraction.entities).await?;
        }

        info!("Processed {} entities for article {}", entity_ids.len(), article_id);
        Ok(entity_ids)
    }

    async fn upsert_entity(&self, extracted: &ExtractedEntity) -> Result<Uuid> {
        // Generate embedding for entity
        let embedding = self.embedder.embed(&extracted.name).await?;

        let entity = sqlx::query_as::<_, Entity>(
            r#"
            INSERT INTO entities (name, entity_type, aliases, embedding, mention_count)
            VALUES ($1, $2, $3, $4::vector, 1)
            ON CONFLICT (name, entity_type) DO UPDATE SET
                aliases = CASE
                    WHEN entities.aliases @> $3 THEN entities.aliases
                    ELSE entities.aliases || $3
                END,
                mention_count = entities.mention_count + 1,
                last_seen = NOW(),
                updated_at = NOW()
            RETURNING *
            "#
        )
        .bind(&extracted.name)
        .bind(&extracted.entity_type)
        .bind(&extracted.aliases)
        .bind(&embedding.vector)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(entity.id)
    }

    async fn link_article_entity(&self, article_id: Uuid, entity_id: Uuid, extracted: &ExtractedEntity) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO article_entities (article_id, entity_id, mention_count, relevance_score, context)
            VALUES ($1, $2, 1, $3, $4)
            ON CONFLICT (article_id, entity_id) DO UPDATE SET
                mention_count = article_entities.mention_count + 1,
                relevance_score = GREATEST(article_entities.relevance_score, $3)
            "#
        )
        .bind(article_id)
        .bind(entity_id)
        .bind(extracted.relevance as f64)
        .bind(&extracted.context)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    async fn upsert_relation(&self, relation: &law_eye_ai::ExtractedRelation, entities: &[ExtractedEntity]) -> Result<()> {
        // Find source and target entity IDs
        let source = entities.iter().find(|e| e.name == relation.source);
        let target = entities.iter().find(|e| e.name == relation.target);

        if source.is_none() || target.is_none() {
            return Ok(()); // Skip if entities not found
        }

        let source = source.unwrap();
        let target = target.unwrap();

        // Get entity IDs from database
        let source_id: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM entities WHERE name = $1 AND entity_type = $2"
        )
        .bind(&source.name)
        .bind(&source.entity_type)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let target_id: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM entities WHERE name = $1 AND entity_type = $2"
        )
        .bind(&target.name)
        .bind(&target.entity_type)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if let (Some((source_id,)), Some((target_id,))) = (source_id, target_id) {
            sqlx::query(
                r#"
                INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type, properties)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (source_entity_id, target_entity_id, relation_type) DO UPDATE SET
                    weight = entity_relations.weight + 1
                "#
            )
            .bind(source_id)
            .bind(target_id)
            .bind(&relation.relation_type)
            .bind(serde_json::json!({"description": relation.description}))
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        }

        Ok(())
    }

    /// Get entity by ID
    pub async fn get_entity(&self, id: Uuid) -> Result<Entity> {
        sqlx::query_as::<_, Entity>("SELECT * FROM entities WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Entity {} not found", id)))
    }

    /// Search entities by name
    pub async fn search_entities(&self, query: &str, limit: i64) -> Result<Vec<Entity>> {
        let entities = sqlx::query_as::<_, Entity>(
            r#"
            SELECT * FROM entities
            WHERE to_tsvector('simple', name) @@ plainto_tsquery('simple', $1)
            ORDER BY mention_count DESC
            LIMIT $2
            "#
        )
        .bind(query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(entities)
    }

    /// Get related entities
    pub async fn get_related_entities(&self, entity_id: Uuid, limit: i64) -> Result<Vec<(Entity, String, f64)>> {
        let results = sqlx::query_as::<_, (Entity, String, f64)>(
            r#"
            SELECT e.*, r.relation_type, r.weight
            FROM entity_relations r
            JOIN entities e ON e.id = r.target_entity_id
            WHERE r.source_entity_id = $1
            ORDER BY r.weight DESC
            LIMIT $2
            "#
        )
        .bind(entity_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(results)
    }

    /// Get articles mentioning an entity
    pub async fn get_entity_articles(&self, entity_id: Uuid, limit: i64) -> Result<Vec<Uuid>> {
        let results = sqlx::query_as::<_, (Uuid,)>(
            r#"
            SELECT article_id FROM article_entities
            WHERE entity_id = $1
            ORDER BY relevance_score DESC NULLS LAST
            LIMIT $2
            "#
        )
        .bind(entity_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(results.into_iter().map(|(id,)| id).collect())
    }
}
```

**Step 2: Update lib.rs**

Add:
```rust
pub mod knowledge;
pub use knowledge::KnowledgeService;
```

**Step 3: Verify build**

Run: `cargo build -p law-eye-core`
Expected: SUCCESS

---

## Task 4: RAG Search Service

**Files:**
- Create: `crates/law-eye-core/src/rag.rs`
- Modify: `crates/law-eye-core/src/lib.rs`

**Step 1: Create RAG service**

```rust
use law_eye_ai::{Embedder, LlmGateway};
use law_eye_common::{Error, Result};
use law_eye_db::ArticleChunk;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::info;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagSearchResult {
    pub chunk_id: Uuid,
    pub article_id: Uuid,
    pub content: String,
    pub similarity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagAnswer {
    pub answer: String,
    pub sources: Vec<RagSource>,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagSource {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    pub relevance: f64,
}

pub struct RagService {
    pool: PgPool,
    embedder: Embedder,
    gateway: LlmGateway,
}

impl RagService {
    pub fn new(pool: PgPool, gateway: LlmGateway) -> Self {
        Self {
            pool,
            embedder: Embedder::new(gateway.clone()),
            gateway,
        }
    }

    /// Semantic search for relevant chunks
    pub async fn search(&self, query: &str, limit: i64) -> Result<Vec<RagSearchResult>> {
        // Generate query embedding
        let embedding_result = self.embedder.embed(query).await?;
        let query_vector = embedding_result.vector;

        // Search for similar chunks using pgvector
        let results = sqlx::query_as::<_, (Uuid, Uuid, String, f64)>(
            r#"
            SELECT
                c.id,
                c.article_id,
                c.content,
                1 - (c.embedding <=> $1::vector) as similarity
            FROM article_chunks c
            WHERE c.embedding IS NOT NULL
            ORDER BY c.embedding <=> $1::vector
            LIMIT $2
            "#
        )
        .bind(&query_vector)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let search_results: Vec<RagSearchResult> = results
            .into_iter()
            .map(|(chunk_id, article_id, content, similarity)| RagSearchResult {
                chunk_id,
                article_id,
                content,
                similarity,
            })
            .collect();

        info!("Found {} relevant chunks for query", search_results.len());
        Ok(search_results)
    }

    /// Answer a question using RAG
    pub async fn answer(&self, question: &str, top_k: i64) -> Result<RagAnswer> {
        // Get relevant chunks
        let chunks = self.search(question, top_k).await?;

        if chunks.is_empty() {
            return Ok(RagAnswer {
                answer: "抱歉，我没有找到相关信息来回答这个问题。".to_string(),
                sources: vec![],
                confidence: 0.0,
            });
        }

        // Build context from chunks
        let context: String = chunks
            .iter()
            .enumerate()
            .map(|(i, c)| format!("[来源 {}]\n{}\n", i + 1, c.content))
            .collect::<Vec<_>>()
            .join("\n---\n");

        // Get article titles for sources
        let mut sources = Vec::new();
        for chunk in &chunks {
            let title: Option<(String,)> = sqlx::query_as(
                "SELECT title FROM articles WHERE id = $1"
            )
            .bind(chunk.article_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            if let Some((title,)) = title {
                sources.push(RagSource {
                    article_id: chunk.article_id,
                    title,
                    excerpt: chunk.content.chars().take(200).collect(),
                    relevance: chunk.similarity,
                });
            }
        }

        // Generate answer using LLM
        let system_prompt = r#"你是一位法律信息助手。根据提供的上下文信息回答用户的问题。

规则:
1. 只基于提供的上下文回答，不要编造信息
2. 如果上下文不足以回答问题，诚实地说明
3. 引用来源时使用 [来源 N] 格式
4. 回答要准确、专业、简洁
5. 使用中文回答

输出 JSON 格式:
{
  "answer": "你的回答",
  "confidence": 0.0-1.0 (对答案的置信度)
}"#;

        let user_prompt = format!(
            "上下文信息:\n{}\n\n用户问题: {}",
            context, question
        );

        #[derive(Deserialize)]
        struct LlmResponse {
            answer: String,
            confidence: f32,
        }

        let response: LlmResponse = self.gateway.chat_json(system_prompt, &user_prompt).await?;

        Ok(RagAnswer {
            answer: response.answer,
            sources,
            confidence: response.confidence,
        })
    }

    /// Hybrid search: combine semantic and keyword search
    pub async fn hybrid_search(&self, query: &str, limit: i64) -> Result<Vec<RagSearchResult>> {
        let embedding_result = self.embedder.embed(query).await?;
        let query_vector = embedding_result.vector;

        // Combine vector similarity with full-text search
        let results = sqlx::query_as::<_, (Uuid, Uuid, String, f64)>(
            r#"
            WITH vector_search AS (
                SELECT id, article_id, content,
                       1 - (embedding <=> $1::vector) as vector_score
                FROM article_chunks
                WHERE embedding IS NOT NULL
            ),
            text_search AS (
                SELECT id,
                       ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', $2)) as text_score
                FROM article_chunks
            )
            SELECT
                v.id, v.article_id, v.content,
                (v.vector_score * 0.7 + COALESCE(t.text_score, 0) * 0.3) as combined_score
            FROM vector_search v
            LEFT JOIN text_search t ON v.id = t.id
            ORDER BY combined_score DESC
            LIMIT $3
            "#
        )
        .bind(&query_vector)
        .bind(query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(results
            .into_iter()
            .map(|(chunk_id, article_id, content, similarity)| RagSearchResult {
                chunk_id,
                article_id,
                content,
                similarity,
            })
            .collect())
    }
}
```

**Step 2: Update lib.rs**

Add:
```rust
pub mod rag;
pub use rag::{RagService, RagSearchResult, RagAnswer, RagSource};
```

**Step 3: Verify build**

Run: `cargo build -p law-eye-core`
Expected: SUCCESS

---

## Task 5: RAG API Endpoints

**Files:**
- Create: `crates/law-eye-api/src/routes/search.rs`
- Modify: `crates/law-eye-api/src/routes/mod.rs`
- Modify: `crates/law-eye-api/src/state.rs`

**Step 1: Create search routes**

```rust
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(search))
        .route("/semantic", post(semantic_search))
        .route("/ask", post(ask_question))
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    10
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SearchResultItem {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    pub score: f64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SearchResponse {
    pub results: Vec<SearchResultItem>,
    pub total: usize,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SemanticSearchRequest {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SemanticSearchResult {
    pub chunk_id: Uuid,
    pub article_id: Uuid,
    pub content: String,
    pub similarity: f64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SemanticSearchResponse {
    pub results: Vec<SemanticSearchResult>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AskRequest {
    pub question: String,
    #[serde(default = "default_top_k")]
    pub top_k: i64,
}

fn default_top_k() -> i64 {
    5
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AnswerSource {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    pub relevance: f64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AskResponse {
    pub answer: String,
    pub sources: Vec<AnswerSource>,
    pub confidence: f32,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
}

/// Full-text search
#[utoipa::path(
    get,
    path = "/api/v1/search",
    params(
        ("q" = String, Query, description = "Search query"),
        ("limit" = Option<i64>, Query, description = "Max results")
    ),
    responses(
        (status = 200, description = "Search results", body = SearchResponse)
    )
)]
async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    // Use article service for basic search
    match state.article_service.search(&query.q, query.limit).await {
        Ok(articles) => {
            let results: Vec<SearchResultItem> = articles
                .iter()
                .map(|a| SearchResultItem {
                    article_id: a.id,
                    title: a.title.clone(),
                    excerpt: a.summary.clone().unwrap_or_default(),
                    score: 1.0,
                })
                .collect();
            let total = results.len();
            (StatusCode::OK, Json(SearchResponse { results, total })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        )
            .into_response(),
    }
}

/// Semantic vector search
#[utoipa::path(
    post,
    path = "/api/v1/search/semantic",
    request_body = SemanticSearchRequest,
    responses(
        (status = 200, description = "Semantic search results", body = SemanticSearchResponse)
    )
)]
async fn semantic_search(
    State(state): State<AppState>,
    Json(req): Json<SemanticSearchRequest>,
) -> impl IntoResponse {
    match state.rag_service.search(&req.query, req.limit).await {
        Ok(results) => {
            let response = SemanticSearchResponse {
                results: results
                    .into_iter()
                    .map(|r| SemanticSearchResult {
                        chunk_id: r.chunk_id,
                        article_id: r.article_id,
                        content: r.content,
                        similarity: r.similarity,
                    })
                    .collect(),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        )
            .into_response(),
    }
}

/// RAG Q&A endpoint
#[utoipa::path(
    post,
    path = "/api/v1/search/ask",
    request_body = AskRequest,
    responses(
        (status = 200, description = "AI-generated answer", body = AskResponse)
    )
)]
async fn ask_question(
    State(state): State<AppState>,
    Json(req): Json<AskRequest>,
) -> impl IntoResponse {
    match state.rag_service.answer(&req.question, req.top_k).await {
        Ok(answer) => {
            let response = AskResponse {
                answer: answer.answer,
                sources: answer
                    .sources
                    .into_iter()
                    .map(|s| AnswerSource {
                        article_id: s.article_id,
                        title: s.title,
                        excerpt: s.excerpt,
                        relevance: s.relevance,
                    })
                    .collect(),
                confidence: answer.confidence,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        )
            .into_response(),
    }
}
```

**Step 2: Update routes/mod.rs**

Add `pub mod search;` and register router:
```rust
.nest("/api/v1/search", search::router())
```

**Step 3: Update state.rs with RAG service**

Add `rag_service: RagService` field and initialization.

**Step 4: Verify build**

Run: `cargo build -p law-eye-api`
Expected: SUCCESS

---

## Task 6: API Key Management

**Files:**
- Create: `crates/law-eye-core/src/apikey.rs`
- Create: `crates/law-eye-api/src/routes/apikeys.rs`
- Modify: `crates/law-eye-core/src/lib.rs`
- Modify: `crates/law-eye-api/src/routes/mod.rs`

**Step 1: Create API key service**

```rust
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::SaltString;
use law_eye_common::{Error, Result};
use law_eye_db::{ApiKey, CreateApiKey};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

pub struct ApiKeyService {
    pool: PgPool,
}

impl ApiKeyService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Generate a new API key
    pub async fn create(&self, input: CreateApiKey) -> Result<(ApiKey, String)> {
        // Generate random API key
        let raw_key = self.generate_key();
        let key_prefix = &raw_key[..8];

        // Hash the key
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let key_hash = argon2
            .hash_password(raw_key.as_bytes(), &salt)
            .map_err(|e| Error::Internal(format!("Failed to hash API key: {}", e)))?
            .to_string();

        let permissions = input.permissions.unwrap_or_else(|| vec!["read".to_string()]);
        let rate_limit = input.rate_limit.unwrap_or(100);

        let api_key = sqlx::query_as::<_, ApiKey>(
            r#"
            INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, rate_limit, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#
        )
        .bind(input.user_id)
        .bind(&input.name)
        .bind(&key_hash)
        .bind(key_prefix)
        .bind(serde_json::json!(permissions))
        .bind(rate_limit)
        .bind(input.expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        // Return the raw key only once - user must store it
        Ok((api_key, raw_key))
    }

    /// Verify an API key and return the key record
    pub async fn verify(&self, raw_key: &str) -> Result<ApiKey> {
        if raw_key.len() < 8 {
            return Err(Error::Unauthorized("Invalid API key".to_string()));
        }

        let prefix = &raw_key[..8];

        let api_key = sqlx::query_as::<_, ApiKey>(
            "SELECT * FROM api_keys WHERE key_prefix = $1 AND is_active = true"
        )
        .bind(prefix)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::Unauthorized("Invalid API key".to_string()))?;

        // Check expiration
        if let Some(expires_at) = api_key.expires_at {
            if expires_at < chrono::Utc::now() {
                return Err(Error::Unauthorized("API key expired".to_string()));
            }
        }

        // Verify hash
        let parsed_hash = PasswordHash::new(&api_key.key_hash)
            .map_err(|e| Error::Internal(format!("Invalid hash: {}", e)))?;

        Argon2::default()
            .verify_password(raw_key.as_bytes(), &parsed_hash)
            .map_err(|_| Error::Unauthorized("Invalid API key".to_string()))?;

        // Update last_used
        sqlx::query("UPDATE api_keys SET last_used = NOW() WHERE id = $1")
            .bind(api_key.id)
            .execute(&self.pool)
            .await
            .ok();

        Ok(api_key)
    }

    /// List API keys for a user (without hashes)
    pub async fn list_by_user(&self, user_id: Uuid) -> Result<Vec<ApiKey>> {
        let keys = sqlx::query_as::<_, ApiKey>(
            "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC"
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(keys)
    }

    /// Revoke an API key
    pub async fn revoke(&self, id: Uuid, user_id: Uuid) -> Result<()> {
        let result = sqlx::query(
            "UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2"
        )
        .bind(id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(Error::NotFound("API key not found".to_string()));
        }

        Ok(())
    }

    /// Delete an API key
    pub async fn delete(&self, id: Uuid, user_id: Uuid) -> Result<()> {
        let result = sqlx::query(
            "DELETE FROM api_keys WHERE id = $1 AND user_id = $2"
        )
        .bind(id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(Error::NotFound("API key not found".to_string()));
        }

        Ok(())
    }

    fn generate_key(&self) -> String {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let mut rng = rand::thread_rng();

        let key: String = (0..32)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect();

        format!("le_{}", key) // le_ prefix for Law Eye
    }
}
```

**Step 2: Create API routes**

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_keys))
        .route("/", post(create_key))
        .route("/:id", delete(delete_key))
        .route("/:id/revoke", post(revoke_key))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateKeyRequest {
    pub name: String,
    pub permissions: Option<Vec<String>>,
    pub rate_limit: Option<i32>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub permissions: serde_json::Value,
    pub rate_limit: i32,
    pub is_active: bool,
    pub last_used: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreateKeyResponse {
    pub key: ApiKeyResponse,
    pub raw_key: String, // Only returned on creation
}

#[derive(Debug, Serialize, ToSchema)]
pub struct KeyListResponse {
    pub keys: Vec<ApiKeyResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// List user's API keys
#[utoipa::path(
    get,
    path = "/api/v1/apikeys",
    responses(
        (status = 200, description = "List of API keys", body = KeyListResponse),
        (status = 401, description = "Not authenticated")
    )
)]
async fn list_keys(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse { error: "Not authenticated".to_string() }),
            ).into_response();
        }
    };

    match state.apikey_service.list_by_user(user.id).await {
        Ok(keys) => {
            let response = KeyListResponse {
                keys: keys.into_iter().map(|k| ApiKeyResponse {
                    id: k.id,
                    name: k.name,
                    key_prefix: k.key_prefix,
                    permissions: k.permissions,
                    rate_limit: k.rate_limit,
                    is_active: k.is_active,
                    last_used: k.last_used,
                    created_at: k.created_at,
                }).collect(),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        ).into_response(),
    }
}

/// Create a new API key
#[utoipa::path(
    post,
    path = "/api/v1/apikeys",
    request_body = CreateKeyRequest,
    responses(
        (status = 201, description = "API key created", body = CreateKeyResponse),
        (status = 401, description = "Not authenticated")
    )
)]
async fn create_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<CreateKeyRequest>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse { error: "Not authenticated".to_string() }),
            ).into_response();
        }
    };

    let input = law_eye_db::CreateApiKey {
        user_id: Some(user.id),
        name: req.name,
        permissions: req.permissions,
        rate_limit: req.rate_limit,
        expires_at: None,
    };

    match state.apikey_service.create(input).await {
        Ok((key, raw_key)) => {
            let response = CreateKeyResponse {
                key: ApiKeyResponse {
                    id: key.id,
                    name: key.name,
                    key_prefix: key.key_prefix,
                    permissions: key.permissions,
                    rate_limit: key.rate_limit,
                    is_active: key.is_active,
                    last_used: key.last_used,
                    created_at: key.created_at,
                },
                raw_key,
            };
            (StatusCode::CREATED, Json(response)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        ).into_response(),
    }
}

/// Revoke an API key
#[utoipa::path(
    post,
    path = "/api/v1/apikeys/{id}/revoke",
    params(("id" = Uuid, Path, description = "API key ID")),
    responses(
        (status = 200, description = "Key revoked", body = SuccessResponse),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Key not found")
    )
)]
async fn revoke_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse { error: "Not authenticated".to_string() }),
            ).into_response();
        }
    };

    match state.apikey_service.revoke(id, user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(SuccessResponse { success: true, message: "API key revoked".to_string() }),
        ).into_response(),
        Err(e) => {
            let status = if e.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status, Json(ErrorResponse { error: e.to_string() })).into_response()
        }
    }
}

/// Delete an API key
#[utoipa::path(
    delete,
    path = "/api/v1/apikeys/{id}",
    params(("id" = Uuid, Path, description = "API key ID")),
    responses(
        (status = 200, description = "Key deleted", body = SuccessResponse),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Key not found")
    )
)]
async fn delete_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse { error: "Not authenticated".to_string() }),
            ).into_response();
        }
    };

    match state.apikey_service.delete(id, user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(SuccessResponse { success: true, message: "API key deleted".to_string() }),
        ).into_response(),
        Err(e) => {
            let status = if e.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status, Json(ErrorResponse { error: e.to_string() })).into_response()
        }
    }
}
```

**Step 3: Update lib.rs and mod.rs**

Add exports and register router.

**Step 4: Verify build**

Run: `cargo build --workspace`
Expected: SUCCESS

---

## Task 7: OpenAPI Documentation

**Files:**
- Modify: `crates/law-eye-api/src/main.rs`

**Step 1: Add utoipa-swagger-ui dependency if not present**

**Step 2: Configure OpenAPI spec generation**

Add OpenAPI documentation endpoint at `/api/docs`.

**Step 3: Verify build**

Run: `cargo build -p law-eye-api`
Expected: SUCCESS

---

## Task 8: Build Verification

**Step 1: Full workspace build**

Run: `cargo build --workspace`
Expected: SUCCESS

**Step 2: Run tests**

Run: `cargo test --workspace`
Expected: All tests pass

**Step 3: Clippy check**

Run: `cargo clippy --workspace`
Expected: No errors (warnings acceptable)

---

## Task 9: MCP Protocol Support

**Files:**
- Create: `crates/law-eye-mcp/` (new crate)

**Step 1: Create MCP server crate structure**

```
crates/law-eye-mcp/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── main.rs
    ├── protocol.rs  # JSON-RPC and MCP types
    └── server.rs    # MCP server implementation
```

**Step 2: Implement MCP protocol types**

- JsonRpcRequest/JsonRpcResponse
- InitializeResult
- ServerCapabilities
- Tool, ListToolsResult
- CallToolParams, CallToolResult
- Resource, ListResourcesResult

**Step 3: Implement MCP tools**

Tools provided:
- `search_articles` - 关键词搜索法律资讯
- `semantic_search` - 语义向量搜索
- `ask_question` - RAG 问答
- `get_recent_articles` - 获取最新文章

**Step 4: Implement MCP resources**

Resources provided:
- `laweye://categories` - 分类列表
- `laweye://stats` - 系统统计

**Step 5: Create stdio-based main loop**

```rust
// Read JSON-RPC from stdin, process, write to stdout
for line in reader.lines() {
    let request = parse(line);
    let response = server.handle_request(request).await;
    writeln!(stdout, "{}", response);
}
```

**Step 6: Add to workspace and verify build**

Run: `cargo build -p law-eye-mcp`
Expected: SUCCESS

**Step 7: Create example MCP configuration**

Create `config/mcp-config.example.json` for Claude Desktop.

---

## Summary

Phase 4 完成以下功能：

1. ✅ 知识图谱数据库设计 (entities, relations, article_entities)
2. ✅ 实体提取服务 (EntityExtractor)
3. ✅ 知识图谱服务层 (KnowledgeService)
4. ✅ RAG 搜索服务 (RagService)
5. ✅ RAG API 端点 (/search, /semantic, /ask)
6. ✅ API 密钥管理 (ApiKeyService)
7. ✅ OpenAPI 文档
8. ✅ 构建验证
9. ✅ MCP 协议支持 (law-eye-mcp crate)

