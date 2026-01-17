use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch},
    Json, Router,
};
use law_eye_db::UpdateUser;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;

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
pub struct UserDetailResponse {
    pub user: UserResponse,
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
async fn check_admin_permission(state: &AppState, user_id: Uuid) -> bool {
    state.user_service.has_permission(user_id, "*").await.unwrap_or(false)
}

/// 获取用户列表 (需要管理员权限)
#[utoipa::path(
    get,
    path = "/api/v1/users",
    params(
        ("limit" = Option<i64>, Query, description = "Limit"),
        ("offset" = Option<i64>, Query, description = "Offset")
    ),
    responses(
        (status = 200, description = "Users list", body = UsersListResponse),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden")
    )
)]
async fn list_users(
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

    if !check_admin_permission(&state, user.id).await {
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
    responses(
        (status = 200, description = "User details", body = UserDetailResponse),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "User not found")
    )
)]
async fn get_user(
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
    let is_admin = check_admin_permission(&state, current_user.id).await;
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
    responses(
        (status = 200, description = "User updated", body = UserResponse),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "User not found")
    )
)]
async fn update_user(
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
    let is_admin = check_admin_permission(&state, current_user.id).await;
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
        Ok(user) => (StatusCode::OK, Json(UserResponse::from(user))).into_response(),
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
    responses(
        (status = 200, description = "Roles updated", body = SuccessResponse),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "User not found")
    )
)]
async fn update_user_roles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateRolesRequest>,
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

    if !check_admin_permission(&state, current_user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
            }),
        )
            .into_response();
    }

    // Verify user exists
    if state.user_service.get_by_id(id).await.is_err() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "User not found".to_string(),
            }),
        )
            .into_response();
    }

    // Add roles
    if let Some(roles) = req.add_roles {
        for role in roles {
            let _ = state
                .user_service
                .assign_role(id, &role, Some(current_user.id))
                .await;
        }
    }

    // Remove roles
    if let Some(roles) = req.remove_roles {
        for role in roles {
            let _ = state.user_service.remove_role(id, &role).await;
        }
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
