//! Wave-8 Stream C-1: super-admin reaction insight endpoints.
//!
//! All eight endpoints expose tenant-scoped aggregates fed by the same
//! `reactions` table the public POST endpoint writes to. Auth gating is
//! delegated to the parent router (`require_role_tier_and_permission` with
//! ROLE_TIER_SUPER_ADMIN + tenants:manage) — the handlers themselves only
//! parse query parameters and forward to `ReactionService`.

use std::str::FromStr;

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use law_eye_core::{
    CategoryReactionStat, ColdStartTargetRow, NegativeSignalRow, ReactionInsightWindow,
    ReactionService, ReactionTarget, ReactionTrendGranularity, ReactionTrendPoint, SourceHealthRow,
    TopReactionRow, TopReactionUserRow,
};

use crate::auth::{AuthSession, AuthenticatedUser};
use crate::state::AppState;
use crate::{ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/top-score", get(top_score))
        .route("/controversy", get(controversy))
        .route("/trend", get(trend))
        .route("/by-category", get(by_category))
        .route("/source-health", get(source_health))
        .route("/users/top", get(top_users))
        .route("/cold-start", get(cold_start))
        .route("/negative-signal", get(negative_signal))
}

// ---- shared parsing --------------------------------------------------------

fn parse_target(raw: Option<&str>, default: ReactionTarget) -> Result<ReactionTarget, AppError> {
    match raw {
        None => Ok(default),
        Some(value) => ReactionTarget::from_str(value)
            .map_err(|e| AppError::validation_with_code("INVALID_TARGET_TYPE", e)),
    }
}

fn parse_window(raw: Option<&str>) -> Result<ReactionInsightWindow, AppError> {
    match raw {
        None => Ok(ReactionInsightWindow::Last30Days),
        Some(value) => ReactionInsightWindow::from_str(value)
            .map_err(|e| AppError::validation_with_code("INVALID_WINDOW", e)),
    }
}

fn parse_granularity(
    raw: Option<&str>,
) -> Result<ReactionTrendGranularity, AppError> {
    match raw {
        None => Ok(ReactionTrendGranularity::Day),
        Some(value) => ReactionTrendGranularity::from_str(value)
            .map_err(|e| AppError::validation_with_code("INVALID_GRANULARITY", e)),
    }
}

fn require_admin(auth_session: AuthSession) -> Result<AuthenticatedUser, AppError> {
    auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))
}

// ---- response shapes -------------------------------------------------------

#[derive(Debug, Serialize, ToSchema)]
pub struct TopReactionEntryResponse {
    pub target_type: String,
    pub target_id: Uuid,
    pub likes: i64,
    pub dislikes: i64,
    pub score: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl From<TopReactionRow> for TopReactionEntryResponse {
    fn from(row: TopReactionRow) -> Self {
        Self {
            target_type: row.target_type.as_str().to_string(),
            target_id: row.target_id,
            likes: row.likes,
            dislikes: row.dislikes,
            score: row.score,
            label: row.label,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TopScoreResponse {
    pub items: Vec<TopReactionEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ControversyResponse {
    pub items: Vec<TopReactionEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TrendBucketResponse {
    pub bucket: DateTime<Utc>,
    pub likes: i64,
    pub dislikes: i64,
}

impl From<ReactionTrendPoint> for TrendBucketResponse {
    fn from(point: ReactionTrendPoint) -> Self {
        Self {
            bucket: point.bucket,
            likes: point.likes,
            dislikes: point.dislikes,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TrendResponse {
    pub buckets: Vec<TrendBucketResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CategoryReactionEntryResponse {
    pub category_id: Option<Uuid>,
    pub category_slug: Option<String>,
    pub category_name: Option<String>,
    pub likes: i64,
    pub dislikes: i64,
    pub score: i64,
}

impl From<CategoryReactionStat> for CategoryReactionEntryResponse {
    fn from(row: CategoryReactionStat) -> Self {
        Self {
            category_id: row.category_id,
            category_slug: row.category_slug,
            category_name: row.category_name,
            likes: row.likes,
            dislikes: row.dislikes,
            score: row.score,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CategoryReactionResponse {
    pub items: Vec<CategoryReactionEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceHealthEntryResponse {
    pub source_id: Uuid,
    pub source_name: String,
    pub likes: i64,
    pub dislikes: i64,
    pub like_dislike_ratio: f64,
    pub subscriber_count: i64,
}

impl From<SourceHealthRow> for SourceHealthEntryResponse {
    fn from(row: SourceHealthRow) -> Self {
        Self {
            source_id: row.source_id,
            source_name: row.source_name,
            likes: row.likes,
            dislikes: row.dislikes,
            like_dislike_ratio: row.like_dislike_ratio,
            subscriber_count: row.subscriber_count,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceHealthResponse {
    pub items: Vec<SourceHealthEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TopReactionUserEntryResponse {
    pub user_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub likes_given: i64,
    pub dislikes_given: i64,
    pub total: i64,
}

impl From<TopReactionUserRow> for TopReactionUserEntryResponse {
    fn from(row: TopReactionUserRow) -> Self {
        Self {
            user_id: row.user_id,
            display_name: row.display_name,
            likes_given: row.likes_given,
            dislikes_given: row.dislikes_given,
            total: row.total,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TopUsersResponse {
    pub items: Vec<TopReactionUserEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ColdStartEntryResponse {
    pub target_type: String,
    pub target_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<ColdStartTargetRow> for ColdStartEntryResponse {
    fn from(row: ColdStartTargetRow) -> Self {
        Self {
            target_type: row.target_type.as_str().to_string(),
            target_id: row.target_id,
            label: row.label,
            created_at: row.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ColdStartResponse {
    pub items: Vec<ColdStartEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NegativeSignalEntryResponse {
    pub target_type: String,
    pub target_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub likes: i64,
    pub dislikes: i64,
    pub dislike_ratio: f64,
}

impl From<NegativeSignalRow> for NegativeSignalEntryResponse {
    fn from(row: NegativeSignalRow) -> Self {
        Self {
            target_type: row.target_type.as_str().to_string(),
            target_id: row.target_id,
            label: row.label,
            likes: row.likes,
            dislikes: row.dislikes,
            dislike_ratio: row.dislike_ratio,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NegativeSignalResponse {
    pub items: Vec<NegativeSignalEntryResponse>,
}

// ---- query params ----------------------------------------------------------

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct TopScoreQuery {
    pub target_type: Option<String>,
    pub limit: Option<i64>,
    pub window: Option<String>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct ControversyQuery {
    pub target_type: Option<String>,
    pub limit: Option<i64>,
    pub window: Option<String>,
    /// Minimum likes AND dislikes a target needs to qualify as "controversial"
    /// (defaults to 3). Filters out single-vote noise.
    pub min_threshold: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct TrendQuery {
    pub target_type: Option<String>,
    pub granularity: Option<String>,
    pub window: Option<String>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct ByCategoryQuery {
    pub window: Option<String>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct SourceHealthQuery {
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct TopUsersQuery {
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct ColdStartQuery {
    pub days: Option<i32>,
    pub target_type: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct NegativeSignalParams {
    pub target_type: Option<String>,
    pub dislike_ratio: Option<f64>,
    pub min_total: Option<i64>,
    pub limit: Option<i64>,
}

// ---- handlers --------------------------------------------------------------

pub async fn top_score(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<TopScoreQuery>,
) -> ApiResult<Json<TopScoreResponse>> {
    let user = require_admin(auth_session)?;
    let target_type = parse_target(query.target_type.as_deref(), ReactionTarget::Article)?;
    let window = parse_window(query.window.as_deref())?;
    let limit = query.limit.unwrap_or(20).clamp(1, 200);
    let rows = state
        .reaction_service
        .top_score(user.tenant_id, target_type, window, limit)
        .await
        .map_err(AppError::from)?;
    Ok(Json(TopScoreResponse {
        items: rows.into_iter().map(TopReactionEntryResponse::from).collect(),
    }))
}

pub async fn controversy(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ControversyQuery>,
) -> ApiResult<Json<ControversyResponse>> {
    let user = require_admin(auth_session)?;
    let target_type = parse_target(query.target_type.as_deref(), ReactionTarget::Article)?;
    let window = parse_window(query.window.as_deref())?;
    let limit = query.limit.unwrap_or(20).clamp(1, 200);
    let min_threshold = query.min_threshold.unwrap_or(3).max(0);
    let rows = state
        .reaction_service
        .controversy(user.tenant_id, target_type, window, min_threshold, limit)
        .await
        .map_err(AppError::from)?;
    Ok(Json(ControversyResponse {
        items: rows.into_iter().map(TopReactionEntryResponse::from).collect(),
    }))
}

pub async fn trend(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<TrendQuery>,
) -> ApiResult<Json<TrendResponse>> {
    let user = require_admin(auth_session)?;
    let target_type = parse_target(query.target_type.as_deref(), ReactionTarget::Article)?;
    let window = parse_window(query.window.as_deref())?;
    let granularity = parse_granularity(query.granularity.as_deref())?;
    let rows = state
        .reaction_service
        .trend(user.tenant_id, target_type, granularity, window)
        .await
        .map_err(AppError::from)?;
    Ok(Json(TrendResponse {
        buckets: rows.into_iter().map(TrendBucketResponse::from).collect(),
    }))
}

pub async fn by_category(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ByCategoryQuery>,
) -> ApiResult<Json<CategoryReactionResponse>> {
    let user = require_admin(auth_session)?;
    let window = parse_window(query.window.as_deref())?;
    let rows = state
        .reaction_service
        .by_category(user.tenant_id, window)
        .await
        .map_err(AppError::from)?;
    Ok(Json(CategoryReactionResponse {
        items: rows
            .into_iter()
            .map(CategoryReactionEntryResponse::from)
            .collect(),
    }))
}

pub async fn source_health(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<SourceHealthQuery>,
) -> ApiResult<Json<SourceHealthResponse>> {
    let user = require_admin(auth_session)?;
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let rows = state
        .reaction_service
        .source_health(user.tenant_id, limit)
        .await
        .map_err(AppError::from)?;
    Ok(Json(SourceHealthResponse {
        items: rows
            .into_iter()
            .map(SourceHealthEntryResponse::from)
            .collect(),
    }))
}

pub async fn top_users(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<TopUsersQuery>,
) -> ApiResult<Json<TopUsersResponse>> {
    let user = require_admin(auth_session)?;
    let limit = query.limit.unwrap_or(20).clamp(1, 200);
    let rows = state
        .reaction_service
        .top_users(user.tenant_id, limit)
        .await
        .map_err(AppError::from)?;
    Ok(Json(TopUsersResponse {
        items: rows
            .into_iter()
            .map(TopReactionUserEntryResponse::from)
            .collect(),
    }))
}

pub async fn cold_start(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ColdStartQuery>,
) -> ApiResult<Json<ColdStartResponse>> {
    let user = require_admin(auth_session)?;
    let target_type = parse_target(query.target_type.as_deref(), ReactionTarget::Article)?;
    let days = query.days.unwrap_or(30).clamp(1, 365);
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let rows = state
        .reaction_service
        .cold_start(user.tenant_id, days, target_type, limit)
        .await
        .map_err(AppError::from)?;
    Ok(Json(ColdStartResponse {
        items: rows.into_iter().map(ColdStartEntryResponse::from).collect(),
    }))
}

pub async fn negative_signal(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<NegativeSignalParams>,
) -> ApiResult<Json<NegativeSignalResponse>> {
    let user = require_admin(auth_session)?;
    let target_type = parse_target(query.target_type.as_deref(), ReactionTarget::Article)?;
    let dislike_ratio = query.dislike_ratio.unwrap_or(0.5).clamp(0.0, 1.0);
    let min_total = query.min_total.unwrap_or(3).max(0);
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let rows = state
        .reaction_service
        .negative_signal(
            user.tenant_id,
            target_type,
            dislike_ratio,
            min_total,
            limit,
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(NegativeSignalResponse {
        items: rows
            .into_iter()
            .map(NegativeSignalEntryResponse::from)
            .collect(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_window_defaults_to_30d() {
        assert_eq!(
            parse_window(None).unwrap(),
            ReactionInsightWindow::Last30Days
        );
        assert_eq!(
            parse_window(Some("7d")).unwrap(),
            ReactionInsightWindow::Last7Days
        );
        assert!(parse_window(Some("forever")).is_err());
    }

    #[test]
    fn parse_target_default_falls_back_to_article() {
        assert_eq!(
            parse_target(None, ReactionTarget::Source).unwrap(),
            ReactionTarget::Source
        );
        assert_eq!(
            parse_target(Some("article"), ReactionTarget::Source).unwrap(),
            ReactionTarget::Article
        );
        assert!(parse_target(Some("comment"), ReactionTarget::Article).is_err());
    }

    #[test]
    fn parse_granularity_defaults_to_day() {
        assert_eq!(
            parse_granularity(None).unwrap(),
            ReactionTrendGranularity::Day
        );
        assert_eq!(
            parse_granularity(Some("hour")).unwrap(),
            ReactionTrendGranularity::Hour
        );
    }
}
