mod auth;
mod error;
mod openapi;
mod middleware;
mod routes;
mod state;
pub use error::{ApiError, ApiResult, AppError};

use axum::http::{header, HeaderName, HeaderValue, Method};
use axum_login::AuthManagerLayerBuilder;
use law_eye_ai::{AiService, LlmGateway};
use law_eye_common::AppConfig;
use law_eye_db::create_pool;
use law_eye_queue::TaskQueue;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_redis_store::{fred::prelude::{ClientLike, Client as RedisClient, Config as RedisConfig}, RedisStore};
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use url::Url;
use std::net::SocketAddr;

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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::load().unwrap_or_default();

    info!("Starting Law Eye API server...");
    info!("Database URL: {}", redact_sensitive_url(&config.database.url));
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

    let state = AppState::new(pool, task_queue, ai_service, llm_gateway);

    // CORS configuration - use predicate for dynamic origin validation
    let allowed_origins: Vec<HeaderValue> = vec![
        "http://localhost:3000".parse().unwrap(),
        "http://localhost:8849".parse().unwrap(),
        "http://localhost:3002".parse().unwrap(),
        "http://localhost:3333".parse().unwrap(),
        "http://127.0.0.1:3000".parse().unwrap(),
        "http://127.0.0.1:8849".parse().unwrap(),
        "http://127.0.0.1:3002".parse().unwrap(),
        "http://127.0.0.1:3333".parse().unwrap(),
    ];

    let csrf = CsrfLayer::new(allowed_origins.clone());

    let cors_allowed_origins = allowed_origins.clone();
    let request_id_header = HeaderName::from_static("x-request-id");
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin, _| {
            cors_allowed_origins.iter().any(|allowed| allowed == origin)
        }))
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::COOKIE,
            request_id_header.clone(),
        ])
        .expose_headers([request_id_header])
        .allow_credentials(true);

    // Build application with middleware layers
    let app = routes::create_router(state)
        .layer(auth_layer)
        .layer(csrf)
        .layer(RequestIdLayer::new()) // Add request ID tracking
        .layer(cors);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}
