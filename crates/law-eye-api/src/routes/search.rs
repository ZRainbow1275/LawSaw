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

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::AppError;

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

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    let can_read = match state.user_service.has_permission(user.id, "articles:read").await {
        Ok(value) => value,
        Err(err) => return AppError::from(err).into_response(),
    };
    if !can_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    let q = query.q.trim();
    if q.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Query cannot be empty".to_string(),
            }),
        )
            .into_response();
    }

    let limit = query.limit.clamp(1, KEYWORD_SEARCH_MAX_LIMIT);
    let offset = query.offset.max(0);

    match state.article_service.search_ranked(q, limit, offset).await {
        Ok((hits, total)) => {
            let results: Vec<SearchResultItem> = hits
                .into_iter()
                .map(|h| SearchResultItem {
                    article_id: h.article_id,
                    title: h.title,
                    excerpt: h.excerpt,
                    score: h.score,
                })
                .collect();

            (StatusCode::OK, Json(SearchResponse { results, total })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn semantic_search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<SemanticSearchRequest>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    let can_read = match state.user_service.has_permission(user.id, "articles:read").await {
        Ok(value) => value,
        Err(err) => return AppError::from(err).into_response(),
    };
    if !can_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    if state.ai_service.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "AI service not available".to_string(),
            }),
        )
            .into_response();
    }

    let limit = req.limit.clamp(1, SEMANTIC_SEARCH_MAX_LIMIT);

    match state.rag_service.search(&req.query, limit).await {
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
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn ask_question(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<AskRequest>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    let can_read = match state.user_service.has_permission(user.id, "articles:read").await {
        Ok(value) => value,
        Err(err) => return AppError::from(err).into_response(),
    };
    if !can_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    if state.ai_service.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "AI service not available".to_string(),
            }),
        )
            .into_response();
    }

    let top_k = req.top_k.clamp(1, ASK_MAX_TOP_K);

    match state.rag_service.answer(&req.question, top_k).await {
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
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}
