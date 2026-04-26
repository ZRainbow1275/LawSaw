use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    middleware,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use law_eye_core::{BannerTargetInput, CreateBannerInput, UpdateBannerInput};
use law_eye_db::{Banner, BannerTarget, CreateAuditLog};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::middleware::{RequirePermission, RequiredPermission};
use crate::state::AppState;
use crate::{ApiJson, ApiResult, AppError};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/active", get(list_active_banners))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_admin_banners))
        .route("/", post(create_banner))
        .route("/{id}", patch(update_banner))
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission("banners:manage")))
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ActiveBannersQuery {
    pub channel_ids: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListBannersQuery {
    pub include_archived: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema, Clone)]
pub struct BannerTargetRequest {
    pub target_type: String,
    pub target_channel_id: Option<Uuid>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateBannerRequest {
    pub title: String,
    pub body: Option<String>,
    pub image_url: Option<String>,
    pub cta_label: Option<String>,
    pub cta_url: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub starts_at: Option<chrono::DateTime<chrono::Utc>>,
    pub ends_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
    pub targets: Vec<BannerTargetRequest>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateBannerRequest {
    pub title: Option<String>,
    pub body: Option<String>,
    pub image_url: Option<String>,
    pub cta_label: Option<String>,
    pub cta_url: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub starts_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub ends_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub metadata: Option<serde_json::Value>,
    pub archived_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub targets: Option<Vec<BannerTargetRequest>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct BannerTargetResponse {
    pub id: Uuid,
    pub target_type: String,
    pub target_channel_id: Option<Uuid>,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct BannerResponse {
    pub id: Uuid,
    pub title: String,
    pub body: Option<String>,
    pub image_url: Option<String>,
    pub cta_label: Option<String>,
    pub cta_url: Option<String>,
    pub status: String,
    pub priority: i32,
    pub starts_at: Option<chrono::DateTime<chrono::Utc>>,
    pub ends_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub archived_at: Option<chrono::DateTime<chrono::Utc>>,
    pub targets: Vec<BannerTargetResponse>,
}

impl From<BannerTarget> for BannerTargetResponse {
    fn from(value: BannerTarget) -> Self {
        Self {
            id: value.id,
            target_type: value.target_type,
            target_channel_id: value.target_channel_id,
            sort_order: value.sort_order,
        }
    }
}

fn to_banner_response(banner: Banner, targets: Vec<BannerTarget>) -> BannerResponse {
    BannerResponse {
        id: banner.id,
        title: banner.title,
        body: banner.body,
        image_url: banner.image_url,
        cta_label: banner.cta_label,
        cta_url: banner.cta_url,
        status: banner.status,
        priority: banner.priority,
        starts_at: banner.starts_at,
        ends_at: banner.ends_at,
        created_at: banner.created_at,
        updated_at: banner.updated_at,
        archived_at: banner.archived_at,
        targets: targets
            .into_iter()
            .map(BannerTargetResponse::from)
            .collect(),
    }
}

#[utoipa::path(get, path = "/api/v1/banners/active", params(ActiveBannersQuery), security(("session" = [])), responses((status = 200, body = [BannerResponse])), tag = "banners")]
pub(crate) async fn list_active_banners(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ActiveBannersQuery>,
) -> ApiResult<Json<Vec<BannerResponse>>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let channel_ids = query
        .channel_ids
        .as_deref()
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(|v| {
                    Uuid::parse_str(v)
                        .map_err(|_| AppError::validation("Invalid channel_ids query"))
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?
        .unwrap_or_default();
    let items = state
        .banner_service
        .list_active(current_user.tenant_id, &channel_ids)
        .await
        .map_err(AppError::from)?;
    Ok(Json(
        items
            .into_iter()
            .map(|item| to_banner_response(item.banner, item.targets))
            .collect(),
    ))
}

#[utoipa::path(get, path = "/api/v1/admin/banners", params(ListBannersQuery), security(("session" = [])), responses((status = 200, body = [BannerResponse])), tag = "banners")]
pub(crate) async fn list_admin_banners(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListBannersQuery>,
) -> ApiResult<Json<Vec<BannerResponse>>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .banner_service
        .list_admin(
            current_user.tenant_id,
            query.include_archived.unwrap_or(false),
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(
        items
            .into_iter()
            .map(|item| to_banner_response(item.banner, item.targets))
            .collect(),
    ))
}

#[utoipa::path(post, path = "/api/v1/admin/banners", request_body = CreateBannerRequest, security(("session" = [])), responses((status = 200, body = BannerResponse)), tag = "banners")]
pub(crate) async fn create_banner(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateBannerRequest>,
) -> ApiResult<Json<BannerResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let item = state
        .banner_service
        .create(
            current_user.tenant_id,
            CreateBannerInput {
                title: req.title,
                body: req.body,
                image_url: req.image_url,
                cta_label: req.cta_label,
                cta_url: req.cta_url,
                status: req.status,
                priority: req.priority,
                starts_at: req.starts_at,
                ends_at: req.ends_at,
                metadata: req.metadata,
                created_by: Some(current_user.id),
                targets: req
                    .targets
                    .into_iter()
                    .map(|target| BannerTargetInput {
                        target_type: target.target_type,
                        target_channel_id: target.target_channel_id,
                        sort_order: target.sort_order,
                    })
                    .collect(),
            },
        )
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state.audit_service.log(current_user.tenant_id, CreateAuditLog { user_id: Some(current_user.id), action: "banners.create".to_string(), resource: "banners".to_string(), resource_id: Some(item.banner.id), old_value: None, new_value: Some(json!({"title": item.banner.title, "status": item.banner.status, "priority": item.banner.priority})), ip_address, user_agent }).await.map_err(AppError::from)?;
    Ok(Json(to_banner_response(item.banner, item.targets)))
}

#[utoipa::path(patch, path = "/api/v1/admin/banners/{id}", params(("id" = Uuid, Path, description = "Banner ID")), request_body = UpdateBannerRequest, security(("session" = [])), responses((status = 200, body = BannerResponse)), tag = "banners")]
pub(crate) async fn update_banner(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateBannerRequest>,
) -> ApiResult<Json<BannerResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let item = state
        .banner_service
        .update(
            current_user.tenant_id,
            id,
            UpdateBannerInput {
                title: req.title,
                body: req.body,
                image_url: req.image_url,
                cta_label: req.cta_label,
                cta_url: req.cta_url,
                status: req.status,
                priority: req.priority,
                starts_at: req.starts_at,
                ends_at: req.ends_at,
                metadata: req.metadata,
                archived_at: req.archived_at,
                targets: req.targets.map(|targets| {
                    targets
                        .into_iter()
                        .map(|target| BannerTargetInput {
                            target_type: target.target_type,
                            target_channel_id: target.target_channel_id,
                            sort_order: target.sort_order,
                        })
                        .collect()
                }),
            },
        )
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state.audit_service.log(current_user.tenant_id, CreateAuditLog { user_id: Some(current_user.id), action: "banners.update".to_string(), resource: "banners".to_string(), resource_id: Some(item.banner.id), old_value: None, new_value: Some(json!({"title": item.banner.title, "status": item.banner.status, "priority": item.banner.priority, "archived_at": item.banner.archived_at})), ip_address, user_agent }).await.map_err(AppError::from)?;
    Ok(Json(to_banner_response(item.banner, item.targets)))
}
