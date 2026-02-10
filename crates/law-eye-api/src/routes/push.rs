use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode, Uri},
    routing::{get, post},
    Json, Router,
};
use base64::{
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD},
    Engine as _,
};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy, UrlPolicyError};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use web_push_native::{
    jwt_simple::algorithms::ES256KeyPair, p256::PublicKey, Auth, WebPushBuilder,
};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use law_eye_db::{CreateAuditLog, CreateWebPushSubscription, WebPushSubscription};
use std::net::SocketAddr;

const TEST_PUSH_DEFAULT_LIMIT: i64 = 20;
const TEST_PUSH_MAX_LIMIT: i64 = 200;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/vapid-public-key", get(get_vapid_public_key))
        .route("/subscribe", post(subscribe))
        .route("/unsubscribe", post(unsubscribe))
        .route("/test", post(test_push))
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct VapidPublicKeyResponse {
    pub public_key: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PushSubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SubscribeRequest {
    pub endpoint: String,
    #[serde(rename = "expirationTime")]
    pub expiration_time: Option<i64>,
    pub keys: PushSubscriptionKeys,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UnsubscribeRequest {
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SubscribeResponse {
    pub id: Uuid,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TestPushQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TestPushResponse {
    pub delivered: usize,
    pub failed: usize,
    pub total: usize,
    pub available_total: usize,
    pub limit: i64,
    pub offset: i64,
}

fn env_required(name: &str) -> Result<String, AppError> {
    let value = std::env::var(name).map_err(|_| {
        AppError::service_unavailable(format!("{name} is not configured (required for Web Push)"))
    })?;
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::service_unavailable(format!(
            "{name} is not configured (required for Web Push)"
        )));
    }
    Ok(trimmed)
}

fn decode_base64_any(value: &str, field: &str) -> Result<Vec<u8>, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation(format!("{field} is required")));
    }

    // Accept both base64url and standard base64, with or without padding.
    let engines = [URL_SAFE_NO_PAD, URL_SAFE, STANDARD_NO_PAD, STANDARD];
    for engine in engines {
        if let Ok(bytes) = engine.decode(trimmed) {
            return Ok(bytes);
        }
    }

    Err(AppError::validation(format!(
        "Invalid base64 for {field} (expect base64url/base64)"
    )))
}

fn load_vapid_keypair() -> Result<ES256KeyPair, AppError> {
    let raw = env_required("WEB_PUSH_VAPID_PRIVATE_KEY")?;
    let bytes = decode_base64_any(&raw, "WEB_PUSH_VAPID_PRIVATE_KEY")?;
    ES256KeyPair::from_bytes(&bytes)
        .map_err(|_| AppError::service_unavailable("Invalid WEB_PUSH_VAPID_PRIVATE_KEY"))
}

fn vapid_public_key() -> Result<String, AppError> {
    let raw = env_required("WEB_PUSH_VAPID_PUBLIC_KEY")?;
    // Validate that it's at least decodable; the client will convert to Uint8Array.
    let _ = decode_base64_any(&raw, "WEB_PUSH_VAPID_PUBLIC_KEY")?;
    Ok(raw)
}

async fn validate_push_url(raw: &str) -> Result<url::Url, AppError> {
    let policy = OutboundUrlPolicy::https_only(false).with_max_len(4096);
    validate_outbound_url(raw, &policy)
        .await
        .map_err(|err| match err {
            UrlPolicyError::InvalidUrl { message } => AppError::validation(&message),
            UrlPolicyError::SsrfBlocked { message } => AppError::validation(&message),
        })
}

async fn validate_push_endpoint(raw: &str) -> Result<Uri, AppError> {
    let url = validate_push_url(raw).await?;
    url.as_str()
        .parse::<Uri>()
        .map_err(|_| AppError::validation("Invalid push endpoint"))
}

/// Get Web Push VAPID public key (base64url, no padding).
#[utoipa::path(
    get,
    path = "/api/v1/push/vapid-public-key",
    security(("session" = [])),
    responses(
        (status = 200, description = "VAPID public key", body = VapidPublicKeyResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 503, description = "Not configured", body = ApiError)
    )
)]
pub(crate) async fn get_vapid_public_key(
    auth_session: AuthSession,
) -> ApiResult<Json<VapidPublicKeyResponse>> {
    let _ = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    Ok(Json(VapidPublicKeyResponse {
        public_key: vapid_public_key()?,
    }))
}

/// Subscribe current user to Web Push.
#[utoipa::path(
    post,
    path = "/api/v1/push/subscribe",
    request_body = SubscribeRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Subscribed", body = SubscribeResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn subscribe(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<SubscribeRequest>,
) -> ApiResult<Json<SubscribeResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Validate VAPID config early to fail fast for clients.
    let _ = vapid_public_key()?;
    let _ = env_required("WEB_PUSH_SUBJECT")?;

    let _ = validate_push_endpoint(&req.endpoint).await?;

    let p256dh_decoded = decode_base64_any(&req.keys.p256dh, "p256dh")?;
    let _ = PublicKey::from_sec1_bytes(&p256dh_decoded)
        .map_err(|_| AppError::validation("Invalid subscription p256dh"))?;
    let _ = decode_base64_any(&req.keys.auth, "auth")?;

    let expiration_time = law_eye_core::parse_expiration_time_millis(req.expiration_time);
    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let input = CreateWebPushSubscription {
        user_id: user.id,
        endpoint: req.endpoint,
        p256dh: req.keys.p256dh,
        auth: req.keys.auth,
        expiration_time,
        user_agent,
    };

    let (ip_address, user_agent_audit) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let row = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let service = state.web_push_subscription_service.clone();
        let audit = state.audit_service.clone();
        let input = input.clone();
        let ip_address = ip_address.clone();
        let user_agent_audit = user_agent_audit.clone();

        Box::pin(async move {
            let row = service.upsert_tx(tenant_id, tx, input.clone()).await?;

            audit
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "push.subscribe".to_string(),
                        resource: "web_push_subscriptions".to_string(),
                        resource_id: Some(row.id),
                        old_value: None,
                        new_value: Some(serde_json::json!({
                            "endpoint": row.endpoint,
                            "expiration_time": row.expiration_time,
                        })),
                        ip_address,
                        user_agent: user_agent_audit,
                    },
                )
                .await?;

            Ok(row)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(SubscribeResponse { id: row.id }))
}

/// Unsubscribe current user from Web Push (by endpoint).
#[utoipa::path(
    post,
    path = "/api/v1/push/unsubscribe",
    request_body = UnsubscribeRequest,
    security(("session" = [])),
    responses(
        (status = 204, description = "Unsubscribed"),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn unsubscribe(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<UnsubscribeRequest>,
) -> ApiResult<StatusCode> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let service = state.web_push_subscription_service.clone();
        let audit = state.audit_service.clone();
        let endpoint = req.endpoint.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            service
                .soft_delete_by_endpoint_tx(tenant_id, tx, user_id, &endpoint)
                .await?;

            audit
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "push.unsubscribe".to_string(),
                        resource: "web_push_subscriptions".to_string(),
                        resource_id: None,
                        old_value: Some(serde_json::json!({ "endpoint": endpoint })),
                        new_value: None,
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(())
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

fn push_payload_json(title: &str, body: &str, url: &str) -> Vec<u8> {
    serde_json::json!({
        "title": title,
        "body": body,
        "url": url,
    })
    .to_string()
    .into_bytes()
}

async fn send_web_push(
    http: &reqwest::Client,
    subscription: &WebPushSubscription,
    payload: Vec<u8>,
    key_pair: &ES256KeyPair,
    subject: &str,
) -> Result<reqwest::Response, AppError> {
    let endpoint = validate_push_endpoint(&subscription.endpoint).await?;
    let p256dh = decode_base64_any(&subscription.p256dh, "p256dh")?;
    let auth = decode_base64_any(&subscription.auth, "auth")?;

    let builder = WebPushBuilder::new(
        endpoint,
        PublicKey::from_sec1_bytes(&p256dh)
            .map_err(|_| AppError::validation("Invalid subscription p256dh"))?,
        Auth::clone_from_slice(&auth),
    )
    .with_vapid(key_pair, subject);

    let request = builder
        .build(payload)
        .map_err(|_| AppError::service_unavailable("Failed to build Web Push request"))?;

    let method = reqwest::Method::from_bytes(request.method().as_str().as_bytes())
        .map_err(|_| AppError::internal("Invalid Web Push method"))?;
    let url = validate_push_url(&request.uri().to_string()).await?;

    let mut builder = http.request(method, url);
    for (name, value) in request.headers().iter() {
        builder = builder.header(name, value);
    }

    builder
        .body(request.body().clone())
        .send()
        .await
        .map_err(|e| AppError::service_unavailable(format!("Web Push request failed: {e}")))
}

/// Send a test notification to the current user's active subscriptions.
#[utoipa::path(
    post,
    path = "/api/v1/push/test",
    params(
        ("limit" = Option<i64>, Query, description = "Page size (default 20, max 200)"),
        ("offset" = Option<i64>, Query, description = "Page offset (default 0)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Test push result", body = TestPushResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 503, description = "Not configured", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn test_push(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<TestPushQuery>,
) -> ApiResult<Json<TestPushResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = query.limit.unwrap_or(TEST_PUSH_DEFAULT_LIMIT);
    if limit < 1 {
        return Err(AppError::validation("limit must be >= 1"));
    }
    let limit = limit.min(TEST_PUSH_MAX_LIMIT);

    let offset = query.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let key_pair = load_vapid_keypair()?;
    let subject = env_required("WEB_PUSH_SUBJECT")?;
    let http = reqwest::Client::builder()
        .user_agent("law-eye-api/web-push")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| AppError::internal(format!("Failed to build http client: {e}")))?;

    let tenant_id = user.tenant_id;
    let available_total = state
        .web_push_subscription_service
        .count_by_user(tenant_id, user.id)
        .await
        .map_err(AppError::from)? as usize;

    let subs = state
        .web_push_subscription_service
        .list_by_user_paginated(tenant_id, user.id, limit, offset)
        .await
        .map_err(AppError::from)?;

    if subs.is_empty() {
        return Ok(Json(TestPushResponse {
            delivered: 0,
            failed: 0,
            total: 0,
            available_total,
            limit,
            offset,
        }));
    }

    let payload = push_payload_json(
        "LawSaw 测试通知",
        "如果你看到这条消息，说明 Web Push 已可用。",
        "/",
    );

    let mut delivered = 0usize;
    let mut failed = 0usize;

    for sub in &subs {
        match send_web_push(&http, sub, payload.clone(), &key_pair, &subject).await {
            Ok(resp) => {
                if resp.status().is_success() {
                    delivered += 1;
                } else {
                    failed += 1;
                    if resp.status().as_u16() == 404 || resp.status().as_u16() == 410 {
                        let _ = state
                            .web_push_subscription_service
                            .delete_stale_endpoint(tenant_id, &sub.endpoint)
                            .await;
                    }
                }
            }
            Err(_) => {
                failed += 1;
            }
        }
    }

    Ok(Json(TestPushResponse {
        delivered,
        failed,
        total: subs.len(),
        available_total,
        limit,
        offset,
    }))
}
