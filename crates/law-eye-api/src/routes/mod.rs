pub mod ai;
pub mod apikeys;
pub mod articles;
pub mod auth;
pub mod categories;
pub mod feedbacks;
pub mod health;
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
    Router,
};
use metrics::{counter, histogram};
use std::time::Instant;

use crate::middleware::rate_limit::RateLimitLayer;
use crate::middleware::RequireAuth;
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

pub fn create_router(state: AppState) -> Router {
    let protected_api = Router::new()
        .nest("/articles", articles::router())
        .nest("/sources", sources::router())
        .nest("/categories", categories::router())
        .nest("/feedbacks", feedbacks::router())
        .nest("/ai", ai::router())
        .nest("/users", users::router())
        .nest("/search", search::router())
        .nest("/apikeys", apikeys::router())
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
