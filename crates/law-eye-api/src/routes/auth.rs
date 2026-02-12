use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use law_eye_common::Error;
use law_eye_core::OAuthProviderIdentity;
use law_eye_db::{CreateAuditLog, CreateUser};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use utoipa::ToSchema;
use tower_sessions::Session;

use once_cell::sync::Lazy;
use regex::Regex;

use crate::auth::{AuthSession, AuthenticatedUser, Credentials};
use crate::middleware::rate_limit::RateLimitLayer;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};

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
        .route(
            "/email-verification/request",
            post(request_email_verification).layer(RateLimitLayer::email_verification()),
        )
        .route(
            "/email-verification/confirm",
            post(confirm_email_verification).layer(RateLimitLayer::email_verification()),
        )
        .route(
            "/password-reset/request",
            post(request_password_reset).layer(RateLimitLayer::password_reset()),
        )
        .route("/password-reset/confirm", post(confirm_password_reset))
        .route(
            "/oauth/start",
            post(oauth_start).layer(RateLimitLayer::login()),
        )
        .route(
            "/oauth/callback",
            post(oauth_callback).layer(RateLimitLayer::login()),
        )
        .route(
            "/mfa/totp/setup",
            post(mfa_totp_setup).layer(RateLimitLayer::login()),
        )
        .route(
            "/mfa/totp/confirm",
            post(mfa_totp_confirm).layer(RateLimitLayer::login()),
        )
        .route(
            "/mfa/totp/disable",
            post(mfa_totp_disable).layer(RateLimitLayer::login()),
        )
        .route(
            "/mfa/verify",
            post(mfa_verify).layer(RateLimitLayer::login()),
        )
        .route("/logout", post(logout))
        .route("/me", get(get_current_user))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mfa_required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mfa_challenge: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OAuthStartResponse {
    pub success: bool,
    pub provider: String,
    pub tenant_slug: String,
    pub state: String,
    pub state_expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OAuthStartRequest {
    pub provider: String,
    pub tenant_slug: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OAuthCallbackRequest {
    pub provider: String,
    pub state: String,
    pub provider_user_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub tenant_slug: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MfaTotpSetupRequest {
    pub account_label: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MfaTotpSetupResponse {
    pub success: bool,
    pub issuer: String,
    pub account_label: String,
    pub secret: String,
    pub provisioning_uri: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MfaTotpConfirmRequest {
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MfaTotpStatusResponse {
    pub success: bool,
    pub enabled: bool,
    pub verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MfaVerifyRequest {
    pub email: String,
    pub challenge: String,
    pub code: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PasswordResetRequest {
    pub email: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PasswordResetRequestResponse {
    pub success: bool,
    pub message: String,
    /// Development-only: returns the raw token when `PRODUCTION` is not set.
    pub debug_token: Option<String>,
    /// Development-only: token expiry timestamp.
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EmailVerificationRequest {
    pub email: String,
    /// 租户标识（用于多租户隔离）。未提供时默认使用 `default`。
    pub tenant_slug: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EmailVerificationRequestResponse {
    pub success: bool,
    pub message: String,
    /// Development-only: returns the raw token when `PRODUCTION` is not set.
    pub debug_token: Option<String>,
    /// Development-only: token expiry timestamp.
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EmailVerificationConfirmRequest {
    pub email: String,
    pub token: String,
    /// 租户标识（用于多租户隔离）。未提供时默认使用 `default`。
    pub tenant_slug: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PasswordResetConfirmRequest {
    pub email: String,
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserResponse {
    pub id: uuid::Uuid,
    pub tenant_id: uuid::Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
    pub email_verified_at: Option<chrono::DateTime<chrono::Utc>>,
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
            email_verified_at: user.email_verified_at,
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
            email_verified_at: user.email_verified_at,
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
    session: Session,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<RegisterRequest>,
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

    validate_password_policy(&req.password)?;

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
    bind_session_tenant_mapping(&state, &session, user.tenant_id, user.id).await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            tenant.id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.register".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: Some(json!({
                    "tenant_id": tenant.id,
                    "email": user.email,
                    "display_name": user.display_name,
                    "assigned_role": default_role,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            success: true,
            message: "Registration successful".to_string(),
            user: Some(user.into()),
            mfa_required: Some(false),
            mfa_challenge: None,
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
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    session: Session,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(creds): ApiJson<Credentials>,
) -> ApiResult<Json<AuthResponse>> {
    let user = auth_session
        .authenticate(creds)
        .await
        .map_err(|e| AppError::internal(format!("Auth backend error: {}", e)))?
        .ok_or_else(|| AppError::unauthorized("Invalid email or password"))?;

    let mfa_status = state
        .mfa_totp_service
        .get_totp_status(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?;

    if mfa_status.as_ref().is_some_and(|m| m.enabled) {
        let challenge = state
            .mfa_totp_service
            .issue_login_challenge(user.tenant_id, user.id, mfa_challenge_ttl_seconds(&state))
            .await
            .map_err(AppError::from)?;

        let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
        state
            .audit_service
            .log(
                user.tenant_id,
                CreateAuditLog {
                    user_id: Some(user.id),
                    action: "auth.mfa.challenge_issued".to_string(),
                    resource: "auth".to_string(),
                    resource_id: Some(user.id),
                    old_value: None,
                    new_value: Some(json!({
                        "challenge_expires_at": challenge.token.expires_at,
                    })),
                    ip_address,
                    user_agent,
                },
            )
            .await
            .map_err(AppError::from)?;

        return Ok(Json(AuthResponse {
            success: true,
            message: "MFA verification required".to_string(),
            user: None,
            mfa_required: Some(true),
            mfa_challenge: Some(challenge.raw_challenge),
        }));
    }

    auth_session
        .login(&user)
        .await
        .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;
    bind_session_tenant_mapping(&state, &session, user.tenant_id, user.id).await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.login".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: Some(json!({
                    "email": user.email,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuthResponse {
        success: true,
        message: "Login successful".to_string(),
        user: Some(user.into()),
        mfa_required: Some(false),
        mfa_challenge: None,
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
pub(crate) async fn logout(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    session: Session,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<AuthResponse>> {
    let user = auth_session.user.clone();

    auth_session
        .logout()
        .await
        .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;

    unbind_session_tenant_mapping(&state, &session).await?;

    if let Some(user) = user {
        let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
        state
            .audit_service
            .log(
                user.tenant_id,
                CreateAuditLog {
                    user_id: Some(user.id),
                    action: "auth.logout".to_string(),
                    resource: "auth".to_string(),
                    resource_id: Some(user.id),
                    old_value: None,
                    new_value: None,
                    ip_address,
                    user_agent,
                },
            )
            .await
            .map_err(AppError::from)?;
    }

    Ok(Json(AuthResponse {
        success: true,
        message: "Logout successful".to_string(),
        user: None,
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
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
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}

async fn bind_session_tenant_mapping(
    state: &AppState,
    session: &Session,
    tenant_id: uuid::Uuid,
    user_id: uuid::Uuid,
) -> ApiResult<()> {
    let Some(session_id) = session.id().map(|value| value.to_string()) else {
        return Ok(());
    };

    state
        .tenant_service
        .bind_session_tenant(&session_id, tenant_id, Some(user_id))
        .await
        .map_err(AppError::from)?;

    Ok(())
}

async fn unbind_session_tenant_mapping(state: &AppState, session: &Session) -> ApiResult<()> {
    let Some(session_id) = session.id().map(|value| value.to_string()) else {
        return Ok(());
    };

    state
        .tenant_service
        .unbind_session_tenant(&session_id)
        .await
        .map_err(AppError::from)?;

    Ok(())
}

fn validate_password_policy(password: &str) -> Result<(), AppError> {
    let password = password.trim();

    if password.len() < 12 {
        return Err(AppError::validation(
            "Password must be at least 12 characters",
        ));
    }
    if password.len() > 128 {
        return Err(AppError::validation("Password is too long"));
    }
    if password
        .chars()
        .any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(AppError::validation(
            "Password must not contain whitespace or control characters",
        ));
    }

    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_symbol = password.chars().any(|c| !c.is_ascii_alphanumeric());

    if !(has_lower && has_upper && has_digit && has_symbol) {
        return Err(AppError::validation(
            "Password must include uppercase, lowercase, number, and symbol",
        ));
    }

    Ok(())
}

fn password_reset_ttl_seconds() -> u64 {
    const DEFAULT_TTL_SECS: u64 = 60 * 60; // 1h
    const MAX_TTL_SECS: u64 = 60 * 60 * 24; // 24h cap

    std::env::var("LAW_EYE__AUTH__PASSWORD_RESET_TTL_SECONDS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_TTL_SECS)
        .min(MAX_TTL_SECS)
}

fn email_verification_ttl_seconds() -> u64 {
    const DEFAULT_TTL_SECS: u64 = 60 * 60 * 24; // 24h
    const MAX_TTL_SECS: u64 = 60 * 60 * 24 * 7; // 7d cap

    std::env::var("LAW_EYE__AUTH__EMAIL_VERIFICATION_TTL_SECONDS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_TTL_SECS)
        .min(MAX_TTL_SECS)
}

fn oauth_state_ttl_seconds(state: &AppState) -> u64 {
    state.auth_oauth_state_ttl_seconds.clamp(30, 1800)
}

fn mfa_challenge_ttl_seconds(state: &AppState) -> u64 {
    state
        .auth_mfa_login_challenge_ttl_seconds
        .clamp(30, 1800)
}

fn normalize_provider_or_err(state: &AppState, provider: &str) -> Result<String, AppError> {
    let provider = provider.trim().to_ascii_lowercase();
    if provider.is_empty() {
        return Err(AppError::validation("Invalid oauth provider"));
    }

    if !state
        .auth_oauth_enabled_providers
        .iter()
        .any(|p| p == &provider)
    {
        return Err(AppError::validation("Unsupported oauth provider"));
    }

    Ok(provider)
}

fn normalize_tenant_slug_or_default(tenant_slug: Option<String>) -> Result<String, AppError> {
    let tenant_slug_re = TENANT_SLUG_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    let tenant_slug = tenant_slug.unwrap_or_else(|| "default".to_string());
    let tenant_slug = tenant_slug.trim().to_ascii_lowercase();
    if !tenant_slug_re.is_match(&tenant_slug) {
        return Err(AppError::validation(
            "Invalid tenant_slug (expected: ^[a-z][a-z0-9-]{2,31}$)",
        ));
    }

    Ok(tenant_slug)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/oauth/start",
    request_body = OAuthStartRequest,
    responses(
        (status = 200, description = "OAuth start issued", body = OAuthStartResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn oauth_start(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<OAuthStartRequest>,
) -> ApiResult<Json<OAuthStartResponse>> {
    let provider = normalize_provider_or_err(&state, &req.provider)?;
    let tenant_slug = normalize_tenant_slug_or_default(req.tenant_slug)?;
    let tenant = state
        .tenant_service
        .get_by_slug(&tenant_slug)
        .await
        .map_err(AppError::from)?;

    let issued = state
        .oauth_identity_service
        .issue_state_token(
            tenant.id,
            &provider,
            oauth_state_ttl_seconds(&state),
        )
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            tenant.id,
            CreateAuditLog {
                user_id: None,
                action: "auth.oauth.start".to_string(),
                resource: "auth".to_string(),
                resource_id: None,
                old_value: None,
                new_value: Some(json!({
                    "provider": provider.clone(),
                    "tenant_slug": tenant_slug.clone(),
                    "state_expires_at": issued.token.expires_at,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(OAuthStartResponse {
        success: true,
        provider: issued.token.provider,
        tenant_slug,
        state: issued.raw_state,
        state_expires_at: issued.token.expires_at,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/oauth/callback",
    request_body = OAuthCallbackRequest,
    responses(
        (status = 200, description = "OAuth login successful", body = AuthResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Unauthorized", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn oauth_callback(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    session: Session,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<OAuthCallbackRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    let provider = normalize_provider_or_err(&state, &req.provider)?;
    let tenant_slug = normalize_tenant_slug_or_default(req.tenant_slug)?;
    let tenant = state
        .tenant_service
        .get_by_slug(&tenant_slug)
        .await
        .map_err(AppError::from)?;

    if req.email.trim().is_empty() || !email_re.is_match(req.email.trim()) {
        return Err(AppError::validation("Invalid email address"));
    }

    state
        .oauth_identity_service
        .consume_state_token(tenant.id, &provider, &req.state)
        .await
        .map_err(|e| match e {
            Error::Unauthorized(_) => AppError::unauthorized("Invalid or expired OAuth state"),
            other => AppError::from(other),
        })?;

    let identity = OAuthProviderIdentity {
        provider: provider.clone(),
        provider_user_id: req.provider_user_id.clone(),
        provider_email: req.email.clone(),
    };

    let mut user = state
        .oauth_identity_service
        .find_user_by_identity(tenant.id, &identity)
        .await
        .map_err(AppError::from)?;

    if user.is_none() {
        user = state
            .oauth_identity_service
            .get_user_by_email(tenant.id, &req.email)
            .await
            .map_err(AppError::from)?;
    }

    let mut provisioned_role: Option<String> = None;
    let user = match user {
        Some(user) => user,
        None => {
            let existing_users = state
                .user_service
                .count_by_tenant(tenant.id)
                .await
                .map_err(AppError::from)?;

            let create_user = CreateUser {
                tenant_id: tenant.id,
                email: req.email.clone(),
                password: format!("oauth:{}:{}", provider, uuid::Uuid::new_v4()),
                display_name: req.display_name.clone(),
            };

            let created = match state.user_service.create(create_user).await {
                Ok(user) => user,
                Err(Error::Validation(msg)) if msg.contains("already exists") => state
                    .oauth_identity_service
                    .get_user_by_email(tenant.id, &req.email)
                    .await
                    .map_err(AppError::from)?
                    .ok_or_else(|| AppError::conflict("Email already registered"))?,
                Err(err) => return Err(AppError::from(err)),
            };

            let default_role = if existing_users == 0 { "admin" } else { "viewer" };
            state
                .user_service
                .assign_role(created.id, default_role, None)
                .await
                .map_err(AppError::from)?;
            provisioned_role = Some(default_role.to_string());
            created
        }
    };

    state
        .oauth_identity_service
        .link_identity(tenant.id, user.id, &identity)
        .await
        .map_err(AppError::from)?;

    let auth_user = AuthenticatedUser::from_db_user(&user);
    auth_session
        .login(&auth_user)
        .await
        .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;
    bind_session_tenant_mapping(&state, &session, tenant.id, user.id).await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            tenant.id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.oauth.callback".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: Some(json!({
                    "provider": provider.clone(),
                    "provider_user_id": req.provider_user_id,
                    "email": user.email,
                    "provisioned_role": provisioned_role,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuthResponse {
        success: true,
        message: "OAuth login successful".to_string(),
        user: Some(user.into()),
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/mfa/totp/setup",
    security(("session" = [])),
    request_body = MfaTotpSetupRequest,
    responses(
        (status = 200, description = "MFA setup prepared", body = MfaTotpSetupResponse),
        (status = 401, description = "Unauthorized", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn mfa_totp_setup(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<MfaTotpSetupRequest>,
) -> ApiResult<Json<MfaTotpSetupResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let account_label = req.account_label.unwrap_or_else(|| user.email.clone());
    let account_label = account_label.trim().to_string();
    if account_label.is_empty() {
        return Err(AppError::validation("Invalid account label"));
    }

    let provisioning = state
        .mfa_totp_service
        .setup_totp(
            user.tenant_id,
            user.id,
            &state.auth_mfa_totp_issuer,
            &account_label,
        )
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.mfa.setup".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: Some(json!({
                    "issuer": state.auth_mfa_totp_issuer.clone(),
                    "account_label": account_label.clone(),
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(MfaTotpSetupResponse {
        success: true,
        issuer: state.auth_mfa_totp_issuer.clone(),
        account_label,
        secret: provisioning.secret,
        provisioning_uri: provisioning.provisioning_uri,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/mfa/totp/confirm",
    security(("session" = [])),
    request_body = MfaTotpConfirmRequest,
    responses(
        (status = 200, description = "MFA enabled", body = MfaTotpStatusResponse),
        (status = 401, description = "Unauthorized", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn mfa_totp_confirm(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<MfaTotpConfirmRequest>,
) -> ApiResult<Json<MfaTotpStatusResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let updated = state
        .mfa_totp_service
        .confirm_totp(user.tenant_id, user.id, &req.code)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.mfa.confirm".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: Some(json!({
                    "enabled": updated.enabled,
                    "verified_at": updated.verified_at,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(MfaTotpStatusResponse {
        success: true,
        enabled: updated.enabled,
        verified_at: updated.verified_at,
        last_used_at: updated.last_used_at,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/mfa/totp/disable",
    security(("session" = [])),
    responses(
        (status = 200, description = "MFA disabled", body = AuthResponse),
        (status = 401, description = "Unauthorized", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn mfa_totp_disable(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<AuthResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    state
        .mfa_totp_service
        .disable_totp(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.mfa.disable".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: Some(json!({
                    "enabled": false,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuthResponse {
        success: true,
        message: "MFA disabled".to_string(),
        user: None,
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/mfa/verify",
    request_body = MfaVerifyRequest,
    responses(
        (status = 200, description = "MFA verified", body = AuthResponse),
        (status = 401, description = "Unauthorized", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn mfa_verify(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    session: Session,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<MfaVerifyRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    if req.email.trim().is_empty() || !email_re.is_match(req.email.trim()) {
        return Err(AppError::validation("Invalid email address"));
    }

    let db_user = state
        .user_service
        .get_by_email(&req.email)
        .await
        .map_err(|e| match e {
            Error::NotFound(_) => AppError::unauthorized("Invalid MFA challenge or code"),
            other => AppError::from(other),
        })?;

    let challenge_user_id = state
        .mfa_totp_service
        .consume_login_challenge_and_verify(db_user.tenant_id, &req.challenge, &req.code)
        .await
        .map_err(|e| match e {
            Error::Unauthorized(_) => AppError::unauthorized("Invalid MFA challenge or code"),
            other => AppError::from(other),
        })?;

    if challenge_user_id != db_user.id {
        return Err(AppError::unauthorized("Invalid MFA challenge or code"));
    }

    let auth_user = AuthenticatedUser::from_db_user(&db_user);
    auth_session
        .login(&auth_user)
        .await
        .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;
    bind_session_tenant_mapping(&state, &session, db_user.tenant_id, db_user.id).await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            db_user.tenant_id,
            CreateAuditLog {
                user_id: Some(db_user.id),
                action: "auth.mfa.verify".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(db_user.id),
                old_value: None,
                new_value: Some(json!({
                    "email": db_user.email,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuthResponse {
        success: true,
        message: "Login successful".to_string(),
        user: Some(db_user.into()),
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}

/// 请求邮箱验证（生产环境应通过邮件等渠道交付 token；本实现默认仅在非生产返回 debug_token）
#[utoipa::path(
    post,
    path = "/api/v1/auth/email-verification/request",
    request_body = EmailVerificationRequest,
    responses(
        (status = 200, description = "Request accepted", body = EmailVerificationRequestResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn request_email_verification(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<EmailVerificationRequest>,
) -> ApiResult<Json<EmailVerificationRequestResponse>> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    let tenant_slug_re = TENANT_SLUG_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    if req.email.is_empty() || !email_re.is_match(&req.email) {
        return Err(AppError::validation("Invalid email address"));
    }

    let tenant_slug = req.tenant_slug.unwrap_or_else(|| "default".to_string());
    let tenant_slug = tenant_slug.trim().to_ascii_lowercase();
    if !tenant_slug_re.is_match(&tenant_slug) {
        return Err(AppError::validation(
            "Invalid tenant_slug (expected: ^[a-z][a-z0-9-]{2,31}$)",
        ));
    }

    let tenant = state
        .tenant_service
        .get_by_slug(&tenant_slug)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let is_production = std::env::var_os("PRODUCTION").is_some();

    let mut debug_token: Option<String> = None;
    let mut expires_at: Option<chrono::DateTime<chrono::Utc>> = None;

    // Avoid account enumeration: return 200 even if user doesn't exist.
    match state.user_service.get_by_email(&req.email).await {
        Ok(user) => {
            if user.tenant_id == tenant.id && user.email_verified_at.is_none() {
                let ttl_seconds = email_verification_ttl_seconds();
                let (token, raw_token) = state
                    .email_verification_service
                    .create_token(
                        tenant.id,
                        user.id,
                        &user.email,
                        ttl_seconds,
                        ip_address.clone(),
                        user_agent.clone(),
                    )
                    .await
                    .map_err(AppError::from)?;

                state
                    .audit_service
                    .log(
                        tenant.id,
                        CreateAuditLog {
                            user_id: Some(user.id),
                            action: "auth.email_verification.request".to_string(),
                            resource: "auth".to_string(),
                            resource_id: Some(user.id),
                            old_value: None,
                            new_value: Some(json!({
                                "expires_at": token.expires_at,
                            })),
                            ip_address,
                            user_agent,
                        },
                    )
                    .await
                    .map_err(AppError::from)?;

                if !is_production {
                    debug_token = Some(raw_token);
                    expires_at = Some(token.expires_at);
                }
            }
        }
        Err(Error::NotFound(_)) => {}
        Err(err) => return Err(AppError::from(err)),
    }

    Ok(Json(EmailVerificationRequestResponse {
        success: true,
        message: if is_production {
            "If an account exists, verification instructions will be delivered out-of-band."
        } else {
            "Email verification token generated (development-only)."
        }
        .to_string(),
        debug_token,
        expires_at,
    }))
}

/// 确认邮箱验证（使用 token；不需要登录）
#[utoipa::path(
    post,
    path = "/api/v1/auth/email-verification/confirm",
    request_body = EmailVerificationConfirmRequest,
    responses(
        (status = 200, description = "Email verified", body = AuthResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Invalid token", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn confirm_email_verification(
    State(state): State<AppState>,
    mut auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<EmailVerificationConfirmRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    let tenant_slug_re = TENANT_SLUG_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    if req.email.is_empty() || !email_re.is_match(&req.email) {
        return Err(AppError::validation("Invalid email address"));
    }

    if req.token.trim().is_empty() {
        return Err(AppError::validation("Invalid token"));
    }

    let tenant_slug = req.tenant_slug.unwrap_or_else(|| "default".to_string());
    let tenant_slug = tenant_slug.trim().to_ascii_lowercase();
    if !tenant_slug_re.is_match(&tenant_slug) {
        return Err(AppError::validation(
            "Invalid tenant_slug (expected: ^[a-z][a-z0-9-]{2,31}$)",
        ));
    }

    let tenant = state
        .tenant_service
        .get_by_slug(&tenant_slug)
        .await
        .map_err(AppError::from)?;

    let user = state
        .user_service
        .get_by_email(&req.email)
        .await
        .map_err(|e| match e {
            Error::NotFound(_) => AppError::unauthorized("Invalid token or email"),
            other => AppError::from(other),
        })?;

    if user.tenant_id != tenant.id {
        return Err(AppError::unauthorized("Invalid token or email"));
    }

    // Idempotency: already verified.
    if user.email_verified_at.is_some() {
        return Ok(Json(AuthResponse {
            success: true,
            message: "Email already verified".to_string(),
            user: None,
            mfa_required: Some(false),
            mfa_challenge: None,
        }));
    }

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    state
        .email_verification_service
        .consume_and_verify(tenant.id, user.id, &user.email, &req.token)
        .await
        .map_err(|e| match e {
            Error::Unauthorized(_) => AppError::unauthorized("Invalid token or email"),
            other => AppError::from(other),
        })?;

    state
        .audit_service
        .log(
            tenant.id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.email_verification.confirm".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: None,
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    // If the caller has an active session for the same user, refresh the session user snapshot.
    if auth_session
        .user
        .as_ref()
        .is_some_and(|session_user| session_user.id == user.id)
    {
        let refreshed = state
            .user_service
            .get_by_id(user.id)
            .await
            .map_err(AppError::from)?;
        let auth_user = AuthenticatedUser::from_db_user(&refreshed);
        auth_session
            .login(&auth_user)
            .await
            .map_err(|e| AppError::internal(format!("Session error: {}", e)))?;
    }

    Ok(Json(AuthResponse {
        success: true,
        message: "Email verified".to_string(),
        user: None,
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}

/// 请求密码重置（生产环境应通过邮件/短信等渠道交付 token；本实现默认仅在非生产返回 debug_token）
#[utoipa::path(
    post,
    path = "/api/v1/auth/password-reset/request",
    request_body = PasswordResetRequest,
    responses(
        (status = 200, description = "Request accepted", body = PasswordResetRequestResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn request_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<PasswordResetRequest>,
) -> ApiResult<Json<PasswordResetRequestResponse>> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    if req.email.is_empty() || !email_re.is_match(&req.email) {
        return Err(AppError::validation("Invalid email address"));
    }

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let is_production = std::env::var_os("PRODUCTION").is_some();

    let mut debug_token: Option<String> = None;
    let mut expires_at: Option<chrono::DateTime<chrono::Utc>> = None;

    // Avoid account enumeration: return 200 even if user doesn't exist.
    match state.user_service.get_by_email(&req.email).await {
        Ok(user) => {
            let ttl_seconds = password_reset_ttl_seconds();
            let (token, raw_token) = state
                .password_reset_service
                .create_token(
                    user.tenant_id,
                    user.id,
                    ttl_seconds,
                    ip_address.clone(),
                    user_agent.clone(),
                )
                .await
                .map_err(AppError::from)?;

            state
                .audit_service
                .log(
                    user.tenant_id,
                    CreateAuditLog {
                        user_id: Some(user.id),
                        action: "auth.password_reset.request".to_string(),
                        resource: "auth".to_string(),
                        resource_id: Some(user.id),
                        old_value: None,
                        new_value: Some(json!({
                            "expires_at": token.expires_at,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await
                .map_err(AppError::from)?;

            if !is_production {
                debug_token = Some(raw_token);
                expires_at = Some(token.expires_at);
            }
        }
        Err(Error::NotFound(_)) => {}
        Err(err) => return Err(AppError::from(err)),
    }

    Ok(Json(PasswordResetRequestResponse {
        success: true,
        message: if is_production {
            "If an account exists, reset instructions will be delivered out-of-band."
        } else {
            "Password reset token generated (development-only)."
        }
        .to_string(),
        debug_token,
        expires_at,
    }))
}

/// 确认密码重置（使用 token + 新密码）
#[utoipa::path(
    post,
    path = "/api/v1/auth/password-reset/confirm",
    request_body = PasswordResetConfirmRequest,
    responses(
        (status = 200, description = "Password reset successful", body = AuthResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Invalid token", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn confirm_password_reset(
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<PasswordResetConfirmRequest>,
) -> ApiResult<Json<AuthResponse>> {
    let email_re = EMAIL_RE.as_ref().ok_or_else(|| {
        AppError::internal_with_code("REGEX_INIT_FAILED", "Internal server error")
    })?;

    if req.email.is_empty() || !email_re.is_match(&req.email) {
        return Err(AppError::validation("Invalid email address"));
    }

    validate_password_policy(&req.new_password)?;

    let user = state
        .user_service
        .get_by_email(&req.email)
        .await
        .map_err(|e| match e {
            Error::NotFound(_) => AppError::unauthorized("Invalid token or email"),
            other => AppError::from(other),
        })?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let password_hash = law_eye_core::PasswordResetService::hash_password(&req.new_password)
        .map_err(AppError::from)?;

    state
        .password_reset_service
        .consume_and_reset_password(user.tenant_id, user.id, &req.token, &password_hash)
        .await
        .map_err(AppError::from)?;

    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "auth.password_reset.confirm".to_string(),
                resource: "auth".to_string(),
                resource_id: Some(user.id),
                old_value: None,
                new_value: None,
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuthResponse {
        success: true,
        message: "Password reset successful".to_string(),
        user: None,
        mfa_required: Some(false),
        mfa_challenge: None,
    }))
}
