use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use law_eye_core::UpdateTenantConfigInput;
use law_eye_db::CreateAuditLog;
use std::net::SocketAddr;
use uuid::Uuid;

use super::dto::{
    CreateTenantRequest, DeleteTenantResponse, TenantConfigResponse, TenantDetailResponse,
    TenantResponse, TenantUsageResponse, UpdateTenantConfigRequest, UpdateTenantRequest,
};
use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiJson, ApiResult, AppError};

/// Require the current user to have the `tenants:manage` permission.
async fn require_tenants_manage(
    state: &AppState,
    tenant_id: Uuid,
    user_id: Uuid,
) -> ApiResult<()> {
    let allowed = state
        .user_service
        .has_permission(tenant_id, user_id, "tenants:manage")
        .await
        .map_err(AppError::from)?;
    if !allowed {
        return Err(AppError::forbidden("Permission denied"));
    }
    Ok(())
}

// ── List tenants ──────────────────────────────────────────────────────

pub(crate) async fn list_tenants(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<TenantResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let tenants = state
        .tenant_service
        .list_tenants()
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        tenants.into_iter().map(TenantResponse::from).collect(),
    ))
}

// ── Create tenant ─────────────────────────────────────────────────────

pub(crate) async fn create_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateTenantRequest>,
) -> ApiResult<Json<TenantResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let slug = req.slug.trim();
    let name = req.name.trim();

    if slug.is_empty() {
        return Err(AppError::validation("slug cannot be empty"));
    }
    if name.is_empty() {
        return Err(AppError::validation("name cannot be empty"));
    }
    // Validate slug format: only lowercase alphanumeric and hyphens
    if !slug
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(AppError::validation(
            "slug must contain only lowercase letters, digits, and hyphens",
        ));
    }

    let tenant = state
        .tenant_service
        .upsert_by_slug(slug, name)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);

    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "tenants.create".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(tenant.id),
                old_value: None,
                new_value: Some(serde_json::json!({
                    "slug": tenant.slug,
                    "name": tenant.name,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantResponse::from(tenant)))
}

// ── Get tenant detail ─────────────────────────────────────────────────

pub(crate) async fn get_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<TenantDetailResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let tenant = state
        .tenant_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;

    let config = state
        .tenant_service
        .get_config(id)
        .await
        .map_err(AppError::from)?;

    let usage = state
        .tenant_service
        .get_usage(id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantDetailResponse {
        tenant: TenantResponse::from(tenant),
        config: TenantConfigResponse::from(config),
        usage: TenantUsageResponse::from(usage),
    }))
}

// ── Update tenant ─────────────────────────────────────────────────────

pub(crate) async fn update_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateTenantRequest>,
) -> ApiResult<Json<TenantResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let before = state
        .tenant_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;

    let tenant = state
        .tenant_service
        .update_tenant(id, &req.name)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);

    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "tenants.update".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(id),
                old_value: Some(serde_json::json!({
                    "name": before.name,
                })),
                new_value: Some(serde_json::json!({
                    "name": tenant.name,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantResponse::from(tenant)))
}

// ── Delete tenant ─────────────────────────────────────────────────────

pub(crate) async fn delete_tenant(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteTenantResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let before = state
        .tenant_service
        .get_by_id(id)
        .await
        .map_err(AppError::from)?;

    state
        .tenant_service
        .delete_tenant(id)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);

    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "tenants.delete".to_string(),
                resource: "tenants".to_string(),
                resource_id: Some(id),
                old_value: Some(serde_json::json!({
                    "slug": before.slug,
                    "name": before.name,
                })),
                new_value: Some(serde_json::json!({ "deleted": true })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(DeleteTenantResponse {
        success: true,
        message: "Tenant deleted".to_string(),
    }))
}

// ── Get tenant config ─────────────────────────────────────────────────

pub(crate) async fn get_tenant_config(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<TenantConfigResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let config = state
        .tenant_service
        .get_config(id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantConfigResponse::from(config)))
}

// ── Update tenant config ──────────────────────────────────────────────

pub(crate) async fn update_tenant_config(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateTenantConfigRequest>,
) -> ApiResult<Json<TenantConfigResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let before = state
        .tenant_service
        .get_config(id)
        .await
        .map_err(AppError::from)?;

    let input = UpdateTenantConfigInput {
        max_users: req.max_users,
        max_articles: req.max_articles,
        max_sources: req.max_sources,
        max_storage_mb: req.max_storage_mb,
        max_reports_per_month: req.max_reports_per_month,
        feature_ai_enabled: req.feature_ai_enabled,
        feature_knowledge_graph: req.feature_knowledge_graph,
        feature_report_generation: req.feature_report_generation,
        feature_webhook: req.feature_webhook,
        logo_url: req.logo_url,
        primary_color: req.primary_color,
    };

    let config = state
        .tenant_service
        .update_config(id, input)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);

    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "tenants.config.update".to_string(),
                resource: "tenant_configs".to_string(),
                resource_id: Some(id),
                old_value: Some(serde_json::json!({
                    "max_users": before.max_users,
                    "max_articles": before.max_articles,
                    "max_sources": before.max_sources,
                    "max_storage_mb": before.max_storage_mb,
                    "max_reports_per_month": before.max_reports_per_month,
                    "feature_ai_enabled": before.feature_ai_enabled,
                    "feature_knowledge_graph": before.feature_knowledge_graph,
                    "feature_report_generation": before.feature_report_generation,
                    "feature_webhook": before.feature_webhook,
                })),
                new_value: Some(serde_json::json!({
                    "max_users": config.max_users,
                    "max_articles": config.max_articles,
                    "max_sources": config.max_sources,
                    "max_storage_mb": config.max_storage_mb,
                    "max_reports_per_month": config.max_reports_per_month,
                    "feature_ai_enabled": config.feature_ai_enabled,
                    "feature_knowledge_graph": config.feature_knowledge_graph,
                    "feature_report_generation": config.feature_report_generation,
                    "feature_webhook": config.feature_webhook,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantConfigResponse::from(config)))
}

// ── Get tenant usage ──────────────────────────────────────────────────

pub(crate) async fn get_tenant_usage(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<TenantUsageResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let usage = state
        .tenant_service
        .get_usage(id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantUsageResponse::from(usage)))
}

// ── Refresh tenant usage ──────────────────────────────────────────────

pub(crate) async fn refresh_tenant_usage(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<TenantUsageResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_tenants_manage(&state, user.tenant_id, user.id).await?;

    let usage = state
        .tenant_service
        .refresh_usage(id)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::super::extract_audit_meta(&headers, addr);

    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "tenants.usage.refresh".to_string(),
                resource: "tenant_usage".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(serde_json::json!({
                    "current_users": usage.current_users,
                    "current_articles": usage.current_articles,
                    "current_sources": usage.current_sources,
                    "current_storage_mb": usage.current_storage_mb,
                    "current_reports_this_month": usage.current_reports_this_month,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(TenantUsageResponse::from(usage)))
}
