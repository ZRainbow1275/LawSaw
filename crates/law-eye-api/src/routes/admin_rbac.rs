use axum::{extract::State, routing::get, Json, Router};
use law_eye_common::Error;
use law_eye_core::with_tenant_tx;
use serde::Serialize;
use utoipa::ToSchema;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RoleEntry {
    /// Role tier name (e.g. `super_admin`, `tenant_admin`, `premium_user`).
    pub tier: String,
    /// Permissions baked into the role row's JSONB column.
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PermissionEntry {
    pub key: String,
    pub label: String,
    pub group: String,
}

/// Combined response shape consumed by both `/admin/roles` and
/// `/admin/permissions`. The frontend matrix screen ([
/// `apps/web/src/components/admin/admin-permissions-matrix.tsx`])
/// asserts the same shape from either endpoint and renders whichever
/// arrives first.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RolesPermissionsResponse {
    pub roles: Vec<RoleEntry>,
    pub permissions: Vec<PermissionEntry>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/roles", get(list_roles))
        .route("/permissions", get(list_permissions))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/roles",
    security(("session" = [])),
    responses(
        (status = 200, body = RolesPermissionsResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "admin-rbac"
)]
pub(crate) async fn list_roles(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<RolesPermissionsResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let roles = fetch_roles(&state, user.tenant_id).await?;
    let permissions = catalog_permissions();

    Ok(Json(RolesPermissionsResponse { roles, permissions }))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/permissions",
    security(("session" = [])),
    responses(
        (status = 200, body = RolesPermissionsResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "admin-rbac"
)]
pub(crate) async fn list_permissions(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<RolesPermissionsResponse>> {
    list_roles(State(state), auth_session).await
}

async fn fetch_roles(state: &AppState, tenant_id: uuid::Uuid) -> ApiResult<Vec<RoleEntry>> {
    let rows: Vec<(String, serde_json::Value)> = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, (String, serde_json::Value)>(
                "SELECT name, permissions FROM roles WHERE tenant_id = $1 ORDER BY name ASC",
            )
            .bind(tenant_id)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(rows
        .into_iter()
        .map(|(name, perms)| RoleEntry {
            tier: name,
            permissions: extract_permission_strings(&perms),
        })
        .collect())
}

fn extract_permission_strings(value: &serde_json::Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// Static catalog of well-known permission keys. The matrix UI uses these
/// rows to label columns and group them; the boolean cells come from each
/// role's `permissions` JSONB array.
///
/// Keep in sync with the `require_permission(... "<key>")` calls in
/// `crates/law-eye-api/src/routes/mod.rs::create_router`.
fn catalog_permissions() -> Vec<PermissionEntry> {
    const ENTRIES: &[(&str, &str, &str)] = &[
        // Articles
        ("articles:read", "Read articles", "Articles"),
        ("articles:write", "Write articles", "Articles"),
        ("articles:publish", "Publish articles", "Articles"),
        // Sources
        ("sources:read", "Read sources", "Sources"),
        ("sources:write", "Write sources", "Sources"),
        ("sources:manage", "Manage sources", "Sources"),
        // Categories
        ("categories:read", "Read categories", "Content"),
        ("categories:write", "Manage categories", "Content"),
        // Channels
        ("channels:manage", "Manage channels", "Content"),
        // Pins / banners
        ("pins:manage", "Manage pinned articles", "Content"),
        ("banners:manage", "Manage banners", "Content"),
        // Reports
        ("reports:read", "Read reports", "Reports"),
        ("reports:write", "Generate reports", "Reports"),
        // Knowledge graph
        ("knowledge:read", "Read knowledge graph", "Knowledge"),
        ("knowledge:write", "Mutate knowledge graph", "Knowledge"),
        // Users / tenants
        ("users:read", "Read users", "Admin"),
        ("users:write", "Manage users", "Admin"),
        ("tenants:manage", "Manage tenants", "Admin"),
        ("audit:read", "Read audit log", "Admin"),
        // Feedback
        ("feedbacks:read", "Read feedbacks", "Admin"),
        ("feedbacks:write", "Resolve feedbacks", "Admin"),
        // API keys
        ("apikeys:manage", "Manage API keys", "API"),
        // Webhooks
        ("webhooks:read", "Read webhooks", "Integrations"),
        ("webhooks:write", "Manage webhooks", "Integrations"),
        // Objects
        ("objects:read", "Read object storage", "Integrations"),
        // AI usage
        ("ai:usage:read", "Read AI usage", "AI"),
    ];

    ENTRIES
        .iter()
        .map(|(key, label, group)| PermissionEntry {
            key: (*key).to_string(),
            label: (*label).to_string(),
            group: (*group).to_string(),
        })
        .collect()
}
