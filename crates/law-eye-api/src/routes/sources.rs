use axum::{
    extract::ConnectInfo,
    extract::{Path, State},
    http::HeaderMap,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};
use law_eye_db::{CreateAuditLog, CreateSource};
use law_eye_queue::IngestTask;
use serde_json::Value;
use std::net::SocketAddr;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sources).post(create_source))
        .route("/{id}", get(get_source))
        .route("/{id}/fetch", post(trigger_fetch))
}

fn validate_spider_config(config: &Value) -> Result<(), AppError> {
    let obj = config
        .as_object()
        .ok_or_else(|| AppError::validation("Spider config must be a JSON object"))?;

    for field in ["list_selector", "title_selector", "link_selector"] {
        let value = obj
            .get(field)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty());

        if value.is_none() {
            return Err(AppError::validation(format!(
                "Spider config missing required field: {}",
                field
            )));
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SourceResponse {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: i32,
    pub is_active: bool,
    pub last_fetch: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Source> for SourceResponse {
    fn from(source: law_eye_db::Source) -> Self {
        Self {
            id: source.id,
            name: source.name,
            url: source.url,
            source_type: source.source_type,
            config: source.config,
            schedule: source.schedule,
            priority: source.priority,
            is_active: source.is_active,
            last_fetch: source.last_fetch,
            last_error: source.last_error,
            created_at: source.created_at,
            updated_at: source.updated_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateSourceRequest {
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: Option<i32>,
}

impl From<CreateSourceRequest> for CreateSource {
    fn from(request: CreateSourceRequest) -> Self {
        Self {
            name: request.name,
            url: request.url,
            source_type: request.source_type,
            config: request.config,
            schedule: request.schedule,
            priority: request.priority,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EnqueueResponse {
    pub message: String,
}

/// List sources
#[utoipa::path(
    get,
    path = "/api/v1/sources",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Sources", body = Vec<SourceResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_sources(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<SourceResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "sources:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let sources = state
        .source_service
        .list(user.tenant_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(
        sources
            .into_iter()
            .map(SourceResponse::from)
            .collect::<Vec<_>>(),
    ))
}

/// Get source by id
#[utoipa::path(
    get,
    path = "/api/v1/sources/{id}",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source", body = SourceResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SourceResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "sources:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let source = state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(SourceResponse::from(source)))
}

/// Create source (admin only)
#[utoipa::path(
    post,
    path = "/api/v1/sources",
    request_body = CreateSourceRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 201, description = "Source created", body = SourceResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn create_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(input): Json<CreateSourceRequest>,
) -> ApiResult<(StatusCode, Json<SourceResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    match input.source_type.as_str() {
        "rss" => {}
        "spider" => validate_spider_config(&input.config)?,
        "api" => {
            return Err(AppError::validation(
                "API source type is not supported yet (worker does not implement it)",
            ))
        }
        _ => return Err(AppError::validation("Invalid source type")),
    }

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let input_for_db: CreateSource = input.into();

    let source = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let source_service = state.source_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let input_for_db = input_for_db.clone();

        Box::pin(async move {
            let source = source_service
                .create_tx(tenant_id, tx, input_for_db)
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.create".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(source.id),
                        old_value: None,
                        new_value: Some(serde_json::json!({
                            "id": source.id,
                            "name": source.name,
                            "url": source.url,
                            "type": source.source_type,
                            "priority": source.priority,
                            "schedule": source.schedule,
                            "is_active": source.is_active,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(source)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok((StatusCode::CREATED, Json(SourceResponse::from(source))))
}

/// Trigger ingest fetch (admin only)
#[utoipa::path(
    post,
    path = "/api/v1/sources/{id}/fetch",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 202, description = "Task enqueued", body = EnqueueResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn trigger_fetch(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<EnqueueResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let source = state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let task = IngestTask {
        tenant_id: user.tenant_id,
        source_id: source.id,
        source_type: source.source_type,
        url: source.url,
        config: source.config,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ingest", task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "sources.fetch.enqueue".to_string(),
                resource: "sources".to_string(),
                resource_id: Some(source.id),
                old_value: None,
                new_value: Some(serde_json::json!({
                    "queue": "queue:ingest",
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(EnqueueResponse {
            message: "Ingest task enqueued".to_string(),
        }),
    ))
}
