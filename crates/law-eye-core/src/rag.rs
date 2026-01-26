use law_eye_ai::{Embedder, LlmGateway};
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
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
    gateway: Arc<LlmGateway>,
}

impl RagService {
    pub fn new(pool: PgPool, gateway: Arc<LlmGateway>) -> Self {
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
            "#,
        )
        .bind(&query_vector)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let search_results: Vec<RagSearchResult> = results
            .into_iter()
            .map(
                |(chunk_id, article_id, content, similarity)| RagSearchResult {
                    chunk_id,
                    article_id,
                    content,
                    similarity,
                },
            )
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
            let title: Option<(String,)> =
                sqlx::query_as("SELECT title FROM articles WHERE id = $1")
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

        let user_prompt = format!("上下文信息:\n{}\n\n用户问题: {}", context, question);

        #[derive(Deserialize)]
        struct LlmResponse {
            answer: String,
            confidence: f32,
        }

        let response: LlmResponse = match self.gateway.chat_json(system_prompt, &user_prompt).await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("LLM chat failed: {}", e);
                LlmResponse {
                    answer: "抱歉，生成回答时出现错误。".to_string(),
                    confidence: 0.0,
                }
            }
        };

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
            "#,
        )
        .bind(&query_vector)
        .bind(query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(results
            .into_iter()
            .map(
                |(chunk_id, article_id, content, similarity)| RagSearchResult {
                    chunk_id,
                    article_id,
                    content,
                    similarity,
                },
            )
            .collect())
    }

    /// Search with entity context (enhanced RAG)
    pub async fn search_with_entities(
        &self,
        query: &str,
        entity_ids: &[Uuid],
        limit: i64,
    ) -> Result<Vec<RagSearchResult>> {
        if entity_ids.is_empty() {
            return self.search(query, limit).await;
        }

        let embedding_result = self.embedder.embed(query).await?;
        let query_vector = embedding_result.vector;

        // Boost results from articles that contain specified entities
        let results = sqlx::query_as::<_, (Uuid, Uuid, String, f64)>(
            r#"
            WITH entity_articles AS (
                SELECT DISTINCT article_id
                FROM article_entities
                WHERE entity_id = ANY($3)
            )
            SELECT
                c.id,
                c.article_id,
                c.content,
                CASE
                    WHEN ea.article_id IS NOT NULL
                    THEN (1 - (c.embedding <=> $1::vector)) * 1.5
                    ELSE 1 - (c.embedding <=> $1::vector)
                END as boosted_similarity
            FROM article_chunks c
            LEFT JOIN entity_articles ea ON c.article_id = ea.article_id
            WHERE c.embedding IS NOT NULL
            ORDER BY boosted_similarity DESC
            LIMIT $2
            "#,
        )
        .bind(&query_vector)
        .bind(limit)
        .bind(entity_ids)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(results
            .into_iter()
            .map(
                |(chunk_id, article_id, content, similarity)| RagSearchResult {
                    chunk_id,
                    article_id,
                    content,
                    similarity,
                },
            )
            .collect())
    }
}
