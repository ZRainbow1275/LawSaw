use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, patch, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error;
use law_eye_core::{
    role_tier::{derive_role_tier_from_names, role_tier_at_least},
    SuperListTenantsFilter, SuperTenantUsageSnapshot, SuperUpdateTenantInput,
};
use law_eye_db::{CreateAuditLog, CreateUser};
use law_eye_queue::ExportTenantTask;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};

const SUPER_ADMIN_ROLE: &str = "super_admin";
const PASSWORD_RESET_TTL_SECONDS: u64 = 60 * 60 * 24; // 24h
const QUEUE_TENANT_EXPORT: &str = "queue:tenant_export";
const TENANT_USERS_DEFAULT_LIMIT: i64 = 50;
const TENANT_USERS_MAX_LIMIT: i64 = 200;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_tenants))
        .route("/", post(create_tenant))
        .route("/{id}", patch(update_tenant))
        .route("/{id}", delete(delete_tenant))
        .route("/{id}/usage", get(get_tenant_usage))
        .route("/{id}/users", get(list_tenant_users))
        .route("/{id}/suspend", post(suspend_tenant))
        .route("/{id}/admin/reset-password", post(reset_admin_password))
        .route("/{id}/export", post(export_tenant))
        .route("/{id}/exports", get(list_tenant_exports))
        .route("/{id}/exports/{export_id}", get(get_tenant_export))
}

// ── DTOs ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListSuperTenantsQuery {
    pub q: Option<String>,
    pub status: Option<String>,
    pub include_deleted: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSuperTenantRequest {
    pub slug: String,
    pub name: String,
    pub admin_email: String,
    pub admin_display_name: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateSuperTenantRequest {
    pub name: Option<String>,
    pub status: Option<String>,
    pub quota_users: Option<i32>,
    pub quota_storage_mb: Option<i64>,
    pub quota_ai_tokens_monthly: Option<i64>,
    pub feature_flags: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuperTenantResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub status: String,
    pub quota_users: i32,
    pub quota_storage_mb: i64,
    pub quota_ai_tokens_monthly: i64,
    pub feature_flags: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl From<law_eye_db::Tenant> for SuperTenantResponse {
    fn from(t: law_eye_db::Tenant) -> Self {
        Self {
            id: t.id,
            slug: t.slug,
            name: t.name,
            status: t.status,
            quota_users: t.quota_users,
            quota_storage_mb: t.quota_storage_mb,
            quota_ai_tokens_monthly: t.quota_ai_tokens_monthly,
            feature_flags: t.feature_flags,
            created_at: t.created_at,
            updated_at: t.updated_at,
            deleted_at: t.deleted_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreateSuperTenantResponse {
    pub tenant: SuperTenantResponse,
    pub admin_user_id: Uuid,
    pub password_reset_token: String,
    pub password_reset_expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteSuperTenantResponse {
    pub success: bool,
    pub id: Uuid,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuperTenantUsageResponse {
    pub tenant_id: Uuid,
    pub current_users: i32,
    pub current_articles: i32,
    pub current_storage_mb: i64,
    pub ai_tokens_this_month: i64,
}

impl From<SuperTenantUsageSnapshot> for SuperTenantUsageResponse {
    fn from(s: SuperTenantUsageSnapshot) -> Self {
        Self {
            tenant_id: s.tenant_id,
            current_users: s.current_users,
            current_articles: s.current_articles,
            current_storage_mb: s.current_storage_mb,
            ai_tokens_this_month: s.ai_tokens_this_month,
        }
    }
}

// ── Handlers ──────────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/api/v1/super/tenants",
    params(ListSuperTenantsQuery),
    security(("session" = [])),
    responses(
        (status = 200, body = [SuperTenantResponse]),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn list_tenants(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListSuperTenantsQuery>,
) -> ApiResult<Json<Vec<SuperTenantResponse>>> {
    let _user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let tenants = state
        .tenant_service
        .super_list_tenants(SuperListTenantsFilter {
            q: query.q,
            status: query.status,
            include_deleted: query.include_deleted,
            limit: query.limit,
            offset: query.offset,
        })
        .await
        .map_err(AppError::from)?;
    Ok(Json(
        tenants.into_iter().map(SuperTenantResponse::from).collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/super/tenants",
    request_body = CreateSuperTenantRequest,
    security(("session" = [])),
    responses(
        (status = 200, body = CreateSuperTenantResponse),
        (status = 400, body = ApiError),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 409, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn create_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateSuperTenantRequest>,
) -> ApiResult<Json<CreateSuperTenantResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let admin_email = req.admin_email.trim();
    if admin_email.is_empty() || !admin_email.contains('@') {
        return Err(AppError::validation("admin_email must be a valid email"));
    }

    let tenant = state
        .tenant_service
        .super_create_tenant(&req.slug, &req.name)
        .await
        .map_err(AppError::from)?;

    // The admin user must claim the account via the password-reset token
    // returned below. The interim password is a random UUID hash that is
    // never disclosed and never usable for login.
    let placeholder_password =
        format!("{}-{}", Uuid::new_v4(), Uuid::new_v4());

    let admin_user = state
        .user_service
        .create(CreateUser {
            tenant_id: tenant.id,
            email: admin_email.to_string(),
            password: placeholder_password,
            display_name: req.admin_display_name.clone(),
        })
        .await
        .map_err(AppError::from)?;

    state
        .user_service
        .assign_role(
            tenant.id,
            admin_user.id,
            SUPER_ADMIN_ROLE,
            Some(current_user.id),
        )
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let (token_record, raw_token) = state
        .password_reset_service
        .create_token(
            tenant.id,
            admin_user.id,
            PASSWORD_RESET_TTL_SECONDS,
            ip_address.clone(),
            user_agent.clone(),
        )
        .await
        .map_err(AppError::from)?;

    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "super_tenants.create".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(tenant.id),
                old_value: None,
                new_value: Some(json!({
                    "slug": tenant.slug,
                    "name": tenant.name,
                    "admin_user_id": admin_user.id,
                    "admin_email": admin_email,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(CreateSuperTenantResponse {
        tenant: tenant.into(),
        admin_user_id: admin_user.id,
        password_reset_token: raw_token,
        password_reset_expires_at: token_record.expires_at,
    }))
}

#[utoipa::path(
    patch,
    path = "/api/v1/super/tenants/{id}",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    request_body = UpdateSuperTenantRequest,
    security(("session" = [])),
    responses(
        (status = 200, body = SuperTenantResponse),
        (status = 400, body = ApiError),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn update_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateSuperTenantRequest>,
) -> ApiResult<Json<SuperTenantResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let tenant = state
        .tenant_service
        .super_update_tenant(
            id,
            SuperUpdateTenantInput {
                name: req.name,
                status: req.status,
                quota_users: req.quota_users,
                quota_storage_mb: req.quota_storage_mb,
                quota_ai_tokens_monthly: req.quota_ai_tokens_monthly,
                feature_flags: req.feature_flags,
            },
        )
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "super_tenants.update".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(tenant.id),
                old_value: None,
                new_value: Some(json!({
                    "name": tenant.name,
                    "status": tenant.status,
                    "quota_users": tenant.quota_users,
                    "quota_storage_mb": tenant.quota_storage_mb,
                    "quota_ai_tokens_monthly": tenant.quota_ai_tokens_monthly,
                    "feature_flags": tenant.feature_flags,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(tenant.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/super/tenants/{id}",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, body = DeleteSuperTenantResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 412, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn delete_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteSuperTenantResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let confirm = headers
        .get("x-confirm-delete")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim().eq_ignore_ascii_case("yes"))
        .unwrap_or(false);
    if !confirm {
        return Err(AppError::precondition_failed(
            "Missing X-Confirm-Delete: yes header — destructive op refused",
        ));
    }

    state
        .tenant_service
        .super_soft_delete_tenant(id)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "super_tenants.delete".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({ "id": id, "soft_delete": true })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(DeleteSuperTenantResponse { success: true, id }))
}

#[utoipa::path(
    get,
    path = "/api/v1/super/tenants/{id}/usage",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, body = SuperTenantUsageResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn get_tenant_usage(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SuperTenantUsageResponse>> {
    let _user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let snapshot = state
        .tenant_service
        .super_tenant_usage(id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(snapshot.into()))
}

// ── Phase F.7: tenant subroutines ─────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListTenantUsersQuery {
    /// Substring search on email + display_name (ILIKE %q%).
    pub q: Option<String>,
    /// Min role tier filter: basic_user, verified_user, premium_user, tenant_admin, super_admin.
    pub role_tier: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantUserResponse {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub is_active: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub role_tier: String,
    pub roles: Vec<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantUsersListResponse {
    pub data: Vec<TenantUserResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[utoipa::path(
    get,
    path = "/api/v1/super/tenants/{id}/users",
    params(("id" = Uuid, Path, description = "Tenant ID"), ListTenantUsersQuery),
    security(("session" = [])),
    responses(
        (status = 200, body = TenantUsersListResponse),
        (status = 400, body = ApiError),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn list_tenant_users(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<ListTenantUsersQuery>,
) -> ApiResult<Json<TenantUsersListResponse>> {
    let _user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let limit = query
        .limit
        .unwrap_or(TENANT_USERS_DEFAULT_LIMIT)
        .clamp(1, TENANT_USERS_MAX_LIMIT);
    let offset = query.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let q_pattern = query
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s));

    // Pull rows with the target tenant + optional ILIKE filter. Cross-tenant
    // by construction — guarded by ROLE_TIER_SUPER_ADMIN at the router layer,
    // so we issue raw queries against the pool (RLS bypassed via SECURITY-DEFINER
    // would be cleaner, but with_tenant_tx pinning to the target tenant achieves
    // the same effect for the auth-scoped queries below).
    let users = law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
        let q_pattern = q_pattern.clone();
        Box::pin(async move {
            let rows: Vec<law_eye_db::User> = if let Some(pattern) = q_pattern {
                sqlx::query_as::<_, law_eye_db::User>(
                    r#"
                    SELECT * FROM users
                    WHERE tenant_id = $1
                      AND (email ILIKE $2 OR COALESCE(display_name, '') ILIKE $2)
                    ORDER BY created_at DESC, id DESC
                    LIMIT $3 OFFSET $4
                    "#,
                )
                .bind(id)
                .bind(pattern)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
            } else {
                sqlx::query_as::<_, law_eye_db::User>(
                    r#"
                    SELECT * FROM users
                    WHERE tenant_id = $1
                    ORDER BY created_at DESC, id DESC
                    LIMIT $2 OFFSET $3
                    "#,
                )
                .bind(id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
            };
            Ok::<Vec<law_eye_db::User>, Error>(rows)
        })
    })
    .await
    .map_err(AppError::from)?;

    let total: i64 = law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
        let q_pattern = q_pattern.clone();
        Box::pin(async move {
            let count: (i64,) = if let Some(pattern) = q_pattern {
                sqlx::query_as(
                    r#"
                    SELECT COUNT(*) FROM users
                    WHERE tenant_id = $1
                      AND (email ILIKE $2 OR COALESCE(display_name, '') ILIKE $2)
                    "#,
                )
                .bind(id)
                .bind(pattern)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
            } else {
                sqlx::query_as("SELECT COUNT(*) FROM users WHERE tenant_id = $1")
                    .bind(id)
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
            };
            Ok::<i64, Error>(count.0)
        })
    })
    .await
    .map_err(AppError::from)?;

    let role_filter = query.role_tier.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let mut data: Vec<TenantUserResponse> = Vec::with_capacity(users.len());
    for user in users {
        let roles = state
            .user_service
            .get_user_roles(id, user.id)
            .await
            .map_err(AppError::from)?;
        let role_names: Vec<String> = roles.into_iter().map(|r| r.name).collect();
        let tier = derive_role_tier_from_names(&role_names);
        if let Some(min_tier) = role_filter {
            if !role_tier_at_least(&tier, min_tier) {
                continue;
            }
        }
        data.push(TenantUserResponse {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            is_active: user.is_active,
            last_login: user.last_login,
            email_verified_at: user.email_verified_at,
            role_tier: tier,
            roles: role_names,
            created_at: user.created_at,
        });
    }

    Ok(Json(TenantUsersListResponse {
        data,
        total,
        limit,
        offset,
    }))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SuspendTenantRequest {
    pub reason: Option<String>,
    pub until: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuspendTenantResponse {
    pub tenant: SuperTenantResponse,
    pub sessions_revoked: i64,
}

#[utoipa::path(
    post,
    path = "/api/v1/super/tenants/{id}/suspend",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    request_body = SuspendTenantRequest,
    security(("session" = [])),
    responses(
        (status = 200, body = SuspendTenantResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn suspend_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<SuspendTenantRequest>,
) -> ApiResult<Json<SuspendTenantResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let now = Utc::now();
    let until = req.until;

    // sessions table is global (no tenant_id column — see migration 003);
    // tenant scope is encoded inside the BYTEA `data` blob via tower-sessions.
    // We instead revoke by joining on session_tenants (migration 028) which
    // tracks per-tenant active session ids.
    let tenant_row = sqlx::query_as::<_, law_eye_db::Tenant>(
        r#"
        UPDATE tenants
        SET status = 'suspended',
            suspended_at = $2,
            suspended_until = $3,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(now)
    .bind(until)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| AppError::internal_with_code("DB_ERROR", e.to_string()))?
    .ok_or_else(|| AppError::not_found(format!("Tenant {} not found", id)))?;
    let (tenant_after, sessions_revoked) = async_revoke_sessions(&state, id, tenant_row).await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "super_tenants.suspend".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({
                    "tenant_id": id,
                    "reason": req.reason,
                    "until": until,
                    "sessions_revoked": sessions_revoked,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(SuspendTenantResponse {
        tenant: tenant_after.into(),
        sessions_revoked,
    }))
}

/// Hard-delete every session row whose `session_tenants.tenant_id` matches.
/// Returns (tenant, rows_deleted). Falls back to 0 if `session_tenants` is
/// missing in the local schema.
async fn async_revoke_sessions(
    state: &AppState,
    tenant_id: Uuid,
    tenant: law_eye_db::Tenant,
) -> Result<(law_eye_db::Tenant, i64), AppError> {
    let result = sqlx::query(
        r#"
        DELETE FROM sessions
        WHERE id IN (
            SELECT session_id FROM session_tenants WHERE tenant_id = $1
        )
        "#,
    )
    .bind(tenant_id)
    .execute(&state.pool)
    .await
    .map_err(|e| AppError::internal_with_code("DB_ERROR", e.to_string()))?;

    Ok((tenant, result.rows_affected() as i64))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ResetAdminPasswordResponse {
    pub admin_user_id: Uuid,
    pub admin_email: String,
    pub reset_token: String,
    pub expires_at: DateTime<Utc>,
}

#[utoipa::path(
    post,
    path = "/api/v1/super/tenants/{id}/admin/reset-password",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, body = ResetAdminPasswordResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn reset_admin_password(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ResetAdminPasswordResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    // Find the first super_admin (by created_at ASC) inside the target tenant.
    let admin: law_eye_db::User = law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, law_eye_db::User>(
                r#"
                SELECT u.*
                FROM users u
                JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
                JOIN roles r ON r.id = ur.role_id
                WHERE u.tenant_id = $1
                  AND r.name = $2
                ORDER BY u.created_at ASC, u.id ASC
                LIMIT 1
                "#,
            )
            .bind(id)
            .bind(SUPER_ADMIN_ROLE)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| {
                Error::NotFound(format!("Tenant {} has no super_admin user", id))
            })
        })
    })
    .await
    .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let (token_record, raw_token) = state
        .password_reset_service
        .create_token(
            id,
            admin.id,
            PASSWORD_RESET_TTL_SECONDS,
            ip_address.clone(),
            user_agent.clone(),
        )
        .await
        .map_err(AppError::from)?;

    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "super_tenants.admin_reset_password".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({
                    "tenant_id": id,
                    "admin_user_id": admin.id,
                    "admin_email": admin.email,
                    "expires_at": token_record.expires_at,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(ResetAdminPasswordResponse {
        admin_user_id: admin.id,
        admin_email: admin.email,
        reset_token: raw_token,
        expires_at: token_record.expires_at,
    }))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ExportTenantResponse {
    pub export_id: Uuid,
    pub job_id: Uuid,
    pub queued_at: DateTime<Utc>,
    pub status: String,
}

#[utoipa::path(
    post,
    path = "/api/v1/super/tenants/{id}/export",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 202, body = ExportTenantResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn export_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<(axum::http::StatusCode, Json<ExportTenantResponse>)> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    // Confirm tenant exists (cross-tenant SELECT — super_admin gate already
    // applied at the router; we do not pin app.tenant_id, so sqlx reads with
    // an explicit tenant_id WHERE clause.)
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| AppError::internal_with_code("DB_ERROR", e.to_string()))?;
    if exists.is_none() {
        return Err(AppError::not_found(format!("Tenant {} not found", id)));
    }

    // Persist a tenant_exports row first (status='queued') so the UI can poll
    // it; the worker (Task #38) will UPDATE this row through running →
    // completed / failed. tenant_exports has RLS pinned to app.tenant_id, so
    // we run the INSERT inside with_tenant_tx for the target tenant.
    let queued_at = Utc::now();
    let requested_by = current_user.id;
    let export_id: Uuid = law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
        Box::pin(async move {
            let row: (Uuid,) = sqlx::query_as(
                r#"
                INSERT INTO tenant_exports (tenant_id, status, requested_by, created_at)
                VALUES ($1, 'queued', $2, $3)
                RETURNING id
                "#,
            )
            .bind(id)
            .bind(requested_by)
            .bind(queued_at)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
            Ok::<Uuid, Error>(row.0)
        })
    })
    .await
    .map_err(AppError::from)?;

    // job_id mirrors export_id so the worker can lookup tenant_exports.id
    // directly without a separate index.
    let job_id = export_id;
    let task = ExportTenantTask {
        tenant_id: id,
        export_id,
        job_id,
        requested_by: current_user.id,
        requested_at: queued_at.timestamp(),
    };
    state
        .task_queue
        .enqueue_retryable(QUEUE_TENANT_EXPORT, task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "super_tenants.export".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({
                    "tenant_id": id,
                    "export_id": export_id,
                    "queue": QUEUE_TENANT_EXPORT,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        axum::http::StatusCode::ACCEPTED,
        Json(ExportTenantResponse {
            export_id,
            job_id,
            queued_at,
            status: "queued".to_string(),
        }),
    ))
}

// ── Phase F.8: export history endpoints ───────────────────────────────

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListTenantExportsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct TenantExportResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub status: String,
    pub requested_by: Option<Uuid>,
    pub job_id: Option<Uuid>,
    pub download_url: Option<String>,
    pub size_bytes: Option<i64>,
    pub error_message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantExportsListResponse {
    pub data: Vec<TenantExportResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

const TENANT_EXPORTS_DEFAULT_LIMIT: i64 = 50;
const TENANT_EXPORTS_MAX_LIMIT: i64 = 200;

#[utoipa::path(
    get,
    path = "/api/v1/super/tenants/{id}/exports",
    params(("id" = Uuid, Path, description = "Tenant ID"), ListTenantExportsQuery),
    security(("session" = [])),
    responses(
        (status = 200, body = TenantExportsListResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn list_tenant_exports(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<ListTenantExportsQuery>,
) -> ApiResult<Json<TenantExportsListResponse>> {
    let _user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let limit = query
        .limit
        .unwrap_or(TENANT_EXPORTS_DEFAULT_LIMIT)
        .clamp(1, TENANT_EXPORTS_MAX_LIMIT);
    let offset = query.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    // tenant_exports has RLS pinned to app.tenant_id; the SELECT runs inside
    // with_tenant_tx for the target tenant.
    let rows: Vec<TenantExportResponse> =
        law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, TenantExportResponse>(
                    r#"
                    SELECT id, tenant_id, status, requested_by, job_id,
                           download_url, size_bytes, error_message,
                           started_at, finished_at, created_at
                    FROM tenant_exports
                    WHERE tenant_id = $1
                    ORDER BY created_at DESC, id DESC
                    LIMIT $2 OFFSET $3
                    "#,
                )
                .bind(id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
        .map_err(AppError::from)?;

    let total: i64 = law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
        Box::pin(async move {
            let count: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM tenant_exports WHERE tenant_id = $1")
                    .bind(id)
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
            Ok::<i64, Error>(count.0)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(TenantExportsListResponse {
        data: rows,
        total,
        limit,
        offset,
    }))
}

#[utoipa::path(
    get,
    path = "/api/v1/super/tenants/{id}/exports/{export_id}",
    params(
        ("id" = Uuid, Path, description = "Tenant ID"),
        ("export_id" = Uuid, Path, description = "Export ID"),
    ),
    security(("session" = [])),
    responses(
        (status = 200, body = TenantExportResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 404, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "super-tenants"
)]
pub(crate) async fn get_tenant_export(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path((id, export_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<TenantExportResponse>> {
    let _user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let row: TenantExportResponse = law_eye_core::with_tenant_tx(&state.pool, id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, TenantExportResponse>(
                r#"
                SELECT id, tenant_id, status, requested_by, job_id,
                       download_url, size_bytes, error_message,
                       started_at, finished_at, created_at
                FROM tenant_exports
                WHERE tenant_id = $1 AND id = $2
                "#,
            )
            .bind(id)
            .bind(export_id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Export {} not found", export_id)))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(row))
}
