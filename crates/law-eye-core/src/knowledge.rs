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

        if extraction.entities.is_empty() {
            info!("No entities extracted for article {}", article_id);
            return Ok(vec![]);
        }

        // Batch embedding: embed all entity names concurrently to eliminate
        // N+1 serial API calls.
        let embed_futures: Vec<_> = extraction
            .entities
            .iter()
            .map(|extracted| self.embedder.embed(&extracted.name))
            .collect();
        let embed_results = futures::future::try_join_all(embed_futures).await?;
        let embeddings: Vec<Vec<f32>> = embed_results.into_iter().map(|r| r.vector).collect();

        let mut entity_ids = Vec::with_capacity(extraction.entities.len());
        let mut entity_id_map: std::collections::HashMap<(String, String), Uuid> =
            std::collections::HashMap::new();

        // Process entities with pre-computed embeddings
        for (extracted, embedding) in extraction.entities.iter().zip(embeddings.iter()) {
            let entity_id = self.upsert_entity(tenant_id, extracted, embedding).await?;
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
            let source = extraction
                .entities
                .iter()
                .find(|e| e.name == relation.source);
            let target = extraction
                .entities
                .iter()
                .find(|e| e.name == relation.target);
            let (Some(source), Some(target)) = (source, target) else {
                continue;
            };

            let source_id = entity_id_map.get(&(source.name.clone(), source.entity_type.clone()));
            let target_id = entity_id_map.get(&(target.name.clone(), target.entity_type.clone()));
            let (Some(&source_id), Some(&target_id)) = (source_id, target_id) else {
                continue;
            };

            self.upsert_relation(tenant_id, source_id, target_id, relation)
                .await?;
        }

        info!(
            "Processed {} entities and {} relations for article {}",
            entity_ids.len(),
            extraction.relations.len(),
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
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
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
            })
        })
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
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Entity>("SELECT * FROM entities WHERE id = $1")
                    .bind(id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
                    .ok_or_else(|| Error::NotFound(format!("Entity {} not found", id)))
            })
        })
        .await
    }

    /// Search entities by name
    pub async fn search_entities(
        &self,
        tenant_id: Uuid,
        query: &str,
        limit: i64,
    ) -> Result<Vec<Entity>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
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
            })
        })
        .await
    }

    /// Semantic search entities using vector similarity (HNSW index)
    pub async fn semantic_search(
        &self,
        tenant_id: Uuid,
        query: &str,
        limit: i64,
    ) -> Result<Vec<(Entity, f64)>> {
        // Generate embedding for the query text
        let query_embedding = self.embedder.embed(query).await?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let vector = query_embedding.vector.clone();
            Box::pin(async move {
                // Use pgvector cosine distance operator (<=>)
                // Lower distance = more similar; convert to similarity score
                let rows = sqlx::query_as::<
                    _,
                    (
                        Uuid,
                        Uuid,
                        String,
                        String,
                        Vec<String>,
                        serde_json::Value,
                        i32,
                        chrono::DateTime<chrono::Utc>,
                        chrono::DateTime<chrono::Utc>,
                        chrono::DateTime<chrono::Utc>,
                        chrono::DateTime<chrono::Utc>,
                        f64,
                    ),
                >(
                    r#"
                    SELECT
                        e.id, e.tenant_id, e.name, e.entity_type, e.aliases,
                        e.properties, e.mention_count,
                        e.first_seen, e.last_seen, e.created_at, e.updated_at,
                        1 - (e.embedding <=> $1::vector) AS similarity
                    FROM entities e
                    WHERE e.embedding IS NOT NULL
                    ORDER BY e.embedding <=> $1::vector
                    LIMIT $2
                    "#,
                )
                .bind(&vector as &[f32])
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let results = rows
                    .into_iter()
                    .map(
                        |(
                            id,
                            tenant_id,
                            name,
                            entity_type,
                            aliases,
                            properties,
                            mention_count,
                            first_seen,
                            last_seen,
                            created_at,
                            updated_at,
                            similarity,
                        )| {
                            (
                                Entity {
                                    id,
                                    tenant_id,
                                    name,
                                    entity_type,
                                    aliases,
                                    properties,
                                    embedding: None,
                                    mention_count,
                                    first_seen,
                                    last_seen,
                                    created_at,
                                    updated_at,
                                },
                                similarity,
                            )
                        },
                    )
                    .collect();

                Ok(results)
            })
        })
        .await
    }

    /// Hybrid search: combine text search and vector similarity
    pub async fn hybrid_search(
        &self,
        tenant_id: Uuid,
        query: &str,
        limit: i64,
    ) -> Result<Vec<Entity>> {
        // Run text search and semantic search in parallel
        let (text_results, semantic_results) = tokio::try_join!(
            self.search_entities(tenant_id, query, limit),
            self.semantic_search(tenant_id, query, limit),
        )?;

        // Merge results: use a map to deduplicate by entity ID
        let mut entity_scores: std::collections::HashMap<Uuid, (Entity, f64)> =
            std::collections::HashMap::new();

        // Text search results get a base score based on mention_count
        for entity in text_results {
            let score = entity.mention_count as f64 * 0.01;
            entity_scores.insert(entity.id, (entity, score + 0.5)); // text match bonus
        }

        // Semantic results use similarity score
        for (entity, similarity) in semantic_results {
            entity_scores
                .entry(entity.id)
                .and_modify(|(_, score)| *score += similarity)
                .or_insert((entity, similarity));
        }

        // Sort by combined score descending
        let mut results: Vec<(Entity, f64)> = entity_scores.into_values().collect();
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit as usize);

        Ok(results.into_iter().map(|(entity, _)| entity).collect())
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
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
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
            })
        })
        .await
    }

    /// Get articles mentioning an entity
    pub async fn get_entity_articles(
        &self,
        tenant_id: Uuid,
        entity_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Uuid>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
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
            })
        })
        .await
    }

    /// Get top entities overall
    pub async fn get_top_entities(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<Entity>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let entities = sqlx::query_as::<_, Entity>(
                    "SELECT * FROM entities ORDER BY mention_count DESC LIMIT $1",
                )
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(entities)
            })
        })
        .await
    }

    /// Find potentially duplicate entities using embedding similarity
    pub async fn find_duplicate_candidates(
        &self,
        tenant_id: Uuid,
        similarity_threshold: f64,
        limit: i64,
    ) -> Result<Vec<(Entity, Entity, f64)>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // Find pairs of entities with high embedding similarity
                // that are NOT already the same entity
                let rows = sqlx::query_as::<
                    _,
                    (Uuid, String, String, i32, Uuid, String, String, i32, f64),
                >(
                    r#"
                    SELECT
                        e1.id, e1.name, e1.entity_type, e1.mention_count,
                        e2.id, e2.name, e2.entity_type, e2.mention_count,
                        1 - (e1.embedding <=> e2.embedding) AS similarity
                    FROM entities e1
                    JOIN entities e2 ON e1.id < e2.id
                        AND e1.entity_type = e2.entity_type
                        AND e1.embedding IS NOT NULL
                        AND e2.embedding IS NOT NULL
                    WHERE 1 - (e1.embedding <=> e2.embedding) > $1
                    ORDER BY similarity DESC
                    LIMIT $2
                    "#,
                )
                .bind(similarity_threshold)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let results = rows
                    .into_iter()
                    .map(|(id1, name1, etype1, mc1, id2, name2, etype2, mc2, sim)| {
                        let e1 = Entity {
                            id: id1,
                            tenant_id,
                            name: name1,
                            entity_type: etype1,
                            aliases: vec![],
                            properties: serde_json::Value::Object(Default::default()),
                            embedding: None,
                            mention_count: mc1,
                            first_seen: chrono::Utc::now(),
                            last_seen: chrono::Utc::now(),
                            created_at: chrono::Utc::now(),
                            updated_at: chrono::Utc::now(),
                        };
                        let e2 = Entity {
                            id: id2,
                            tenant_id,
                            name: name2,
                            entity_type: etype2,
                            aliases: vec![],
                            properties: serde_json::Value::Object(Default::default()),
                            embedding: None,
                            mention_count: mc2,
                            first_seen: chrono::Utc::now(),
                            last_seen: chrono::Utc::now(),
                            created_at: chrono::Utc::now(),
                            updated_at: chrono::Utc::now(),
                        };
                        (e1, e2, sim)
                    })
                    .collect();

                Ok(results)
            })
        })
        .await
    }

    /// Merge entity `source_id` into `target_id`:
    /// - Move all article_entities references
    /// - Move all entity_relations references
    /// - Merge aliases
    /// - Delete the source entity
    pub async fn merge_entities(
        &self,
        tenant_id: Uuid,
        target_id: Uuid,
        source_id: Uuid,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 1. Get source entity aliases to merge
                let source_aliases: Vec<String> = sqlx::query_scalar(
                    "SELECT aliases FROM entities WHERE id = $1"
                )
                .bind(source_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let source_name: String = sqlx::query_scalar(
                    "SELECT name FROM entities WHERE id = $1"
                )
                .bind(source_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // 2. Merge aliases: add source's name and aliases to target
                let mut all_new_aliases = source_aliases;
                all_new_aliases.push(source_name);

                sqlx::query(
                    r#"
                    UPDATE entities SET
                        aliases = (SELECT array_agg(DISTINCT a) FROM unnest(aliases || $2) AS a),
                        mention_count = mention_count + (SELECT mention_count FROM entities WHERE id = $3),
                        updated_at = NOW()
                    WHERE id = $1
                    "#,
                )
                .bind(target_id)
                .bind(&all_new_aliases)
                .bind(source_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // 3. Re-point article_entities from source to target
                // Use ON CONFLICT to handle cases where both entities were linked to same article
                sqlx::query(
                    r#"
                    UPDATE article_entities SET entity_id = $1
                    WHERE entity_id = $2
                    AND NOT EXISTS (
                        SELECT 1 FROM article_entities ae2
                        WHERE ae2.article_id = article_entities.article_id AND ae2.entity_id = $1
                    )
                    "#,
                )
                .bind(target_id)
                .bind(source_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // Delete remaining article_entities pointing to source (duplicates)
                sqlx::query("DELETE FROM article_entities WHERE entity_id = $1")
                    .bind(source_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                // 4. Re-point entity_relations
                sqlx::query(
                    r#"
                    UPDATE entity_relations SET source_entity_id = $1
                    WHERE source_entity_id = $2
                    AND NOT EXISTS (
                        SELECT 1 FROM entity_relations er2
                        WHERE er2.source_entity_id = $1
                        AND er2.target_entity_id = entity_relations.target_entity_id
                        AND er2.relation_type = entity_relations.relation_type
                    )
                    "#,
                )
                .bind(target_id)
                .bind(source_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                sqlx::query(
                    r#"
                    UPDATE entity_relations SET target_entity_id = $1
                    WHERE target_entity_id = $2
                    AND NOT EXISTS (
                        SELECT 1 FROM entity_relations er2
                        WHERE er2.target_entity_id = $1
                        AND er2.source_entity_id = entity_relations.source_entity_id
                        AND er2.relation_type = entity_relations.relation_type
                    )
                    "#,
                )
                .bind(target_id)
                .bind(source_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // Delete remaining relations pointing to/from source
                sqlx::query(
                    "DELETE FROM entity_relations WHERE source_entity_id = $1 OR target_entity_id = $1"
                )
                .bind(source_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // 5. Delete the source entity
                sqlx::query("DELETE FROM entities WHERE id = $1")
                    .bind(source_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                info!(
                    target_id = %target_id,
                    source_id = %source_id,
                    "Entity merge completed"
                );

                Ok(())
            })
        })
        .await
    }

    /// Compute degree centrality for entities (number of connections).
    /// Returns entities sorted by total degree (incoming + outgoing).
    pub async fn compute_degree_centrality(
        &self,
        tenant_id: Uuid,
        limit: i64,
    ) -> Result<Vec<(Entity, i64, i64, i64)>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows = sqlx::query_as::<
                    _,
                    (
                        Uuid,
                        String,
                        String,
                        Vec<String>,
                        serde_json::Value,
                        i32,
                        chrono::DateTime<chrono::Utc>,
                        chrono::DateTime<chrono::Utc>,
                        chrono::DateTime<chrono::Utc>,
                        chrono::DateTime<chrono::Utc>,
                        i64,
                        i64,
                    ),
                >(
                    r#"
                    SELECT
                        e.id, e.name, e.entity_type, e.aliases, e.properties, e.mention_count,
                        e.first_seen, e.last_seen, e.created_at, e.updated_at,
                        COALESCE(out_d.cnt, 0) AS out_degree,
                        COALESCE(in_d.cnt, 0) AS in_degree
                    FROM entities e
                    LEFT JOIN (
                        SELECT source_entity_id AS eid, COUNT(*) AS cnt
                        FROM entity_relations GROUP BY source_entity_id
                    ) out_d ON out_d.eid = e.id
                    LEFT JOIN (
                        SELECT target_entity_id AS eid, COUNT(*) AS cnt
                        FROM entity_relations GROUP BY target_entity_id
                    ) in_d ON in_d.eid = e.id
                    WHERE COALESCE(out_d.cnt, 0) + COALESCE(in_d.cnt, 0) > 0
                    ORDER BY COALESCE(out_d.cnt, 0) + COALESCE(in_d.cnt, 0) DESC
                    LIMIT $1
                    "#,
                )
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let results = rows
                    .into_iter()
                    .map(
                        |(
                            id,
                            name,
                            entity_type,
                            aliases,
                            properties,
                            mention_count,
                            first_seen,
                            last_seen,
                            created_at,
                            updated_at,
                            out_degree,
                            in_degree,
                        )| {
                            let entity = Entity {
                                id,
                                tenant_id,
                                name,
                                entity_type,
                                aliases,
                                properties,
                                embedding: None,
                                mention_count,
                                first_seen,
                                last_seen,
                                created_at,
                                updated_at,
                            };
                            let total = out_degree + in_degree;
                            (entity, out_degree, in_degree, total)
                        },
                    )
                    .collect();

                Ok(results)
            })
        })
        .await
    }

    /// Get entity co-occurrence network: entities that frequently appear
    /// in the same articles.
    pub async fn get_cooccurrence_network(
        &self,
        tenant_id: Uuid,
        min_cooccurrence: i64,
        limit: i64,
    ) -> Result<Vec<(Uuid, String, Uuid, String, i64)>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows = sqlx::query_as::<_, (Uuid, String, Uuid, String, i64)>(
                    r#"
                    SELECT
                        e1.id AS entity1_id,
                        e1.name AS entity1_name,
                        e2.id AS entity2_id,
                        e2.name AS entity2_name,
                        COUNT(*) AS cooccurrence_count
                    FROM article_entities ae1
                    JOIN article_entities ae2 ON ae1.article_id = ae2.article_id
                        AND ae1.entity_id < ae2.entity_id
                    JOIN entities e1 ON e1.id = ae1.entity_id
                    JOIN entities e2 ON e2.id = ae2.entity_id
                    GROUP BY e1.id, e1.name, e2.id, e2.name
                    HAVING COUNT(*) >= $1
                    ORDER BY cooccurrence_count DESC
                    LIMIT $2
                    "#,
                )
                .bind(min_cooccurrence)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(rows)
            })
        })
        .await
    }

    /// Get graph statistics summary
    pub async fn get_graph_stats(&self, tenant_id: Uuid) -> Result<GraphStats> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let (entity_count,): (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM entities"
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let (relation_count,): (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM entity_relations"
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let (article_entity_count,): (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM article_entities"
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let type_distribution = sqlx::query_as::<_, (String, i64)>(
                    "SELECT entity_type, COUNT(*) AS cnt FROM entities GROUP BY entity_type ORDER BY cnt DESC"
                )
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let (entities_with_embedding,): (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM entities WHERE embedding IS NOT NULL"
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(GraphStats {
                    entity_count,
                    relation_count,
                    article_entity_count,
                    entities_with_embedding,
                    type_distribution,
                })
            })
        })
        .await
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GraphStats {
    pub entity_count: i64,
    pub relation_count: i64,
    pub article_entity_count: i64,
    pub entities_with_embedding: i64,
    pub type_distribution: Vec<(String, i64)>,
}
