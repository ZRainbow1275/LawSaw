use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::{header::USER_AGENT, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, patch},
    Json, Router,
};
use law_eye_common::Error;
use law_eye_db::{CreateAuditLog, UpdateUser};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
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
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// 检查用户是否有管理员权限
async fn check_admin_permission(state: &AppState, user_id: Uuid) -> Result<bool, crate::AppError> {
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Forbidden", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_users(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    let is_admin = match check_admin_permission(&state, user.id).await {
        Ok(value) => value,
        Err(err) => return err.into_response(),
    };
    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
            }),
        )
            .into_response();
    }

    match state.user_service.list(query.limit, query.offset).await {
        Ok(users) => {
            let total = state.user_service.count().await.unwrap_or(0);
            (
                StatusCode::OK,
                Json(UsersListResponse {
                    users: users.into_iter().map(|u| u.into()).collect(),
                    total,
                    limit: query.limit,
                    offset: query.offset,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Forbidden", body = ErrorResponse),
        (status = 404, description = "User not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn get_user(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let current_user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    // Allow users to view their own profile, or admins to view any
    let is_admin = match check_admin_permission(&state, current_user.id).await {
        Ok(value) => value,
        Err(err) => return err.into_response(),
    };
    if current_user.id != id && !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Access denied".to_string(),
            }),
        )
            .into_response();
    }

    match state.user_service.get_by_id(id).await {
        Ok(user) => {
            let roles = state
                .user_service
                .get_user_roles(id)
                .await
                .unwrap_or_default();
            let permissions = state
                .user_service
                .get_user_permissions(id)
                .await
                .unwrap_or_default();

            (
                StatusCode::OK,
                Json(UserDetailResponse {
                    user: user.into(),
                    roles: roles.into_iter().map(|r| r.name).collect(),
                    permissions,
                }),
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Forbidden", body = ErrorResponse),
        (status = 404, description = "User not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn update_user(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateUserRequest>,
) -> impl IntoResponse {
    let current_user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    // Allow users to update their own profile, or admins to update any
    let is_admin = match check_admin_permission(&state, current_user.id).await {
        Ok(value) => value,
        Err(err) => return err.into_response(),
    };
    if current_user.id != id && !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Access denied".to_string(),
            }),
        )
            .into_response();
    }

    let update = UpdateUser {
        display_name: req.display_name,
        avatar_url: req.avatar_url,
        preferences: req.preferences,
    };

    match state.user_service.update(id, update).await {
        Ok(user) => (StatusCode::OK, Json(UserProfileResponse::from(user))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Forbidden", body = ErrorResponse),
        (status = 404, description = "User not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn update_user_roles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateRolesRequest>,
) -> impl IntoResponse {
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

    let current_user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    let is_admin = match check_admin_permission(&state, current_user.id).await {
        Ok(value) => value,
        Err(err) => return err.into_response(),
    };
    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
            }),
        )
            .into_response();
    }

    // Verify user exists
    match state.user_service.get_by_id(id).await {
        Ok(_) => {}
        Err(Error::NotFound(_)) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "User not found".to_string(),
                }),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e.to_string() }),
            )
                .into_response();
        }
    }

    let add_roles = match normalize_role_names(req.add_roles) {
        Ok(v) => v,
        Err(msg) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse { error: msg }),
            )
                .into_response()
        }
    };
    let remove_roles = match normalize_role_names(req.remove_roles) {
        Ok(v) => v,
        Err(msg) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse { error: msg }),
            )
                .into_response()
        }
    };

    if add_roles.is_empty() && remove_roles.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "No roles specified".to_string(),
            }),
        )
            .into_response();
    }

    let add_set: std::collections::BTreeSet<String> = add_roles.iter().cloned().collect();
    let remove_set: std::collections::BTreeSet<String> = remove_roles.iter().cloned().collect();
    let overlap: Vec<String> = add_set
        .intersection(&remove_set)
        .cloned()
        .collect::<Vec<_>>();
    if !overlap.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Role(s) cannot be both added and removed: {}", overlap.join(", ")),
            }),
        )
            .into_response();
    }

    let mut tx = match state.pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e.to_string() }),
            )
                .into_response()
        }
    };

    let all_role_names: Vec<String> = add_set.union(&remove_set).cloned().collect();
    if let Err(e) = state
        .user_service
        .validate_roles_exist_tx(&mut tx, &all_role_names)
        .await
    {
        let status = match e {
            Error::Validation(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        return (status, Json(ErrorResponse { error: e.to_string() })).into_response();
    }

    let before_roles = match state.user_service.get_user_roles_tx(&mut tx, id).await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e.to_string() }),
            )
                .into_response()
        }
    };

    for role in &add_roles {
        if let Err(e) = state
            .user_service
            .assign_role_tx(&mut tx, id, role, Some(current_user.id))
            .await
        {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e.to_string() }),
            )
                .into_response();
        }
    }

    for role in &remove_roles {
        if let Err(e) = state.user_service.remove_role_tx(&mut tx, id, role).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e.to_string() }),
            )
                .into_response();
        }
    }

    let after_roles = match state.user_service.get_user_roles_tx(&mut tx, id).await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: e.to_string() }),
            )
                .into_response()
        }
    };

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

    if let Err(e) = state.audit_service.log_tx(&mut tx, audit_input).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        )
            .into_response();
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: e.to_string() }),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(SuccessResponse {
            success: true,
            message: "Roles updated successfully".to_string(),
        }),
    )
        .into_response()
}
