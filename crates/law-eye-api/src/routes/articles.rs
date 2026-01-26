use axum::{
    extract::{Path, Query, State},
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
use crate::{ApiError, ApiResult, AppError};

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

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleCategoryCountResponse {
    pub category_id: Option<Uuid>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleStatusCountsResponse {
    pub pending: i64,
    pub processing: i64,
    pub published: i64,
    pub archived: i64,
    pub rejected: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleRiskCountsResponse {
    pub unknown: i64,
    pub low: i64,
    pub medium: i64,
    pub high: i64,
    pub critical: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleSentimentCountsResponse {
    pub unknown: i64,
    pub positive: i64,
    pub neutral: i64,
    pub negative: i64,
    pub mixed: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleAnalyticsSummaryResponse {
    pub total: i64,
    pub status: ArticleStatusCountsResponse,
    pub risk: ArticleRiskCountsResponse,
    pub sentiment: ArticleSentimentCountsResponse,
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
pub struct DeleteResponse {
    pub success: bool,
    pub message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_articles))
        .route("/stats", get(get_stats))
        .route("/analytics-summary", get(get_analytics_summary))
        .route("/category-counts", get(get_category_counts))
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
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_articles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<ArticleListResponse>> {
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

    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    if let Some(status) = params.status.as_deref() {
        if !is_valid_status(status) {
            return Err(AppError::validation("Invalid status"));
        }
    }

    let articles = state
        .article_service
        .list_filtered(limit, offset, params.category_id, params.status.as_deref())
        .await
        .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

    let total = state
        .article_service
        .count_filtered(params.category_id, params.status.as_deref())
        .await
        .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;
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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_stats(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<ArticleStatsResponse>> {
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

    let stats = state
        .article_service
        .get_stats()
        .await
        .map_err(|e| AppError::internal_with_code("STATS_ERROR", e.to_string()))?;
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
    path = "/api/v1/articles/analytics-summary",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Analytics summary (status/risk/sentiment distributions)", body = ArticleAnalyticsSummaryResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_analytics_summary(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<ArticleAnalyticsSummaryResponse>> {
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

    let summary = state
        .article_service
        .get_analytics_summary()
        .await
        .map_err(|e| AppError::internal_with_code("STATS_ERROR", e.to_string()))?;

    Ok(Json(ArticleAnalyticsSummaryResponse {
        total: summary.total,
        status: ArticleStatusCountsResponse {
            pending: summary.status.pending,
            processing: summary.status.processing,
            published: summary.status.published,
            archived: summary.status.archived,
            rejected: summary.status.rejected,
        },
        risk: ArticleRiskCountsResponse {
            unknown: summary.risk.unknown,
            low: summary.risk.low,
            medium: summary.risk.medium,
            high: summary.risk.high,
            critical: summary.risk.critical,
        },
        sentiment: ArticleSentimentCountsResponse {
            unknown: summary.sentiment.unknown,
            positive: summary.sentiment.positive,
            neutral: summary.sentiment.neutral,
            negative: summary.sentiment.negative,
            mixed: summary.sentiment.mixed,
        },
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/articles/category-counts",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article counts grouped by category_id (NULL = uncategorized)", body = Vec<ArticleCategoryCountResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_category_counts(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<ArticleCategoryCountResponse>>> {
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

    let rows = state
        .article_service
        .get_category_counts()
        .await
        .map_err(|e| AppError::internal_with_code("STATS_ERROR", e.to_string()))?;

    Ok(Json(
        rows.into_iter()
            .map(|row| ArticleCategoryCountResponse {
                category_id: row.category_id,
                count: row.count,
            })
            .collect(),
    ))
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
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_trends(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<TrendParams>,
) -> ApiResult<Json<Vec<ArticleTrendPointResponse>>> {
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

    let days = params.days.unwrap_or(7);
    if !(1..=90).contains(&days) {
        return Err(AppError::validation("Invalid days"));
    }

    let points = state
        .article_service
        .get_daily_trend(days)
        .await
        .map_err(|e| AppError::internal_with_code("STATS_ERROR", e.to_string()))?;

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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_recent(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<Vec<ArticleResponse>>> {
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

    let limit = params.limit.unwrap_or(10).min(50);
    let articles = state
        .article_service
        .list_recent(limit)
        .await
        .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;
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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ArticleResponse>> {
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

    let article = state.article_service.get_by_id(id).await.map_err(AppError::from)?;
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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn delete_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .delete(id)
        .await
        .map_err(|e| match e {
            Error::NotFound(_) => AppError::from(e),
            _ => AppError::internal_with_code("DELETE_ERROR", e.to_string()),
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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn publish_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ArticleResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_publish = state
        .user_service
        .has_permission(user.id, "articles:publish")
        .await
        .map_err(AppError::from)?;
    if !can_publish {
        return Err(AppError::forbidden("Permission denied"));
    }

    let article = state
        .article_service
        .update_status(id, "published")
        .await
        .map_err(|e| match e {
            Error::NotFound(_) => AppError::from(e),
            _ => AppError::internal_with_code("PUBLISH_ERROR", e.to_string()),
        })?;
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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn archive_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ArticleResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_publish = state
        .user_service
        .has_permission(user.id, "articles:publish")
        .await
        .map_err(AppError::from)?;
    if !can_publish {
        return Err(AppError::forbidden("Permission denied"));
    }

    let article = state
        .article_service
        .update_status(id, "archived")
        .await
        .map_err(|e| match e {
            Error::NotFound(_) => AppError::from(e),
            _ => AppError::internal_with_code("ARCHIVE_ERROR", e.to_string()),
        })?;
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
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn batch_update_status(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<BatchStatusRequest>,
) -> ApiResult<Json<BatchStatusResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_publish = state
        .user_service
        .has_permission(user.id, "articles:publish")
        .await
        .map_err(AppError::from)?;
    if !can_publish {
        return Err(AppError::forbidden("Permission denied"));
    }

    if req.ids.is_empty() {
        return Err(AppError::validation("ids cannot be empty"));
    }

    if !is_valid_status(&req.status) {
        return Err(AppError::validation("Invalid status"));
    }

    let updated = state
        .article_service
        .batch_update_status(&req.ids, &req.status)
        .await
        .map_err(|e| AppError::internal_with_code("BATCH_ERROR", e.to_string()))?;
    Ok(Json(BatchStatusResponse { updated }))
}
