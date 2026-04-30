pub mod admin_ai_governance;
pub mod admin_authz;
pub mod admin_dashboard;
pub mod admin_rbac;
pub mod ai;
pub mod ai_usage_admin;
pub mod apikeys;
pub mod article_pins;
pub mod articles;
pub mod audit;
pub mod auth;
pub mod authz;
pub mod banners;
pub mod categories;
pub mod channels;
pub mod feedbacks;
pub mod health;
pub mod knowledge;
pub mod me;
pub mod notifications;
pub mod objects;
pub mod openapi;
pub mod push;
pub mod report_subscriptions;
pub mod reports;
pub mod search;
pub mod sources;
pub mod statistics;
pub mod super_tenants;
pub mod system_metrics;
pub mod tenants;
pub mod users;
pub mod webhooks;

use axum::{
    body::Body,
    extract::{MatchedPath, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Extension, Router,
};
use chrono::Utc;
use metrics::{counter, histogram};
use sha2::{Digest, Sha256};
use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

use crate::middleware::rate_limit::RateLimitLayer;
use crate::middleware::{
    require_role_tier, require_role_tier_and_permission, RequireAuth, RequirePermission,
    RequiredPermission, RequiredPermissions,
};
use crate::state::AppState;
use crate::AppError;
use law_eye_core::role_tier::{
    ROLE_TIER_BASIC_USER, ROLE_TIER_SUPER_ADMIN, ROLE_TIER_TENANT_ADMIN,
};

async fn metrics_endpoint(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if std::env::var_os("PRODUCTION").is_some() {
        let Some(token) = state
            .metrics_token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty())
        else {
            return StatusCode::NOT_FOUND.into_response();
        };

        let expected = format!("Bearer {}", token);
        let auth_ok = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.trim() == expected);

        if !auth_ok {
            return StatusCode::NOT_FOUND.into_response();
        }
    }

    let metrics = state.metrics_handle.render();
    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; version=0.0.4"),
        )],
        metrics,
    )
        .into_response()
}

async fn track_metrics(req: Request<Body>, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().as_str().to_string();
    let route = req
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_string())
        .unwrap_or_else(|| "__unmatched__".to_string());

    let response = next.run(req).await;
    let status = response.status().as_u16().to_string();

    counter!(
        "http_requests_total",
        "method" => method.clone(),
        "path" => route.clone(),
        "status" => status.clone(),
    )
    .increment(1);

    histogram!(
        "http_request_duration_seconds",
        "method" => method,
        "path" => route,
        "status" => status,
    )
    .record(start.elapsed().as_secs_f64());

    response
}

const DEFAULT_CACHE_CONTROL_HEADER: &str = "private, max-age=30, must-revalidate";
const V1_DEPRECATION_WARNING_HEADER: &str = "299 - \"API v1 is deprecated; migrate to /api/v2\"";
const V1_SUNSET_RFC2822: &str = "Wed, 31 Dec 2026 23:59:59 GMT";
const HEADER_DEPRECATION: &str = "deprecation";
const HEADER_SUNSET: &str = "sunset";
const HEADER_X_API_VERSION: &str = "x-api-version";

fn build_weak_etag_signature(path_and_query: &str, response: &Response) -> Option<String> {
    let content_length = response
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("0");
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream");

    if content_length == "0" {
        return None;
    }

    let mut hasher = Sha256::new();
    hasher.update(path_and_query.as_bytes());
    hasher.update(b"|");
    hasher.update(content_type.as_bytes());
    hasher.update(b"|");
    hasher.update(content_length.as_bytes());
    let digest = hasher.finalize();

    Some(format!("W/\"{:x}\"", digest))
}

fn if_none_match_matches(headers: &HeaderMap, etag: &HeaderValue) -> bool {
    let Some(raw_if_none_match) = headers.get(header::IF_NONE_MATCH) else {
        return false;
    };

    let Ok(current_etag) = etag.to_str() else {
        return false;
    };

    let Ok(raw) = raw_if_none_match.to_str() else {
        return false;
    };

    raw.split(',').map(str::trim).any(|candidate| {
        if candidate == "*" {
            return true;
        }

        let candidate = candidate.strip_prefix("W/").unwrap_or(candidate).trim();
        let current = current_etag
            .strip_prefix("W/")
            .unwrap_or(current_etag)
            .trim();
        candidate == current
    })
}

async fn apply_conditional_cache_headers(req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    let headers = req.headers().clone();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string());

    let mut response = next.run(req).await;

    if !matches!(method, Method::GET | Method::HEAD)
        || (!path_and_query.starts_with("/api/v1") && !path_and_query.starts_with("/api/v2"))
    {
        return response;
    }

    if !response.status().is_success() {
        return response;
    }

    if !response.headers().contains_key(header::CACHE_CONTROL) {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static(DEFAULT_CACHE_CONTROL_HEADER),
        );
    }

    if !response.headers().contains_key(header::LAST_MODIFIED) {
        if let Ok(last_modified) = HeaderValue::from_str(&Utc::now().to_rfc2822()) {
            response
                .headers_mut()
                .insert(header::LAST_MODIFIED, last_modified);
        }
    }

    if !response.headers().contains_key(header::ETAG) {
        if let Some(signature) = build_weak_etag_signature(&path_and_query, &response) {
            if let Ok(etag) = HeaderValue::from_str(&signature) {
                response.headers_mut().insert(header::ETAG, etag);
            }
        }
    }

    let maybe_etag = response.headers().get(header::ETAG).cloned();
    if let Some(etag) = maybe_etag {
        if if_none_match_matches(&headers, &etag) {
            let mut not_modified = StatusCode::NOT_MODIFIED.into_response();
            not_modified.headers_mut().insert(header::ETAG, etag);
            if let Some(last_modified) = response.headers().get(header::LAST_MODIFIED).cloned() {
                not_modified
                    .headers_mut()
                    .insert(header::LAST_MODIFIED, last_modified);
            }
            if let Some(cache_control) = response.headers().get(header::CACHE_CONTROL).cloned() {
                not_modified
                    .headers_mut()
                    .insert(header::CACHE_CONTROL, cache_control);
            }
            return not_modified;
        }
    }

    response
}

async fn apply_api_version_headers(req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let mut response = next.run(req).await;

    if path.starts_with("/api/v1") {
        response.headers_mut().insert(
            HeaderName::from_static(HEADER_X_API_VERSION),
            HeaderValue::from_static("1"),
        );
        response.headers_mut().insert(
            HeaderName::from_static(HEADER_DEPRECATION),
            HeaderValue::from_static("true"),
        );
        response.headers_mut().insert(
            HeaderName::from_static(HEADER_SUNSET),
            HeaderValue::from_static(V1_SUNSET_RFC2822),
        );
        response.headers_mut().insert(
            header::WARNING,
            HeaderValue::from_static(V1_DEPRECATION_WARNING_HEADER),
        );
    } else if path.starts_with("/api/v2") {
        response.headers_mut().insert(
            HeaderName::from_static(HEADER_X_API_VERSION),
            HeaderValue::from_static("2"),
        );
    }

    response
}

pub(super) fn extract_audit_meta(
    headers: &HeaderMap,
    addr: SocketAddr,
) -> (Option<String>, Option<String>) {
    let ip_from_xff = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim())
        .and_then(|s| s.parse::<IpAddr>().ok())
        .map(|ip| ip.to_string());

    let ip_address = ip_from_xff.or_else(|| Some(addr.ip().to_string()));

    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    (ip_address, user_agent)
}

pub(crate) fn etag_for_version(version: i64) -> Result<HeaderValue, AppError> {
    HeaderValue::from_str(&format!("\"v{version}\""))
        .map_err(|_| AppError::internal("Failed to format ETag"))
}

pub(crate) fn parse_if_match_version(headers: &HeaderMap) -> Result<Option<i64>, AppError> {
    let raw = match headers.get(header::IF_MATCH) {
        Some(value) => value,
        None => return Ok(None),
    };

    let raw = raw
        .to_str()
        .map_err(|_| AppError::validation("Invalid If-Match header"))?;

    let token = raw.split(',').next().unwrap_or("").trim();
    if token.is_empty() {
        return Err(AppError::validation("Invalid If-Match header"));
    }
    if token == "*" {
        return Err(AppError::validation("If-Match '*' is not supported"));
    }

    let token = token.strip_prefix("W/").unwrap_or(token).trim();
    let token = token
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(token);

    let token = token.strip_prefix('v').unwrap_or(token);
    let version = token
        .parse::<i64>()
        .map_err(|_| AppError::validation("Invalid If-Match version"))?;

    if version < 1 {
        return Err(AppError::validation("Invalid If-Match version"));
    }

    Ok(Some(version))
}

pub(crate) fn require_if_match_version(headers: &HeaderMap) -> Result<i64, AppError> {
    parse_if_match_version(headers)?.ok_or_else(|| {
        AppError::precondition_required("Missing If-Match header (refresh the resource and retry)")
    })
}

fn require_permission(router: Router<AppState>, permission: &'static str) -> Router<AppState> {
    router
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission(permission)))
}

fn require_permissions(
    router: Router<AppState>,
    read: &'static str,
    write: &'static str,
) -> Router<AppState> {
    router
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermissions { read, write }))
}

pub fn create_router(state: AppState) -> Router {
    let protected_api = Router::new()
        .nest(
            "/articles",
            require_permissions(articles::router(), "articles:read", "articles:write"),
        )
        .nest(
            "/sources",
            require_permissions(sources::router(), "sources:read", "sources:write"),
        )
        .nest(
            "/categories",
            require_permission(categories::router(), "categories:read"),
        )
        .nest(
            "/feedbacks",
            require_permissions(feedbacks::router(), "feedbacks:read", "feedbacks:write"),
        )
        .nest(
            "/ai",
            require_permissions(ai::router(), "articles:read", "articles:write"),
        )
        .nest("/users", require_permission(users::router(), "users:read"))
        .nest(
            "/webhooks",
            require_permissions(webhooks::router(), "webhooks:read", "webhooks:write"),
        )
        .nest(
            "/objects",
            require_permission(objects::router(), "objects:read"),
        )
        .nest(
            "/search",
            require_permission(search::router(), "articles:read"),
        )
        .nest("/push", require_permission(push::router(), "articles:read"))
        .nest(
            "/apikeys",
            require_permission(apikeys::router(), "apikeys:manage"),
        )
        // Knowledge graph: outer gate is the read-tier permission so basic
        // users can hit search/stats/analytics endpoints. Write-tier handlers
        // (merge/backfill/backfill-llm) call `require_knowledge_manage` in
        // `routes/knowledge/handlers.rs`, which enforces the SPEC-01
        // `knowledge:manage` permission tenant-admin and super-admin hold.
        .nest(
            "/knowledge",
            require_permission(knowledge::router(), "knowledge:read"),
        )
        .nest(
            "/statistics",
            require_permission(statistics::router(), "articles:read"),
        )
        .nest(
            "/reports",
            require_permissions(reports::router(), "reports:read", "reports:write"),
        )
        .nest(
            "/report-templates",
            require_permissions(reports::template_router(), "reports:read", "reports:write"),
        )
        .nest(
            "/tenants",
            require_permission(tenants::router(), "tenants:manage"),
        )
        .nest(
            "/admin/dashboard",
            require_permission(admin_dashboard::router(), "tenants:manage"),
        )
        // G.4: admin ReBAC list endpoints — tenant-admin gated.
        .nest(
            "/admin/authz",
            require_role_tier_and_permission(
                admin_authz::router(),
                ROLE_TIER_TENANT_ADMIN,
                "tenants:manage",
            ),
        )
        .nest(
            "/admin",
            require_role_tier_and_permission(
                admin_rbac::router(),
                ROLE_TIER_TENANT_ADMIN,
                "tenants:manage",
            ),
        )
        // G.1: admin/system/metrics — operational KPIs for ops dashboard.
        // Tenant-admin gated; reads tenant-scoped tables via RLS.
        .nest(
            "/admin/system",
            require_role_tier_and_permission(
                system_metrics::router(),
                ROLE_TIER_TENANT_ADMIN,
                "tenants:manage",
            ),
        )
        .nest(
            "/admin/audit",
            require_role_tier_and_permission(
                audit::admin_router(),
                ROLE_TIER_TENANT_ADMIN,
                "audit:read",
            ),
        )
        .nest(
            "/me",
            require_role_tier(me::router(), ROLE_TIER_BASIC_USER),
        )
        .nest(
            "/channels",
            require_role_tier(channels::public_router(), ROLE_TIER_BASIC_USER),
        )
        .nest(
            "/admin/channels",
            require_role_tier_and_permission(
                channels::admin_router(),
                ROLE_TIER_TENANT_ADMIN,
                "channels:manage",
            ),
        )
        .nest(
            "/admin/categories",
            require_role_tier_and_permission(
                categories::admin_router(),
                ROLE_TIER_TENANT_ADMIN,
                "categories:write",
            ),
        )
        .nest(
            "/article-pins",
            require_role_tier(article_pins::public_router(), ROLE_TIER_BASIC_USER),
        )
        .nest(
            "/admin/article-pins",
            require_role_tier_and_permission(
                article_pins::admin_router(),
                ROLE_TIER_TENANT_ADMIN,
                "pins:manage",
            ),
        )
        .nest(
            "/report-subscriptions",
            require_role_tier(report_subscriptions::router(), ROLE_TIER_BASIC_USER),
        )
        // B.6a: banners (basic_user public feed + tenant_admin manage).
        .nest(
            "/banners",
            require_role_tier(banners::public_router(), ROLE_TIER_BASIC_USER),
        )
        .nest(
            "/admin/banners",
            require_role_tier_and_permission(
                banners::admin_router(),
                ROLE_TIER_TENANT_ADMIN,
                "banners:manage",
            ),
        )
        // B.6a: authz endpoints (decision check public to authenticated users
        // via the inner router; relation mutations gated by tenants:manage
        // inside the router itself). Top-level role gate keeps drive-by anon
        // probes out.
        .nest(
            "/authz",
            require_role_tier(authz::router(), ROLE_TIER_BASIC_USER),
        )
        // B.6a: notifications router declares absolute paths (`/me/notifications`)
        // so we merge instead of nest to avoid double-prefixing.
        .merge(require_role_tier(
            notifications::router(),
            ROLE_TIER_BASIC_USER,
        ))
        // F.3: admin sources crawler control (manual run + run history).
        .nest(
            "/admin/sources",
            require_role_tier_and_permission(
                sources::admin_router(),
                ROLE_TIER_TENANT_ADMIN,
                "sources:manage",
            ),
        )
        // F.3: admin AI usage time-series + by-model. Reads ai_usage_events directly
        // (does not depend on the still-locked ai_usage_service in law-eye-ai).
        .nest(
            "/admin/ai/usage",
            require_role_tier_and_permission(
                ai_usage_admin::router(),
                ROLE_TIER_TENANT_ADMIN,
                "ai:usage:read",
            ),
        )
        // G.6: admin AI governance stubs — empty-list payloads aligned with
        // apps/web/src/hooks/use-ai-governance.ts asserts. Real persistence
        // (ai_governance_policies / ai_prompt_versions / ai_content_flags /
        // ai_token_usage_events / ai_budget_alerts / feed_experiment_configs)
        // is V2 backlog. Auth gate kept tenant-admin so anonymous probes
        // still get rejected.
        .nest(
            "/admin/ai",
            require_role_tier_and_permission(
                admin_ai_governance::router(),
                ROLE_TIER_TENANT_ADMIN,
                "tenants:manage",
            ),
        )
        // F.5: super-admin tenant CRUD + quotas + feature flags + usage snapshot.
        // Gated to ROLE_TIER_SUPER_ADMIN with `tenants:manage` permission;
        // DELETE additionally requires `X-Confirm-Delete: yes` header.
        .nest(
            "/super/tenants",
            require_role_tier_and_permission(
                super_tenants::router(),
                ROLE_TIER_SUPER_ADMIN,
                "tenants:manage",
            ),
        )
        // Default deny: everything under /api/v1 requires an authenticated session,
        // except routes explicitly mounted outside this protected router (e.g. /api/v1/auth/*).
        .layer(middleware::from_extractor::<RequireAuth>())
        .layer(RateLimitLayer::api());

    Router::new()
        .merge(openapi::router())
        .route("/metrics", get(metrics_endpoint))
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v2/auth", auth::router())
        .nest("/api/v1", protected_api.clone())
        .nest("/api/v2", protected_api)
        .nest("/health", health::router())
        // G.1: also expose /api/v1/health/* (and /api/v2/) for ops dashboards
        // and k8s probes that prefer versioned paths. Anonymous on purpose.
        .nest("/api/v1/health", health::router())
        .nest("/api/v2/health", health::router())
        .route_layer(middleware::from_fn(apply_api_version_headers))
        .route_layer(middleware::from_fn(track_metrics))
        .route_layer(middleware::from_fn(apply_conditional_cache_headers))
        .with_state(state)
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{header, HeaderName, Method, Request, StatusCode};
    use law_eye_ai::LlmGateway;
    use law_eye_common::vault::PlaintextCipher;
    use law_eye_queue::TaskQueue;
    use metrics_exporter_prometheus::PrometheusBuilder;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use tower::ServiceExt;

    fn test_state() -> AppState {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_lazy("postgres://postgres:postgres@localhost/law_eye")
            .expect("lazy postgres pool");
        let queue = TaskQueue::new("redis://127.0.0.1/").expect("redis pool config");
        let recorder = PrometheusBuilder::new().build_recorder();
        let metrics_handle = recorder.handle();

        AppState::new(
            pool,
            queue,
            None,
            None,
            Some(LlmGateway::new("", None, None)),
            None,
            metrics_handle,
            None,
            false,
            false,
            300,
            vec!["google".to_string()],
            "LawSaw".to_string(),
            300,
            Arc::new(PlaintextCipher),
            None,
        )
    }

    async fn request_status(
        app: Router,
        method: Method,
        path: &str,
        json_body: &str,
    ) -> StatusCode {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json_body.to_string()))
            .expect("request");

        app.oneshot(request).await.expect("response").status()
    }

    #[tokio::test]
    async fn auth_login_contract_is_consistent_between_v1_and_v2() {
        let app = create_router(test_state());

        let v1 = request_status(app.clone(), Method::POST, "/api/v1/auth/login", "{}").await;
        let v2 = request_status(app, Method::POST, "/api/v2/auth/login", "{}").await;

        assert_ne!(v1, StatusCode::NOT_FOUND);
        assert_ne!(v2, StatusCode::NOT_FOUND);
        assert_eq!(v1, v2, "v1/v2 login contract status should stay aligned");
    }

    #[tokio::test]
    async fn protected_article_route_exists_for_v1_and_v2() {
        let app = create_router(test_state());

        let v1 = request_status(app.clone(), Method::GET, "/api/v1/articles", "").await;
        let v2 = request_status(app, Method::GET, "/api/v2/articles", "").await;

        assert_ne!(v1, StatusCode::NOT_FOUND);
        assert_ne!(v2, StatusCode::NOT_FOUND);
        assert_eq!(v1, v2, "v1/v2 protected route status should stay aligned");
    }

    #[tokio::test]
    async fn v1_includes_deprecation_headers_but_v2_does_not() {
        let app = create_router(test_state());

        let v1_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from("{}"))
            .expect("v1 request");
        let v1_response = app.clone().oneshot(v1_request).await.expect("v1 response");

        let v2_request = Request::builder()
            .method(Method::POST)
            .uri("/api/v2/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from("{}"))
            .expect("v2 request");
        let v2_response = app.oneshot(v2_request).await.expect("v2 response");

        let deprecation_header = HeaderName::from_static(HEADER_DEPRECATION);
        let sunset_header = HeaderName::from_static(HEADER_SUNSET);
        let version_header = HeaderName::from_static(HEADER_X_API_VERSION);

        assert_eq!(
            v1_response
                .headers()
                .get(&version_header)
                .and_then(|v| v.to_str().ok()),
            Some("1")
        );
        assert_eq!(
            v1_response
                .headers()
                .get(&deprecation_header)
                .and_then(|v| v.to_str().ok()),
            Some("true")
        );
        assert_eq!(
            v1_response
                .headers()
                .get(&sunset_header)
                .and_then(|v| v.to_str().ok()),
            Some(V1_SUNSET_RFC2822)
        );
        assert!(
            v1_response
                .headers()
                .get(header::WARNING)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|value| value.contains("/api/v2")),
            "v1 should carry migration warning header"
        );

        assert_eq!(
            v2_response
                .headers()
                .get(&version_header)
                .and_then(|v| v.to_str().ok()),
            Some("2")
        );
        assert!(v2_response.headers().get(&deprecation_header).is_none());
        assert!(v2_response.headers().get(&sunset_header).is_none());
    }
}
