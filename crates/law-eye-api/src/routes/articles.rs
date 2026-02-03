use axum::{
    extract::{ConnectInfo, Path, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error;
use law_eye_db::CreateAuditLog;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use std::net::SocketAddr;

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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
pub struct TrendParams {
    pub days: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateArticleRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub category_id: Option<Uuid>,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
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
        .route(
            "/{id}",
            get(get_article)
                .patch(update_article)
                .delete(delete_article),
        )
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
    ApiQuery(params): ApiQuery<ListParams>,
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
        .list_filtered(
            user.tenant_id,
            limit,
            offset,
            params.category_id,
            params.status.as_deref(),
        )
        .await
        .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

    let total = state
        .article_service
        .count_filtered(user.tenant_id, params.category_id, params.status.as_deref())
        .await
        .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;
    let data: Vec<ArticleResponse> = articles.into_iter().map(|a| a.into()).collect();

    Ok(Json(ArticleListResponse {
        data,
        total,
        limit,
        offset,
    }))
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
        .get_stats(user.tenant_id)
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
        .get_analytics_summary(user.tenant_id)
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
        .get_category_counts(user.tenant_id)
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
    ApiQuery(params): ApiQuery<TrendParams>,
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
        .get_daily_trend(user.tenant_id, days)
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
    ApiQuery(params): ApiQuery<ListParams>,
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
        .list_recent(user.tenant_id, limit)
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

    let article = state
        .article_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(article.into()))
}

#[utoipa::path(
    patch,
    path = "/api/v1/articles/{id}",
    params(("id" = Uuid, Path, description = "Article ID")),
    request_body = UpdateArticleRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article updated", body = ArticleResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn update_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateArticleRequest>,
) -> ApiResult<Json<ArticleResponse>> {
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

    let title = req.title.as_deref().map(str::trim);
    let content = req.content.as_deref().map(str::trim);
    let summary = req.summary.as_deref().map(str::trim);

    if matches!(title, Some("")) {
        return Err(AppError::validation("title cannot be empty"));
    }

    if matches!(content, Some("")) {
        return Err(AppError::validation("content cannot be empty"));
    }

    if matches!(summary, Some("")) {
        return Err(AppError::validation("summary cannot be empty"));
    }

    let has_changes =
        title.is_some() || content.is_some() || summary.is_some() || req.category_id.is_some();
    if !has_changes {
        return Err(AppError::validation("No fields to update"));
    }

    if let Some(category_id) = req.category_id {
        state
            .category_service
            .get_by_id(category_id)
            .await
            .map_err(|e| match e {
                Error::NotFound(_) => AppError::validation("Invalid category_id"),
                _ => AppError::from(e),
            })?;
    }

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let title_for_db = title.map(str::to_string);
    let content_for_db = content.map(str::to_string);
    let summary_for_db = summary.map(str::to_string);

    let article = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let article_service = state.article_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let title_for_db = title_for_db.clone();
        let content_for_db = content_for_db.clone();
        let summary_for_db = summary_for_db.clone();
        let category_id = req.category_id;

        Box::pin(async move {
            let before = article_service.get_by_id_tx(tenant_id, tx, id).await?;

            let after = article_service
                .update_tx(
                    tenant_id,
                    tx,
                    id,
                    law_eye_core::article::UpdateArticlePatch {
                        title: title_for_db.as_deref(),
                        content: content_for_db.as_deref(),
                        summary: summary_for_db.as_deref(),
                        category_id,
                    },
                )
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "articles.update".to_string(),
                        resource: "articles".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "title": before.title,
                            "summary": before.summary,
                            "category_id": before.category_id,
                            "status": before.status,
                            "content_len": before.content.as_deref().map(|v| v.len()),
                        })),
                        new_value: Some(serde_json::json!({
                            "title": after.title,
                            "summary": after.summary,
                            "category_id": after.category_id,
                            "status": after.status,
                            "content_len": after.content.as_deref().map(|v| v.len()),
                            "requested": {
                                "title": title_for_db,
                                "summary": summary_for_db,
                                "category_id": category_id,
                                "content_len": content_for_db.as_deref().map(|v| v.len()),
                            }
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(after)
        })
    })
    .await
    .map_err(AppError::from)?;

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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let article_service = state.article_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = article_service.get_by_id_tx(tenant_id, tx, id).await?;

            article_service.delete_tx(tenant_id, tx, id).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "articles.delete".to_string(),
                        resource: "articles".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "title": before.title,
                            "summary": before.summary,
                            "category_id": before.category_id,
                            "status": before.status,
                            "content_len": before.content.as_deref().map(|v| v.len()),
                        })),
                        new_value: Some(serde_json::json!({
                            "deleted": true,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<(), law_eye_common::Error>(())
        })
    })
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let article = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let article_service = state.article_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = article_service.get_by_id_tx(tenant_id, tx, id).await?;
            let after = article_service
                .update_status_tx(tenant_id, tx, id, "published")
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "articles.publish".to_string(),
                        resource: "articles".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "status": before.status,
                        })),
                        new_value: Some(serde_json::json!({
                            "status": after.status,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(after)
        })
    })
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let article = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let article_service = state.article_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = article_service.get_by_id_tx(tenant_id, tx, id).await?;
            let after = article_service
                .update_status_tx(tenant_id, tx, id, "archived")
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "articles.archive".to_string(),
                        resource: "articles".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "status": before.status,
                        })),
                        new_value: Some(serde_json::json!({
                            "status": after.status,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(after)
        })
    })
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<BatchStatusRequest>,
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let ids_sample: Vec<Uuid> = req.ids.iter().copied().take(50).collect();
    let ids_count = req.ids.len();

    let updated = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let article_service = state.article_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let status = req.status.clone();
        let ids = req.ids.clone();
        let ids_sample = ids_sample.clone();

        Box::pin(async move {
            let updated = article_service
                .batch_update_status_tx(tenant_id, tx, &ids, &status)
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "articles.status.batch_update".to_string(),
                        resource: "articles".to_string(),
                        resource_id: None,
                        old_value: None,
                        new_value: Some(serde_json::json!({
                            "status": status,
                            "ids_count": ids_count,
                            "ids_sample": ids_sample,
                            "updated": updated,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(updated)
        })
    })
    .await
    .map_err(|e| AppError::internal_with_code("BATCH_ERROR", e.to_string()))?;
    Ok(Json(BatchStatusResponse { updated }))
}
