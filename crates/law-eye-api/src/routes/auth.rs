use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use law_eye_db::CreateUser;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use once_cell::sync::Lazy;
use regex::Regex;

use crate::auth::{AuthSession, AuthenticatedUser, Credentials};
use crate::middleware::rate_limit::RateLimitLayer;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

static EMAIL_RE: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").ok());
static TENANT_SLUG_RE: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r"^[a-z][a-z0-9-]{2,31}$").ok());

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/register",
            post(register).layer(RateLimitLayer::register()),
        )
        .route("/login", post(login).layer(RateLimitLayer::login()))
        .route("/logout", post(logout))
        .route("/me", get(get_current_user))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
    /// 租户标识（用于多租户隔离）。未提供时默认使用 `default`。
    pub tenant_slug: Option<String>,
    /// 租户名称（创建新租户时使用）。未提供时默认使用 slug。
    pub tenant_name: Option<String>,
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
    pub tenant_id: uuid::Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
}

impl From<AuthenticatedUser> for UserResponse {
    fn from(user: AuthenticatedUser) -> Self {
        Self {
            id: user.id,
            tenant_id: user.tenant_id,
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
            tenant_id: user.tenant_id,
            email: user.email,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
        }
    }
}

/// 用户注册
#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "Registration successful", body = AuthResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 409, description = "Email already exists", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn register(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    Json(req): Json<RegisterRequest>,
) -> ApiResult<(StatusCode, Json<AuthResponse>)> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    let tenant_slug_re = TENANT_SLUG_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    // Validate input
    if req.email.is_empty() || !email_re.is_match(&req.email) {
        return Err(AppError::validation("Invalid email address"));
    }

    if req.password.len() < 8 {
        return Err(AppError::validation(
            "Password must be at least 8 characters",
        ));
    }

    let tenant_slug = req.tenant_slug.unwrap_or_else(|| "default".to_string());
    let tenant_slug = tenant_slug.trim().to_ascii_lowercase();
    if !tenant_slug_re.is_match(&tenant_slug) {
        return Err(AppError::validation(
            "Invalid tenant_slug (expected: ^[a-z][a-z0-9-]{2,31}$)",
        ));
    }

    let tenant_name = req
        .tenant_name
        .unwrap_or_else(|| tenant_slug.clone())
        .trim()
        .to_string();
    if tenant_name.is_empty() || tenant_name.len() > 100 {
        return Err(AppError::validation("Invalid tenant_name"));
    }

    let tenant = state
        .tenant_service
        .upsert_by_slug(&tenant_slug, &tenant_name)
        .await
        .map_err(AppError::from)?;

    let existing_users = state
        .user_service
        .count_by_tenant(tenant.id)
        .await
        .map_err(AppError::from)?;

    let create_user = CreateUser {
        tenant_id: tenant.id,
        email: req.email,
        password: req.password,
        display_name: req.display_name,
    };

    let user = match state.user_service.create(create_user).await {
        Ok(user) => user,
        Err(law_eye_common::Error::Validation(msg)) if msg.contains("already exists") => {
            return Err(AppError::conflict("Email already registered"))
        }
        Err(err) => return Err(AppError::from(err)),
    };

    let default_role = if existing_users == 0 {
        "admin"
    } else {
        "viewer"
    };
    state
        .user_service
        .assign_role(user.id, default_role, None)
        .await
        .map_err(AppError::from)?;

    let auth_user = AuthenticatedUser::from_db_user(&user);
    auth_session
        .login(&auth_user)
        .await
        .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            success: true,
            message: "Registration successful".to_string(),
            user: Some(user.into()),
        }),
    ))
}

/// 用户登录
#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    request_body = Credentials,
    responses(
        (status = 200, description = "Login successful", body = AuthResponse),
        (status = 401, description = "Invalid credentials", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn login(
    mut auth_session: AuthSession,
    Json(creds): Json<Credentials>,
) -> ApiResult<Json<AuthResponse>> {
    let user = auth_session
        .authenticate(creds)
        .await
        .map_err(|e| AppError::internal(format!("Auth backend error: {}", e)))?
        .ok_or_else(|| AppError::unauthorized("Invalid email or password"))?;

    auth_session
        .login(&user)
        .await
        .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;

    Ok(Json(AuthResponse {
        success: true,
        message: "Login successful".to_string(),
        user: Some(user.into()),
    }))
}

/// 用户登出
#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    responses(
        (status = 200, description = "Logout successful", body = AuthResponse)
    )
)]
pub(crate) async fn logout(mut auth_session: AuthSession) -> (StatusCode, Json<AuthResponse>) {
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
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Current user", body = AuthResponse),
        (status = 401, description = "Not authenticated", body = ApiError)
    )
)]
pub(crate) async fn get_current_user(auth_session: AuthSession) -> ApiResult<Json<AuthResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    Ok(Json(AuthResponse {
        success: true,
        message: "Authenticated".to_string(),
        user: Some(user.into()),
    }))
}
