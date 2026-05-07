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
use crate::middleware::role_tier_at_least;
use crate::routes::{etag_for_version, require_if_match_version};
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use law_eye_core::role_tier::{
    category_visible_for_tier, derive_role_tier_from_names, is_admin_tier, truncate_body_for_tier,
    ROLE_TIER_PREMIUM_USER, ROLE_TIER_TENANT_ADMIN, ROLE_TIER_VERIFIED_USER,
};
use std::net::SocketAddr;

async fn fetch_role_tier(
    state: &AppState,
    tenant_id: Uuid,
    user_id: Uuid,
) -> Result<String, AppError> {
    let roles = state
        .user_service
        .get_user_roles(tenant_id, user_id)
        .await
        .map_err(AppError::from)?;
    let role_names: Vec<String> = roles.into_iter().map(|role| role.name).collect();
    Ok(derive_role_tier_from_names(&role_names))
}

/// Returns the article status filter that the given role tier is allowed to query.
///
/// Non-admin tiers can only see published articles. Admins (tenant_admin/super_admin)
/// may pass through any explicit status filter, including unpublished workflow states.
fn enforce_article_status_for_tier(
    tier: &str,
    requested_status: Option<String>,
) -> Result<Option<String>, AppError> {
    if role_tier_at_least(tier, ROLE_TIER_TENANT_ADMIN) {
        return Ok(requested_status);
    }
    match requested_status.as_deref() {
        None => Ok(Some("published".to_string())),
        Some("published") => Ok(Some("published".to_string())),
        Some(_) => Err(AppError::forbidden(
            "Only tenant admins may filter by non-published status",
        )),
    }
}

/// Resolve the set of category IDs that the given role tier may see.
///
/// Returns `None` when the tier has full access (premium/admin). Otherwise returns the
/// list of visible category IDs derived from `category_visible_for_tier(slug, tier)`.
/// Empty visibility (e.g. zero categories match) returns `Some(vec![])`, which the
/// caller must interpret as "deny everything".
async fn visible_category_ids_for_tier(
    state: &AppState,
    tier: &str,
) -> Result<Option<Vec<Uuid>>, AppError> {
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        return Ok(None);
    }

    let categories = state
        .category_service
        .list()
        .await
        .map_err(AppError::from)?;

    let allowed: Vec<Uuid> = categories
        .into_iter()
        .filter(|category| category_visible_for_tier(&category.slug, tier))
        .map(|category| category.id)
        .collect();

    Ok(Some(allowed))
}

/// Validate that a `category_id` query parameter is allowed for the caller's tier.
///
/// Returns `Ok(())` if the caller may filter by the requested category, otherwise
/// `Err(AppError::forbidden(...))` with an upgrade hint. Premium/admin tiers always
/// pass through.
fn ensure_category_filter_allowed(
    requested: Option<Uuid>,
    visible: &Option<Vec<Uuid>>,
) -> Result<(), AppError> {
    let (Some(requested_id), Some(allowed)) = (requested, visible.as_ref()) else {
        return Ok(());
    };

    if !allowed.contains(&requested_id) {
        return Err(AppError::forbidden(
            "Category not visible for current role tier",
        ));
    }
    Ok(())
}

/// Apply SPEC-01 §2 tier-aware payload trimming to an `ArticleResponse`.
///
/// - `basic_user`: body truncated to 200 chars + ellipsis; `link`, `source_ref`,
///   `ai_metadata`, `domain_*`, `summary_struct`, `keywords`, and `risk_score` cleared
///   so non-paying users cannot harvest source URLs or AI insights.
/// - `verified_user`: keeps body and basic metadata; `ai_metadata` cleared (premium
///   AI insights gated behind `articles:read:full`).
/// - `premium_user`+: full passthrough.
fn trim_article_for_tier(mut body: ArticleResponse, tier: &str) -> ArticleResponse {
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        return body;
    }

    if !role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER) {
        // basic_user trimming
        body.content = truncate_body_for_tier(body.content.as_deref(), tier);
        body.link = String::new();
        body.source_ref = None;
        body.author = None;
        body.ai_metadata = serde_json::Value::Null;
        body.domain_root = None;
        body.domain_sub = None;
        body.summary_struct = None;
        body.keywords = Vec::new();
        body.risk_score = None;
        body.authority_level = None;
        body.issuer = None;
        body.doc_number = None;
    } else {
        // verified_user — hide premium AI insights only
        body.ai_metadata = serde_json::Value::Null;
        body.summary_struct = None;
    }

    body
}

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
    // Crawler enhancement: legal domain metadata
    pub domain_root: Option<String>,
    pub domain_sub: Option<String>,
    pub authority_level: Option<i32>,
    pub issuer: Option<String>,
    pub doc_number: Option<String>,
    pub effective_date: Option<chrono::NaiveDate>,
    pub region_code: Option<String>,
    pub content_hash: Option<String>,
    pub summary_struct: Option<serde_json::Value>,
    pub source_ref: Option<String>,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub ai_metadata: serde_json::Value,
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
            domain_root: a.domain_root,
            domain_sub: a.domain_sub,
            authority_level: a.authority_level,
            issuer: a.issuer,
            doc_number: a.doc_number,
            effective_date: a.effective_date,
            region_code: a.region_code,
            content_hash: a.content_hash,
            summary_struct: a.summary_struct,
            source_ref: a.source_ref,
            tags: a.tags,
            keywords: a.keywords,
            ai_metadata: a.ai_metadata,
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

/// SPEC-01 §2 / E.3 — tier-aware AI insights envelope.
///
/// `tier` echoes the caller's resolved role tier so the frontend can render
/// upgrade prompts deterministically. Premium tiers get the full payload;
/// verified users see only `summary` + `sentiment`; basic users are 403'd
/// upstream by the handler and never receive this struct.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleAiInsightsResponse {
    pub article_id: Uuid,
    pub tier: String,
    pub summary: String,
    pub sentiment: String,
    pub sentiment_score: f32,
    /// Only populated for premium/admin tiers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abstract_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_points: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_score: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_level: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendations: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub importance: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RelatedArticleResponse {
    #[serde(flatten)]
    pub article: ArticleResponse,
    /// Cosine similarity in [0, 1]; higher is more similar.
    pub similarity: f64,
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
        .route("/recommendations", get(list_recommendations))
        .route("/batch-status", post(batch_update_status))
        .route(
            "/{id}",
            get(get_article)
                .patch(update_article)
                .delete(delete_article),
        )
        .route("/{id}/ai-insights", get(get_ai_insights))
        .route("/{id}/related", get(get_related_articles))
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

        let role_tier = fetch_role_tier(&state, user.tenant_id, user.id).await?;
        let effective_status = enforce_article_status_for_tier(&role_tier, params.status.clone())?;
        let visible_categories = visible_category_ids_for_tier(&state, &role_tier).await?;
        ensure_category_filter_allowed(params.category_id, &visible_categories)?;

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
                    effective_status.as_deref(),
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
                    effective_status.as_deref(),
                )
                .await
                .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?
        };

        // Apply tier-based category visibility AFTER the DB call so a single SQL path
        // works for everyone. For premium/admin (`visible_categories == None`) this is
        // a no-op pass-through.
        let articles: Vec<_> = if let Some(allowed) = visible_categories.as_ref() {
            articles
                .into_iter()
                .filter(|article| {
                    article
                        .category_id
                        .map(|id| allowed.contains(&id))
                        .unwrap_or(false)
                })
                .collect()
        } else {
            articles
        };

        let total = state
            .article_service
            .count_filtered(
                user.tenant_id,
                params.category_id,
                effective_status.as_deref(),
            )
            .await
            .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;
        let data: Vec<ArticleResponse> = articles
            .into_iter()
            .map(ArticleResponse::from)
            .map(|item| trim_article_for_tier(item, &role_tier))
            .collect();

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
        let role_tier = fetch_role_tier(&state, user.tenant_id, user.id).await?;
        let visible_categories = visible_category_ids_for_tier(&state, &role_tier).await?;
        let articles = if role_tier_at_least(&role_tier, ROLE_TIER_TENANT_ADMIN) {
            state
                .article_service
                .list_recent(user.tenant_id, limit)
                .await
                .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?
        } else {
            state
                .article_service
                .list_filtered(user.tenant_id, limit, 0, None, Some("published"))
                .await
                .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?
        };

        let articles: Vec<_> = if let Some(allowed) = visible_categories.as_ref() {
            articles
                .into_iter()
                .filter(|article| {
                    article
                        .category_id
                        .map(|id| allowed.contains(&id))
                        .unwrap_or(false)
                })
                .collect()
        } else {
            articles
        };

        let data: Vec<ArticleResponse> = articles
            .into_iter()
            .map(ArticleResponse::from)
            .map(|item| trim_article_for_tier(item, &role_tier))
            .collect();
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

        let role_tier = fetch_role_tier(&state, user.tenant_id, user.id).await?;

        // Enforce tier-based category visibility for the resource itself.
        if !is_admin_tier(&role_tier) {
            let visible_categories = visible_category_ids_for_tier(&state, &role_tier).await?;
            if let Some(allowed) = visible_categories.as_ref() {
                let visible = article
                    .category_id
                    .map(|id| allowed.contains(&id))
                    .unwrap_or(false);
                if !visible {
                    return Err(AppError::forbidden(
                        "Article category not visible for current role tier",
                    ));
                }
            }
        }

        let body: ArticleResponse = article.into();
        let body = trim_article_for_tier(body, &role_tier);
        let etag = etag_for_version(body.version)?;
        let mut response = Json(body).into_response();
        response.headers_mut().insert(header::ETAG, etag);
        Ok(response)
    }

    /// E.3 — Tier-aware AI insights for a single article.
    ///
    /// - `basic_user`: 403 (upgrade required)
    /// - `verified_user`: summary + sentiment only
    /// - `premium_user`/admins: full insights (risk, key points, recommendations, importance)
    ///
    /// AI insights are computed on demand via `AiService::process_article`. The result
    /// is *not* persisted here — that path belongs to the ingestion pipeline.
    #[utoipa::path(
        get,
        path = "/api/v1/articles/{id}/ai-insights",
        params(("id" = Uuid, Path, description = "Article ID")),
        security(("session" = [])),
        responses(
            (status = 200, description = "AI insights (tier-trimmed)", body = ArticleAiInsightsResponse),
            (status = 401, description = "Not authenticated", body = ApiError),
            (status = 403, description = "Permission denied / tier too low", body = ApiError),
            (status = 404, description = "Article not found", body = ApiError),
            (status = 503, description = "AI service unavailable", body = ApiError),
            (status = 500, description = "Server error", body = ApiError),
        )
    )]
    pub(crate) async fn get_ai_insights(
        State(state): State<AppState>,
        auth_session: AuthSession,
        Path(id): Path<Uuid>,
    ) -> ApiResult<Json<ArticleAiInsightsResponse>> {
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

        let role_tier = fetch_role_tier(&state, user.tenant_id, user.id).await?;
        // basic_user is denied entirely — AI insights are a paid feature per SPEC-01 §2.
        if !role_tier_at_least(&role_tier, ROLE_TIER_VERIFIED_USER) {
            return Err(AppError::forbidden(
                "AI insights require verified or premium tier",
            ));
        }

        let article = state
            .article_service
            .get_by_id(user.tenant_id, id)
            .await
            .map_err(AppError::from)?;

        // Enforce tier-based category visibility so verified users can't peek at
        // restricted-domain insights via this endpoint.
        if !is_admin_tier(&role_tier) {
            let visible_categories = visible_category_ids_for_tier(&state, &role_tier).await?;
            if let Some(allowed) = visible_categories.as_ref() {
                let visible = article
                    .category_id
                    .map(|cid| allowed.contains(&cid))
                    .unwrap_or(false);
                if !visible {
                    return Err(AppError::forbidden(
                        "Article category not visible for current role tier",
                    ));
                }
            }
        }

        let ai_service = state
            .ai_service
            .as_ref()
            .ok_or_else(|| AppError::service_unavailable("AI service not configured"))?;

        let title = article.title.clone();
        let content = article.content.clone().unwrap_or_default();
        let result = ai_service
            .process_article(&title, &content)
            .await
            .map_err(|e| AppError::internal_with_code("AI_INSIGHTS_ERROR", e.to_string()))?;

        let is_premium = role_tier_at_least(&role_tier, ROLE_TIER_PREMIUM_USER);

        let body = if is_premium {
            ArticleAiInsightsResponse {
                article_id: article.id,
                tier: role_tier.clone(),
                summary: result.summary,
                sentiment: result.sentiment,
                sentiment_score: result.sentiment_score,
                abstract_text: Some(result.abstract_text),
                key_points: Some(result.key_points),
                risk_score: Some(result.risk_score),
                risk_level: Some(result.risk_level),
                recommendations: Some(result.recommendations),
                importance: Some(result.importance),
                tags: Some(result.tags),
                keywords: Some(result.keywords),
            }
        } else {
            // verified_user — strip everything except summary + sentiment.
            ArticleAiInsightsResponse {
                article_id: article.id,
                tier: role_tier.clone(),
                summary: result.summary,
                sentiment: result.sentiment,
                sentiment_score: result.sentiment_score,
                abstract_text: None,
                key_points: None,
                risk_score: None,
                risk_level: None,
                recommendations: None,
                importance: None,
                tags: None,
                keywords: None,
            }
        };

        Ok(Json(body))
    }

    /// E.3 — Top-N related articles via pgvector cosine similarity.
    ///
    /// Strategy: find the source article's chunk embedding (chunk_index = 0), then
    /// rank other articles' chunks by cosine distance and dedupe by article_id.
    /// Returns up to 5 results, each tier-trimmed via `trim_article_for_tier`.
    #[utoipa::path(
        get,
        path = "/api/v1/articles/{id}/related",
        params(("id" = Uuid, Path, description = "Source article ID")),
        security(("session" = [])),
        responses(
            (status = 200, description = "Related articles", body = Vec<RelatedArticleResponse>),
            (status = 401, description = "Not authenticated", body = ApiError),
            (status = 403, description = "Permission denied", body = ApiError),
            (status = 404, description = "Article not found", body = ApiError),
            (status = 500, description = "Server error", body = ApiError),
        )
    )]
    pub(crate) async fn get_related_articles(
        State(state): State<AppState>,
        auth_session: AuthSession,
        Path(id): Path<Uuid>,
    ) -> ApiResult<Json<Vec<RelatedArticleResponse>>> {
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

        let role_tier = fetch_role_tier(&state, user.tenant_id, user.id).await?;
        let tenant_id = user.tenant_id;

        // Verify source article is visible to this caller before exposing its neighbors.
        let source = state
            .article_service
            .get_by_id(tenant_id, id)
            .await
            .map_err(AppError::from)?;

        let visible_categories = visible_category_ids_for_tier(&state, &role_tier).await?;
        if !is_admin_tier(&role_tier) {
            if let Some(allowed) = visible_categories.as_ref() {
                let visible = source
                    .category_id
                    .map(|cid| allowed.contains(&cid))
                    .unwrap_or(false);
                if !visible {
                    return Err(AppError::forbidden(
                        "Article category not visible for current role tier",
                    ));
                }
            }
        }

        // Pull related article ids + similarity via pgvector. We DISTINCT ON
        // article_id and pick the best-matching chunk per article. Then we hydrate
        // the full Article rows in a second query so the tuple decoder doesn't have
        // to dance around the wide articles row shape.
        let admin_can_see_all = is_admin_tier(&role_tier);
        let ranked: Vec<(Uuid, f64)> = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, (Uuid, f64)>(
                    r#"
                    WITH source_chunk AS (
                        SELECT embedding
                        FROM article_chunks
                        WHERE article_id = $1
                          AND embedding IS NOT NULL
                        ORDER BY chunk_index ASC
                        LIMIT 1
                    ),
                    ranked AS (
                        SELECT DISTINCT ON (c.article_id)
                            c.article_id,
                            1 - (c.embedding <=> (SELECT embedding FROM source_chunk)) AS similarity
                        FROM article_chunks c
                        WHERE c.embedding IS NOT NULL
                          AND c.article_id <> $1
                          AND EXISTS (SELECT 1 FROM source_chunk)
                        ORDER BY c.article_id,
                                 c.embedding <=> (SELECT embedding FROM source_chunk) ASC
                    )
                    SELECT r.article_id, r.similarity
                    FROM ranked r
                    JOIN articles a ON a.id = r.article_id
                    WHERE a.deleted_at IS NULL
                      AND ($2 OR a.status = 'published')
                    ORDER BY r.similarity DESC
                    LIMIT 20
                    "#,
                )
                .bind(id)
                .bind(admin_can_see_all)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| law_eye_common::Error::Database(e.to_string()))
            })
        })
        .await
        .map_err(|e| AppError::internal_with_code("RELATED_QUERY_ERROR", e.to_string()))?;

        // Hydrate, filter by tier-visible categories, then take 5.
        let allowed_set = visible_categories.clone();
        let mut data: Vec<RelatedArticleResponse> = Vec::new();
        for (article_id, similarity) in ranked {
            if data.len() >= 5 {
                break;
            }
            let article = match state.article_service.get_by_id(tenant_id, article_id).await {
                Ok(a) => a,
                // Skip rows that disappeared between the two queries (race) or that
                // RLS hides — they shouldn't surface as errors here.
                Err(_) => continue,
            };
            if let Some(allowed) = allowed_set.as_ref() {
                let visible = article
                    .category_id
                    .map(|cid| allowed.contains(&cid))
                    .unwrap_or(false);
                if !visible {
                    continue;
                }
            }
            let resp: ArticleResponse = article.into();
            let resp = trim_article_for_tier(resp, &role_tier);
            data.push(RelatedArticleResponse {
                article: resp,
                similarity,
            });
        }

        Ok(Json(data))
    }

    /// E.6 — Personalized recommendations for the current user.
    ///
    /// Algorithm:
    /// 1. Pull the user's most recent ≤20 finished article ids from
    ///    `article_reads`.
    /// 2. Average their `chunk_index = 0` embeddings into a centroid.
    /// 3. pgvector cosine search against `article_chunks.embedding` within
    ///    visible categories, excluding already-read articles.
    /// 4. New users (no finished reads, or no embeddings on the seeds) fall
    ///    back to the MVP "recent published in visible categories" path.
    #[utoipa::path(
        get,
        path = "/api/v1/articles/recommendations",
        params(
            ("limit" = Option<i64>, Query, description = "Max results (default 10, max 30)")
        ),
        security(("session" = [])),
        responses(
            (status = 200, description = "Recommended articles", body = Vec<ArticleResponse>),
            (status = 401, description = "Not authenticated", body = ApiError),
            (status = 403, description = "Permission denied", body = ApiError),
            (status = 500, description = "Server error", body = ApiError),
        )
    )]
    pub(crate) async fn list_recommendations(
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

        let limit = params.limit.unwrap_or(10).clamp(1, 30);
        let role_tier = fetch_role_tier(&state, user.tenant_id, user.id).await?;
        let visible_categories = visible_category_ids_for_tier(&state, &role_tier).await?;

        // Step 1: try the personalized path. Returns empty when the user has no
        // finished reads or when none of the seeds have embeddings yet.
        let seed_ids = state
            .article_read_service
            .recent_finished_article_ids(user.tenant_id, user.id, 20)
            .await
            .map_err(AppError::from)?;

        let personalized: Vec<_> = if !seed_ids.is_empty() {
            let excluded = state
                .article_read_service
                .all_read_article_ids(user.tenant_id, user.id)
                .await
                .map_err(AppError::from)?;
            state
                .article_service
                .recommend_personalized(
                    user.tenant_id,
                    &seed_ids,
                    &excluded,
                    visible_categories.as_deref(),
                    limit,
                )
                .await
                .map_err(AppError::from)?
        } else {
            Vec::new()
        };

        let articles = if !personalized.is_empty() {
            personalized
        } else {
            // Step 2: MVP fallback — recent published in visible categories.
            let candidate_limit = limit.saturating_mul(3).clamp(limit, 100);
            let pool = state
                .article_service
                .list_filtered(user.tenant_id, candidate_limit, 0, None, Some("published"))
                .await
                .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

            if let Some(allowed) = visible_categories.as_ref() {
                pool.into_iter()
                    .filter(|article| {
                        article
                            .category_id
                            .map(|cid| allowed.contains(&cid))
                            .unwrap_or(false)
                    })
                    .collect()
            } else {
                pool
            }
        };

        let data: Vec<ArticleResponse> = articles
            .into_iter()
            .take(limit as usize)
            .map(ArticleResponse::from)
            .map(|item| trim_article_for_tier(item, &role_tier))
            .collect();

        Ok(Json(data))
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

        // Invalidate statistics caches after article update
        if let Some(ref cache) = state.cache_service {
            let _ = cache.invalidate_resource(tenant_id, "statistics").await;
        }

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

        // Invalidate statistics caches after article deletion
        if let Some(ref cache) = state.cache_service {
            let _ = cache.invalidate_resource(tenant_id, "statistics").await;
        }

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

        // Invalidate statistics caches after article restore
        if let Some(ref cache) = state.cache_service {
            let _ = cache.invalidate_resource(tenant_id, "statistics").await;
        }

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

        // Invalidate statistics caches after article publish
        if let Some(ref cache) = state.cache_service {
            let _ = cache.invalidate_resource(tenant_id, "statistics").await;
        }

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

        // Invalidate statistics caches after article archive
        if let Some(ref cache) = state.cache_service {
            let _ = cache.invalidate_resource(tenant_id, "statistics").await;
        }

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

        // Invalidate statistics caches after batch status update
        if let Some(ref cache) = state.cache_service {
            let _ = cache.invalidate_resource(tenant_id, "statistics").await;
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
    get_ai_insights, get_analytics_summary, get_article, get_category_counts, get_related_articles,
    get_stats, get_trends, list_articles, list_recent, list_recommendations,
};

#[cfg(test)]
mod tier_filter_tests {
    //! Pure unit tests for the SPEC-01 §2 tier-aware payload trimming applied to
    //! `ArticleResponse`. These exercise `trim_article_for_tier` and the article
    //! status enforcement helper across all 5 tiers.

    use super::*;
    use chrono::Utc;
    use law_eye_core::role_tier::{
        BASIC_USER_BODY_PREVIEW_CHARS, ROLE_TIER_BASIC_USER, ROLE_TIER_PREMIUM_USER,
        ROLE_TIER_SUPER_ADMIN, ROLE_TIER_TENANT_ADMIN, ROLE_TIER_VERIFIED_USER,
    };

    fn fixture_article() -> ArticleResponse {
        let now = Utc::now();
        ArticleResponse {
            id: Uuid::new_v4(),
            source_id: Uuid::new_v4(),
            category_id: Some(Uuid::new_v4()),
            title: "示例标题".to_string(),
            link: "https://gov.example/article/1".to_string(),
            content: Some("body ".repeat(200)),
            summary: Some("summary".to_string()),
            author: Some("作者".to_string()),
            published_at: Some(now),
            risk_score: Some(75),
            importance: Some(3),
            sentiment: Some("neutral".to_string()),
            domain_root: Some("regulation".to_string()),
            domain_sub: Some("data_protection".to_string()),
            authority_level: Some(2),
            issuer: Some("国家网信办".to_string()),
            doc_number: Some("国信发[2026]1号".to_string()),
            effective_date: None,
            region_code: Some("CN-11".to_string()),
            content_hash: Some("deadbeef".to_string()),
            summary_struct: Some(serde_json::json!({"keypoints": ["a", "b"]})),
            source_ref: Some("https://gov.example/raw".to_string()),
            tags: vec!["data".to_string()],
            keywords: vec!["data".to_string(), "privacy".to_string()],
            ai_metadata: serde_json::json!({"insights": "premium analysis"}),
            status: "published".to_string(),
            version: 1,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn trim_article_basic_user_strips_link_source_and_ai_metadata() {
        let trimmed = trim_article_for_tier(fixture_article(), ROLE_TIER_BASIC_USER);
        assert_eq!(trimmed.link, "");
        assert!(trimmed.source_ref.is_none());
        assert!(trimmed.ai_metadata.is_null());
        assert!(trimmed.author.is_none());
        assert!(trimmed.domain_root.is_none());
        assert!(trimmed.summary_struct.is_none());
        assert!(trimmed.keywords.is_empty());
        assert!(trimmed.risk_score.is_none());
        // basic user body must be at most preview length + ellipsis.
        let body = trimmed.content.as_deref().unwrap();
        assert!(body.chars().count() <= BASIC_USER_BODY_PREVIEW_CHARS + 1);
    }

    #[test]
    fn trim_article_verified_user_keeps_metadata_but_hides_ai_insights() {
        let trimmed = trim_article_for_tier(fixture_article(), ROLE_TIER_VERIFIED_USER);
        assert!(!trimmed.link.is_empty(), "link visible to verified");
        assert!(trimmed.source_ref.is_some(), "source_ref visible");
        assert!(trimmed.author.is_some(), "author visible");
        assert!(
            trimmed.ai_metadata.is_null(),
            "ai_metadata hidden for verified"
        );
        assert!(trimmed.summary_struct.is_none(), "summary_struct hidden");
        assert_eq!(trimmed.domain_root.as_deref(), Some("regulation"));
        assert!(trimmed.risk_score.is_some());
    }

    #[test]
    fn trim_article_premium_user_passes_through_full_payload() {
        let original = fixture_article();
        let trimmed = trim_article_for_tier(original.clone(), ROLE_TIER_PREMIUM_USER);
        assert_eq!(trimmed.link, original.link);
        assert_eq!(trimmed.ai_metadata, original.ai_metadata);
        assert_eq!(trimmed.summary_struct, original.summary_struct);
        assert_eq!(trimmed.source_ref, original.source_ref);
    }

    #[test]
    fn trim_article_tenant_admin_passes_through_full_payload() {
        let original = fixture_article();
        let trimmed = trim_article_for_tier(original.clone(), ROLE_TIER_TENANT_ADMIN);
        assert_eq!(trimmed.ai_metadata, original.ai_metadata);
        assert_eq!(trimmed.link, original.link);
    }

    #[test]
    fn trim_article_super_admin_passes_through_full_payload() {
        let original = fixture_article();
        let trimmed = trim_article_for_tier(original.clone(), ROLE_TIER_SUPER_ADMIN);
        assert_eq!(trimmed.ai_metadata, original.ai_metadata);
        assert_eq!(trimmed.link, original.link);
    }

    #[test]
    fn enforce_status_for_basic_user_forces_published() {
        let result = enforce_article_status_for_tier(ROLE_TIER_BASIC_USER, None).unwrap();
        assert_eq!(result, Some("published".to_string()));
    }

    #[test]
    fn enforce_status_for_basic_user_rejects_archived_filter() {
        let err =
            enforce_article_status_for_tier(ROLE_TIER_BASIC_USER, Some("archived".to_string()))
                .unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::FORBIDDEN);
    }

    #[test]
    fn enforce_status_for_verified_user_still_blocks_unpublished() {
        let err =
            enforce_article_status_for_tier(ROLE_TIER_VERIFIED_USER, Some("pending".to_string()))
                .unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::FORBIDDEN);
    }

    #[test]
    fn enforce_status_for_premium_user_still_blocks_unpublished() {
        let err =
            enforce_article_status_for_tier(ROLE_TIER_PREMIUM_USER, Some("processing".to_string()))
                .unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::FORBIDDEN);
    }

    #[test]
    fn enforce_status_for_tenant_admin_passes_through_archived_filter() {
        let result =
            enforce_article_status_for_tier(ROLE_TIER_TENANT_ADMIN, Some("archived".to_string()))
                .unwrap();
        assert_eq!(result, Some("archived".to_string()));
    }

    #[test]
    fn enforce_status_for_super_admin_passes_through_pending_filter() {
        let result =
            enforce_article_status_for_tier(ROLE_TIER_SUPER_ADMIN, Some("pending".to_string()))
                .unwrap();
        assert_eq!(result, Some("pending".to_string()));
    }

    #[test]
    fn ensure_category_filter_allowed_premium_passes_anything() {
        // visible == None means premium/admin → all categories allowed.
        ensure_category_filter_allowed(Some(Uuid::new_v4()), &None).unwrap();
    }

    #[test]
    fn ensure_category_filter_allowed_basic_blocks_unknown_category() {
        let allowed = vec![Uuid::new_v4()];
        let err = ensure_category_filter_allowed(Some(Uuid::new_v4()), &Some(allowed)).unwrap_err();
        assert_eq!(err.status, axum::http::StatusCode::FORBIDDEN);
    }

    #[test]
    fn ensure_category_filter_allowed_basic_accepts_visible_category() {
        let id = Uuid::new_v4();
        let allowed = vec![id];
        ensure_category_filter_allowed(Some(id), &Some(allowed)).unwrap();
    }
}
