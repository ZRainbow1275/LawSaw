mod auth;
mod error;
mod middleware;
mod openapi;
mod routes;
mod state;
pub use error::{ApiError, ApiResult, AppError};

use anyhow::Context;
use axum::error_handling::HandleErrorLayer;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderName, HeaderValue, Method};
use axum::response::IntoResponse;
use axum_login::AuthManagerLayerBuilder;
use law_eye_ai::{AiService, LlmGateway};
use law_eye_common::AppConfig;
use law_eye_db::create_pool;
use law_eye_queue::TaskQueue;
use metrics_exporter_prometheus::PrometheusBuilder;
use std::{collections::HashSet, net::SocketAddr, time::Duration};
use tower::{timeout::TimeoutLayer, BoxError, ServiceBuilder};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_redis_store::{
    fred::prelude::{Client as RedisClient, ClientLike, Config as RedisConfig},
    RedisStore,
};
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use url::{Host, Url};

use crate::auth::AuthBackend;
use crate::middleware::{CsrfLayer, RequestIdLayer};
use crate::state::AppState;

fn redact_sensitive_url(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(mut url) => {
            // Never log secrets; if userinfo includes password, redact it.
            if url.password().is_some() {
                let _ = url.set_password(Some("REDACTED"));
            }
            url.to_string()
        }
        Err(_) => "<redacted>".to_string(),
    }
}

fn normalize_origin(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let url = Url::parse(trimmed).ok()?;
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return None;
    }

    let path = url.path();
    if (path != "/" && !path.is_empty()) || url.query().is_some() || url.fragment().is_some() {
        return None;
    }

    let host = match url.host() {
        Some(Host::Domain(host)) => host.to_string(),
        Some(Host::Ipv4(ip)) => ip.to_string(),
        Some(Host::Ipv6(ip)) => format!("[{ip}]"),
        None => return None,
    };

    let port = url.port_or_known_default()?;
    let default_port = match scheme {
        "http" => 80,
        "https" => 443,
        _ => port,
    };

    if port == default_port {
        Some(format!("{scheme}://{host}"))
    } else {
        Some(format!("{scheme}://{host}:{port}"))
    }
}

fn build_allowed_origins(origins: &[String]) -> Vec<HeaderValue> {
    let mut unique = HashSet::new();
    let mut values = Vec::new();

    for raw in origins {
        let Some(origin) = normalize_origin(raw) else {
            warn!(origin = %raw, "Invalid origin in allowlist (expected scheme://host[:port])");
            continue;
        };

        if !unique.insert(origin.clone()) {
            continue;
        }

        match HeaderValue::from_str(&origin) {
            Ok(value) => values.push(value),
            Err(_) => warn!(origin = %origin, "Invalid origin header value in allowlist"),
        }
    }

    values
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::load().unwrap_or_default();

    let metrics_handle = PrometheusBuilder::new()
        .install_recorder()
        .context("install prometheus metrics recorder")?;

    info!("Starting Law Eye API server...");
    info!(
        "Database URL: {}",
        redact_sensitive_url(&config.database.url)
    );
    info!("Redis URL: {}", redact_sensitive_url(&config.redis.url));
    info!("Server Port: {}", config.server.port);

    let pool = create_pool(&config.database.url, config.database.max_connections).await?;

    info!("Running database migrations...");
    law_eye_db::run_migrations(&pool).await?;

    let task_queue = TaskQueue::new(&config.redis.url)?;

    // Initialize Redis client for sessions
    info!("Connecting to Redis for session storage...");
    let redis_config = RedisConfig::from_url(&config.redis.url)?;
    let redis_client = RedisClient::new(redis_config, None, None, None);
    redis_client.connect();
    redis_client.wait_for_connect().await?;

    let session_store = RedisStore::new(redis_client);
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(std::env::var("PRODUCTION").is_ok()) // Secure cookie in production
        .with_same_site(tower_sessions::cookie::SameSite::Lax) // CSRF protection
        .with_expiry(Expiry::OnInactivity(time::Duration::hours(24)));

    // Initialize auth backend
    let auth_backend = AuthBackend::new(pool.clone());
    let auth_layer = AuthManagerLayerBuilder::new(auth_backend, session_layer).build();

    // Initialize AI service and LLM gateway if configured
    let (ai_service, llm_gateway) = if !config.ai.api_key.is_empty() {
        info!("AI service enabled");
        let gateway = LlmGateway::new(
            &config.ai.api_key,
            config.ai.base_url.as_deref(),
            Some(&config.ai.model),
        );
        (
            Some(AiService::new(
                &config.ai.api_key,
                config.ai.base_url.as_deref(),
                Some(&config.ai.model),
            )),
            Some(gateway),
        )
    } else {
        warn!("AI service not configured (missing api_key)");
        (None, None)
    };

    if std::env::var_os("PRODUCTION").is_some() {
        if config
            .metrics
            .token
            .as_deref()
            .is_some_and(|token| !token.trim().is_empty())
        {
            info!("Metrics enabled at /metrics (token protected)");
        } else {
            warn!("Metrics disabled in production (LAW_EYE__METRICS__TOKEN not set)");
        }
    } else {
        info!("Metrics enabled at /metrics (development mode)");
    }

    let state = AppState::new(
        pool,
        task_queue,
        ai_service,
        llm_gateway,
        metrics_handle,
        config.metrics.token.clone(),
    );

    // CORS configuration - use predicate for dynamic origin validation
    let allowed_origins = build_allowed_origins(&config.server.allowed_origins);
    if std::env::var_os("PRODUCTION").is_some() && allowed_origins.is_empty() {
        anyhow::bail!("LAW_EYE__SERVER__ALLOWED_ORIGINS must be set in production");
    }

    let csrf = CsrfLayer::new(allowed_origins.clone());

    let cors_allowed_origins = allowed_origins.clone();
    let request_id_header = HeaderName::from_static("x-request-id");
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin, _| {
            cors_allowed_origins.iter().any(|allowed| allowed == origin)
        }))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::COOKIE,
            request_id_header.clone(),
        ])
        .expose_headers([request_id_header])
        .allow_credentials(true);

    let trace = TraceLayer::new_for_http().make_span_with(|request: &axum::http::Request<_>| {
        let request_id = request
            .extensions()
            .get::<crate::middleware::request_id::RequestId>()
            .map(|id| id.0.as_str())
            .unwrap_or("-");

        tracing::info_span!(
            "http.request",
            request_id = %request_id,
            method = %request.method(),
            uri = %request.uri()
        )
    });

    // Build application with middleware layers
    let mut app = routes::create_router(state)
        .layer(auth_layer)
        .layer(csrf);

    if std::env::var_os("PRODUCTION").is_some() {
        if config.server.request_timeout_ms == 0 {
            warn!("Request timeout disabled in production (LAW_EYE__SERVER__REQUEST_TIMEOUT_MS=0)");
        }
        if config.server.max_body_bytes == 0 {
            warn!("Request body limit disabled in production (LAW_EYE__SERVER__MAX_BODY_BYTES=0)");
        }
    }

    if config.server.max_body_bytes > 0 {
        app = app.layer(DefaultBodyLimit::max(config.server.max_body_bytes));
    }

    if config.server.request_timeout_ms > 0 {
        app = app.layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(|err: BoxError| async move {
                    if err.is::<tower::timeout::error::Elapsed>() {
                        AppError {
                            status: axum::http::StatusCode::REQUEST_TIMEOUT,
                            body: ApiError::new("Request timed out").with_code("REQUEST_TIMEOUT"),
                        }
                        .into_response()
                    } else {
                        AppError::internal("Internal server error").into_response()
                    }
                }))
                .layer(TimeoutLayer::new(Duration::from_millis(
                    config.server.request_timeout_ms,
                ))),
        );
    }

    let app = app.layer(trace).layer(RequestIdLayer::new()).layer(cors);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
