use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use law_eye_core::audit::AuditFilters;
use law_eye_db::AuditLog;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiResult, AppError};

pub fn admin_router() -> Router<AppState> {
    Router::new().route("/", get(list_audit_logs))
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListAuditQuery {
    pub user_id: Option<Uuid>,
    pub resource: Option<String>,
    pub resource_id: Option<Uuid>,
    pub action: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuditLogResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub seq: i64,
    pub event_version: i32,
    pub prev_hash: Option<String>,
    pub hash: String,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource: String,
    pub resource_id: Option<Uuid>,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<AuditLog> for AuditLogResponse {
    fn from(value: AuditLog) -> Self {
        Self {
            id: value.id,
            tenant_id: value.tenant_id,
            seq: value.seq,
            event_version: value.event_version,
            prev_hash: value.prev_hash,
            hash: value.hash,
            user_id: value.user_id,
            action: value.action,
            resource: value.resource,
            resource_id: value.resource_id,
            old_value: value.old_value,
            new_value: value.new_value,
            ip_address: value.ip_address,
            user_agent: value.user_agent,
            created_at: value.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuditListResponse {
    pub data: Vec<AuditLogResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[utoipa::path(get, path = "/api/v1/admin/audit", params(ListAuditQuery), security(("session" = [])), responses((status = 200, body = AuditListResponse)), tag = "audit")]
pub(crate) async fn list_audit_logs(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListAuditQuery>,
) -> ApiResult<Json<AuditListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let filters = AuditFilters {
        user_id: query.user_id,
        resource: query.resource,
        resource_id: query.resource_id,
        action: query.action,
        created_after: None,
        created_before: None,
        limit: query.limit.unwrap_or(50).clamp(1, 200),
        offset: query.offset.unwrap_or(0).max(0),
    };

    let total = state
        .audit_service
        .count(user.tenant_id, filters.clone())
        .await
        .map_err(AppError::from)?;
    let data = state
        .audit_service
        .list(user.tenant_id, filters.clone())
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuditListResponse {
        data: data.into_iter().map(AuditLogResponse::from).collect(),
        total,
        limit: filters.limit,
        offset: filters.offset,
    }))
}
