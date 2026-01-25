use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleResponse {
    pub id: Uuid,
    pub source_id: Uuid,
    pub category_id: Option<Uuid>,
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub risk_score: Option<i32>,
    pub importance: Option<i32>,
    pub sentiment: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Article> for ArticleResponse {
    fn from(a: law_eye_db::Article) -> Self {
        Self {
            id: a.id,
            source_id: a.source_id,
            category_id: a.category_id,
            title: a.title,
            link: a.link,
            content: a.content,
            summary: a.summary,
            author: a.author,
            published_at: a.published_at,
            risk_score: a.risk_score,
            importance: a.importance,
            sentiment: a.sentiment,
            status: a.status,
            created_at: a.created_at,
            updated_at: a.updated_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub category_id: Option<Uuid>,
    pub status: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct ArticleListResponse {
    pub data: Vec<ArticleResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Serialize, ToSchema)]
pub struct ArticleStatsResponse {
    pub total_articles: i64,
    pub pending_count: i64,
    pub published_count: i64,
    pub high_risk_count: i64,
    pub today_count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleTrendPointResponse {
    pub date: String,
    pub count: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct TrendParams {
    pub days: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateArticleRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub category_id: Option<Uuid>,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchStatusRequest {
    pub ids: Vec<Uuid>,
    pub status: String,
}

#[derive(Serialize, ToSchema)]
pub struct BatchStatusResponse {
    pub updated: i64,
}

#[derive(Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

#[derive(Serialize, ToSchema)]
pub struct DeleteResponse {
    pub success: bool,
    pub message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_articles))
        .route("/stats", get(get_stats))
        .route("/trends", get(get_trends))
        .route("/recent", get(list_recent))
        .route("/batch-status", post(batch_update_status))
        .route("/{id}", get(get_article).delete(delete_article))
        .route("/{id}/publish", post(publish_article))
        .route("/{id}/archive", post(archive_article))
}

fn is_valid_status(status: &str) -> bool {
    matches!(
        status,
        "pending" | "processing" | "published" | "archived" | "rejected"
    )
}

#[utoipa::path(
    get,
    path = "/api/v1/articles",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 20, max 100)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("category_id" = Option<Uuid>, Query, description = "Filter by category id"),
        ("status" = Option<String>, Query, description = "Filter by status (pending/processing/published/archived/rejected)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article list", body = ArticleListResponse),
        (status = 400, description = "Validation error", body = ErrorResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_articles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> Result<Json<ArticleListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    if let Some(status) = params.status.as_deref() {
        if !is_valid_status(status) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid status".to_string(),
                    code: "VALIDATION_ERROR".to_string(),
                }),
            ));
        }
    }

    let articles = state
        .article_service
        .list_filtered(limit, offset, params.category_id, params.status.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "FETCH_ERROR".to_string() })))?;

    let total = state
        .article_service
        .count_filtered(params.category_id, params.status.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: "COUNT_ERROR".to_string(),
                }),
            )
        })?;
    let data: Vec<ArticleResponse> = articles.into_iter().map(|a| a.into()).collect();

    Ok(Json(ArticleListResponse { data, total, limit, offset }))
}

#[utoipa::path(
    get,
    path = "/api/v1/articles/stats",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article stats", body = ArticleStatsResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn get_stats(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> Result<Json<ArticleStatsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let stats = state.article_service.get_stats().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "STATS_ERROR".to_string() })))?;
    Ok(Json(ArticleStatsResponse {
        total_articles: stats.total,
        pending_count: stats.pending,
        published_count: stats.published,
        high_risk_count: stats.high_risk,
        today_count: stats.today,
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/articles/trends",
    params(
        ("days" = Option<i64>, Query, description = "Number of days (default 7, max 90)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Daily article trend", body = Vec<ArticleTrendPointResponse>),
        (status = 400, description = "Validation error", body = ErrorResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn get_trends(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<TrendParams>,
) -> Result<Json<Vec<ArticleTrendPointResponse>>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let days = params.days.unwrap_or(7);
    if !(1..=90).contains(&days) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid days".to_string(),
                code: "VALIDATION_ERROR".to_string(),
            }),
        ));
    }

    let points = state.article_service.get_daily_trend(days).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "STATS_ERROR".to_string(),
            }),
        )
    })?;

    Ok(Json(
        points
            .into_iter()
            .map(|point| ArticleTrendPointResponse {
                date: point.date.to_string(),
                count: point.count,
            })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/articles/recent",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 10, max 50)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Recent articles", body = Vec<ArticleResponse>),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_recent(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<ArticleResponse>>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let limit = params.limit.unwrap_or(10).min(50);
    let articles = state.article_service.list_recent(limit).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "FETCH_ERROR".to_string() })))?;
    let data: Vec<ArticleResponse> = articles.into_iter().map(|a| a.into()).collect();
    Ok(Json(data))
}

#[utoipa::path(
    get,
    path = "/api/v1/articles/{id}",
    params(("id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article details", body = ArticleResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn get_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> Result<Json<ArticleResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let article = state.article_service.get_by_id(id).await
        .map_err(|e| (StatusCode::NOT_FOUND, Json(ErrorResponse { error: e.to_string(), code: "NOT_FOUND".to_string() })))?;
    Ok(Json(article.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/articles/{id}",
    params(("id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article deleted", body = DeleteResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn delete_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .unwrap_or(false);
    if !can_write {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    state.article_service.delete(id).await.map_err(|e| {
        let (status, code) = match e {
            Error::NotFound(_) => (StatusCode::NOT_FOUND, "NOT_FOUND"),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "DELETE_ERROR"),
        };
        (
            status,
            Json(ErrorResponse {
                error: e.to_string(),
                code: code.to_string(),
            }),
        )
    })?;

    Ok(Json(DeleteResponse {
        success: true,
        message: "Article deleted".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/articles/{id}/publish",
    params(("id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article published", body = ArticleResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn publish_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> Result<Json<ArticleResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_publish = state
        .user_service
        .has_permission(user.id, "articles:publish")
        .await
        .unwrap_or(false);
    if !can_publish {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let article = state.article_service.update_status(id, "published").await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "PUBLISH_ERROR".to_string() })))?;
    Ok(Json(article.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/articles/{id}/archive",
    params(("id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article archived", body = ArticleResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn archive_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> Result<Json<ArticleResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_publish = state
        .user_service
        .has_permission(user.id, "articles:publish")
        .await
        .unwrap_or(false);
    if !can_publish {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let article = state.article_service.update_status(id, "archived").await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "ARCHIVE_ERROR".to_string() })))?;
    Ok(Json(article.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/articles/batch-status",
    request_body = BatchStatusRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Batch status updated", body = BatchStatusResponse),
        (status = 400, description = "Validation error", body = ErrorResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn batch_update_status(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<BatchStatusRequest>,
) -> Result<Json<BatchStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = auth_session.user.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
                code: "UNAUTHORIZED".to_string(),
            }),
        )
    })?;

    let can_publish = state
        .user_service
        .has_permission(user.id, "articles:publish")
        .await
        .unwrap_or(false);
    if !can_publish {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        ));
    }

    let updated = state.article_service.batch_update_status(&req.ids, &req.status).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "BATCH_ERROR".to_string() })))?;
    Ok(Json(BatchStatusResponse { updated }))
}
