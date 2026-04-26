use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    middleware,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use law_eye_common::Error;
use law_eye_core::UpdateChannelInput;
use law_eye_db::{Channel, ChannelAccessPolicy, CreateAuditLog, CreateChannel};
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
    Router::new().route("/", get(list_channels))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_admin_channels))
        .route("/", post(create_channel))
        .route("/{id}", patch(update_channel))
        .route(
            "/{id}/policies",
            get(list_channel_policies).post(create_channel_policy),
        )
        .route(
            "/{id}/policies/{policy_id}",
            patch(update_channel_policy).delete(delete_channel_policy),
        )
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission("channels:manage")))
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListChannelsQuery {
    pub include_inactive: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateChannelRequest {
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub linked_category_id: Option<Uuid>,
    pub visibility: Option<String>,
    pub is_active: Option<bool>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateChannelRequest {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub linked_category_id: Option<Uuid>,
    pub clear_linked_category: Option<bool>,
    pub visibility: Option<String>,
    pub is_active: Option<bool>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ChannelResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub linked_category_id: Option<Uuid>,
    pub visibility: String,
    pub is_active: bool,
    pub metadata: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ChannelPolicyResponse {
    pub id: Uuid,
    pub subject_type: String,
    pub subject_key: String,
    pub can_read: bool,
    pub can_read_source_meta: bool,
    pub can_access_reports: bool,
    pub priority: i32,
}

impl From<Channel> for ChannelResponse {
    fn from(value: Channel) -> Self {
        Self {
            id: value.id,
            slug: value.slug,
            name: value.name,
            description: value.description,
            linked_category_id: value.linked_category_id,
            visibility: value.visibility,
            is_active: value.is_active,
            metadata: value.metadata,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<ChannelAccessPolicy> for ChannelPolicyResponse {
    fn from(value: ChannelAccessPolicy) -> Self {
        Self {
            id: value.id,
            subject_type: value.subject_type,
            subject_key: value.subject_key,
            can_read: value.can_read,
            can_read_source_meta: value.can_read_source_meta,
            can_access_reports: value.can_access_reports,
            priority: value.priority,
        }
    }
}

#[utoipa::path(get, path = "/api/v1/channels", params(ListChannelsQuery), security(("session" = [])), responses((status = 200, body = [ChannelResponse])), tag = "channels")]
pub(crate) async fn list_channels(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<ChannelResponse>>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .channel_service
        .list_active(current_user.tenant_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(items.into_iter().map(ChannelResponse::from).collect()))
}

#[utoipa::path(get, path = "/api/v1/admin/channels", params(ListChannelsQuery), security(("session" = [])), responses((status = 200, body = [ChannelResponse])), tag = "channels")]
pub(crate) async fn list_admin_channels(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListChannelsQuery>,
) -> ApiResult<Json<Vec<ChannelResponse>>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .channel_service
        .list_admin(
            current_user.tenant_id,
            query.include_inactive.unwrap_or(true),
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(items.into_iter().map(ChannelResponse::from).collect()))
}

#[utoipa::path(post, path = "/api/v1/admin/channels", request_body = CreateChannelRequest, security(("session" = [])), responses((status = 200, body = ChannelResponse)), tag = "channels")]
pub(crate) async fn create_channel(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateChannelRequest>,
) -> ApiResult<Json<ChannelResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let channel = state
        .channel_service
        .create(
            current_user.tenant_id,
            CreateChannel {
                slug: req.slug,
                name: req.name,
                description: req.description,
                linked_category_id: req.linked_category_id,
                visibility: req.visibility,
                is_active: req.is_active,
                metadata: req.metadata,
            },
        )
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state.audit_service.log(current_user.tenant_id, CreateAuditLog { user_id: Some(current_user.id), action: "channels.create".to_string(), resource: "channels".to_string(), resource_id: Some(channel.id), old_value: None, new_value: Some(json!({"slug": channel.slug, "name": channel.name, "visibility": channel.visibility})), ip_address, user_agent }).await.map_err(AppError::from)?;
    Ok(Json(channel.into()))
}

#[utoipa::path(patch, path = "/api/v1/admin/channels/{id}", params(("id" = Uuid, Path, description = "Channel ID")), request_body = UpdateChannelRequest, security(("session" = [])), responses((status = 200, body = ChannelResponse)), tag = "channels")]
pub(crate) async fn update_channel(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateChannelRequest>,
) -> ApiResult<Json<ChannelResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let linked_category_id = if req.clear_linked_category.unwrap_or(false) {
        Some(None)
    } else {
        req.linked_category_id.map(Some)
    };
    let channel = state
        .channel_service
        .update(
            current_user.tenant_id,
            id,
            UpdateChannelInput {
                slug: req.slug,
                name: req.name,
                description: req.description,
                linked_category_id,
                visibility: req.visibility,
                is_active: req.is_active,
                metadata: req.metadata,
            },
        )
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state.audit_service.log(current_user.tenant_id, CreateAuditLog { user_id: Some(current_user.id), action: "channels.update".to_string(), resource: "channels".to_string(), resource_id: Some(channel.id), old_value: None, new_value: Some(json!({"slug": channel.slug, "name": channel.name, "visibility": channel.visibility, "is_active": channel.is_active})), ip_address, user_agent }).await.map_err(AppError::from)?;
    Ok(Json(channel.into()))
}

#[utoipa::path(get, path = "/api/v1/admin/channels/{id}/policies", params(("id" = Uuid, Path, description = "Channel ID")), security(("session" = [])), responses((status = 200, body = [ChannelPolicyResponse])), tag = "channels")]
pub(crate) async fn list_channel_policies(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<ChannelPolicyResponse>>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .channel_service
        .list_policies(current_user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(
        items.into_iter().map(ChannelPolicyResponse::from).collect(),
    ))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateChannelPolicyRequest {
    pub subject_type: String,
    pub subject_key: String,
    pub can_read: Option<bool>,
    pub can_read_source_meta: Option<bool>,
    pub can_access_reports: Option<bool>,
    pub priority: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateChannelPolicyRequest {
    pub subject_type: Option<String>,
    pub subject_key: Option<String>,
    pub can_read: Option<bool>,
    pub can_read_source_meta: Option<bool>,
    pub can_access_reports: Option<bool>,
    pub priority: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

fn validate_subject_type(value: &str) -> Result<(), AppError> {
    if !matches!(value, "role" | "user" | "group" | "tier") {
        return Err(AppError::validation(
            "subject_type must be 'role' / 'user' / 'group' / 'tier'",
        ));
    }
    Ok(())
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/channels/{id}/policies",
    params(("id" = Uuid, Path, description = "Channel ID")),
    request_body = CreateChannelPolicyRequest,
    security(("session" = [])),
    responses((status = 200, body = ChannelPolicyResponse)),
    tag = "channels"
)]
pub(crate) async fn create_channel_policy(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(channel_id): Path<Uuid>,
    ApiJson(req): ApiJson<CreateChannelPolicyRequest>,
) -> ApiResult<Json<ChannelPolicyResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    validate_subject_type(&req.subject_type)?;
    if req.subject_key.trim().is_empty() {
        return Err(AppError::validation("subject_key cannot be empty"));
    }

    let tenant_id = current_user.tenant_id;
    let user_id = current_user.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let policy = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let req = req;

        Box::pin(async move {
            let channel_exists: Option<Uuid> = sqlx::query_scalar(
                "SELECT id FROM channels WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(channel_id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
            if channel_exists.is_none() {
                return Err(Error::NotFound(format!("Channel {} not found", channel_id)));
            }

            let policy = sqlx::query_as::<_, ChannelAccessPolicy>(
                r#"
                INSERT INTO channel_access_policies (
                    tenant_id, channel_id, subject_type, subject_key,
                    can_read, can_read_source_meta, can_access_reports,
                    priority, metadata
                )
                VALUES ($1, $2, $3, $4, COALESCE($5, true), COALESCE($6, false), COALESCE($7, false), COALESCE($8, 100), COALESCE($9, '{}'::jsonb))
                RETURNING *
                "#,
            )
            .bind(tenant_id)
            .bind(channel_id)
            .bind(&req.subject_type)
            .bind(req.subject_key.trim())
            .bind(req.can_read)
            .bind(req.can_read_source_meta)
            .bind(req.can_access_reports)
            .bind(req.priority)
            .bind(&req.metadata)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "channels.policy.create".to_string(),
                        resource: "channel_access_policies".to_string(),
                        resource_id: Some(policy.id),
                        old_value: None,
                        new_value: Some(json!({
                            "channel_id": channel_id,
                            "subject_type": policy.subject_type,
                            "subject_key": policy.subject_key,
                            "can_read": policy.can_read,
                            "can_read_source_meta": policy.can_read_source_meta,
                            "can_access_reports": policy.can_access_reports,
                            "priority": policy.priority,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<ChannelAccessPolicy, Error>(policy)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(policy.into()))
}

#[utoipa::path(
    patch,
    path = "/api/v1/admin/channels/{id}/policies/{policy_id}",
    params(
        ("id" = Uuid, Path, description = "Channel ID"),
        ("policy_id" = Uuid, Path, description = "Policy ID")
    ),
    request_body = UpdateChannelPolicyRequest,
    security(("session" = [])),
    responses((status = 200, body = ChannelPolicyResponse)),
    tag = "channels"
)]
pub(crate) async fn update_channel_policy(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path((channel_id, policy_id)): Path<(Uuid, Uuid)>,
    ApiJson(req): ApiJson<UpdateChannelPolicyRequest>,
) -> ApiResult<Json<ChannelPolicyResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    if let Some(st) = req.subject_type.as_deref() {
        validate_subject_type(st)?;
    }
    if let Some(sk) = req.subject_key.as_deref() {
        if sk.trim().is_empty() {
            return Err(AppError::validation("subject_key cannot be empty"));
        }
    }

    let tenant_id = current_user.tenant_id;
    let user_id = current_user.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let policy = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let req = req;

        Box::pin(async move {
            let policy = sqlx::query_as::<_, ChannelAccessPolicy>(
                r#"
                UPDATE channel_access_policies
                SET subject_type = COALESCE($3, subject_type),
                    subject_key = COALESCE($4, subject_key),
                    can_read = COALESCE($5, can_read),
                    can_read_source_meta = COALESCE($6, can_read_source_meta),
                    can_access_reports = COALESCE($7, can_access_reports),
                    priority = COALESCE($8, priority),
                    metadata = COALESCE($9, metadata),
                    updated_at = NOW()
                WHERE id = $1 AND channel_id = $2
                RETURNING *
                "#,
            )
            .bind(policy_id)
            .bind(channel_id)
            .bind(req.subject_type.as_deref())
            .bind(req.subject_key.as_deref().map(str::trim))
            .bind(req.can_read)
            .bind(req.can_read_source_meta)
            .bind(req.can_access_reports)
            .bind(req.priority)
            .bind(&req.metadata)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Policy {} not found", policy_id)))?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "channels.policy.update".to_string(),
                        resource: "channel_access_policies".to_string(),
                        resource_id: Some(policy.id),
                        old_value: None,
                        new_value: Some(json!({
                            "subject_type": policy.subject_type,
                            "subject_key": policy.subject_key,
                            "can_read": policy.can_read,
                            "can_read_source_meta": policy.can_read_source_meta,
                            "can_access_reports": policy.can_access_reports,
                            "priority": policy.priority,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<ChannelAccessPolicy, Error>(policy)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(policy.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/admin/channels/{id}/policies/{policy_id}",
    params(
        ("id" = Uuid, Path, description = "Channel ID"),
        ("policy_id" = Uuid, Path, description = "Policy ID")
    ),
    security(("session" = [])),
    responses((status = 200, description = "Policy deleted")),
    tag = "channels"
)]
pub(crate) async fn delete_channel_policy(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path((channel_id, policy_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<serde_json::Value>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let tenant_id = current_user.tenant_id;
    let user_id = current_user.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let result =
                sqlx::query("DELETE FROM channel_access_policies WHERE id = $1 AND channel_id = $2")
                    .bind(policy_id)
                    .bind(channel_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
            if result.rows_affected() == 0 {
                return Err(Error::NotFound(format!("Policy {} not found", policy_id)));
            }

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "channels.policy.delete".to_string(),
                        resource: "channel_access_policies".to_string(),
                        resource_id: Some(policy_id),
                        old_value: Some(json!({ "channel_id": channel_id })),
                        new_value: None,
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<(), Error>(())
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(json!({ "success": true, "id": policy_id })))
}
