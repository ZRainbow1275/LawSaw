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
    BackfillRequest, BackfillResponse, CooccurrenceEdge, CooccurrenceNetworkQuery,
    DegreeCentralityQuery, DegreeCentralityResponse, DuplicateCandidatePair,
    DuplicateCandidatesQuery, EntitiesByTypeQuery, EntityArticleResponse, EntityArticlesQuery,
    GraphStatsResponse, HybridSearchQuery, KnowledgeEntityResponse, LlmBackfillRequest,
    LlmBackfillResponse, MergeEntitiesRequest, MergeEntitiesResponse, RelatedEntitiesQuery,
    RelatedEntityResponse, SearchEntitiesQuery, SemanticSearchEntityResponse, SemanticSearchQuery,
    TopEntitiesQuery,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities/top", get(list_top_entities))
        .route("/entities/search", get(search_entities))
        .route("/entities/semantic-search", get(semantic_search))
        .route("/entities/hybrid-search", get(hybrid_search))
        .route("/entities/by-type", get(get_entities_by_type))
        .route("/entities/duplicates", get(find_duplicate_candidates))
        .route("/entities/merge", post(merge_entities))
        .route("/entities/{id}", get(get_entity))
        .route("/entities/{id}/related", get(get_related_entities))
        .route("/entities/{id}/articles", get(get_entity_articles))
        .route("/analytics/centrality", get(get_degree_centrality))
        .route("/analytics/cooccurrence", get(get_cooccurrence_network))
        .route("/stats", get(get_graph_stats))
        .route("/backfill", post(backfill))
        .route("/backfill-llm", post(backfill_llm))
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

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/semantic-search",
    params(
        ("q" = String, Query, description = "Semantic search query"),
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-100)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Semantically matched entities", body = Vec<SemanticSearchEntityResponse>),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn semantic_search(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<SemanticSearchQuery>,
) -> ApiResult<Json<Vec<SemanticSearchEntityResponse>>> {
    handlers::semantic_search(state, auth_session, query).await
}

#[utoipa::path(
    post,
    path = "/api/v1/knowledge/backfill-llm",
    request_body = LlmBackfillRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "LLM backfill enqueued", body = LlmBackfillResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn backfill_llm(
    state: State<AppState>,
    auth_session: AuthSession,
    req: ApiJson<LlmBackfillRequest>,
) -> ApiResult<Json<LlmBackfillResponse>> {
    handlers::backfill_llm(state, auth_session, req).await
}

// ── New endpoints ──────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/hybrid-search",
    params(
        ("q" = String, Query, description = "Search query (combined text + vector)"),
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-100)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Hybrid search results", body = Vec<KnowledgeEntityResponse>),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn hybrid_search(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<HybridSearchQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    handlers::hybrid_search(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/by-type",
    params(
        ("entity_type" = String, Query, description = "Entity type (e.g. organization, concept, law, person)"),
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-200)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Entities filtered by type", body = Vec<KnowledgeEntityResponse>),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_entities_by_type(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<EntitiesByTypeQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    handlers::get_entities_by_type(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/duplicates",
    params(
        ("similarity_threshold" = Option<f64>, Query, description = "Minimum cosine similarity (0.5-0.99, default 0.85)"),
        ("limit" = Option<i64>, Query, description = "Maximum number of pairs (1-100)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Potential duplicate entity pairs", body = Vec<DuplicateCandidatePair>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn find_duplicate_candidates(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<DuplicateCandidatesQuery>,
) -> ApiResult<Json<Vec<DuplicateCandidatePair>>> {
    handlers::find_duplicate_candidates(state, auth_session, query).await
}

#[utoipa::path(
    post,
    path = "/api/v1/knowledge/entities/merge",
    request_body = MergeEntitiesRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Entities merged", body = MergeEntitiesResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Entity not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn merge_entities(
    state: State<AppState>,
    auth_session: AuthSession,
    req: ApiJson<MergeEntitiesRequest>,
) -> ApiResult<Json<MergeEntitiesResponse>> {
    handlers::merge_entities(state, auth_session, req).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/analytics/centrality",
    params(
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-200)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Degree centrality rankings", body = Vec<DegreeCentralityResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_degree_centrality(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<DegreeCentralityQuery>,
) -> ApiResult<Json<Vec<DegreeCentralityResponse>>> {
    handlers::get_degree_centrality(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/analytics/cooccurrence",
    params(
        ("min_cooccurrence" = Option<i64>, Query, description = "Minimum co-occurrence count (default 2)"),
        ("limit" = Option<i64>, Query, description = "Maximum number of edges (1-500)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Co-occurrence network edges", body = Vec<CooccurrenceEdge>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_cooccurrence_network(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<CooccurrenceNetworkQuery>,
) -> ApiResult<Json<Vec<CooccurrenceEdge>>> {
    handlers::get_cooccurrence_network(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/stats",
    security(("session" = [])),
    responses(
        (status = 200, description = "Knowledge graph statistics", body = GraphStatsResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_graph_stats(
    state: State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<GraphStatsResponse>> {
    handlers::get_graph_stats(state, auth_session).await
}
