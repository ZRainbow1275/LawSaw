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
