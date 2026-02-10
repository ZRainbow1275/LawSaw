use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, patch, post},
    Json, Router,
};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_core::{CreateWebhookEndpointInput, UpdateWebhookEndpointInput, WebhookEndpoint};
use law_eye_db::CreateAuditLog;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeSet, net::SocketAddr};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};

const WEBHOOK_NAME_MAX_LEN: usize = 120;
const WEBHOOK_URL_MAX_LEN: usize = 2048;
const WEBHOOK_SECRET_MAX_LEN: usize = 512;
const WEBHOOK_EVENTS_MAX: usize = 64;
const WEBHOOK_EVENT_NAME_MAX_LEN: usize = 80;
const WEBHOOK_LIST_DEFAULT_LIMIT: i64 = 50;
const WEBHOOK_LIST_MAX_LIMIT: i64 = 500;
const WEBHOOK_TIMEOUT_MIN_MS: i32 = 1_000;
const WEBHOOK_TIMEOUT_MAX_MS: i32 = 60_000;
const WEBHOOK_TIMEOUT_DEFAULT_MS: i32 = 10_000;
const WEBHOOK_MAX_RETRIES_MIN: i32 = 0;
const WEBHOOK_MAX_RETRIES_MAX: i32 = 20;
const WEBHOOK_MAX_RETRIES_DEFAULT: i32 = 5;
const WEBHOOK_TEST_EVENT_TYPE: &str = "webhooks.test";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_webhooks))
        .route("/", post(create_webhook))
        .route("/{id}", patch(update_webhook))
        .route("/{id}", delete(delete_webhook))
        .route("/{id}/test", post(test_webhook))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ListWebhooksQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateWebhookRequest {
    pub name: String,
    pub url: String,
    pub signing_secret: String,
    pub enabled: Option<bool>,
    pub events: Vec<String>,
    pub timeout_ms: Option<i32>,
    pub max_retries: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateWebhookRequest {
    pub name: Option<String>,
    pub url: Option<String>,
    pub signing_secret: Option<String>,
    pub enabled: Option<bool>,
    pub events: Option<Vec<String>>,
    pub timeout_ms: Option<i32>,
    pub max_retries: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TestWebhookRequest {
    pub event_type: Option<String>,
    pub payload: Option<Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct WebhookEndpointResponse {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub events: Vec<String>,
    pub timeout_ms: i32,
    pub max_retries: i32,
    pub created_by: Option<Uuid>,
    pub last_success_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_failure_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_status_code: Option<i32>,
    pub last_error: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct WebhookListResponse {
    pub items: Vec<WebhookEndpointResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct WebhookTestResponse {
    pub event_id: Uuid,
    pub event_type: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

async fn ensure_admin(state: &AppState, tenant_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let is_admin = state
        .user_service
        .has_permission(tenant_id, user_id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }
    Ok(())
}

fn normalize_webhook_name(raw: &str) -> Result<String, AppError> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::validation("Webhook name cannot be empty"));
    }
    if name.len() > WEBHOOK_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "Webhook name too long (max {WEBHOOK_NAME_MAX_LEN})"
        )));
    }
    Ok(name.to_string())
}

fn normalize_webhook_secret(raw: &str) -> Result<String, AppError> {
    let secret = raw.trim();
    if secret.is_empty() {
        return Err(AppError::validation(
            "Webhook signing_secret cannot be empty",
        ));
    }
    if secret.len() > WEBHOOK_SECRET_MAX_LEN {
        return Err(AppError::validation(format!(
            "Webhook signing_secret too long (max {WEBHOOK_SECRET_MAX_LEN})"
        )));
    }
    Ok(secret.to_string())
}

async fn normalize_webhook_url(state: &AppState, raw: &str) -> Result<String, AppError> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(AppError::validation("Webhook URL cannot be empty"));
    }
    if raw.len() > WEBHOOK_URL_MAX_LEN {
        return Err(AppError::validation(format!(
            "Webhook URL too long (max {WEBHOOK_URL_MAX_LEN})"
        )));
    }

    validate_webhook_url(raw, state.allow_internal_webhook_urls).await
}

async fn validate_webhook_url(
    raw: &str,
    allow_internal_webhook_urls: bool,
) -> Result<String, AppError> {
    let policy = OutboundUrlPolicy::https_or_http_internal(allow_internal_webhook_urls);
    let parsed = validate_outbound_url(raw, &policy)
        .await
        .map_err(|err| AppError::validation(format!("Invalid webhook URL: {}", err.code())))?;

    Ok(parsed.to_string())
}

fn normalize_events(events: Vec<String>) -> Result<Vec<String>, AppError> {
    if events.is_empty() {
        return Err(AppError::validation("events cannot be empty"));
    }

    let mut unique = BTreeSet::<String>::new();
    for raw in events {
        let event = raw.trim();
        if event.is_empty() {
            return Err(AppError::validation("event name cannot be empty"));
        }
        if event.len() > WEBHOOK_EVENT_NAME_MAX_LEN {
            return Err(AppError::validation(format!(
                "event name too long (max {WEBHOOK_EVENT_NAME_MAX_LEN})"
            )));
        }
        unique.insert(event.to_string());
        if unique.len() > WEBHOOK_EVENTS_MAX {
            return Err(AppError::validation(format!(
                "too many events (max {WEBHOOK_EVENTS_MAX})"
            )));
        }
    }

    Ok(unique.into_iter().collect())
}

fn validate_timeout(timeout_ms: Option<i32>) -> Result<i32, AppError> {
    let timeout = timeout_ms.unwrap_or(WEBHOOK_TIMEOUT_DEFAULT_MS);
    if !(WEBHOOK_TIMEOUT_MIN_MS..=WEBHOOK_TIMEOUT_MAX_MS).contains(&timeout) {
        return Err(AppError::validation(format!(
            "timeout_ms must be between {WEBHOOK_TIMEOUT_MIN_MS} and {WEBHOOK_TIMEOUT_MAX_MS}"
        )));
    }
    Ok(timeout)
}

fn validate_max_retries(max_retries: Option<i32>) -> Result<i32, AppError> {
    let retries = max_retries.unwrap_or(WEBHOOK_MAX_RETRIES_DEFAULT);
    if !(WEBHOOK_MAX_RETRIES_MIN..=WEBHOOK_MAX_RETRIES_MAX).contains(&retries) {
        return Err(AppError::validation(format!(
            "max_retries must be between {WEBHOOK_MAX_RETRIES_MIN} and {WEBHOOK_MAX_RETRIES_MAX}"
        )));
    }
    Ok(retries)
}

fn to_response(endpoint: WebhookEndpoint) -> WebhookEndpointResponse {
    WebhookEndpointResponse {
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        enabled: endpoint.enabled,
        events: endpoint.events,
        timeout_ms: endpoint.timeout_ms,
        max_retries: endpoint.max_retries,
        created_by: endpoint.created_by,
        last_success_at: endpoint.last_success_at,
        last_failure_at: endpoint.last_failure_at,
        last_status_code: endpoint.last_status_code,
        last_error: endpoint.last_error,
        created_at: endpoint.created_at,
        updated_at: endpoint.updated_at,
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/webhooks",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 50, max 500)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "List webhooks", body = WebhookListResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_webhooks(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<ListWebhooksQuery>,
) -> ApiResult<Json<WebhookListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_admin(&state, user.tenant_id, user.id).await?;

    let mut limit = query.limit.unwrap_or(WEBHOOK_LIST_DEFAULT_LIMIT);
    if limit < 1 {
        return Err(AppError::validation("limit must be >= 1"));
    }
    limit = limit.min(WEBHOOK_LIST_MAX_LIMIT);

    let offset = query.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let total = state
        .webhook_service
        .count_endpoints(user.tenant_id)
        .await
        .map_err(AppError::from)?;
    let items = state
        .webhook_service
        .list_endpoints(user.tenant_id, limit, offset)
        .await
        .map_err(AppError::from)?;

    Ok(Json(WebhookListResponse {
        items: items.into_iter().map(to_response).collect(),
        total,
        limit,
        offset,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/webhooks",
    request_body = CreateWebhookRequest,
    security(("session" = [])),
    responses(
        (status = 201, description = "Webhook created", body = WebhookEndpointResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn create_webhook(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ApiJson(req): ApiJson<CreateWebhookRequest>,
) -> ApiResult<(StatusCode, Json<WebhookEndpointResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_admin(&state, user.tenant_id, user.id).await?;

    let name = normalize_webhook_name(&req.name)?;
    let url = normalize_webhook_url(&state, &req.url).await?;
    let signing_secret = normalize_webhook_secret(&req.signing_secret)?;
    let timeout_ms = validate_timeout(req.timeout_ms)?;
    let max_retries = validate_max_retries(req.max_retries)?;
    let events = normalize_events(req.events)?;

    let created = state
        .webhook_service
        .create_endpoint(
            user.tenant_id,
            CreateWebhookEndpointInput {
                name,
                url,
                signing_secret,
                enabled: req.enabled.unwrap_or(true),
                events: events.clone(),
                timeout_ms,
                max_retries,
                created_by: Some(user.id),
            },
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
                action: "webhooks.create".to_string(),
                resource: "webhooks".to_string(),
                resource_id: Some(created.id),
                old_value: None,
                new_value: Some(json!({
                    "name": created.name,
                    "url": created.url,
                    "enabled": created.enabled,
                    "events": events,
                    "timeout_ms": created.timeout_ms,
                    "max_retries": created.max_retries,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((StatusCode::CREATED, Json(to_response(created))))
}

#[utoipa::path(
    patch,
    path = "/api/v1/webhooks/{id}",
    params(("id" = Uuid, Path, description = "Webhook endpoint ID")),
    request_body = UpdateWebhookRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Webhook updated", body = WebhookEndpointResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn update_webhook(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateWebhookRequest>,
) -> ApiResult<Json<WebhookEndpointResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_admin(&state, user.tenant_id, user.id).await?;

    if req.name.is_none()
        && req.url.is_none()
        && req.signing_secret.is_none()
        && req.enabled.is_none()
        && req.events.is_none()
        && req.timeout_ms.is_none()
        && req.max_retries.is_none()
    {
        return Err(AppError::validation("No fields to update"));
    }

    let input = UpdateWebhookEndpointInput {
        name: req
            .name
            .as_deref()
            .map(normalize_webhook_name)
            .transpose()?,
        url: match req.url.as_deref() {
            Some(value) => Some(normalize_webhook_url(&state, value).await?),
            None => None,
        },
        signing_secret: req
            .signing_secret
            .as_deref()
            .map(normalize_webhook_secret)
            .transpose()?,
        enabled: req.enabled,
        events: req.events.map(normalize_events).transpose()?,
        timeout_ms: req.timeout_ms,
        max_retries: req.max_retries,
    };

    if let Some(value) = input.timeout_ms {
        let _ = validate_timeout(Some(value))?;
    }
    if let Some(value) = input.max_retries {
        let _ = validate_max_retries(Some(value))?;
    }

    let updated = state
        .webhook_service
        .update_endpoint(user.tenant_id, id, input)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "webhooks.update".to_string(),
                resource: "webhooks".to_string(),
                resource_id: Some(updated.id),
                old_value: None,
                new_value: Some(json!({
                    "name": updated.name,
                    "url": updated.url,
                    "enabled": updated.enabled,
                    "events": updated.events,
                    "timeout_ms": updated.timeout_ms,
                    "max_retries": updated.max_retries,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(to_response(updated)))
}

#[utoipa::path(
    delete,
    path = "/api/v1/webhooks/{id}",
    params(("id" = Uuid, Path, description = "Webhook endpoint ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Webhook deleted", body = SuccessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn delete_webhook(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SuccessResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_admin(&state, user.tenant_id, user.id).await?;

    state
        .webhook_service
        .delete_endpoint(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "webhooks.delete".to_string(),
                resource: "webhooks".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({ "deleted": true })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: "Webhook deleted".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/webhooks/{id}/test",
    params(("id" = Uuid, Path, description = "Webhook endpoint ID")),
    request_body = TestWebhookRequest,
    security(("session" = [])),
    responses(
        (status = 202, description = "Webhook test event queued", body = WebhookTestResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn test_webhook(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<TestWebhookRequest>,
) -> ApiResult<(StatusCode, Json<WebhookTestResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_admin(&state, user.tenant_id, user.id).await?;

    let event_type = req
        .event_type
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(WEBHOOK_TEST_EVENT_TYPE)
        .to_string();

    if event_type.len() > WEBHOOK_EVENT_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "event_type too long (max {WEBHOOK_EVENT_NAME_MAX_LEN})"
        )));
    }

    let payload = req.payload.unwrap_or_else(|| {
        json!({
            "message": "manual webhook test",
            "requested_by": user.id,
        })
    });

    let event_id = state
        .webhook_service
        .enqueue_test_event(user.tenant_id, id, &event_type, payload)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "webhooks.test".to_string(),
                resource: "webhooks".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({
                    "event_id": event_id,
                    "event_type": event_type,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(WebhookTestResponse {
            event_id,
            event_type,
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn validate_webhook_url_blocks_internal_host_when_switch_disabled() {
        let err = validate_webhook_url("https://127.0.0.1/hook", false)
            .await
            .unwrap_err();

        assert_eq!(err.status, StatusCode::BAD_REQUEST);
        assert_eq!(err.body.code.as_deref(), Some("VALIDATION_ERROR"));
        assert!(err.body.error.contains("SSRF_BLOCKED"));
    }

    #[tokio::test]
    async fn validate_webhook_url_allows_internal_host_when_switch_enabled() {
        let url = validate_webhook_url("http://127.0.0.1:1234/hook", true)
            .await
            .unwrap();

        assert_eq!(url, "http://127.0.0.1:1234/hook");
    }
}
