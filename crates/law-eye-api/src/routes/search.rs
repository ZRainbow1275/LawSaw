use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

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
    #[serde(default)]
    pub offset: i64,
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
    pub total: i64,
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

const KEYWORD_SEARCH_MAX_LIMIT: i64 = 50;
const SEMANTIC_SEARCH_MAX_LIMIT: i64 = 20;
const ASK_MAX_TOP_K: i64 = 20;

/// Full-text search
#[utoipa::path(
    get,
    path = "/api/v1/search",
    params(
        ("q" = String, Query, description = "Search query"),
        ("limit" = Option<i64>, Query, description = "Max results (default 10, max 50)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Search results", body = SearchResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<SearchResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let q = query.q.trim();
    if q.is_empty() {
        return Err(AppError::validation("Query cannot be empty"));
    }

    let limit = query.limit.clamp(1, KEYWORD_SEARCH_MAX_LIMIT);
    let offset = query.offset.max(0);

    let (hits, total) = state
        .article_service
        .search_ranked(q, limit, offset)
        .await
        .map_err(AppError::from)?;

    let results: Vec<SearchResultItem> = hits
        .into_iter()
        .map(|h| SearchResultItem {
            article_id: h.article_id,
            title: h.title,
            excerpt: h.excerpt,
            score: h.score,
        })
        .collect();

    Ok(Json(SearchResponse { results, total }))
}

/// Semantic vector search
#[utoipa::path(
    post,
    path = "/api/v1/search/semantic",
    request_body = SemanticSearchRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Semantic search results", body = SemanticSearchResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 503, description = "AI service unavailable", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn semantic_search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<SemanticSearchRequest>,
) -> ApiResult<Json<SemanticSearchResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let query = req.query.trim();
    if query.is_empty() {
        return Err(AppError::validation("Query cannot be empty"));
    }

    let limit = req.limit.clamp(1, SEMANTIC_SEARCH_MAX_LIMIT);

    let results = state
        .rag_service
        .search(query, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(SemanticSearchResponse {
        results: results
            .into_iter()
            .map(|r| SemanticSearchResult {
                chunk_id: r.chunk_id,
                article_id: r.article_id,
                content: r.content,
                similarity: r.similarity,
            })
            .collect(),
    }))
}

/// RAG Q&A endpoint
#[utoipa::path(
    post,
    path = "/api/v1/search/ask",
    request_body = AskRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "AI-generated answer", body = AskResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 503, description = "AI service unavailable", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn ask_question(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<AskRequest>,
) -> ApiResult<Json<AskResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let question = req.question.trim();
    if question.is_empty() {
        return Err(AppError::validation("Question cannot be empty"));
    }

    let top_k = req.top_k.clamp(1, ASK_MAX_TOP_K);

    let answer = state
        .rag_service
        .answer(question, top_k)
        .await
        .map_err(AppError::from)?;

    Ok(Json(AskResponse {
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
    }))
}
