pub mod ai;
pub mod apikeys;
pub mod articles;
pub mod auth;
pub mod categories;
pub mod feedbacks;
pub mod health;
pub mod knowledge;
pub mod objects;
pub mod openapi;
pub mod search;
pub mod sources;
pub mod users;

use axum::{
    body::Body,
    extract::{MatchedPath, State},
    http::{header, HeaderMap, HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Extension,
    Router,
};
use metrics::{counter, histogram};
use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

use crate::middleware::rate_limit::RateLimitLayer;
use crate::middleware::{RequireAuth, RequirePermission, RequiredPermission, RequiredPermissions};
use crate::state::AppState;

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
        1,
        "method" => method.clone(),
        "path" => route.clone(),
        "status" => status.clone(),
    );

    histogram!(
        "http_request_duration_seconds",
        start.elapsed().as_secs_f64(),
        "method" => method,
        "path" => route,
        "status" => status,
    );

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
            require_permissions(sources::router(), "sources:read", "*"),
        )
        .nest("/categories", require_permission(categories::router(), "categories:read"))
        .nest(
            "/feedbacks",
            require_permission(feedbacks::router(), "feedbacks:write"),
        )
        .nest(
            "/ai",
            require_permissions(ai::router(), "articles:read", "articles:write"),
        )
        .nest("/users", require_permission(users::router(), "users:read"))
        .nest("/objects", require_permission(objects::router(), "objects:read"))
        .nest("/search", require_permission(search::router(), "articles:read"))
        .nest("/apikeys", require_permission(apikeys::router(), "apikeys:manage"))
        .nest("/knowledge", require_permission(knowledge::router(), "articles:read"))
        // Default deny: everything under /api/v1 requires an authenticated session,
        // except routes explicitly mounted outside this protected router (e.g. /api/v1/auth/*).
        .layer(middleware::from_extractor::<RequireAuth>())
        .layer(RateLimitLayer::api());

    Router::new()
        .merge(openapi::router())
        .route("/metrics", get(metrics_endpoint))
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1", protected_api)
        .nest("/health", health::router())
        .route_layer(middleware::from_fn(track_metrics))
        .with_state(state)
}
