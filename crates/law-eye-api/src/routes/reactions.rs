//! Wave-8 Stream C-1: public reactions endpoints.
//!
//! `POST   /api/v1/reactions`               — set/clear the calling user's reaction
//! `GET    /api/v1/reactions/summary`       — batch summary lookup for N target ids
//!
//! Login required (the protected_api router enforces RequireAuth one level up).
//! Both endpoints serialise the canonical `ReactionSummaryResponse` envelope so
//! the frontend hook can share a single shape between detail and batch flows.

use std::collections::HashMap;
use std::str::FromStr;

use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use law_eye_core::{
    ReactionKind, ReactionService as _, ReactionSummary, ReactionTarget,
};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiJson, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(set_reaction))
        .route("/summary", get(get_summary_batch))
}

#[derive(Debug, Clone, Serialize, ToSchema, PartialEq, Eq)]
pub struct ReactionSummaryResponse {
    pub likes: i64,
    pub dislikes: i64,
    pub score: i64,
    /// `"like"` / `"dislike"` / null. Present only when the request has an
    /// authenticated viewer; the field is omitted otherwise so anonymous
    /// callers never accidentally see another user's state.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub my_kind: Option<String>,
}

impl From<ReactionSummary> for ReactionSummaryResponse {
    fn from(summary: ReactionSummary) -> Self {
        Self {
            likes: summary.likes,
            dislikes: summary.dislikes,
            score: summary.score,
            my_kind: summary.my_kind.map(|k| k.as_str().to_string()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetReactionRequest {
    /// `"article"` or `"source"`.
    pub target_type: String,
    pub target_id: Uuid,
    /// `"like"` / `"dislike"` / null. `null` clears any existing reaction.
    pub kind: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SetReactionResponse {
    pub summary: ReactionSummaryResponse,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct SummaryQuery {
    /// `"article"` or `"source"`.
    pub target_type: String,
    /// Repeated `target_ids[]=<uuid>` query parameter; up to 100 ids per call.
    #[serde(default, rename = "target_ids[]")]
    pub target_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SummaryBatchResponse {
    pub summaries: HashMap<String, ReactionSummaryResponse>,
}

const MAX_BATCH_TARGET_IDS: usize = 100;

fn parse_target_type(raw: &str) -> Result<ReactionTarget, AppError> {
    ReactionTarget::from_str(raw)
        .map_err(|e| AppError::validation_with_code("INVALID_TARGET_TYPE", e))
}

fn parse_kind(raw: Option<&str>) -> Result<Option<ReactionKind>, AppError> {
    match raw {
        None => Ok(None),
        Some(value) => ReactionKind::from_str(value)
            .map(Some)
            .map_err(|e| AppError::validation_with_code("INVALID_REACTION_KIND", e)),
    }
}

#[utoipa::path(
    post,
    path = "/api/v1/reactions",
    request_body = SetReactionRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Updated reaction summary", body = SetReactionResponse),
        (status = 400, description = "Invalid payload"),
        (status = 401, description = "Authentication required"),
        (status = 404, description = "Target article or source not found")
    ),
    tag = "reactions"
)]
pub async fn set_reaction(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<SetReactionRequest>,
) -> ApiResult<Json<SetReactionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let target_type = parse_target_type(&req.target_type)?;
    let kind = parse_kind(req.kind.as_deref())?;

    let summary = state
        .reaction_service
        .set_reaction(user.tenant_id, user.id, target_type, req.target_id, kind)
        .await
        .map_err(AppError::from)?;

    Ok(Json(SetReactionResponse {
        summary: summary.into(),
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/reactions/summary",
    params(SummaryQuery),
    security(("session" = [])),
    responses(
        (status = 200, description = "Reaction summaries keyed by target id", body = SummaryBatchResponse),
        (status = 400, description = "Invalid params or too many target ids"),
        (status = 401, description = "Authentication required")
    ),
    tag = "reactions"
)]
pub async fn get_summary_batch(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<SummaryQuery>,
) -> ApiResult<Json<SummaryBatchResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let target_type = parse_target_type(&params.target_type)?;
    if params.target_ids.len() > MAX_BATCH_TARGET_IDS {
        return Err(AppError::validation_with_code(
            "TOO_MANY_TARGETS",
            format!(
                "target_ids[] is capped at {} entries",
                MAX_BATCH_TARGET_IDS
            ),
        ));
    }

    let map = state
        .reaction_service
        .get_summaries_batch(
            user.tenant_id,
            target_type,
            &params.target_ids,
            Some(user.id),
        )
        .await
        .map_err(AppError::from)?;

    let summaries: HashMap<String, ReactionSummaryResponse> = map
        .into_iter()
        .map(|(id, summary)| (id.to_string(), summary.into()))
        .collect();

    Ok(Json(SummaryBatchResponse { summaries }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_target_type_accepts_known_values() {
        assert_eq!(parse_target_type("article").unwrap(), ReactionTarget::Article);
        assert_eq!(parse_target_type("SOURCE").unwrap(), ReactionTarget::Source);
        let err = parse_target_type("comment").unwrap_err();
        assert_eq!(err.body.code.as_deref(), Some("INVALID_TARGET_TYPE"));
    }

    #[test]
    fn parse_kind_handles_optional_payload() {
        assert!(parse_kind(None).unwrap().is_none());
        assert_eq!(parse_kind(Some("like")).unwrap(), Some(ReactionKind::Like));
        let err = parse_kind(Some("meh")).unwrap_err();
        assert_eq!(err.body.code.as_deref(), Some("INVALID_REACTION_KIND"));
    }

    #[test]
    fn summary_response_omits_my_kind_when_absent() {
        let response = ReactionSummaryResponse::from(ReactionSummary::new(2, 1, None));
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json.get("likes").and_then(|v| v.as_i64()), Some(2));
        assert_eq!(json.get("score").and_then(|v| v.as_i64()), Some(1));
        assert!(json.get("my_kind").is_none());
    }
}
