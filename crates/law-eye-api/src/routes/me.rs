//! `/api/v1/me/*` — current-user endpoints.
//!
//! SPEC-02 §2.2 calls for a tier-aware personal feed combining channels,
//! pinned articles and recent articles. This handler honours the SPEC-01 §2
//! tier-aware payload trimming rules. `BannerService` is not yet available
//! in `AppState` (banners migration is incomplete), so banners are omitted
//! from the response and will be added once F.2 wiring lands.

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use law_eye_core::role_tier::{
    category_visible_for_tier, derive_role_tier_from_names, is_admin_tier, role_tier_at_least,
    truncate_body_for_tier, ROLE_TIER_PREMIUM_USER, ROLE_TIER_TENANT_ADMIN,
    ROLE_TIER_VERIFIED_USER,
};
use law_eye_core::{ArticleReadInput, ReadingHistoryRow};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::routes::articles::ArticleResponse;
use crate::routes::auth::{AuthResponse, UserResponse};
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct MeFeedQuery {
    pub article_limit: Option<i64>,
    pub pin_limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ChannelEntry {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub linked_category_id: Option<Uuid>,
    pub visibility: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PinnedArticleEntry {
    pub pin_id: Uuid,
    pub priority: i32,
    pub article: ArticleResponse,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MeFeedResponse {
    pub role_tier: String,
    pub visible_channels: Vec<ChannelEntry>,
    pub visible_category_ids: Vec<Uuid>,
    pub pinned_articles: Vec<PinnedArticleEntry>,
    pub articles: Vec<ArticleResponse>,
    /// Tier-aware AI enrichment, parallel to `articles` by `article_id`.
    /// - `basic_user`: empty
    /// - `verified_user`: only `summary_one_sentence` populated; other fields None
    /// - `premium_user` / admin: full payload
    pub articles_ai: Vec<MeFeedArticleAi>,
}

/// Per-article AI preview attached to `/me/feed`. Tier-trimmed: verified users
/// see only the one-sentence summary so they have a hook to upgrade; premium users
/// see all sentiment + summary tiers.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MeFeedArticleAi {
    pub article_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_one_sentence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_three_sentences: Option<String>,
    /// JSON array of strings (3-5 key points). `None` for verified tier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_key_points: Option<serde_json::Value>,
    /// JSON array of headline keywords (2-5 items). `None` for verified tier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headline_keywords: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sentiment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sentiment_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sentiment_aspect: Option<String>,
}

/// Full AI payload for `GET /api/v1/me/articles/{id}/ai` — premium tier only.
///
/// Mirrors columns added by migration `065_sentiment_summary_fields.sql` plus
/// the legacy `articles.sentiment` / `ai_metadata` / `tags` / `keywords` slots.
/// All fields are nullable in the DB, so worker backfill gaps surface as `None`
/// rather than runtime errors.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MeArticleAiResponse {
    pub article_id: Uuid,
    pub tier: String,
    pub sentiment: Option<String>,
    pub sentiment_score: Option<f64>,
    pub sentiment_rationale: Option<String>,
    pub sentiment_aspect: Option<String>,
    pub summary_one_sentence: Option<String>,
    pub summary_three_sentences: Option<String>,
    /// JSON array of strings (3-5 key points), defaults to `[]` in DB.
    pub summary_key_points: serde_json::Value,
    /// JSON array (2-5 items), defaults to `[]` in DB.
    pub headline_keywords: serde_json::Value,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub ai_metadata: serde_json::Value,
}

/// Raw row pulled from `articles` to feed both `MeArticleAiResponse` and the
/// per-article enrichment in `/me/feed`. Kept private — not serialized.
#[derive(Debug, sqlx::FromRow)]
struct ArticleAiRow {
    article_id: Uuid,
    sentiment: Option<String>,
    sentiment_score: Option<f64>,
    sentiment_rationale: Option<String>,
    sentiment_aspect: Option<String>,
    summary_one_sentence: Option<String>,
    summary_three_sentences: Option<String>,
    summary_key_points: serde_json::Value,
    headline_keywords: serde_json::Value,
    tags: Vec<String>,
    keywords: Vec<String>,
    ai_metadata: serde_json::Value,
}

/// Trim an AI row to the verified tier shape: only `summary_one_sentence` +
/// sentiment label survives. We keep the sentiment label (not the score/aspect)
/// as a low-fidelity hook so the feed can render a small mood pill without
/// leaking the premium-only confidence/aspect breakdown.
fn ai_row_to_feed_entry(row: ArticleAiRow, tier: &str) -> MeFeedArticleAi {
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        // Convert defaults `[]` to `None` so the FE can cleanly skip empty arrays.
        let key_points = if matches!(&row.summary_key_points, serde_json::Value::Array(a) if a.is_empty())
        {
            None
        } else {
            Some(row.summary_key_points)
        };
        let headline = if matches!(&row.headline_keywords, serde_json::Value::Array(a) if a.is_empty())
        {
            None
        } else {
            Some(row.headline_keywords)
        };
        MeFeedArticleAi {
            article_id: row.article_id,
            summary_one_sentence: row.summary_one_sentence,
            summary_three_sentences: row.summary_three_sentences,
            summary_key_points: key_points,
            headline_keywords: headline,
            sentiment: row.sentiment,
            sentiment_score: row.sentiment_score,
            sentiment_aspect: row.sentiment_aspect,
        }
    } else {
        // verified_user — only the one-sentence summary + bare sentiment label.
        MeFeedArticleAi {
            article_id: row.article_id,
            summary_one_sentence: row.summary_one_sentence,
            summary_three_sentences: None,
            summary_key_points: None,
            headline_keywords: None,
            sentiment: row.sentiment,
            sentiment_score: None,
            sentiment_aspect: None,
        }
    }
}

async fn fetch_article_ai_rows(
    state: &AppState,
    tenant_id: Uuid,
    article_ids: &[Uuid],
) -> Result<Vec<ArticleAiRow>, AppError> {
    if article_ids.is_empty() {
        return Ok(Vec::new());
    }

    let ids = article_ids.to_vec();
    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, ArticleAiRow>(
                r#"
                SELECT
                    id AS article_id,
                    sentiment,
                    sentiment_score,
                    sentiment_rationale,
                    sentiment_aspect,
                    summary_one_sentence,
                    summary_three_sentences,
                    summary_key_points,
                    headline_keywords,
                    tags,
                    keywords,
                    ai_metadata
                FROM articles
                WHERE deleted_at IS NULL
                  AND id = ANY($1)
                "#,
            )
            .bind(&ids)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))
        })
    })
    .await
    .map_err(AppError::from)
}

fn channel_visible_for_tier(visibility: &str, tier: &str) -> bool {
    if role_tier_at_least(tier, ROLE_TIER_TENANT_ADMIN) {
        return true;
    }
    match visibility {
        "public" | "restricted" => true,
        "verified" => role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER),
        "premium" => role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER),
        _ => false,
    }
}

/// Mirror of `routes::articles::trim_article_for_tier` (kept private there).
///
/// Duplicated locally so this handler can satisfy the SPEC-01 §2 trimming
/// contract without exposing the helper publicly. Keep the two implementations
/// in sync if `trim_article_for_tier` evolves.
fn trim_for_tier(mut body: ArticleResponse, tier: &str) -> ArticleResponse {
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        return body;
    }

    if !role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER) {
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
        body.ai_metadata = serde_json::Value::Null;
        body.summary_struct = None;
    }

    body
}

#[utoipa::path(
    get,
    path = "/api/v1/me/feed",
    params(MeFeedQuery),
    security(("session" = [])),
    responses(
        (status = 200, description = "Personalized feed payload", body = MeFeedResponse),
        (status = 401, description = "Authentication required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "me"
)]
pub(crate) async fn get_feed(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<MeFeedQuery>,
) -> ApiResult<Json<MeFeedResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let article_limit = query.article_limit.unwrap_or(20).clamp(1, 60);
    let pin_limit = query.pin_limit.unwrap_or(8).clamp(1, 20);

    let role_names: Vec<String> = state
        .user_service
        .get_user_roles(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?
        .into_iter()
        .map(|role| role.name)
        .collect();
    let role_tier = derive_role_tier_from_names(&role_names);

    let visible_channels: Vec<ChannelEntry> = state
        .channel_service
        .list_active(user.tenant_id)
        .await
        .map_err(AppError::from)?
        .into_iter()
        .filter(|channel| channel_visible_for_tier(&channel.visibility, &role_tier))
        .map(|channel| ChannelEntry {
            id: channel.id,
            slug: channel.slug,
            name: channel.name,
            description: channel.description,
            linked_category_id: channel.linked_category_id,
            visibility: channel.visibility,
        })
        .collect();

    let categories = state
        .category_service
        .list()
        .await
        .map_err(AppError::from)?;
    let visible_category_ids: Vec<Uuid> = if role_tier_at_least(&role_tier, ROLE_TIER_PREMIUM_USER)
    {
        categories.iter().map(|category| category.id).collect()
    } else {
        categories
            .iter()
            .filter(|category| category_visible_for_tier(&category.slug, &role_tier))
            .map(|category| category.id)
            .collect()
    };

    let pinned = state
        .article_pin_service
        .list_active(user.tenant_id, pin_limit)
        .await
        .map_err(AppError::from)?;
    let pinned_articles: Vec<PinnedArticleEntry> = pinned
        .into_iter()
        .filter(|item| {
            item.article
                .category_id
                .map(|id| visible_category_ids.contains(&id))
                .unwrap_or(true)
        })
        .map(|item| PinnedArticleEntry {
            pin_id: item.pin.id,
            priority: item.pin.priority,
            article: trim_for_tier(ArticleResponse::from(item.article), &role_tier),
        })
        .collect();

    let articles = state
        .article_service
        .list_recent(user.tenant_id, article_limit)
        .await
        .map_err(AppError::from)?;
    let trimmed: Vec<ArticleResponse> = articles
        .into_iter()
        .filter(|article| {
            article
                .category_id
                .map(|id| visible_category_ids.contains(&id))
                .unwrap_or(true)
        })
        .map(|article| trim_for_tier(ArticleResponse::from(article), &role_tier))
        .collect();

    // Tier-aware AI enrichment: basic gets nothing, verified+/premium get a
    // parallel array keyed by article_id. This sits alongside the trimmed
    // article body so the FE can join client-side without re-parsing the
    // legacy ArticleResponse shape.
    let articles_ai = if role_tier_at_least(&role_tier, ROLE_TIER_VERIFIED_USER) {
        let ids: Vec<Uuid> = trimmed.iter().map(|article| article.id).collect();
        let rows = fetch_article_ai_rows(&state, user.tenant_id, &ids).await?;
        rows.into_iter()
            .map(|row| ai_row_to_feed_entry(row, &role_tier))
            .collect()
    } else {
        Vec::new()
    };

    Ok(Json(MeFeedResponse {
        role_tier,
        visible_channels,
        visible_category_ids,
        pinned_articles,
        articles: trimmed,
        articles_ai,
    }))
}

/// `GET /api/v1/me/articles/{id}/ai` — premium-only AI deep-dive for a single
/// article visible to the caller.
///
/// Returns 403 with an upgrade hint for basic/verified tiers. Returns 404 if
/// the article doesn't exist or is filtered out by tier-aware category
/// visibility (so we don't leak existence of restricted-domain articles).
#[utoipa::path(
    get,
    path = "/api/v1/me/articles/{id}/ai",
    params(("id" = Uuid, Path, description = "Article ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Full AI payload for the article", body = MeArticleAiResponse),
        (status = 401, description = "Authentication required", body = ApiError),
        (status = 403, description = "Premium tier required", body = ApiError),
        (status = 404, description = "Article not found / not visible", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "me"
)]
pub(crate) async fn get_my_article_ai(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
) -> ApiResult<Json<MeArticleAiResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let role_names: Vec<String> = state
        .user_service
        .get_user_roles(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?
        .into_iter()
        .map(|role| role.name)
        .collect();
    let role_tier = derive_role_tier_from_names(&role_names);

    if !role_tier_at_least(&role_tier, ROLE_TIER_PREMIUM_USER) {
        return Err(AppError::forbidden(
            "Premium tier required for AI insights — upgrade to access full sentiment + summary breakdown",
        ));
    }

    // Confirm the article exists + the caller's tier may see its category.
    // We do this *before* the AI fetch so we reuse `article_service.get_by_id`'s
    // tenant guard and 404 mapping. Premium users can see all categories, but
    // we still call `category_visible_for_tier` for symmetry / future-proofing
    // if "premium" ever loses access to a niche slug.
    let article = state
        .article_service
        .get_by_id(user.tenant_id, article_id)
        .await
        .map_err(AppError::from)?;

    if !is_admin_tier(&role_tier) {
        if let Some(cid) = article.category_id {
            let categories = state
                .category_service
                .list()
                .await
                .map_err(AppError::from)?;
            let visible = categories
                .iter()
                .find(|c| c.id == cid)
                .map(|c| category_visible_for_tier(&c.slug, &role_tier))
                .unwrap_or(false);
            if !visible {
                return Err(AppError::not_found("Article not found"));
            }
        }
    }

    let mut rows = fetch_article_ai_rows(&state, user.tenant_id, &[article_id]).await?;

    // Graceful degradation: if the AI worker hasn't backfilled this article
    // yet, return an empty payload with the article_id stamped — the FE shows
    // a "pending analysis" placeholder instead of erroring out.
    let body = if let Some(row) = rows.pop() {
        MeArticleAiResponse {
            article_id: row.article_id,
            tier: role_tier.clone(),
            sentiment: row.sentiment,
            sentiment_score: row.sentiment_score,
            sentiment_rationale: row.sentiment_rationale,
            sentiment_aspect: row.sentiment_aspect,
            summary_one_sentence: row.summary_one_sentence,
            summary_three_sentences: row.summary_three_sentences,
            summary_key_points: row.summary_key_points,
            headline_keywords: row.headline_keywords,
            tags: row.tags,
            keywords: row.keywords,
            ai_metadata: row.ai_metadata,
        }
    } else {
        MeArticleAiResponse {
            article_id,
            tier: role_tier.clone(),
            sentiment: None,
            sentiment_score: None,
            sentiment_rationale: None,
            sentiment_aspect: None,
            summary_one_sentence: None,
            summary_three_sentences: None,
            summary_key_points: serde_json::json!([]),
            headline_keywords: serde_json::json!([]),
            tags: Vec::new(),
            keywords: Vec::new(),
            ai_metadata: serde_json::Value::Null,
        }
    };

    Ok(Json(body))
}

// ── Article read tracking (E.6) ───────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema, Default)]
#[serde(deny_unknown_fields)]
pub struct RecordArticleReadRequest {
    pub dwell_ms: Option<i32>,
    pub scroll_pct: Option<i32>,
    pub finished: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RecordArticleReadResponse {
    pub article_id: Uuid,
    pub dwell_ms: i32,
    pub scroll_pct: i32,
    pub finished: bool,
    pub read_at: chrono::DateTime<chrono::Utc>,
}

#[utoipa::path(
    post,
    path = "/api/v1/me/articles/{id}/read",
    params(("id" = Uuid, Path, description = "Article ID")),
    request_body = RecordArticleReadRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Read event recorded", body = RecordArticleReadResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Article not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "me"
)]
pub(crate) async fn record_article_read(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
    ApiJson(req): ApiJson<RecordArticleReadRequest>,
) -> ApiResult<Json<RecordArticleReadResponse>> {
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

    // Confirm the article belongs to the caller's tenant before recording.
    state
        .article_service
        .get_by_id(user.tenant_id, article_id)
        .await
        .map_err(AppError::from)?;

    let record = state
        .article_read_service
        .record_read(
            user.tenant_id,
            user.id,
            article_id,
            ArticleReadInput {
                dwell_ms: req.dwell_ms,
                scroll_pct: req.scroll_pct,
                finished: req.finished,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(RecordArticleReadResponse {
        article_id: record.article_id,
        dwell_ms: record.dwell_ms,
        scroll_pct: record.scroll_pct,
        finished: record.finished,
        read_at: record.read_at,
    }))
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListReadingHistoryQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub finished_only: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReadingHistoryItem {
    pub article_id: Uuid,
    pub title: String,
    pub category_slug: Option<String>,
    pub dwell_ms_total: i32,
    pub scroll_pct_peak: i32,
    pub finished: bool,
    pub last_read_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ListReadingHistoryResponse {
    pub items: Vec<ReadingHistoryItem>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

impl From<ReadingHistoryRow> for ReadingHistoryItem {
    fn from(row: ReadingHistoryRow) -> Self {
        Self {
            article_id: row.article_id,
            title: row.title,
            category_slug: row.category_slug,
            dwell_ms_total: row.dwell_ms_total,
            scroll_pct_peak: row.scroll_pct_peak,
            finished: row.finished,
            last_read_at: row.last_read_at,
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/me/reading-history",
    params(ListReadingHistoryQuery),
    security(("session" = [])),
    responses(
        (status = 200, description = "Paginated reading history", body = ListReadingHistoryResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "me"
)]
pub(crate) async fn list_reading_history(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListReadingHistoryQuery>,
) -> ApiResult<Json<ListReadingHistoryResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = query.offset.unwrap_or(0).max(0);
    let finished_only = query.finished_only.unwrap_or(false);

    let (rows, total) = state
        .article_read_service
        .list_with_articles(user.tenant_id, user.id, limit, offset, finished_only)
        .await
        .map_err(AppError::from)?;

    Ok(Json(ListReadingHistoryResponse {
        items: rows.into_iter().map(ReadingHistoryItem::from).collect(),
        total,
        limit,
        offset,
    }))
}

/// `GET /api/v1/me/profile` — alias of `/api/v1/auth/me`.
///
/// SPEC-01 §6.1 mirrors the auth-store contract on the client; the FE expected
/// `/me/profile` while the backend canonical path is `/auth/me`. Returning the
/// identical AuthResponse shape (success + user) keeps both routes
/// interchangeable until consumers migrate.
#[utoipa::path(
    get,
    path = "/api/v1/me/profile",
    security(("session" = [])),
    responses(
        (status = 200, description = "Current user", body = AuthResponse),
        (status = 401, description = "Not authenticated", body = ApiError)
    ),
    tag = "me"
)]
pub(crate) async fn get_my_profile(auth_session: AuthSession) -> ApiResult<Json<AuthResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let user_resp: UserResponse = user.into();
    Ok(Json(AuthResponse {
        success: true,
        message: "Authenticated".to_string(),
        user: Some(user_resp),
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/feed", get(get_feed))
        .route("/profile", get(get_my_profile))
        .route("/articles/{id}/ai", get(get_my_article_ai))
        .route("/articles/{id}/read", post(record_article_read))
        .route("/reading-history", get(list_reading_history))
}
