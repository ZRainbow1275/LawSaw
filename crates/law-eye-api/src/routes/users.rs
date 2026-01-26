use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::{header::USER_AGENT, HeaderMap},
    routing::{get, patch},
    Json, Router,
};
use law_eye_db::{CreateAuditLog, UpdateUser};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};
use std::net::{IpAddr, SocketAddr};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_users))
        .route("/{id}", get(get_user))
        .route("/{id}", patch(update_user))
        .route("/{id}/roles", patch(update_user_roles))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    20
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UsersListResponse {
    pub users: Vec<UserResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
    pub last_login: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<law_eye_db::User> for UserResponse {
    fn from(user: law_eye_db::User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
            last_login: user.last_login,
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
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub preferences: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRolesRequest {
    pub add_roles: Option<Vec<String>>,
    pub remove_roles: Option<Vec<String>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// 检查用户是否有管理员权限
async fn check_admin_permission(state: &AppState, user_id: Uuid) -> Result<bool, AppError> {
    Ok(state.user_service.has_permission(user_id, "*").await?)
}

/// 获取用户列表 (需要管理员权限)
#[utoipa::path(
    get,
    path = "/api/v1/users",
    params(
        ("limit" = Option<i64>, Query, description = "Limit"),
        ("offset" = Option<i64>, Query, description = "Offset")
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
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<UsersListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = check_admin_permission(&state, user.id).await?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let limit = query.limit.clamp(1, 100);
    let offset = query.offset.max(0);

    let users = state
        .user_service
        .list(limit, offset)
        .await
        .map_err(AppError::from)?;
    let total = state.user_service.count().await.map_err(AppError::from)?;

    Ok(Json(UsersListResponse {
        users: users.into_iter().map(Into::into).collect(),
        total,
        limit,
        offset,
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
) -> ApiResult<Json<UserDetailResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Allow users to view their own profile, or admins to view any
    let is_admin = check_admin_permission(&state, current_user.id).await?;
    if current_user.id != id && !is_admin {
        return Err(AppError::forbidden("Access denied"));
    }

    let user = state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;
    let roles = state
        .user_service
        .get_user_roles(id)
        .await
        .map_err(AppError::from)?;
    let permissions = state
        .user_service
        .get_user_permissions(id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(UserDetailResponse {
        user: user.into(),
        roles: roles.into_iter().map(|r| r.name).collect(),
        permissions,
    }))
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
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateUserRequest>,
) -> ApiResult<Json<UserProfileResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Allow users to update their own profile, or admins to update any
    let is_admin = check_admin_permission(&state, current_user.id).await?;
    if current_user.id != id && !is_admin {
        return Err(AppError::forbidden("Access denied"));
    }

    let update = UpdateUser {
        display_name: req.display_name,
        avatar_url: req.avatar_url,
        preferences: req.preferences,
    };

    let user = state
        .user_service
        .update(id, update)
        .await
        .map_err(AppError::from)?;

    Ok(Json(UserProfileResponse::from(user)))
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
    Json(req): Json<UpdateRolesRequest>,
) -> ApiResult<Json<SuccessResponse>> {
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

    let is_admin = check_admin_permission(&state, current_user.id).await?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    // Verify user exists
    state
        .user_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;

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

    let all_role_names: Vec<String> = add_set.union(&remove_set).cloned().collect();
    state
        .user_service
        .validate_roles_exist_tx(&mut tx, &all_role_names)
        .await
        .map_err(AppError::from)?;

    let before_roles = state
        .user_service
        .get_user_roles_tx(&mut tx, id)
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
        .get_user_roles_tx(&mut tx, id)
        .await
        .map_err(AppError::from)?;

    let before_role_names: Vec<String> = before_roles.into_iter().map(|r| r.name).collect();
    let after_role_names: Vec<String> = after_roles.into_iter().map(|r| r.name).collect();

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
            "roles": before_role_names,
        })),
        new_value: Some(serde_json::json!({
            "roles": after_role_names,
            "requested_add_roles": add_roles,
            "requested_remove_roles": remove_roles,
        })),
        ip_address,
        user_agent,
    };

    state
        .audit_service
        .log_tx(&mut tx, audit_input)
        .await
        .map_err(AppError::from)?;

    tx.commit()
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(Json(SuccessResponse {
        success: true,
        message: "Roles updated successfully".to_string(),
    }))
}
