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
use url::{Host, Url};

const SOURCE_NAME_MAX_LEN: usize = 100;
const SOURCE_URL_MAX_LEN: usize = 2048;
const SOURCE_SCHEDULE_MAX_LEN: usize = 128;
const SOURCE_PRIORITY_MIN: i32 = 0;
const SOURCE_PRIORITY_MAX: i32 = 100;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sources).post(create_source))
        .route("/{id}", get(get_source))
        .route("/{id}/fetch", post(trigger_fetch))
}

fn allow_internal_source_urls() -> bool {
    // Local dev/test environments may need to ingest from localhost fixtures.
    // In production, deny internal/loopback by default to reduce SSRF risk.
    std::env::var_os("PRODUCTION").is_none()
}

fn is_internal_host<S: AsRef<str>>(host: &Host<S>) -> bool {
    fn is_internal_ip(ip: std::net::IpAddr) -> bool {
        match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_private()
                    || v4.is_loopback()
                    || v4.is_link_local()
                    || v4.is_multicast()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
            }
            std::net::IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.is_unique_local()
                    || v6.is_unicast_link_local()
                    || v6.is_multicast()
                    || v6.is_unspecified()
            }
        }
    }

    match host {
        Host::Domain(domain) => {
            let lower = domain.as_ref().trim().to_ascii_lowercase();
            lower == "localhost" || lower.ends_with(".localhost")
        }
        Host::Ipv4(ip) => is_internal_ip(std::net::IpAddr::V4(*ip)),
        Host::Ipv6(ip) => is_internal_ip(std::net::IpAddr::V6(*ip)),
    }
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

fn validate_source_url(raw: &str, allow_internal: bool) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation_with_code(
            "INVALID_URL",
            "URL cannot be empty",
        ));
    }
    if trimmed.len() > SOURCE_URL_MAX_LEN {
        return Err(AppError::validation_with_code(
            "INVALID_URL",
            format!("URL too long (max {SOURCE_URL_MAX_LEN})"),
        ));
    }

    let url = Url::parse(trimmed).map_err(|_| {
        AppError::validation_with_code("INVALID_URL", "URL must be a valid http/https URL")
    })?;

    match url.scheme() {
        "http" | "https" => {}
        _ => {
            return Err(AppError::validation_with_code(
                "INVALID_URL",
                "URL scheme must be http or https",
            ))
        }
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::validation_with_code(
            "INVALID_URL",
            "URL must not contain embedded credentials",
        ));
    }

    let host = url.host().ok_or_else(|| {
        AppError::validation_with_code("INVALID_URL", "URL must include a host")
    })?;

    if !allow_internal && is_internal_host(&host) {
        return Err(AppError::validation_with_code(
            "SSRF_BLOCKED",
            "Internal/loopback URLs are not allowed in production",
        ));
    }

    Ok(trimmed.to_string())
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
    Json(mut input): Json<CreateSourceRequest>,
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
    input.url = validate_source_url(&input.url, allow_internal_source_urls())?;
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

    #[test]
    fn validate_source_url_allows_localhost_in_non_production() {
        let url = validate_source_url("http://127.0.0.1:1234/rss.xml", true).unwrap();
        assert_eq!(url, "http://127.0.0.1:1234/rss.xml");
    }

    #[test]
    fn validate_source_url_blocks_localhost_in_production() {
        let err = validate_source_url("http://127.0.0.1:1234/rss.xml", false).unwrap_err();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
        assert_eq!(err.body.code.as_deref(), Some("SSRF_BLOCKED"));
    }

    #[test]
    fn validate_source_url_rejects_non_http_scheme() {
        let err = validate_source_url("file:///etc/passwd", true).unwrap_err();
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
