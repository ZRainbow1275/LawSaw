use axum::{
    extract::{ConnectInfo, Multipart, Path, State},
    http::{
        header::{self, USER_AGENT},
        HeaderMap,
    },
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error;
use law_eye_core::{AuditFilters, UploadUserAvatarInput};
use law_eye_db::{CreateAuditLog, UpdateUser};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::routes::{etag_for_version, require_if_match_version};
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use std::net::{IpAddr, SocketAddr};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_users))
        // /me routes MUST be registered before /{id} to avoid path conflicts
        .route("/me/change-password", post(change_password))
        .route("/me/login-activity", get(login_activity))
        .route("/{id}", get(get_user))
        .route("/{id}", patch(update_user))
        .route("/{id}/permissions/audit", get(list_permission_audits))
        .route("/{id}/avatar", post(upload_user_avatar))
        .route("/{id}/roles", patch(update_user_roles))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
    /// Cursor for keyset pagination (base64url-encoded JSON).
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    20
}

const DISPLAY_NAME_MAX_LEN: usize = 100;
const AVATAR_URL_MAX_LEN: usize = 2048;

#[derive(Debug, Serialize, ToSchema)]
pub struct UsersListResponse {
    pub data: Vec<UserResponse>,
    /// Backward-compatible alias for legacy clients; prefer `data`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub users: Option<Vec<UserResponse>>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
    pub email_verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_login: Option<chrono::DateTime<chrono::Utc>>,
    pub version: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<law_eye_db::User> for UserResponse {
    fn from(user: law_eye_db::User) -> Self {
        Self {
            id: user.id,
            tenant_id: user.tenant_id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
            email_verified_at: user.email_verified_at,
            last_login: user.last_login,
            version: user.version,
            created_at: user.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserProfileResponse {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
    pub last_login: Option<chrono::DateTime<chrono::Utc>>,
    pub version: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub preferences: serde_json::Value,
}

impl From<law_eye_db::User> for UserProfileResponse {
    fn from(user: law_eye_db::User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
            last_login: user.last_login,
            version: user.version,
            created_at: user.created_at,
            preferences: user.preferences,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserDetailResponse {
    pub user: UserProfileResponse,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub preferences: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateRolesRequest {
    pub add_roles: Option<Vec<String>>,
    pub remove_roles: Option<Vec<String>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
    pub version: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PermissionAuditQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PermissionAuditEntry {
    pub id: Uuid,
    pub seq: i64,
    pub action: String,
    pub actor_user_id: Option<Uuid>,
    pub target_user_id: Option<Uuid>,
    pub before_roles: Vec<String>,
    pub after_roles: Vec<String>,
    pub requested_add_roles: Vec<String>,
    pub requested_remove_roles: Vec<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PermissionAuditListResponse {
    pub items: Vec<PermissionAuditEntry>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

// ========== Change Password Types ==========

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

impl std::fmt::Debug for ChangePasswordRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChangePasswordRequest")
            .field("current_password", &"[REDACTED]")
            .field("new_password", &"[REDACTED]")
            .finish()
    }
}

// ========== Login Activity Types ==========

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginActivityEntry {
    pub id: Uuid,
    pub action: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginActivityResponse {
    pub items: Vec<LoginActivityEntry>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginActivityParams {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn json_array_to_strings(value: Option<&serde_json::Value>) -> Vec<String> {
    value
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn json_object_array_field_to_strings(
    value: Option<&serde_json::Value>,
    field: &str,
) -> Vec<String> {
    value
        .and_then(|v| v.as_object())
        .map(|map| json_array_to_strings(map.get(field)))
        .unwrap_or_default()
}
/// 检查用户是否有管理员权限
async fn check_admin_permission(
    state: &AppState,
    tenant_id: Uuid,
    user_id: Uuid,
) -> Result<bool, AppError> {
    Ok(state
        .user_service
        .has_permission(tenant_id, user_id, "*")
        .await?)
}

/// 获取用户列表 (需要管理员权限)
#[utoipa::path(
    get,
    path = "/api/v1/users",
    params(
        ("limit" = Option<i64>, Query, description = "Limit"),
        ("offset" = Option<i64>, Query, description = "Offset"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored.")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Users list", body = UsersListResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_users(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<ListQuery>,
) -> ApiResult<Json<UsersListResponse>> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct CreatedAtCursor {
        created_at: DateTime<Utc>,
        id: Uuid,
    }

    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = check_admin_permission(&state, user.tenant_id, user.id).await?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let limit = query.limit.clamp(1, 100);
    let offset = query.offset;
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let cursor = query
        .cursor
        .as_deref()
        .map(crate::pagination::decode_cursor::<CreatedAtCursor>)
        .transpose()?;

    let mut next_cursor: Option<String> = None;
    let users = if let Some(cursor) = cursor {
        let fetch_limit = limit.saturating_add(1);
        let mut items = state
            .user_service
            .list_by_tenant_cursor(user.tenant_id, fetch_limit, cursor.created_at, cursor.id)
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
            .user_service
            .list_by_tenant(user.tenant_id, limit, offset)
            .await
            .map_err(AppError::from)?
    };
    let total = state
        .user_service
        .count_by_tenant(user.tenant_id)
        .await
        .map_err(AppError::from)?;

    let rows: Vec<UserResponse> = users.into_iter().map(Into::into).collect();
    Ok(Json(UsersListResponse {
        data: rows.clone(),
        users: Some(rows),
        total,
        limit,
        offset: if query.cursor.is_some() { 0 } else { offset },
        next_cursor,
    }))
}

/// 获取用户详情
#[utoipa::path(
    get,
    path = "/api/v1/users/{id}",
    params(("id" = Uuid, Path, description = "User ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "User details", body = UserDetailResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "User not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_user(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Allow users to view their own profile, or admins to view any
    let is_admin = check_admin_permission(&state, current_user.tenant_id, current_user.id).await?;
    if current_user.id != id && !is_admin {
        return Err(AppError::forbidden("Access denied"));
    }

    let target_user = state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;

    if target_user.tenant_id != current_user.tenant_id {
        return Err(AppError::not_found("User not found"));
    }

    let roles = state
        .user_service
        .get_user_roles(current_user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    let permissions = state
        .user_service
        .get_user_permissions(current_user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let body = UserDetailResponse {
        user: target_user.into(),
        roles: roles.into_iter().map(|r| r.name).collect(),
        permissions,
    };

    let etag = etag_for_version(body.user.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

/// 更新用户信息
#[utoipa::path(
    patch,
    path = "/api/v1/users/{id}",
    params(("id" = Uuid, Path, description = "User ID")),
    request_body = UpdateUserRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "User updated", body = UserProfileResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "User not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn update_user(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateUserRequest>,
) -> ApiResult<Response> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let expected_version = require_if_match_version(&headers)?;

    // Allow users to update their own profile, or admins to update any
    let is_admin = check_admin_permission(&state, current_user.tenant_id, current_user.id).await?;
    if current_user.id != id && !is_admin {
        return Err(AppError::forbidden("Access denied"));
    }

    let target_user = state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;
    if target_user.tenant_id != current_user.tenant_id {
        return Err(AppError::not_found("User not found"));
    }

    if target_user.version != expected_version {
        return Err(AppError::precondition_failed(
            "User was updated by someone else (refresh the page and retry)",
        ));
    }

    let display_name = match req.display_name {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.len() > DISPLAY_NAME_MAX_LEN {
                return Err(AppError::validation(format!(
                    "display_name too long (max {DISPLAY_NAME_MAX_LEN})"
                )));
            } else {
                Some(trimmed.to_string())
            }
        }
        None => None,
    };

    let avatar_url = match req.avatar_url {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else if trimmed.len() > AVATAR_URL_MAX_LEN {
                return Err(AppError::validation(format!(
                    "avatar_url too long (max {AVATAR_URL_MAX_LEN})"
                )));
            } else {
                Some(trimmed.to_string())
            }
        }
        None => None,
    };

    let preferences = match req.preferences {
        Some(value) => {
            if !value.is_object() {
                return Err(AppError::validation("preferences must be an object"));
            }
            Some(value)
        }
        None => None,
    };

    if display_name.is_none() && avatar_url.is_none() && preferences.is_none() {
        return Err(AppError::validation("No fields to update"));
    }

    let update = UpdateUser {
        display_name,
        avatar_url,
        preferences,
    };

    let user = state
        .user_service
        .update_with_version(current_user.tenant_id, id, expected_version, update)
        .await
        .map_err(|e| match e {
            Error::Conflict(_) => AppError::precondition_failed(
                "User was updated by someone else (refresh the page and retry)",
            ),
            other => AppError::from(other),
        })?;

    let body = UserProfileResponse::from(user);
    let etag = etag_for_version(body.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

/// 上传用户头像（对象存储：S3/MinIO）
#[utoipa::path(
    post,
    path = "/api/v1/users/{id}/avatar",
    params(("id" = Uuid, Path, description = "User ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Updated user profile", body = UserProfileResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "User not found", body = ApiError),
        (status = 503, description = "Object storage not configured", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn upload_user_avatar(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> ApiResult<Response> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let expected_version = require_if_match_version(&headers)?;

    let is_admin = check_admin_permission(&state, current_user.tenant_id, current_user.id).await?;
    if current_user.id != id && !is_admin {
        return Err(AppError::forbidden("Access denied"));
    }

    let target_user = state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;
    if target_user.tenant_id != current_user.tenant_id {
        return Err(AppError::not_found("User not found"));
    }

    if target_user.version != expected_version {
        return Err(AppError::precondition_failed(
            "User was updated by someone else (refresh the page and retry)",
        ));
    }

    let object_service = state
        .object_service
        .as_ref()
        .ok_or_else(|| AppError::service_unavailable("Object storage is not configured"))?;

    let mut uploaded: Option<(Vec<u8>, String)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::bad_request(format!("Invalid multipart data: {e}")))?
    {
        let name = field.name().unwrap_or_default();
        if name != "file" && name != "avatar" {
            continue;
        }

        let content_type = field.content_type().unwrap_or_default().to_string();
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::bad_request(format!("Read upload failed: {e}")))?;

        uploaded = Some((data.to_vec(), content_type));
        break;
    }

    let (bytes, content_type) =
        uploaded.ok_or_else(|| AppError::validation("Missing file field"))?;
    if content_type.trim().is_empty() {
        return Err(AppError::validation(
            "Missing content-type for uploaded file",
        ));
    }

    let previous_avatar_url = target_user.avatar_url.clone();
    let (ip_address, user_agent) = crate::routes::extract_audit_meta(&headers, addr);

    let upload_input = UploadUserAvatarInput {
        tenant_id: current_user.tenant_id,
        actor_user_id: current_user.id,
        target_user_id: id,
        expected_version,
        previous_avatar_url,
        content_type,
        bytes,
        ip_address,
        user_agent,
    };

    let (user, _object) = object_service
        .upload_user_avatar(upload_input, state.audit_service.as_ref())
        .await
        .map_err(|e| match e {
            Error::Conflict(_) => AppError::precondition_failed(
                "User was updated by someone else (refresh the page and retry)",
            ),
            other => AppError::from(other),
        })?;

    let body = UserProfileResponse::from(user);
    let etag = etag_for_version(body.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

#[utoipa::path(
    get,
    path = "/api/v1/users/{id}/permissions/audit",
    params(
        ("id" = Uuid, Path, description = "User ID"),
        ("limit" = Option<i64>, Query, description = "Limit (1-100)"),
        ("offset" = Option<i64>, Query, description = "Offset")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Permission audit list", body = PermissionAuditListResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "User not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_permission_audits(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<PermissionAuditQuery>,
) -> ApiResult<Json<PermissionAuditListResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = check_admin_permission(&state, current_user.tenant_id, current_user.id).await?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let target_user = state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;
    if target_user.tenant_id != current_user.tenant_id {
        return Err(AppError::not_found("User not found"));
    }

    if query.offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }
    let limit = query.limit.clamp(1, 100);

    let filters = AuditFilters {
        user_id: None,
        resource: Some("users".to_string()),
        resource_id: Some(id),
        action: Some("users.roles.update".to_string()),
        limit,
        offset: query.offset,
    };

    let total = state
        .audit_service
        .count(current_user.tenant_id, filters.clone())
        .await
        .map_err(AppError::from)?;

    let logs = state
        .audit_service
        .list(current_user.tenant_id, filters)
        .await
        .map_err(AppError::from)?;

    let items = logs
        .into_iter()
        .map(|log| PermissionAuditEntry {
            id: log.id,
            seq: log.seq,
            action: log.action,
            actor_user_id: log.user_id,
            target_user_id: log.resource_id,
            before_roles: json_object_array_field_to_strings(log.old_value.as_ref(), "roles"),
            after_roles: json_object_array_field_to_strings(log.new_value.as_ref(), "roles"),
            requested_add_roles: json_object_array_field_to_strings(
                log.new_value.as_ref(),
                "requested_add_roles",
            ),
            requested_remove_roles: json_object_array_field_to_strings(
                log.new_value.as_ref(),
                "requested_remove_roles",
            ),
            ip_address: log.ip_address,
            user_agent: log.user_agent,
            created_at: log.created_at,
        })
        .collect::<Vec<_>>();

    Ok(Json(PermissionAuditListResponse {
        items,
        total,
        limit,
        offset: query.offset,
    }))
}
/// 修改当前用户密码
#[utoipa::path(
    post,
    path = "/api/v1/users/me/change-password",
    request_body = ChangePasswordRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Password changed", body = SuccessResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated or wrong password", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn change_password(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ApiJson(req): ApiJson<ChangePasswordRequest>,
) -> ApiResult<Json<SuccessResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Verify current password
    state
        .user_service
        .verify_password(&user.email, &req.current_password)
        .await
        .map_err(|e| match e {
            Error::Unauthorized(_) => AppError::unauthorized("Current password is incorrect"),
            Error::NotFound(_) => AppError::unauthorized("Current password is incorrect"),
            other => AppError::from(other),
        })?;

    // Validate new password policy
    crate::routes::auth::validate_password_policy(&req.new_password)?;

    // Update password
    state
        .user_service
        .update_password(user.tenant_id, user.id, &req.new_password)
        .await
        .map_err(AppError::from)?;

    // Audit log
    let (ip_address, user_agent) = crate::routes::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "users.password.change".to_string(),
                resource: "users".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: None,
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: "Password changed successfully".to_string(),
        version: 0,
    }))
}

/// 获取当前用户的登录活动记录
#[utoipa::path(
    get,
    path = "/api/v1/users/me/login-activity",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Login activity list", body = LoginActivityResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn login_activity(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<LoginActivityParams>,
) -> ApiResult<Json<LoginActivityResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = params.limit.clamp(1, 100);
    let offset = params.offset.max(0);

    let filters = AuditFilters {
        user_id: Some(user.id),
        resource: Some("auth".to_string()),
        action: None,
        resource_id: None,
        limit,
        offset,
    };

    let total = state
        .audit_service
        .count(user.tenant_id, filters.clone())
        .await
        .map_err(AppError::from)?;

    let logs = state
        .audit_service
        .list(user.tenant_id, filters)
        .await
        .map_err(AppError::from)?;

    let items = logs
        .into_iter()
        .map(|log| LoginActivityEntry {
            id: log.id,
            action: log.action,
            ip_address: log.ip_address,
            user_agent: log.user_agent,
            created_at: log.created_at,
        })
        .collect::<Vec<_>>();

    Ok(Json(LoginActivityResponse { items, total }))
}

/// 更新用户角色 (需要管理员权限)
#[utoipa::path(
    patch,
    path = "/api/v1/users/{id}/roles",
    params(("id" = Uuid, Path, description = "User ID")),
    request_body = UpdateRolesRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Roles updated", body = SuccessResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "User not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn update_user_roles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateRolesRequest>,
) -> ApiResult<Response> {
    fn normalize_role_names(input: Option<Vec<String>>) -> Result<Vec<String>, String> {
        use std::collections::BTreeSet;

        let mut unique = BTreeSet::<String>::new();
        for raw in input.unwrap_or_default() {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err("Role name cannot be empty".to_string());
            }
            unique.insert(trimmed.to_string());
        }
        Ok(unique.into_iter().collect())
    }

    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let expected_version = require_if_match_version(&headers)?;

    let is_admin = check_admin_permission(&state, current_user.tenant_id, current_user.id).await?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    // Verify user exists and belongs to current tenant
    let target_user = state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;
    if target_user.tenant_id != current_user.tenant_id {
        return Err(AppError::not_found("User not found"));
    }

    if target_user.version != expected_version {
        return Err(AppError::precondition_failed(
            "User was updated by someone else (refresh the page and retry)",
        ));
    }

    let add_roles = normalize_role_names(req.add_roles).map_err(AppError::validation)?;
    let remove_roles = normalize_role_names(req.remove_roles).map_err(AppError::validation)?;

    if add_roles.is_empty() && remove_roles.is_empty() {
        return Err(AppError::validation("No roles specified"));
    }

    let add_set: std::collections::BTreeSet<String> = add_roles.iter().cloned().collect();
    let remove_set: std::collections::BTreeSet<String> = remove_roles.iter().cloned().collect();
    let overlap: Vec<String> = add_set.intersection(&remove_set).cloned().collect();
    if !overlap.is_empty() {
        return Err(AppError::validation(format!(
            "Role(s) cannot be both added and removed: {}",
            overlap.join(", ")
        )));
    }

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Set tenant context for RLS — without this, DELETE/UPDATE policies
    // (which require tenant_id match) silently return 0 rows.
    sqlx::query("SELECT set_config('app.tenant_id', $1::text, true)")
        .bind(current_user.tenant_id)
        .execute(tx.as_mut())
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let all_role_names: Vec<String> = add_set.union(&remove_set).cloned().collect();
    state
        .user_service
        .validate_roles_exist_for_tenant_tx(&mut tx, current_user.tenant_id, &all_role_names)
        .await
        .map_err(AppError::from)?;

    let before_roles = state
        .user_service
        .get_user_roles_tx(&mut tx, current_user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    for role in &add_roles {
        state
            .user_service
            .assign_role_tx(&mut tx, id, role, Some(current_user.id))
            .await
            .map_err(AppError::from)?;
    }

    for role in &remove_roles {
        state
            .user_service
            .remove_role_tx(&mut tx, id, role)
            .await
            .map_err(AppError::from)?;
    }

    let after_roles = state
        .user_service
        .get_user_roles_tx(&mut tx, current_user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let before_role_names: Vec<String> = before_roles.into_iter().map(|r| r.name).collect();
    let after_role_names: Vec<String> = after_roles.into_iter().map(|r| r.name).collect();

    let before_roles_for_audit = before_role_names.clone();
    let after_roles_for_audit = after_role_names.clone();
    let add_roles_for_audit = add_roles.clone();
    let remove_roles_for_audit = remove_roles.clone();

    let roles_changed = {
        use std::collections::BTreeSet;
        let before_set: BTreeSet<String> = before_role_names.iter().cloned().collect();
        let after_set: BTreeSet<String> = after_role_names.iter().cloned().collect();
        before_set != after_set
    };

    let user_version = if roles_changed {
        state
            .user_service
            .touch_with_version_tx(current_user.tenant_id, &mut tx, id, expected_version)
            .await
            .map_err(|e| match e {
                Error::Conflict(_) => AppError::precondition_failed(
                    "User was updated by someone else (refresh the page and retry)",
                ),
                other => AppError::from(other),
            })?
            .version
    } else {
        target_user.version
    };

    let ip_from_xff = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim())
        .and_then(|s| s.parse::<IpAddr>().ok())
        .map(|ip| ip.to_string());
    let ip_address = ip_from_xff.or_else(|| Some(addr.ip().to_string()));

    let user_agent = headers
        .get(USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let audit_input = CreateAuditLog {
        user_id: Some(current_user.id),
        action: "users.roles.update".to_string(),
        resource: "users".to_string(),
        resource_id: Some(id),
        old_value: Some(serde_json::json!({
            "roles": before_roles_for_audit,
        })),
        new_value: Some(serde_json::json!({
            "roles": after_roles_for_audit,
            "requested_add_roles": add_roles_for_audit,
            "requested_remove_roles": remove_roles_for_audit,
        })),
        ip_address,
        user_agent,
    };

    state
        .audit_service
        .log_tx(current_user.tenant_id, &mut tx, audit_input)
        .await
        .map_err(AppError::from)?;

    if roles_changed {
        let dedupe_key = format!("users.roles.updated:{id}:v{user_version}");
        let webhook_payload = serde_json::json!({
            "user_id": id,
            "before_roles": &before_role_names,
            "after_roles": &after_role_names,
            "requested_add_roles": &add_roles,
            "requested_remove_roles": &remove_roles,
            "version": user_version,
            "actor_user_id": current_user.id,
        });

        state
            .webhook_service
            .enqueue_event_tx(
                current_user.tenant_id,
                &mut tx,
                "users.roles.updated",
                &webhook_payload,
                &dedupe_key,
            )
            .await
            .map_err(AppError::from)?;
    }

    tx.commit()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    let body = SuccessResponse {
        success: true,
        message: "Roles updated successfully".to_string(),
        version: user_version,
    };

    let etag = etag_for_version(body.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}
