use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use super::dto::{
    BackfillRequest, BackfillResponse, EntityArticleResponse, EntityArticlesQuery,
    KnowledgeEntityResponse, RelatedEntitiesQuery, RelatedEntityResponse, RelationDirection,
    SearchEntitiesQuery, TopEntitiesQuery,
};
use super::permissions::require_articles_read;
use super::queries::{clamp_limit, fetch_entity_articles, fetch_related_entities, run_backfill};
use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiJson, ApiQuery, ApiResult, AppError};

const QUEUE_AI: &str = "queue:ai";

fn ai_extract_entities_dedupe_key(article_id: Uuid) -> String {
    format!("ai:{article_id}:extract_entities")
}

async fn enqueue_extract_entities_outbox_tasks(
    pool: &sqlx::PgPool,
    tenant_id: Uuid,
    article_ids: &[Uuid],
) -> Result<i64, law_eye_common::Error> {
    if article_ids.is_empty() {
        return Ok(0);
    }

    let article_ids = article_ids.to_vec();
    law_eye_core::with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let mut inserted: i64 = 0;
            for article_id in article_ids {
                let retryable_task = law_eye_queue::RetryableTask::new(law_eye_queue::AiTask {
                    tenant_id,
                    article_id,
                    task_type: law_eye_queue::AiTaskType::ExtractEntities,
                });
                let payload = serde_json::to_value(retryable_task)
                    .map_err(|e| law_eye_common::Error::Internal(e.to_string()))?;

                let result = sqlx::query(
                    r#"
                    INSERT INTO queue_outbox (queue, dedupe_key, payload)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (tenant_id, queue, dedupe_key) WHERE delivered_at IS NULL DO NOTHING
                    "#,
                )
                .bind(QUEUE_AI)
                .bind(ai_extract_entities_dedupe_key(article_id))
                .bind(payload)
                .execute(tx.as_mut())
                .await
                .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;

                inserted += result.rows_affected() as i64;
            }

            Ok(inserted)
        })
    })
    .await
}

pub(crate) async fn list_top_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<TopEntitiesQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let limit = clamp_limit(query.limit, 50, 200);
    let entities = state
        .knowledge_service
        .get_top_entities(user.tenant_id, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        entities
            .into_iter()
            .map(KnowledgeEntityResponse::from)
            .collect(),
    ))
}

pub(crate) async fn search_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<SearchEntitiesQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let term = query.q.trim();
    if term.is_empty() {
        return Err(AppError::validation("Query must not be empty"));
    }

    let limit = clamp_limit(query.limit, 20, 100);
    let entities = state
        .knowledge_service
        .search_entities(user.tenant_id, term, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        entities
            .into_iter()
            .map(KnowledgeEntityResponse::from)
            .collect(),
    ))
}

pub(crate) async fn get_entity(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<KnowledgeEntityResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let entity = state
        .knowledge_service
        .get_entity(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(entity.into()))
}

pub(crate) async fn get_related_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<RelatedEntitiesQuery>,
) -> ApiResult<Json<Vec<RelatedEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let limit = clamp_limit(query.limit, 20, 50);

    let (outgoing, incoming) =
        fetch_related_entities(&state.pool, user.tenant_id, id, limit).await?;

    let mut result = Vec::with_capacity(outgoing.len() + incoming.len());

    for row in outgoing {
        let relation_type = row.relation_type.clone();
        let weight = row.weight;
        result.push(RelatedEntityResponse {
            entity: KnowledgeEntityResponse::from(row),
            relation_type,
            weight,
            direction: RelationDirection::Outgoing,
        });
    }

    for row in incoming {
        let relation_type = row.relation_type.clone();
        let weight = row.weight;
        result.push(RelatedEntityResponse {
            entity: KnowledgeEntityResponse::from(row),
            relation_type,
            weight,
            direction: RelationDirection::Incoming,
        });
    }

    result.sort_by(|a, b| b.weight.total_cmp(&a.weight));
    Ok(Json(result))
}

pub(crate) async fn get_entity_articles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<EntityArticlesQuery>,
) -> ApiResult<Json<Vec<EntityArticleResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let limit = clamp_limit(query.limit, 10, 50);
    let items = fetch_entity_articles(&state.pool, user.tenant_id, id, limit).await?;

    Ok(Json(items))
}

pub(crate) async fn backfill(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<BackfillRequest>,
) -> ApiResult<Json<BackfillResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let limit = clamp_limit(req.limit, 500, 5_000);
    let stats = run_backfill(&state.pool, user.tenant_id, limit).await?;

    Ok(Json(stats))
}

/// Enqueue articles for LLM-driven entity extraction.
/// Only articles that have NOT been entity-extracted yet will be enqueued.
pub(crate) async fn backfill_llm(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<super::dto::LlmBackfillRequest>,
) -> ApiResult<Json<super::dto::LlmBackfillResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let limit = clamp_limit(req.limit, 100, 1_000);
    let tenant_id = user.tenant_id;

    // Find articles that have content and need LLM extraction:
    // 1) no article_entities link yet, or
    // 2) linked entities exist but embeddings are still NULL.
    // Must use with_tenant_tx to ensure RLS sees the correct tenant context
    let article_ids: Vec<uuid::Uuid> = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let ids = sqlx::query_scalar(
                r#"
                    SELECT a.id
                    FROM articles a
                    WHERE a.content IS NOT NULL
                        AND LENGTH(TRIM(COALESCE(a.content, ''))) > 0
                        AND (
                            NOT EXISTS (
                                SELECT 1
                                FROM article_entities ae
                                WHERE ae.article_id = a.id
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM article_entities ae
                                JOIN entities e ON e.id = ae.entity_id
                                WHERE ae.article_id = a.id
                                  AND e.embedding IS NULL
                            )
                        )
                    ORDER BY a.published_at DESC NULLS LAST
                    LIMIT $1
                    "#,
            )
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
            Ok(ids)
        })
    })
    .await
    .map_err(AppError::from)?;

    let enqueued = enqueue_extract_entities_outbox_tasks(&state.pool, tenant_id, &article_ids)
        .await
        .map_err(AppError::from)?;

    let entities_embedded = state
        .knowledge_service
        .backfill_missing_entity_embeddings(tenant_id, limit)
        .await
        .map_err(AppError::from)?;

    tracing::info!(
        enqueued = enqueued,
        entities_embedded = entities_embedded,
        total_candidates = article_ids.len(),
        deduped_existing = article_ids.len() as i64 - enqueued,
        "LLM backfill: enqueued deduped article tasks and backfilled missing entity embeddings"
    );

    Ok(Json(super::dto::LlmBackfillResponse {
        articles_enqueued: enqueued,
    }))
}

pub(crate) async fn semantic_search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<super::dto::SemanticSearchQuery>,
) -> ApiResult<Json<Vec<super::dto::SemanticSearchEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let term = query.q.trim();
    if term.is_empty() {
        return Err(AppError::validation("Query must not be empty"));
    }

    let limit = clamp_limit(query.limit, 20, 100);
    let results = state
        .knowledge_service
        .semantic_search(user.tenant_id, term, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        results
            .into_iter()
            .map(
                |(entity, similarity)| super::dto::SemanticSearchEntityResponse {
                    entity: KnowledgeEntityResponse::from(entity),
                    similarity,
                },
            )
            .collect(),
    ))
}

pub(crate) async fn hybrid_search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<super::dto::HybridSearchQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let term = query.q.trim();
    if term.is_empty() {
        return Err(AppError::validation("Query must not be empty"));
    }

    let limit = clamp_limit(query.limit, 20, 100);
    let entities = state
        .knowledge_service
        .hybrid_search(user.tenant_id, term, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        entities
            .into_iter()
            .map(KnowledgeEntityResponse::from)
            .collect(),
    ))
}

pub(crate) async fn get_entities_by_type(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<super::dto::EntitiesByTypeQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let entity_type = query.entity_type.trim();
    if entity_type.is_empty() {
        return Err(AppError::validation("entity_type must not be empty"));
    }

    let limit = clamp_limit(query.limit, 50, 200);
    let entities = state
        .knowledge_service
        .get_entities_by_type(user.tenant_id, entity_type, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        entities
            .into_iter()
            .map(KnowledgeEntityResponse::from)
            .collect(),
    ))
}

pub(crate) async fn find_duplicate_candidates(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<super::dto::DuplicateCandidatesQuery>,
) -> ApiResult<Json<Vec<super::dto::DuplicateCandidatePair>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let threshold = query.similarity_threshold.unwrap_or(0.85).clamp(0.5, 0.99);
    let limit = clamp_limit(query.limit, 20, 100);

    let pairs = state
        .knowledge_service
        .find_duplicate_candidates(user.tenant_id, threshold, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        pairs
            .into_iter()
            .map(|(e1, e2, sim)| super::dto::DuplicateCandidatePair {
                entity1: KnowledgeEntityResponse::from(e1),
                entity2: KnowledgeEntityResponse::from(e2),
                similarity: sim,
            })
            .collect(),
    ))
}

pub(crate) async fn merge_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<super::dto::MergeEntitiesRequest>,
) -> ApiResult<Json<super::dto::MergeEntitiesResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    if req.target_id == req.source_id {
        return Err(AppError::validation("target_id and source_id must differ"));
    }

    state
        .knowledge_service
        .merge_entities(user.tenant_id, req.target_id, req.source_id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(super::dto::MergeEntitiesResponse {
        message: format!("Entity {} merged into {}", req.source_id, req.target_id),
    }))
}

pub(crate) async fn get_degree_centrality(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<super::dto::DegreeCentralityQuery>,
) -> ApiResult<Json<Vec<super::dto::DegreeCentralityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let limit = clamp_limit(query.limit, 50, 200);
    let results = state
        .knowledge_service
        .compute_degree_centrality(user.tenant_id, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        results
            .into_iter()
            .map(
                |(entity, out_deg, in_deg, total)| super::dto::DegreeCentralityResponse {
                    entity: KnowledgeEntityResponse::from(entity),
                    out_degree: out_deg,
                    in_degree: in_deg,
                    total_degree: total,
                },
            )
            .collect(),
    ))
}

pub(crate) async fn get_cooccurrence_network(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<super::dto::CooccurrenceNetworkQuery>,
) -> ApiResult<Json<Vec<super::dto::CooccurrenceEdge>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let min_cooccurrence = query.min_cooccurrence.unwrap_or(2).max(1);
    let limit = clamp_limit(query.limit, 50, 500);

    let edges = state
        .knowledge_service
        .get_cooccurrence_network(user.tenant_id, min_cooccurrence, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        edges
            .into_iter()
            .map(
                |(e1_id, e1_name, e2_id, e2_name, count)| super::dto::CooccurrenceEdge {
                    entity1_id: e1_id,
                    entity1_name: e1_name,
                    entity2_id: e2_id,
                    entity2_name: e2_name,
                    cooccurrence_count: count,
                },
            )
            .collect(),
    ))
}

pub(crate) async fn get_graph_stats(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<super::dto::GraphStatsResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.tenant_id, user.id).await?;

    let stats = state
        .knowledge_service
        .get_graph_stats(user.tenant_id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(super::dto::GraphStatsResponse {
        entity_count: stats.entity_count,
        relation_count: stats.relation_count,
        article_entity_count: stats.article_entity_count,
        entities_with_embedding: stats.entities_with_embedding,
        type_distribution: stats
            .type_distribution
            .into_iter()
            .map(|(entity_type, count)| super::dto::TypeDistributionEntry { entity_type, count })
            .collect(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_extract_entities_dedupe_key_matches_worker_format() {
        let article_id = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
            .expect("fixed uuid should parse");
        assert_eq!(
            ai_extract_entities_dedupe_key(article_id),
            "ai:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:extract_entities"
        );
    }

    #[test]
    fn extract_entities_outbox_payload_uses_retryable_task_shape() {
        let payload =
            serde_json::to_value(law_eye_queue::RetryableTask::new(law_eye_queue::AiTask {
                tenant_id: Uuid::nil(),
                article_id: Uuid::nil(),
                task_type: law_eye_queue::AiTaskType::ExtractEntities,
            }))
            .expect("retryable task serialization should succeed");

        assert!(payload.get("payload").is_some());
        assert_eq!(
            payload
                .get("payload")
                .and_then(|value| value.get("task_type"))
                .and_then(serde_json::Value::as_str),
            Some("extract_entities")
        );
    }
}
