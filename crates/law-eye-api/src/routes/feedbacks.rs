use axum::{
    extract::ConnectInfo,
    extract::{Path, State},
    http::StatusCode,
    http::{HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use law_eye_db::{CreateAuditLog, CreateFeedback, UpdateFeedback};
use std::net::SocketAddr;

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
#[serde(deny_unknown_fields)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// Cursor for keyset pagination (base64url-encoded JSON).
    pub cursor: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored.")
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
    ApiQuery(params): ApiQuery<ListParams>,
) -> ApiResult<Response> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct CreatedAtCursor {
        created_at: DateTime<Utc>,
        id: Uuid,
    }

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

    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let offset = params.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let cursor = params
        .cursor
        .as_deref()
        .map(crate::pagination::decode_cursor::<CreatedAtCursor>)
        .transpose()?;

    let mut next_cursor: Option<String> = None;
    let rows = if let Some(cursor) = cursor {
        let fetch_limit = limit.saturating_add(1);
        let mut items = state
            .feedback_service
            .list_all_cursor(user.tenant_id, fetch_limit, cursor.created_at, cursor.id)
            .await
            .map_err(AppError::from)?;

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
            .feedback_service
            .list_all(user.tenant_id, limit, offset)
            .await
            .map_err(AppError::from)?
    };

    let data: Vec<FeedbackResponse> = rows
        .into_iter()
        .map(|row| {
            let mut resp = FeedbackResponse::from(row);
            // 脱敏策略：列表接口默认返回预览内容 + mask email，避免过度暴露敏感字段。
            resp.content = preview_text(&resp.content, 160);
            resp.contact_email = resp.contact_email.as_deref().map(mask_email);
            resp
        })
        .collect();

    let mut response = Json(data).into_response();
    if let Some(cursor) = next_cursor {
        let value = HeaderValue::from_str(&cursor)
            .map_err(|_| AppError::internal("Failed to format cursor header"))?;
        response.headers_mut().insert("x-next-cursor", value);
    }
    Ok(response)
}

/// Current user: list my feedbacks
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks/my",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored.")
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
    ApiQuery(params): ApiQuery<ListParams>,
) -> ApiResult<Response> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct CreatedAtCursor {
        created_at: DateTime<Utc>,
        id: Uuid,
    }

    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let offset = params.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let cursor = params
        .cursor
        .as_deref()
        .map(crate::pagination::decode_cursor::<CreatedAtCursor>)
        .transpose()?;

    let mut next_cursor: Option<String> = None;
    let rows = if let Some(cursor) = cursor {
        let fetch_limit = limit.saturating_add(1);
        let mut items = state
            .feedback_service
            .list_by_user_cursor(
                user.tenant_id,
                user.id,
                fetch_limit,
                cursor.created_at,
                cursor.id,
            )
            .await
            .map_err(AppError::from)?;

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
            .feedback_service
            .list_by_user(user.tenant_id, user.id, limit, offset)
            .await
            .map_err(AppError::from)?
    };

    let mut response = Json(
        rows.into_iter()
            .map(FeedbackResponse::from)
            .collect::<Vec<_>>(),
    )
    .into_response();
    if let Some(cursor) = next_cursor {
        let value = HeaderValue::from_str(&cursor)
            .map_err(|_| AppError::internal("Failed to format cursor header"))?;
        response.headers_mut().insert("x-next-cursor", value);
    }
    Ok(response)
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateFeedbackRequest>,
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let row = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let feedback_service = state.feedback_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let input = input.clone();

        Box::pin(async move {
            let row = feedback_service.create_tx(tenant_id, tx, input).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "feedbacks.create".to_string(),
                        resource: "feedbacks".to_string(),
                        resource_id: Some(row.id),
                        old_value: None,
                        new_value: Some(serde_json::json!({
                            "id": row.id,
                            "type": row.feedback_type,
                            "title": row.title,
                            "source_url": row.source_url,
                            "source_name": row.source_name,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(row)
        })
    })
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateFeedbackRequest>,
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let row = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let feedback_service = state.feedback_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let input = input.clone();

        Box::pin(async move {
            let before = feedback_service.get_by_id_tx(tenant_id, tx, id).await?;
            let after = feedback_service.update_tx(tenant_id, tx, id, input).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "feedbacks.update".to_string(),
                        resource: "feedbacks".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "status": before.status,
                            "admin_response_len": before.admin_response.as_deref().map(|v| v.len()),
                        })),
                        new_value: Some(serde_json::json!({
                            "status": after.status,
                            "admin_response_len": after.admin_response.as_deref().map(|v| v.len()),
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
        _ => format!(
            "{}***{}",
            local_chars[0],
            local_chars[local_chars.len() - 1]
        ),
    };

    format!("{masked_local}@{domain}")
}
