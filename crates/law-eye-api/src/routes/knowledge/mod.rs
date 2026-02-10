use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult};

mod dto;
mod handlers;
mod permissions;
mod queries;

pub use dto::{
    BackfillRequest, BackfillResponse, EntityArticleResponse, EntityArticlesQuery,
    KnowledgeEntityResponse, RelatedEntitiesQuery, RelatedEntityResponse, SearchEntitiesQuery,
    TopEntitiesQuery,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities/top", get(list_top_entities))
        .route("/entities/search", get(search_entities))
        .route("/entities/{id}", get(get_entity))
        .route("/entities/{id}/related", get(get_related_entities))
        .route("/entities/{id}/articles", get(get_entity_articles))
        .route("/backfill", post(backfill))
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/top",
    params(
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-200)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Top entities", body = Vec<KnowledgeEntityResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn list_top_entities(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<TopEntitiesQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    handlers::list_top_entities(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/search",
    params(
        ("q" = String, Query, description = "Search query"),
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-100)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Matched entities", body = Vec<KnowledgeEntityResponse>),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn search_entities(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<SearchEntitiesQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    handlers::search_entities(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/{id}",
    params(
        ("id" = Uuid, Path, description = "Entity id")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Entity", body = KnowledgeEntityResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_entity(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<KnowledgeEntityResponse>> {
    handlers::get_entity(state, auth_session, id).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/{id}/related",
    params(
        ("id" = Uuid, Path, description = "Entity id"),
        ("limit" = Option<i64>, Query, description = "Maximum number of neighbors per direction (1-50)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Related entities", body = Vec<RelatedEntityResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_related_entities(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
    query: ApiQuery<RelatedEntitiesQuery>,
) -> ApiResult<Json<Vec<RelatedEntityResponse>>> {
    handlers::get_related_entities(state, auth_session, id, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/{id}/articles",
    params(
        ("id" = Uuid, Path, description = "Entity id"),
        ("limit" = Option<i64>, Query, description = "Maximum number of articles (1-50)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Articles linked to entity", body = Vec<EntityArticleResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_entity_articles(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
    query: ApiQuery<EntityArticlesQuery>,
) -> ApiResult<Json<Vec<EntityArticleResponse>>> {
    handlers::get_entity_articles(state, auth_session, id, query).await
}

#[utoipa::path(
    post,
    path = "/api/v1/knowledge/backfill",
    request_body = BackfillRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Backfill completed", body = BackfillResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn backfill(
    state: State<AppState>,
    auth_session: AuthSession,
    req: ApiJson<BackfillRequest>,
) -> ApiResult<Json<BackfillResponse>> {
    handlers::backfill(state, auth_session, req).await
}
