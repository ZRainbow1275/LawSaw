use axum::{
    extract::{Path, State},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult};

mod dto;
mod handlers;

pub use dto::{
    CreateTenantRequest, DeleteTenantResponse, TenantConfigResponse, TenantDetailResponse,
    TenantResponse, TenantUsageResponse, UpdateTenantConfigRequest, UpdateTenantRequest,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_tenants).post(create_tenant))
        .route(
            "/{id}",
            get(get_tenant).put(update_tenant).delete(delete_tenant),
        )
        .route(
            "/{id}/config",
            get(get_tenant_config).put(update_tenant_config),
        )
        .route("/{id}/usage", get(get_tenant_usage))
        .route("/{id}/usage/refresh", post(refresh_tenant_usage))
}

#[utoipa::path(
    get,
    path = "/api/v1/tenants",
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant list", body = Vec<TenantResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn list_tenants(
    state: State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<TenantResponse>>> {
    handlers::list_tenants(state, auth_session).await
}

#[utoipa::path(
    post,
    path = "/api/v1/tenants",
    request_body = CreateTenantRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant created", body = TenantResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn create_tenant(
    state: State<AppState>,
    auth_session: AuthSession,
    headers: axum::http::HeaderMap,
    addr: axum::extract::ConnectInfo<std::net::SocketAddr>,
    req: ApiJson<CreateTenantRequest>,
) -> ApiResult<Json<TenantResponse>> {
    handlers::create_tenant(state, auth_session, headers, addr, req).await
}

#[utoipa::path(
    get,
    path = "/api/v1/tenants/{id}",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant detail with config and usage", body = TenantDetailResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn get_tenant(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<TenantDetailResponse>> {
    handlers::get_tenant(state, auth_session, id).await
}

#[utoipa::path(
    put,
    path = "/api/v1/tenants/{id}",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    request_body = UpdateTenantRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant updated", body = TenantResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn update_tenant(
    state: State<AppState>,
    auth_session: AuthSession,
    headers: axum::http::HeaderMap,
    addr: axum::extract::ConnectInfo<std::net::SocketAddr>,
    id: Path<Uuid>,
    req: ApiJson<UpdateTenantRequest>,
) -> ApiResult<Json<TenantResponse>> {
    handlers::update_tenant(state, auth_session, headers, addr, id, req).await
}

#[utoipa::path(
    delete,
    path = "/api/v1/tenants/{id}",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant deleted", body = DeleteTenantResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn delete_tenant(
    state: State<AppState>,
    auth_session: AuthSession,
    headers: axum::http::HeaderMap,
    addr: axum::extract::ConnectInfo<std::net::SocketAddr>,
    id: Path<Uuid>,
) -> ApiResult<Json<DeleteTenantResponse>> {
    handlers::delete_tenant(state, auth_session, headers, addr, id).await
}

#[utoipa::path(
    get,
    path = "/api/v1/tenants/{id}/config",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant configuration", body = TenantConfigResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn get_tenant_config(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Response> {
    handlers::get_tenant_config(state, auth_session, id).await
}

#[utoipa::path(
    put,
    path = "/api/v1/tenants/{id}/config",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    request_body = UpdateTenantConfigRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant configuration updated", body = TenantConfigResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 412, description = "Version mismatch (If-Match failed)", body = ApiError),
        (status = 428, description = "Missing If-Match header", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn update_tenant_config(
    state: State<AppState>,
    auth_session: AuthSession,
    headers: axum::http::HeaderMap,
    addr: axum::extract::ConnectInfo<std::net::SocketAddr>,
    id: Path<Uuid>,
    req: ApiJson<UpdateTenantConfigRequest>,
) -> ApiResult<Response> {
    handlers::update_tenant_config(state, auth_session, headers, addr, id, req).await
}

#[utoipa::path(
    get,
    path = "/api/v1/tenants/{id}/usage",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant usage statistics", body = TenantUsageResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn get_tenant_usage(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<TenantUsageResponse>> {
    handlers::get_tenant_usage(state, auth_session, id).await
}

#[utoipa::path(
    post,
    path = "/api/v1/tenants/{id}/usage/refresh",
    params(("id" = Uuid, Path, description = "Tenant ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Tenant usage refreshed", body = TenantUsageResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "tenants"
)]
pub(crate) async fn refresh_tenant_usage(
    state: State<AppState>,
    auth_session: AuthSession,
    headers: axum::http::HeaderMap,
    addr: axum::extract::ConnectInfo<std::net::SocketAddr>,
    id: Path<Uuid>,
) -> ApiResult<Json<TenantUsageResponse>> {
    handlers::refresh_tenant_usage(state, auth_session, headers, addr, id).await
}
