use crate::tenant::with_tenant_tx;
use law_eye_ai::{Embedder, EntityExtractor, ExtractedEntity, LlmGateway};
use law_eye_common::{Error, Result};
use law_eye_db::Entity;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

pub struct KnowledgeService {
    pool: PgPool,
    entity_extractor: EntityExtractor,
    embedder: Embedder,
}

impl KnowledgeService {
    pub fn new(pool: PgPool, gateway: Arc<LlmGateway>) -> Self {
        Self {
            pool: pool.clone(),
            entity_extractor: EntityExtractor::new(gateway.clone()),
            embedder: Embedder::new(gateway),
        }
    }

    /// Extract and store entities from an article
    pub async fn process_article(
        &self,
        tenant_id: Uuid,
        article_id: Uuid,
        title: &str,
        content: &str,
    ) -> Result<Vec<Uuid>> {
        let extraction = self.entity_extractor.extract(title, content).await?;
        let mut entity_ids = Vec::new();
        let mut entity_id_map: std::collections::HashMap<(String, String), Uuid> =
            std::collections::HashMap::new();

        // Process entities
        for extracted in &extraction.entities {
            let embedding = self.embedder.embed(&extracted.name).await?;

            let entity_id = self
                .upsert_entity(tenant_id, extracted, &embedding.vector)
                .await?;
            self.link_article_entity(tenant_id, article_id, entity_id, extracted)
                .await?;

            entity_ids.push(entity_id);
            entity_id_map.insert(
                (extracted.name.clone(), extracted.entity_type.clone()),
                entity_id,
            );
        }

        // Process relations
        for relation in &extraction.relations {
            let source = extraction.entities.iter().find(|e| e.name == relation.source);
            let target = extraction.entities.iter().find(|e| e.name == relation.target);
            let (Some(source), Some(target)) = (source, target) else {
                continue;
            };

            let source_id = entity_id_map.get(&(source.name.clone(), source.entity_type.clone()));
            let target_id = entity_id_map.get(&(target.name.clone(), target.entity_type.clone()));
            let (Some(&source_id), Some(&target_id)) = (source_id, target_id) else {
                continue;
            };

            self.upsert_relation(tenant_id, source_id, target_id, relation).await?;
        }

        info!(
            "Processed {} entities for article {}",
            entity_ids.len(),
            article_id
        );
        Ok(entity_ids)
    }

    async fn upsert_entity(
        &self,
        tenant_id: Uuid,
        extracted: &ExtractedEntity,
        embedding: &[f32],
    ) -> Result<Uuid> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let entity = sqlx::query_as::<_, Entity>(
                r#"
                INSERT INTO entities (name, entity_type, aliases, embedding, mention_count)
                VALUES ($1, $2, $3, $4::vector, 1)
                ON CONFLICT (tenant_id, name, entity_type) DO UPDATE SET
                    aliases = CASE
                        WHEN entities.aliases @> $3 THEN entities.aliases
                        ELSE entities.aliases || $3
                    END,
                    mention_count = entities.mention_count + 1,
                    last_seen = NOW(),
                    updated_at = NOW()
                RETURNING *
                "#,
            )
            .bind(&extracted.name)
            .bind(&extracted.entity_type)
            .bind(&extracted.aliases)
            .bind(embedding)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(entity.id)
        }))
        .await
    }

    async fn link_article_entity(
        &self,
        tenant_id: Uuid,
        article_id: Uuid,
        entity_id: Uuid,
        extracted: &ExtractedEntity,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query(
                r#"
                INSERT INTO article_entities (article_id, entity_id, mention_count, relevance_score, context)
                VALUES ($1, $2, 1, $3, $4)
                ON CONFLICT (tenant_id, article_id, entity_id) DO UPDATE SET
                    mention_count = article_entities.mention_count + 1,
                    relevance_score = GREATEST(article_entities.relevance_score, $3)
                "#,
            )
            .bind(article_id)
            .bind(entity_id)
            .bind(extracted.relevance as f64)
            .bind(&extracted.context)
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(())
        }))
        .await
    }

    async fn upsert_relation(
        &self,
        tenant_id: Uuid,
        source_entity_id: Uuid,
        target_entity_id: Uuid,
        relation: &law_eye_ai::ExtractedRelation,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query(
                r#"
                INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type, properties)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (tenant_id, source_entity_id, target_entity_id, relation_type) DO UPDATE SET
                    weight = entity_relations.weight + 1
                "#,
            )
            .bind(source_entity_id)
            .bind(target_entity_id)
            .bind(&relation.relation_type)
            .bind(serde_json::json!({"description": relation.description}))
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
            Ok(())
        }))
        .await
    }

    /// Get entity by ID
    pub async fn get_entity(&self, tenant_id: Uuid, id: Uuid) -> Result<Entity> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Entity>("SELECT * FROM entities WHERE id = $1")
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Entity {} not found", id)))
        }))
        .await
    }

    /// Search entities by name
    pub async fn search_entities(&self, tenant_id: Uuid, query: &str, limit: i64) -> Result<Vec<Entity>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let entities = sqlx::query_as::<_, Entity>(
                r#"
                SELECT * FROM entities
                WHERE to_tsvector('simple', name) @@ plainto_tsquery('simple', $1)
                ORDER BY mention_count DESC
                LIMIT $2
                "#,
            )
            .bind(query)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(entities)
        }))
        .await
    }

    /// Get entities by type
    pub async fn get_entities_by_type(
        &self,
        tenant_id: Uuid,
        entity_type: &str,
        limit: i64,
    ) -> Result<Vec<Entity>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let entities = sqlx::query_as::<_, Entity>(
                "SELECT * FROM entities WHERE entity_type = $1 ORDER BY mention_count DESC LIMIT $2",
            )
            .bind(entity_type)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(entities)
        }))
        .await
    }

    /// Get related entities
    pub async fn get_related_entities(
        &self,
        tenant_id: Uuid,
        entity_id: Uuid,
        limit: i64,
    ) -> Result<Vec<(Uuid, String, String, f64)>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let results = sqlx::query_as::<_, (Uuid, String, String, f64)>(
                r#"
                SELECT e.id, e.name, r.relation_type, r.weight
                FROM entity_relations r
                JOIN entities e ON e.id = r.target_entity_id
                WHERE r.source_entity_id = $1
                ORDER BY r.weight DESC
                LIMIT $2
                "#,
            )
            .bind(entity_id)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(results)
        }))
        .await
    }

    /// Get articles mentioning an entity
    pub async fn get_entity_articles(
        &self,
        tenant_id: Uuid,
        entity_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Uuid>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let results = sqlx::query_as::<_, (Uuid,)>(
                r#"
                SELECT article_id FROM article_entities
                WHERE entity_id = $1
                ORDER BY relevance_score DESC NULLS LAST
                LIMIT $2
                "#,
            )
            .bind(entity_id)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(results.into_iter().map(|(id,)| id).collect())
        }))
        .await
    }

    /// Get top entities overall
    pub async fn get_top_entities(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<Entity>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let entities = sqlx::query_as::<_, Entity>(
                "SELECT * FROM entities ORDER BY mention_count DESC LIMIT $1",
            )
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(entities)
        }))
        .await
    }
}
