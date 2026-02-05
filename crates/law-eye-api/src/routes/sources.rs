use axum::{
    extract::ConnectInfo,
    extract::{Path, State},
    http::HeaderMap,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_db::{CreateAuditLog, CreateSource};
use law_eye_queue::IngestTask;
use serde_json::Value;
use std::net::SocketAddr;
use std::time::Duration;

const SOURCE_NAME_MAX_LEN: usize = 100;
const SOURCE_URL_MAX_LEN: usize = 2048;
const SOURCE_SCHEDULE_MAX_LEN: usize = 128;
const SOURCE_PRIORITY_MIN: i32 = 0;
const SOURCE_PRIORITY_MAX: i32 = 100;
const SOURCE_LIST_DEFAULT_LIMIT: i64 = 100;
const SOURCE_LIST_MAX_LIMIT: i64 = 1000;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(get_source_stats))
        .route("/", get(list_sources).post(create_source))
        .route("/{id}", get(get_source).delete(delete_source))
        .route("/{id}/restore", post(restore_source))
        .route("/{id}/fetch", post(trigger_fetch))
}

fn validate_source_name(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("Source name cannot be empty"));
    }
    if trimmed.len() > SOURCE_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "Source name too long (max {SOURCE_NAME_MAX_LEN})"
        )));
    }
    Ok(trimmed.to_string())
}

async fn validate_source_url(raw: &str, allow_internal: bool) -> Result<String, AppError> {
    let policy = OutboundUrlPolicy::http_and_https(allow_internal)
        .with_max_len(SOURCE_URL_MAX_LEN)
        .with_dns_lookup_timeout(Duration::from_secs(2));

    let url = validate_outbound_url(raw, &policy)
        .await
        .map_err(|err| AppError::validation_with_code(err.code(), err.to_string()))?;

    Ok(url.to_string())
}

fn validate_source_schedule(schedule: Option<String>) -> Result<Option<String>, AppError> {
    let Some(schedule) = schedule else {
        return Ok(None);
    };
    let trimmed = schedule.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > SOURCE_SCHEDULE_MAX_LEN {
        return Err(AppError::validation(format!(
            "Schedule too long (max {SOURCE_SCHEDULE_MAX_LEN})"
        )));
    }
    Ok(Some(trimmed))
}

fn validate_source_priority(priority: Option<i32>) -> Result<Option<i32>, AppError> {
    let Some(priority) = priority else {
        return Ok(None);
    };
    if !(SOURCE_PRIORITY_MIN..=SOURCE_PRIORITY_MAX).contains(&priority) {
        return Err(AppError::validation(format!(
            "Priority must be between {SOURCE_PRIORITY_MIN} and {SOURCE_PRIORITY_MAX}"
        )));
    }
    Ok(Some(priority))
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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ListSourcesParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// Cursor for keyset pagination (base64url-encoded JSON).
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceListResponse {
    pub data: Vec<SourceResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceStatsResponse {
    pub total: i64,
    pub active_count: i64,
    pub error_count: i64,
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
#[serde(deny_unknown_fields)]
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

#[derive(Debug, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

/// Source stats (total/active/error)
#[utoipa::path(
    get,
    path = "/api/v1/sources/stats",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source stats", body = SourceStatsResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_source_stats(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<SourceStatsResponse>> {
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

    let stats = state
        .source_service
        .stats(user.tenant_id)
        .await
        .map_err(|e| AppError::internal_with_code("STATS_ERROR", e.to_string()))?;

    Ok(Json(SourceStatsResponse {
        total: stats.total,
        active_count: stats.active_count,
        error_count: stats.error_count,
    }))
}

/// List sources
#[utoipa::path(
    get,
    path = "/api/v1/sources",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 100, max 1000)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored.")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Sources", body = SourceListResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_sources(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<ListSourcesParams>,
) -> ApiResult<Json<SourceListResponse>> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct SourceCursor {
        priority: i32,
        name: String,
        id: Uuid,
    }

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

    let mut limit = params.limit.unwrap_or(SOURCE_LIST_DEFAULT_LIMIT);
    if limit < 1 {
        return Err(AppError::validation("limit must be >= 1"));
    }
    limit = limit.min(SOURCE_LIST_MAX_LIMIT);

    let offset = params.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let cursor = params
        .cursor
        .as_deref()
        .map(crate::pagination::decode_cursor::<SourceCursor>)
        .transpose()?;

    let mut next_cursor: Option<String> = None;
    let sources = if let Some(cursor) = cursor {
        let fetch_limit = limit.saturating_add(1);
        let mut items = state
            .source_service
            .list_cursor(
                user.tenant_id,
                fetch_limit,
                cursor.priority,
                &cursor.name,
                cursor.id,
            )
            .await
            .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

        if items.len() as i64 > limit {
            items.truncate(limit as usize);
            if let Some(last) = items.last() {
                next_cursor = Some(crate::pagination::encode_cursor(&SourceCursor {
                    priority: last.priority,
                    name: last.name.clone(),
                    id: last.id,
                })?);
            }
        }

        items
    } else {
        state
            .source_service
            .list(user.tenant_id, limit, offset)
            .await
            .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?
    };

    let total = state
        .source_service
        .count(user.tenant_id)
        .await
        .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;

    Ok(Json(SourceListResponse {
        data: sources.into_iter().map(SourceResponse::from).collect(),
        total,
        limit,
        offset: if params.cursor.is_some() { 0 } else { offset },
        next_cursor,
    }))
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

#[utoipa::path(
    delete,
    path = "/api/v1/sources/{id}",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source deleted", body = MessageResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn delete_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<MessageResponse>> {
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let source_service = state.source_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = source_service.get_by_id_tx(tenant_id, tx, id).await?;
            let after = source_service.delete_tx(tenant_id, tx, id).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.delete".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "name": before.name,
                            "url": before.url,
                            "type": before.source_type,
                            "priority": before.priority,
                            "schedule": before.schedule,
                            "is_active": before.is_active,
                        })),
                        new_value: Some(serde_json::json!({
                            "deleted": true,
                            "is_active": after.is_active,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<(), law_eye_common::Error>(())
        })
    })
    .await
    .map_err(|e| match e {
        Error::NotFound(_) | Error::Validation(_) | Error::Conflict(_) => AppError::from(e),
        _ => AppError::internal_with_code("DELETE_ERROR", e.to_string()),
    })?;

    Ok(Json(MessageResponse {
        message: "Source deleted".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/sources/{id}/restore",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source restored", body = SourceResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn restore_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SourceResponse>> {
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

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let source = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let source_service = state.source_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = source_service.get_by_id_any_tx(tenant_id, tx, id).await?;
            let before_deleted_at: Option<DateTime<Utc>> =
                sqlx::query_scalar("SELECT deleted_at FROM sources WHERE id = $1")
                    .bind(id)
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
            let after = source_service.restore_tx(tenant_id, tx, id).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.restore".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "deleted": before_deleted_at.is_some(),
                            "is_active": before.is_active,
                        })),
                        new_value: Some(serde_json::json!({
                            "restored": true,
                            "is_active": after.is_active,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(after)
        })
    })
    .await
    .map_err(|e| match e {
        Error::NotFound(_) | Error::Validation(_) | Error::Conflict(_) => AppError::from(e),
        _ => AppError::internal_with_code("RESTORE_ERROR", e.to_string()),
    })?;

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
    ApiJson(mut input): ApiJson<CreateSourceRequest>,
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

    input.name = validate_source_name(&input.name)?;
    input.url = validate_source_url(&input.url, state.allow_internal_source_urls).await?;
    input.schedule = validate_source_schedule(input.schedule)?;
    input.priority = validate_source_priority(input.priority)?;

    match input.source_type.as_str() {
        "rss" => {}
        "spider" => validate_spider_config(&input.config)?,
        "api" => {
            return Err(AppError::bad_request_with_code(
                "UNSUPPORTED_SOURCE_TYPE",
                "API source type is not supported yet (worker does not implement it)",
            ));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn validate_source_url_allows_localhost_in_non_production() {
        let url = validate_source_url("http://127.0.0.1:1234/rss.xml", true)
            .await
            .unwrap();
        assert_eq!(url, "http://127.0.0.1:1234/rss.xml");
    }

    #[tokio::test]
    async fn validate_source_url_blocks_localhost_in_production() {
        let err = validate_source_url("http://127.0.0.1:1234/rss.xml", false)
            .await
            .unwrap_err();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
        assert_eq!(err.body.code.as_deref(), Some("SSRF_BLOCKED"));
    }

    #[tokio::test]
    async fn validate_source_url_rejects_non_http_scheme() {
        let err = validate_source_url("file:///etc/passwd", true)
            .await
            .unwrap_err();
        assert_eq!(err.body.code.as_deref(), Some("INVALID_URL"));
    }
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
