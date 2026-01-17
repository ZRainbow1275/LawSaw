use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use law_eye_db::CreateUser;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use once_cell::sync::Lazy;
use regex::Regex;

use crate::auth::{AuthSession, AuthenticatedUser, Credentials};
use crate::state::AppState;

static EMAIL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
});

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(get_current_user))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<UserResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserResponse {
    pub id: uuid::Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
}

impl From<AuthenticatedUser> for UserResponse {
    fn from(user: AuthenticatedUser) -> Self {
        Self {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
        }
    }
}

impl From<law_eye_db::User> for UserResponse {
    fn from(user: law_eye_db::User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
}

/// 用户注册
#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "Registration successful", body = AuthResponse),
        (status = 400, description = "Validation error", body = ErrorResponse),
        (status = 409, description = "Email already exists", body = ErrorResponse)
    )
)]
async fn register(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    // Validate input
    if req.email.is_empty() || !EMAIL_RE.is_match(&req.email) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid email address".to_string(),
            }),
        )
            .into_response();
    }

    if req.password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Password must be at least 8 characters".to_string(),
            }),
        )
            .into_response();
    }

    let create_user = CreateUser {
        email: req.email,
        password: req.password,
        display_name: req.display_name,
    };

    match state.user_service.create(create_user).await {
        Ok(user) => {
            // Assign default viewer role
            let _ = state.user_service.assign_role(user.id, "viewer", None).await;

            // Auto login after registration
            let auth_user = AuthenticatedUser::from_db_user(&user);
            let _ = auth_session.login(&auth_user).await;

            (
                StatusCode::CREATED,
                Json(AuthResponse {
                    success: true,
                    message: "Registration successful".to_string(),
                    user: Some(user.into()),
                }),
            )
                .into_response()
        }
        Err(e) => {
            let error_msg = e.to_string();
            if error_msg.contains("already exists") {
                (
                    StatusCode::CONFLICT,
                    Json(ErrorResponse {
                        error: "Email already registered".to_string(),
                    }),
                )
                    .into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Registration failed: {}", error_msg),
                    }),
                )
                    .into_response()
            }
        }
    }
}

/// 用户登录
#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    request_body = Credentials,
    responses(
        (status = 200, description = "Login successful", body = AuthResponse),
        (status = 401, description = "Invalid credentials", body = ErrorResponse)
    )
)]
async fn login(mut auth_session: AuthSession, Json(creds): Json<Credentials>) -> impl IntoResponse {
    match auth_session.authenticate(creds).await {
        Ok(Some(user)) => {
            if let Err(e) = auth_session.login(&user).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Session error: {}", e),
                    }),
                )
                    .into_response();
            }

            (
                StatusCode::OK,
                Json(AuthResponse {
                    success: true,
                    message: "Login successful".to_string(),
                    user: Some(user.into()),
                }),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid email or password".to_string(),
            }),
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Authentication error".to_string(),
            }),
        )
            .into_response(),
    }
}

/// 用户登出
#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    responses(
        (status = 200, description = "Logout successful", body = AuthResponse)
    )
)]
async fn logout(mut auth_session: AuthSession) -> impl IntoResponse {
    let _ = auth_session.logout().await;

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: "Logout successful".to_string(),
            user: None,
        }),
    )
}

/// 获取当前用户
#[utoipa::path(
    get,
    path = "/api/v1/auth/me",
    responses(
        (status = 200, description = "Current user", body = AuthResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse)
    )
)]
async fn get_current_user(auth_session: AuthSession) -> impl IntoResponse {
    match auth_session.user {
        Some(user) => (
            StatusCode::OK,
            Json(AuthResponse {
                success: true,
                message: "Authenticated".to_string(),
                user: Some(user.into()),
            }),
        )
            .into_response(),
        None => (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Not authenticated".to_string(),
            }),
        )
            .into_response(),
    }
}
