use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};
use law_eye_db::{CreateFeedback, UpdateFeedback};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_feedbacks).post(create_feedback))
        .route("/my", get(list_my_feedbacks))
        .route("/{id}", get(get_feedback).patch(update_feedback))
}

fn is_valid_feedback_type(value: &str) -> bool {
    matches!(
        value,
        "source_suggestion" | "bug_report" | "feature_request" | "other"
    )
}

fn is_valid_feedback_status(value: &str) -> bool {
    matches!(value, "pending" | "reviewing" | "resolved" | "rejected")
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FeedbackResponse {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub feedback_type: String,
    pub title: String,
    pub content: String,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
    pub status: String,
    pub admin_response: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Feedback> for FeedbackResponse {
    fn from(f: law_eye_db::Feedback) -> Self {
        Self {
            id: f.id,
            user_id: f.user_id,
            feedback_type: f.feedback_type,
            title: f.title,
            content: f.content,
            contact_email: f.contact_email,
            source_url: f.source_url,
            source_name: f.source_name,
            status: f.status,
            admin_response: f.admin_response,
            created_at: f.created_at,
            updated_at: f.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateFeedbackRequest {
    #[serde(rename = "type")]
    pub feedback_type: String,
    pub title: String,
    pub content: String,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateFeedbackRequest {
    pub status: Option<String>,
    pub admin_response: Option<String>,
}

/// Admin: list all feedbacks
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Feedback list", body = Vec<FeedbackResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_feedbacks(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<Vec<FeedbackResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows = state
        .feedback_service
        .list_all(user.tenant_id, limit, offset)
        .await
        .map_err(AppError::from)?;

    let data = rows
        .into_iter()
        .map(|row| {
            let mut resp = FeedbackResponse::from(row);
            // 脱敏策略：列表接口默认返回预览内容 + mask email，避免过度暴露敏感字段。
            resp.content = preview_text(&resp.content, 160);
            resp.contact_email = resp.contact_email.as_deref().map(mask_email);
            resp
        })
        .collect();

    Ok(Json(data))
}

/// Current user: list my feedbacks
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks/my",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "My feedback list", body = Vec<FeedbackResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_my_feedbacks(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> ApiResult<Json<Vec<FeedbackResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows = state
        .feedback_service
        .list_by_user(user.tenant_id, user.id, limit, offset)
        .await
        .map_err(AppError::from)?;

    Ok(Json(rows.into_iter().map(FeedbackResponse::from).collect()))
}

/// Create a feedback (any authenticated user)
#[utoipa::path(
    post,
    path = "/api/v1/feedbacks",
    request_body = CreateFeedbackRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 201, description = "Feedback created", body = FeedbackResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn create_feedback(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<CreateFeedbackRequest>,
) -> ApiResult<(StatusCode, Json<FeedbackResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    if req.title.trim().is_empty() || req.content.trim().is_empty() {
        return Err(AppError::validation("title/content is required"));
    }

    if !is_valid_feedback_type(&req.feedback_type) {
        return Err(AppError::validation("Invalid feedback type"));
    }

    let input = CreateFeedback {
        user_id: Some(user.id),
        feedback_type: req.feedback_type,
        title: req.title,
        content: req.content,
        contact_email: req.contact_email,
        source_url: req.source_url,
        source_name: req.source_name,
    };

    let row = state
        .feedback_service
        .create(user.tenant_id, input)
        .await
        .map_err(AppError::from)?;
    Ok((StatusCode::CREATED, Json(FeedbackResponse::from(row))))
}

/// Get a feedback by id (owner or admin)
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks/{id}",
    params(("id" = Uuid, Path, description = "Feedback ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Feedback", body = FeedbackResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_feedback(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<FeedbackResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.id, "*")
        .await
        .map_err(AppError::from)?;

    let row = state
        .feedback_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    if !is_admin && row.user_id != Some(user.id) {
        return Err(AppError::forbidden("Access denied"));
    }

    Ok(Json(FeedbackResponse::from(row)))
}

/// Admin: update a feedback status / response
#[utoipa::path(
    patch,
    path = "/api/v1/feedbacks/{id}",
    params(("id" = Uuid, Path, description = "Feedback ID")),
    request_body = UpdateFeedbackRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Feedback updated", body = FeedbackResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn update_feedback(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateFeedbackRequest>,
) -> ApiResult<Json<FeedbackResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    if let Some(status) = req.status.as_deref() {
        if !is_valid_feedback_status(status) {
            return Err(AppError::validation("Invalid status"));
        }
    }

    let input = UpdateFeedback {
        status: req.status,
        admin_response: req.admin_response,
    };

    let row = state
        .feedback_service
        .update(user.tenant_id, id, input)
        .await
        .map_err(AppError::from)?;

    Ok(Json(FeedbackResponse::from(row)))
}

fn preview_text(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if max_chars == 0 {
        return String::new();
    }

    let mut chars = trimmed.chars();
    let mut out = String::new();
    for _ in 0..max_chars {
        let Some(c) = chars.next() else {
            return out;
        };
        out.push(c);
    }

    if chars.next().is_some() {
        out.push('…');
    }

    out
}

fn mask_email(email: &str) -> String {
    let email = email.trim();
    let Some((local, domain)) = email.split_once('@') else {
        return "***".to_string();
    };

    let local_chars: Vec<char> = local.chars().collect();
    let masked_local = match local_chars.len() {
        0 => "***".to_string(),
        1 => format!("{}***", local_chars[0]),
        2 => format!("{}***{}", local_chars[0], local_chars[1]),
        _ => format!("{}***{}", local_chars[0], local_chars[local_chars.len() - 1]),
    };

    format!("{masked_local}@{domain}")
}
