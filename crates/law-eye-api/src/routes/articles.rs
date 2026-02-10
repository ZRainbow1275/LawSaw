use axum::{
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap},
    response::{IntoResponse, Response},
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
use crate::routes::{etag_for_version, require_if_match_version};
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
    pub version: i64,
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
            version: a.version,
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
    /// Cursor for keyset pagination (base64url-encoded JSON).
    pub cursor: Option<String>,
    pub category_id: Option<Uuid>,
    pub status: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct ArticleListResponse {
    pub data: Vec<ArticleResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
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

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct BatchStatusItem {
    pub id: Uuid,
    pub version: i64,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct BatchStatusRequest {
    #[serde(default)]
    pub ids: Vec<Uuid>,
    #[serde(default)]
    pub items: Vec<BatchStatusItem>,
    pub status: String,
}

#[derive(Serialize, ToSchema)]
pub struct BatchStatusResponse {
    pub updated: i64,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub conflicts: Vec<BatchStatusItemConflict>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub missing_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct BatchStatusItemConflict {
    pub id: Uuid,
    pub expected_version: i64,
    pub current_version: i64,
}

#[derive(Serialize, ToSchema)]
pub struct DeleteResponse {
    pub success: bool,
    pub message: String,
}

const MAX_BATCH_STATUS_IDS: usize = 200;

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
        .route("/{id}/restore", post(restore_article))
}

fn is_valid_status(status: &str) -> bool {
    matches!(
        status,
        "pending" | "processing" | "published" | "archived" | "rejected"
    )
}

pub(crate) mod query {
    use super::*;

    #[utoipa::path(
    get,
    path = "/api/v1/articles",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 20, max 100)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored."),
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
        #[derive(Debug, Clone, Serialize, Deserialize)]
        struct CreatedAtCursor {
            created_at: DateTime<Utc>,
            id: Uuid,
        }

        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

        let can_read = state
            .user_service
            .has_permission(user.tenant_id, user.id, "articles:read")
            .await
            .map_err(AppError::from)?;
        if !can_read {
            return Err(AppError::forbidden("Permission denied"));
        }

        let limit = params.limit.unwrap_or(20).clamp(1, 100);
        let offset = params.offset.unwrap_or(0);
        if offset < 0 {
            return Err(AppError::validation("offset must be >= 0"));
        }

        let cursor = params
            .cursor
            .as_deref()
            .map(crate::pagination::decode_cursor::<CreatedAtCursor>)
            .transpose()?;

        if let Some(status) = params.status.as_deref() {
            if !is_valid_status(status) {
                return Err(AppError::validation("Invalid status"));
            }
        }

        let mut next_cursor: Option<String> = None;
        let articles = if let Some(cursor) = cursor {
            let fetch_limit = limit.saturating_add(1);
            let mut items = state
                .article_service
                .list_filtered_cursor(
                    user.tenant_id,
                    fetch_limit,
                    cursor.created_at,
                    cursor.id,
                    params.category_id,
                    params.status.as_deref(),
                )
                .await
                .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

            if items.len() as i64 > limit {
                items.truncate(limit as usize);
                if let Some(last) = items.last() {
                    next_cursor = Some(crate::pagination::encode_cursor(&CreatedAtCursor {
                        created_at: last.created_at,
                        id: last.id,
                    })?);
                }
            }

            items
        } else {
            state
                .article_service
                .list_filtered(
                    user.tenant_id,
                    limit,
                    offset,
                    params.category_id,
                    params.status.as_deref(),
                )
                .await
                .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?
        };

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
            offset: if params.cursor.is_some() { 0 } else { offset },
            next_cursor,
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
            .has_permission(user.tenant_id, user.id, "articles:read")
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
            .has_permission(user.tenant_id, user.id, "articles:read")
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
            .has_permission(user.tenant_id, user.id, "articles:read")
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
            .has_permission(user.tenant_id, user.id, "articles:read")
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
            .has_permission(user.tenant_id, user.id, "articles:read")
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
    ) -> ApiResult<Response> {
        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

        let can_read = state
            .user_service
            .has_permission(user.tenant_id, user.id, "articles:read")
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

        let body: ArticleResponse = article.into();
        let etag = etag_for_version(body.version)?;
        let mut response = Json(body).into_response();
        response.headers_mut().insert(header::ETAG, etag);
        Ok(response)
    }
}

pub(crate) mod command {
    use super::*;

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
    ) -> ApiResult<Response> {
        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

        let can_write = state
            .user_service
            .has_permission(user.tenant_id, user.id, "articles:write")
            .await
            .map_err(AppError::from)?;
        if !can_write {
            return Err(AppError::forbidden("Permission denied"));
        }

        let expected_version = Some(require_if_match_version(&headers)?);

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

        let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);

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
                        expected_version,
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

        let body: ArticleResponse = article.into();
        let etag = etag_for_version(body.version)?;
        let mut response = Json(body).into_response();
        response.headers_mut().insert(header::ETAG, etag);
        Ok(response)
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
            .has_permission(user.tenant_id, user.id, "articles:write")
            .await
            .map_err(AppError::from)?;
        if !can_write {
            return Err(AppError::forbidden("Permission denied"));
        }

        let expected_version = Some(require_if_match_version(&headers)?);

        let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);
        let tenant_id = user.tenant_id;
        let user_id = user.id;

        law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
            let article_service = state.article_service.clone();
            let audit_service = state.audit_service.clone();
            let ip_address = ip_address.clone();
            let user_agent = user_agent.clone();

            Box::pin(async move {
                let before = article_service.get_by_id_tx(tenant_id, tx, id).await?;

                article_service
                    .delete_tx(tenant_id, tx, id, expected_version)
                    .await?;

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
            Error::NotFound(_) | Error::Conflict(_) => AppError::from(e),
            _ => AppError::internal_with_code("DELETE_ERROR", e.to_string()),
        })?;

        Ok(Json(DeleteResponse {
            success: true,
            message: "Article deleted".to_string(),
        }))
    }

    #[utoipa::path(
    post,
    path = "/api/v1/articles/{id}/restore",
    params(("id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Article restored", body = ArticleResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
    pub(crate) async fn restore_article(
        State(state): State<AppState>,
        auth_session: AuthSession,
        headers: HeaderMap,
        ConnectInfo(addr): ConnectInfo<SocketAddr>,
        Path(id): Path<Uuid>,
    ) -> ApiResult<Response> {
        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

        let can_write = state
            .user_service
            .has_permission(user.tenant_id, user.id, "articles:write")
            .await
            .map_err(AppError::from)?;
        if !can_write {
            return Err(AppError::forbidden("Permission denied"));
        }

        let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);
        let tenant_id = user.tenant_id;
        let user_id = user.id;

        let article = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
            let article_service = state.article_service.clone();
            let audit_service = state.audit_service.clone();
            let ip_address = ip_address.clone();
            let user_agent = user_agent.clone();

            Box::pin(async move {
                let before = article_service.get_by_id_any_tx(tenant_id, tx, id).await?;
                let after = article_service.restore_tx(tenant_id, tx, id).await?;

                audit_service
                    .log_tx(
                        tenant_id,
                        tx,
                        CreateAuditLog {
                            user_id: Some(user_id),
                            action: "articles.restore".to_string(),
                            resource: "articles".to_string(),
                            resource_id: Some(id),
                            old_value: Some(serde_json::json!({
                                "status": before.status,
                                "deleted_at": before.deleted_at,
                            })),
                            new_value: Some(serde_json::json!({
                                "status": after.status,
                                "deleted_at": after.deleted_at,
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
            Error::NotFound(_) | Error::Validation(_) => AppError::from(e),
            _ => AppError::internal_with_code("RESTORE_ERROR", e.to_string()),
        })?;

        let body: ArticleResponse = article.into();
        let etag = etag_for_version(body.version)?;
        let mut response = Json(body).into_response();
        response.headers_mut().insert(header::ETAG, etag);
        Ok(response)
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
    ) -> ApiResult<Response> {
        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

        let can_publish = state
            .user_service
            .has_permission(user.tenant_id, user.id, "articles:publish")
            .await
            .map_err(AppError::from)?;
        if !can_publish {
            return Err(AppError::forbidden("Permission denied"));
        }

        let expected_version = Some(require_if_match_version(&headers)?);

        let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);
        let tenant_id = user.tenant_id;
        let user_id = user.id;

        let article = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
            let article_service = state.article_service.clone();
            let audit_service = state.audit_service.clone();
            let webhook_service = state.webhook_service.clone();
            let ip_address = ip_address.clone();
            let user_agent = user_agent.clone();

            Box::pin(async move {
                let before = article_service.get_by_id_tx(tenant_id, tx, id).await?;
                let after = article_service
                    .update_status_tx(tenant_id, tx, id, "published", expected_version)
                    .await?;

                let before_status = before.status.clone();
                let after_status = after.status.clone();

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
                                "status": before_status,
                            })),
                            new_value: Some(serde_json::json!({
                                "status": after_status,
                            })),
                            ip_address,
                            user_agent,
                        },
                    )
                    .await?;

                let dedupe_key = format!("articles.published:{}:v{}", after.id, after.version);
                let webhook_payload = serde_json::json!({
                    "article_id": after.id,
                    "source_id": after.source_id,
                    "category_id": after.category_id,
                    "status": &after.status,
                    "previous_status": &before.status,
                    "published_at": after.published_at,
                    "version": after.version,
                    "actor_user_id": user_id,
                });

                webhook_service
                    .enqueue_event_tx(
                        tenant_id,
                        tx,
                        "articles.published",
                        &webhook_payload,
                        &dedupe_key,
                    )
                    .await?;

                Ok(after)
            })
        })
        .await
        .map_err(|e| match e {
            Error::NotFound(_) | Error::Conflict(_) => AppError::from(e),
            _ => AppError::internal_with_code("PUBLISH_ERROR", e.to_string()),
        })?;

        let body: ArticleResponse = article.into();
        let etag = etag_for_version(body.version)?;
        let mut response = Json(body).into_response();
        response.headers_mut().insert(header::ETAG, etag);
        Ok(response)
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
    ) -> ApiResult<Response> {
        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

        let can_publish = state
            .user_service
            .has_permission(user.tenant_id, user.id, "articles:publish")
            .await
            .map_err(AppError::from)?;
        if !can_publish {
            return Err(AppError::forbidden("Permission denied"));
        }

        let expected_version = Some(require_if_match_version(&headers)?);

        let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);
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
                    .update_status_tx(tenant_id, tx, id, "archived", expected_version)
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
            Error::NotFound(_) | Error::Conflict(_) => AppError::from(e),
            _ => AppError::internal_with_code("ARCHIVE_ERROR", e.to_string()),
        })?;

        let body: ArticleResponse = article.into();
        let etag = etag_for_version(body.version)?;
        let mut response = Json(body).into_response();
        response.headers_mut().insert(header::ETAG, etag);
        Ok(response)
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
            .has_permission(user.tenant_id, user.id, "articles:publish")
            .await
            .map_err(AppError::from)?;
        if !can_publish {
            return Err(AppError::forbidden("Permission denied"));
        }

        let uses_items = !req.items.is_empty();
        let count = if uses_items {
            req.items.len()
        } else {
            req.ids.len()
        };

        if count == 0 {
            return Err(AppError::validation("ids/items cannot be empty"));
        }
        if count > MAX_BATCH_STATUS_IDS {
            return Err(AppError::validation(format!(
                "ids cannot exceed {MAX_BATCH_STATUS_IDS}"
            )));
        }

        if !is_valid_status(&req.status) {
            return Err(AppError::validation("Invalid status"));
        }

        let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);
        let tenant_id = user.tenant_id;
        let user_id = user.id;

        let ids_sample: Vec<Uuid> = if uses_items {
            req.items.iter().map(|item| item.id).take(50).collect()
        } else {
            req.ids.iter().copied().take(50).collect()
        };
        let ids_count = count;

        let result = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let article_service = state.article_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let status = req.status.clone();
        let ids = req.ids.clone();
        let items = req.items.clone();
        let ids_sample = ids_sample.clone();

        Box::pin(async move {
            let (updated, conflicts, missing_ids, mode) = if !items.is_empty() {
                let mut version_items = Vec::with_capacity(items.len());
                for item in items {
                    if item.version < 1 {
                        return Err(Error::Validation("Invalid version".to_string()));
                    }
                    version_items.push(law_eye_core::article::BatchStatusVersionItem {
                        id: item.id,
                        version: item.version,
                    });
                }

                let outcome = article_service
                    .batch_update_status_with_versions_tx(tenant_id, tx, &version_items, &status)
                    .await?;

                (
                    outcome.updated,
                    outcome.conflicts,
                    outcome.missing_ids,
                    "if_match",
                )
            } else {
                let updated = article_service
                    .batch_update_status_tx(tenant_id, tx, &ids, &status)
                    .await?;
                (updated, Vec::new(), Vec::new(), "blind")
            };

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
                            "mode": mode,
                            "conflicts": conflicts.iter().take(50).map(|c| serde_json::json!({
                                "id": c.id,
                                "expected_version": c.expected_version,
                                "current_version": c.current_version,
                            })).collect::<Vec<_>>(),
                            "missing_ids_sample": missing_ids.iter().copied().take(50).collect::<Vec<_>>(),
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok((updated, conflicts, missing_ids))
        })
    })
    .await
    .map_err(|e| match e {
        Error::Validation(msg) => AppError::validation(msg),
        _ => AppError::internal_with_code("BATCH_ERROR", e.to_string()),
    })?;

        let (updated, conflicts, missing_ids) = result;
        if !conflicts.is_empty() || !missing_ids.is_empty() {
            let conflicts_body: Vec<BatchStatusItemConflict> = conflicts
                .into_iter()
                .map(|c| BatchStatusItemConflict {
                    id: c.id,
                    expected_version: c.expected_version,
                    current_version: c.current_version,
                })
                .collect();

            return Err(AppError {
                status: axum::http::StatusCode::CONFLICT,
                body: ApiError::new("Batch update conflict")
                    .with_code("CONFLICT")
                    .with_details(serde_json::json!({
                        "updated": updated,
                        "conflicts": conflicts_body,
                        "missing_ids": missing_ids,
                    })),
            });
        }

        Ok(Json(BatchStatusResponse {
            updated,
            conflicts: Vec::new(),
            missing_ids: Vec::new(),
        }))
    }
}

pub(crate) use command::{
    archive_article, batch_update_status, delete_article, publish_article, restore_article,
    update_article,
};
pub(crate) use query::{
    get_analytics_summary, get_article, get_category_counts, get_stats, get_trends, list_articles,
    list_recent,
};
