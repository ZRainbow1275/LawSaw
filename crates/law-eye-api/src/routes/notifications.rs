use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use law_eye_core::AuditFilters;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiQuery, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/me/notifications", get(list_notifications))
        .route("/me/notifications/seen", post(mark_notifications_seen))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListNotificationsQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    30
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NotificationEntry {
    pub id: Uuid,
    pub seq: i64,
    pub action: String,
    pub resource: String,
    pub resource_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct NotificationsResponse {
    pub items: Vec<NotificationEntry>,
    pub last_seen_seq: i64,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

fn summarize_audit(action: &str, resource: &str) -> String {
    format!("{action} · {resource}")
}

#[utoipa::path(
    get,
    path = "/api/v1/me/notifications",
    params(
        ("limit" = Option<i64>, Query, description = "Max items (default 30)"),
        ("offset" = Option<i64>, Query, description = "Offset"),
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Notifications", body = NotificationsResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "me"
)]
pub(crate) async fn list_notifications(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<ListNotificationsQuery>,
) -> ApiResult<Json<NotificationsResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = query.limit.clamp(1, 200);
    let offset = query.offset.max(0);

    let filters = AuditFilters {
        user_id: None,
        resource: None,
        resource_id: None,
        action: None,
        created_after: None,
        created_before: None,
        limit,
        offset,
    };

    let rows = state
        .audit_service
        .list(user.tenant_id, filters.clone())
        .await
        .map_err(AppError::from)?;
    let total = state
        .audit_service
        .count(user.tenant_id, filters)
        .await
        .map_err(AppError::from)?;

    let items = rows
        .into_iter()
        .map(|row| {
            let summary = summarize_audit(&row.action, &row.resource);
            NotificationEntry {
                id: row.id,
                seq: row.seq,
                action: row.action,
                resource: row.resource,
                resource_id: row.resource_id,
                user_id: row.user_id,
                created_at: row.created_at,
                summary,
            }
        })
        .collect::<Vec<_>>();

    let last_seen_seq = state
        .user_service
        .get_notification_last_seen_seq(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(NotificationsResponse {
        items,
        last_seen_seq,
        total,
        limit,
        offset,
    }))
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MarkSeenRequest {
    pub last_seen_seq: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MarkSeenResponse {
    pub success: bool,
}

#[utoipa::path(
    post,
    path = "/api/v1/me/notifications/seen",
    request_body = MarkSeenRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Marked", body = MarkSeenResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "me"
)]
pub(crate) async fn mark_notifications_seen(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(body): Json<MarkSeenRequest>,
) -> ApiResult<Json<MarkSeenResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    if body.last_seen_seq < 0 {
        return Err(AppError::validation("last_seen_seq must be >= 0"));
    }

    state
        .user_service
        .set_notification_last_seen_seq(user.tenant_id, user.id, body.last_seen_seq)
        .await
        .map_err(AppError::from)?;

    Ok(Json(MarkSeenResponse { success: true }))
}
