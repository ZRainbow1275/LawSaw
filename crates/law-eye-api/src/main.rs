mod auth;
mod error;
mod middleware;
mod openapi;
mod pagination;
mod routes;
mod state;
pub use error::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};

use anyhow::Context;
use axum::body::Body;
use axum::error_handling::HandleErrorLayer;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderName, HeaderValue, Method, Request};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum_login::AuthManagerLayerBuilder;
use law_eye_ai::{AiService, LlmGateway};
use law_eye_common::vault::{PlaintextCipher, SensitiveStringCipher, VaultTransitCipher};
use law_eye_common::AppConfig;
use law_eye_core::ObjectService;
use law_eye_db::{create_pool_retry, create_pool_with_session_role_retry};
use law_eye_queue::TaskQueue;
use metrics_exporter_prometheus::PrometheusBuilder;
use std::{collections::HashSet, net::SocketAddr, sync::Arc, time::Duration};
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

const DB_CONNECT_MAX_ATTEMPTS: u32 = 30;
const SECURITY_HEADERS_HSTS: &str = "max-age=31536000; includeSubDomains";
const SECURITY_HEADERS_CSP_DEFAULT: &str =
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";
const SECURITY_HEADERS_CSP_SWAGGER_UI: &str = "default-src 'self'; \
  base-uri 'none'; \
  frame-ancestors 'none'; \
  form-action 'none'; \
  object-src 'none'; \
  script-src 'self' 'unsafe-inline'; \
  style-src 'self' 'unsafe-inline'; \
  img-src 'self' data:; \
  font-src 'self' data:; \
  connect-src 'self'";
const SECURITY_HEADERS_PERMISSIONS_POLICY: &str =
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=()";

fn healthcheck_port() -> u16 {
    std::env::var("LAW_EYE__SERVER__PORT")
        .ok()
        .and_then(|raw| raw.trim().parse::<u16>().ok())
        .unwrap_or(3001)
}

fn run_healthcheck() -> anyhow::Result<()> {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let port = healthcheck_port();
    let addr = format!("127.0.0.1:{port}");

    let mut stream = TcpStream::connect(&addr)
        .with_context(|| format!("connect to {addr}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .context("set read timeout")?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .context("set write timeout")?;

    let request = b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    stream.write_all(request).context("write request")?;

    let mut buffer = [0u8; 1024];
    let n = stream.read(&mut buffer).context("read response")?;
    let response = std::str::from_utf8(&buffer[..n]).unwrap_or_default();

    let status_line = response.lines().next().unwrap_or_default();
    if status_line.starts_with("HTTP/1.1 200") || status_line.starts_with("HTTP/1.0 200") {
        Ok(())
    } else {
        anyhow::bail!("unhealthy response: {}", status_line);
    }
}

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

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut term = match signal(SignalKind::terminate()) {
            Ok(signal) => signal,
            Err(err) => {
                warn!(
                    error = %err,
                    "failed to install SIGTERM handler; falling back to ctrl_c only"
                );
                let _ = tokio::signal::ctrl_c().await;
                info!("Received shutdown signal, starting graceful shutdown");
                return;
            }
        };

        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }

    info!("Received shutdown signal, starting graceful shutdown");
}

async fn apply_security_headers(req: Request<Body>, next: Next) -> Response {
    let is_production = std::env::var_os("PRODUCTION").is_some();
    let path = req.uri().path().to_string();

    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    let header_x_content_type_options = HeaderName::from_static("x-content-type-options");
    if !headers.contains_key(&header_x_content_type_options) {
        headers.insert(
            header_x_content_type_options,
            HeaderValue::from_static("nosniff"),
        );
    }

    let header_x_frame_options = HeaderName::from_static("x-frame-options");
    if !headers.contains_key(&header_x_frame_options) {
        headers.insert(header_x_frame_options, HeaderValue::from_static("DENY"));
    }

    let header_referrer_policy = HeaderName::from_static("referrer-policy");
    if !headers.contains_key(&header_referrer_policy) {
        headers.insert(header_referrer_policy, HeaderValue::from_static("no-referrer"));
    }

    let header_permissions_policy = HeaderName::from_static("permissions-policy");
    if !headers.contains_key(&header_permissions_policy) {
        match HeaderValue::from_str(SECURITY_HEADERS_PERMISSIONS_POLICY) {
            Ok(value) => {
                headers.insert(header_permissions_policy, value);
            }
            Err(_) => {
                warn!("Invalid Permissions-Policy header value; skipping");
            }
        }
    }

    let header_csp = HeaderName::from_static("content-security-policy");
    if !headers.contains_key(&header_csp) {
        let csp = if path.starts_with("/api-docs/swagger-ui") {
            SECURITY_HEADERS_CSP_SWAGGER_UI
        } else {
            SECURITY_HEADERS_CSP_DEFAULT
        };

        match HeaderValue::from_str(csp) {
            Ok(value) => {
                headers.insert(header_csp, value);
            }
            Err(_) => warn!("Invalid CSP header value; skipping"),
        }
    }

    if is_production {
        let header_hsts = HeaderName::from_static("strict-transport-security");
        if !headers.contains_key(&header_hsts) {
            headers.insert(header_hsts, HeaderValue::from_static(SECURITY_HEADERS_HSTS));
        }
    }

    response
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().any(|arg| arg == "--healthcheck") {
        run_healthcheck().context("healthcheck")?;
        return Ok(());
    }

    let is_production = std::env::var_os("PRODUCTION").is_some();

    if is_production {
        tracing_subscriber::registry()
            .with(tracing_subscriber::EnvFilter::from_default_env())
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_current_span(true)
                    .with_span_list(true),
            )
            .init();
    } else {
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(tracing_subscriber::EnvFilter::from_default_env())
            .init();
    }

    let config = AppConfig::load()
        .await
        .context("load application config (file/env + optional Vault secrets)")?;

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

    info!("Running database migrations...");
    let admin_pool =
        create_pool_retry(&config.database.url, config.database.max_connections, DB_CONNECT_MAX_ATTEMPTS)
            .await?;
    law_eye_db::run_migrations(&admin_pool).await?;

    let pool = create_pool_with_session_role_retry(
        &config.database.url,
        config.database.max_connections,
        config.database.session_role.as_deref(),
        DB_CONNECT_MAX_ATTEMPTS,
    )
    .await?;

    let task_queue = TaskQueue::new(&config.redis.url)?;

    // Initialize Redis client for sessions
    info!("Connecting to Redis for session storage...");
    let redis_config = RedisConfig::from_url(&config.redis.url)?;
    let redis_client = RedisClient::new(redis_config, None, None, None);
    redis_client.connect();
    redis_client.wait_for_connect().await?;

    let session_store = RedisStore::new(redis_client);
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(is_production) // Secure cookie in production
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

    if is_production {
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

    let feedback_cipher: Arc<dyn SensitiveStringCipher> = if config.encryption.feedbacks.enabled {
        if !config.secrets.vault.enabled {
            anyhow::bail!("Feedback encryption requires Vault secrets to be enabled");
        }

        info!(
            "Feedback encryption enabled (Vault Transit key: {})",
            config.encryption.feedbacks.vault_transit_key
        );
        Arc::new(
            VaultTransitCipher::new(
                &config.secrets.vault,
                config.encryption.feedbacks.vault_transit_mount.clone(),
                config.encryption.feedbacks.vault_transit_key.clone(),
            )
            .await?,
        )
    } else {
        info!("Feedback encryption disabled");
        Arc::new(PlaintextCipher)
    };

    let object_service = if config.object_storage.enabled {
        info!(
            "Object storage enabled (bucket: {}, endpoint: {})",
            config.object_storage.bucket, config.object_storage.endpoint
        );
        Some(ObjectService::new(pool.clone(), &config.object_storage).await?)
    } else {
        info!("Object storage disabled");
        None
    };

    let state = AppState::new(
        pool,
        task_queue,
        ai_service,
        llm_gateway,
        object_service,
        metrics_handle,
        config.metrics.token.clone(),
        config.security.allow_internal_source_urls,
        feedback_cipher,
    );

    // CORS configuration - use predicate for dynamic origin validation
    let allowed_origins = build_allowed_origins(&config.server.allowed_origins);
    if is_production && allowed_origins.is_empty() {
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
    let mut app = routes::create_router(state).layer(auth_layer).layer(csrf);

    if is_production {
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

    let app = app
        .layer(trace)
        .layer(RequestIdLayer::new())
        .layer(cors)
        .layer(axum::middleware::from_fn(apply_security_headers));

    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}
