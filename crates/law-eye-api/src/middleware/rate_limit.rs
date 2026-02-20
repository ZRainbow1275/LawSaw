use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, Response, StatusCode},
    response::IntoResponse,
    Json,
};
use deadpool_redis::{redis::Script, Config as RedisConfig, Pool, Runtime};
use serde_json::json;
use std::{
    collections::HashMap,
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::Arc,
    sync::OnceLock,
    task::{Context, Poll},
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, RwLock};
use tower::{Layer, Service};
use tracing::warn;

use crate::ApiError;

const LUA_RATE_LIMIT_FIXED_WINDOW: &str = r#"
local key = KEYS[1]
local max_requests = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window_seconds)
end

local ttl = redis.call('TTL', key)
if ttl < 0 then
  ttl = window_seconds
end

if current > max_requests then
  return {0, ttl}
end

return {1, ttl}
"#;

const DEFAULT_RATE_LIMIT_REDIS_PREFIX: &str = "law-eye:rate-limit";
const DEFAULT_RATE_LIMIT_REDIS_FAIL_OPEN: bool = true;
const RATE_LIMIT_CLEANUP_SHUTDOWN_CHANNEL_SIZE: usize = 8;

fn rate_limit_cleanup_shutdown_sender() -> &'static broadcast::Sender<()> {
    static SENDER: OnceLock<broadcast::Sender<()>> = OnceLock::new();
    SENDER.get_or_init(|| {
        let (sender, _receiver) = broadcast::channel(RATE_LIMIT_CLEANUP_SHUTDOWN_CHANNEL_SIZE);
        sender
    })
}

fn subscribe_rate_limit_cleanup_shutdown() -> broadcast::Receiver<()> {
    rate_limit_cleanup_shutdown_sender().subscribe()
}

pub fn signal_rate_limit_cleanup_shutdown() {
    let _ = rate_limit_cleanup_shutdown_sender().send(());
}

fn env_u32(name: &str) -> Option<u32> {
    std::env::var(name)
        .ok()
        .map(|raw| raw.trim().to_string())
        .and_then(|raw| raw.parse::<u32>().ok())
        .filter(|value| *value > 0)
}

fn env_u64(name: &str) -> Option<u64> {
    std::env::var(name)
        .ok()
        .map(|raw| raw.trim().to_string())
        .and_then(|raw| raw.parse::<u64>().ok())
        .filter(|value| *value > 0)
}

fn env_string(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_bool(name: &str) -> Option<bool> {
    std::env::var(name)
        .ok()
        .map(|raw| raw.trim().to_ascii_lowercase())
        .and_then(|raw| match raw.as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
}

fn redis_pool_from_env() -> Option<Pool> {
    let redis_url = env_string("LAW_EYE__REDIS__URL")?;
    let mut config = RedisConfig::from_url(redis_url);

    let mut pool_config = config.pool.unwrap_or_default();
    pool_config.timeouts.wait = Some(Duration::from_millis(
        env_u64("LAW_EYE__REDIS__POOL_WAIT_TIMEOUT_MS").unwrap_or(2_000),
    ));
    pool_config.timeouts.create = Some(Duration::from_millis(
        env_u64("LAW_EYE__REDIS__POOL_CREATE_TIMEOUT_MS").unwrap_or(2_000),
    ));
    pool_config.timeouts.recycle = Some(Duration::from_millis(
        env_u64("LAW_EYE__REDIS__POOL_RECYCLE_TIMEOUT_MS").unwrap_or(2_000),
    ));
    config.pool = Some(pool_config);

    match config.create_pool(Some(Runtime::Tokio1)) {
        Ok(pool) => Some(pool),
        Err(err) => {
            warn!(error = %err, "rate-limit: failed to create redis pool, falling back to in-memory backend");
            None
        }
    }
}

#[derive(Debug, Clone)]
struct RateLimitEntry {
    count: u32,
    window_start: Instant,
}

#[derive(Clone)]
enum RateLimitBackend {
    Redis {
        pool: Pool,
        key_prefix: String,
        redis_fail_open: bool,
    },
    InMemory {
        entries: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    },
}

#[derive(Debug, Clone, Copy)]
struct RateLimitRejection {
    retry_after_seconds: u64,
    reason: &'static str,
}

impl RateLimitRejection {
    fn limit_exceeded(retry_after_seconds: u64) -> Self {
        Self {
            retry_after_seconds: retry_after_seconds.max(1),
            reason: "limit_exceeded",
        }
    }

    fn backend_unavailable_fail_closed(retry_after_seconds: u64) -> Self {
        Self {
            retry_after_seconds: retry_after_seconds.max(1),
            reason: "backend_unavailable_fail_closed",
        }
    }
}

#[derive(Clone)]
pub struct RateLimitState {
    backend: RateLimitBackend,
    max_requests: u32,
    window_duration: Duration,
}

impl RateLimitState {
    pub fn new(scope: &str, max_requests: u32, window_seconds: u64) -> Self {
        let key_prefix = env_string("LAW_EYE__RATE_LIMIT__REDIS_PREFIX")
            .unwrap_or_else(|| DEFAULT_RATE_LIMIT_REDIS_PREFIX.to_string());
        let redis_fail_open = env_bool("LAW_EYE__RATE_LIMIT__REDIS_FAIL_OPEN")
            .unwrap_or(DEFAULT_RATE_LIMIT_REDIS_FAIL_OPEN);
        let backend = redis_pool_from_env()
            .map(|pool| RateLimitBackend::Redis {
                pool,
                key_prefix: format!("{key_prefix}:{scope}"),
                redis_fail_open,
            })
            .unwrap_or_else(|| RateLimitBackend::InMemory {
                entries: Arc::new(RwLock::new(HashMap::new())),
            });

        Self {
            backend,
            max_requests,
            window_duration: Duration::from_secs(window_seconds),
        }
    }

    fn needs_cleanup(&self) -> bool {
        matches!(self.backend, RateLimitBackend::InMemory { .. })
    }

    async fn check_rate_limit(&self, key: &str) -> Result<(), RateLimitRejection> {
        match &self.backend {
            RateLimitBackend::Redis {
                pool,
                key_prefix,
                redis_fail_open,
            } => {
                let redis_key = format!("{key_prefix}:{key}");
                let script = Script::new(LUA_RATE_LIMIT_FIXED_WINDOW);
                let window_secs = self.window_duration.as_secs().max(1);
                let mut conn = match pool.get().await {
                    Ok(conn) => conn,
                    Err(err) => {
                        if *redis_fail_open {
                            warn!(error = %err, "rate-limit: redis connection failed, fail-open");
                            return Ok(());
                        }

                        warn!(error = %err, "rate-limit: redis connection failed, fail-closed");
                        return Err(RateLimitRejection::backend_unavailable_fail_closed(
                            window_secs,
                        ));
                    }
                };

                let result: (i64, i64) = match script
                    .key(redis_key)
                    .arg(i64::from(self.max_requests))
                    .arg(i64::try_from(window_secs).unwrap_or(i64::MAX))
                    .invoke_async(&mut conn)
                    .await
                {
                    Ok(result) => result,
                    Err(err) => {
                        if *redis_fail_open {
                            warn!(error = %err, "rate-limit: redis script failed, fail-open");
                            return Ok(());
                        }

                        warn!(error = %err, "rate-limit: redis script failed, fail-closed");
                        return Err(RateLimitRejection::backend_unavailable_fail_closed(
                            window_secs,
                        ));
                    }
                };

                if result.0 == 1 {
                    Ok(())
                } else {
                    Err(RateLimitRejection::limit_exceeded(result.1.max(1) as u64))
                }
            }
            RateLimitBackend::InMemory { entries } => {
                let now = Instant::now();
                let mut entries = entries.write().await;

                if let Some(entry) = entries.get_mut(key) {
                    let elapsed = now.duration_since(entry.window_start);

                    if elapsed >= self.window_duration {
                        entry.count = 1;
                        entry.window_start = now;
                        Ok(())
                    } else if entry.count >= self.max_requests {
                        let retry_after = (self.window_duration - elapsed).as_secs().max(1);
                        Err(RateLimitRejection::limit_exceeded(retry_after))
                    } else {
                        entry.count += 1;
                        Ok(())
                    }
                } else {
                    entries.insert(
                        key.to_string(),
                        RateLimitEntry {
                            count: 1,
                            window_start: now,
                        },
                    );
                    Ok(())
                }
            }
        }
    }

    pub async fn cleanup_expired(&self) {
        let RateLimitBackend::InMemory { entries } = &self.backend else {
            return;
        };

        let now = Instant::now();
        let mut entries = entries.write().await;
        entries
            .retain(|_, entry| now.duration_since(entry.window_start) < self.window_duration * 2);
    }
}

#[derive(Clone)]
pub struct RateLimitLayer {
    state: RateLimitState,
}

impl RateLimitLayer {
    pub fn new(scope: &str, max_requests: u32, window_seconds: u64) -> Self {
        let state = RateLimitState::new(scope, max_requests, window_seconds);

        if state.needs_cleanup() {
            let cleanup_state = state.clone();
            let mut shutdown_rx = subscribe_rate_limit_cleanup_shutdown();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(60));
                loop {
                    tokio::select! {
                        _ = shutdown_rx.recv() => {
                            break;
                        }
                        _ = interval.tick() => {
                            cleanup_state.cleanup_expired().await;
                        }
                    }
                }
            });
        }

        Self { state }
    }

    pub fn login() -> Self {
        // Stricter limits for login attempts per client IP.
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__LOGIN_MAX_REQUESTS").unwrap_or(5);
        let window_seconds = env_u64("LAW_EYE__RATE_LIMIT__LOGIN_WINDOW_SECONDS").unwrap_or(60);
        Self::new("login", max_requests, window_seconds)
    }

    pub fn register() -> Self {
        // Registrations per client IP (default: 3 per hour).
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__REGISTER_MAX_REQUESTS").unwrap_or(3);
        let window_seconds =
            env_u64("LAW_EYE__RATE_LIMIT__REGISTER_WINDOW_SECONDS").unwrap_or(3600);
        Self::new("register", max_requests, window_seconds)
    }

    pub fn password_reset() -> Self {
        // Password reset requests per client IP (default: 3 per hour).
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__PASSWORD_RESET_MAX_REQUESTS").unwrap_or(3);
        let window_seconds =
            env_u64("LAW_EYE__RATE_LIMIT__PASSWORD_RESET_WINDOW_SECONDS").unwrap_or(3600);
        Self::new("password-reset", max_requests, window_seconds)
    }

    pub fn email_verification() -> Self {
        // Email verification requests per client IP (default: 5 per hour).
        let max_requests =
            env_u32("LAW_EYE__RATE_LIMIT__EMAIL_VERIFICATION_MAX_REQUESTS").unwrap_or(5);
        let window_seconds =
            env_u64("LAW_EYE__RATE_LIMIT__EMAIL_VERIFICATION_WINDOW_SECONDS").unwrap_or(3600);
        Self::new("email-verification", max_requests, window_seconds)
    }

    pub fn api() -> Self {
        // General API per client IP.
        //
        // NOTE: The earlier default (100/minute) is too low for a modern SPA with background
        // refetching and can cause legitimate user journeys (and E2E) to trip 429s.
        // Keep it configurable for production tuning.
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__API_MAX_REQUESTS").unwrap_or(1200);
        let window_seconds = env_u64("LAW_EYE__RATE_LIMIT__API_WINDOW_SECONDS").unwrap_or(60);
        Self::new("api", max_requests, window_seconds)
    }
}

impl<S> Layer<S> for RateLimitLayer {
    type Service = RateLimitService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RateLimitService {
            inner,
            state: self.state.clone(),
        }
    }
}

#[derive(Clone)]
pub struct RateLimitService<S> {
    inner: S,
    state: RateLimitState,
}

impl<S> Service<Request<Body>> for RateLimitService<S>
where
    S: Service<Request<Body>, Response = Response<Body>> + Send + Clone + 'static,
    S::Future: Send,
{
    type Response = Response<Body>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let state = self.state.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            // Extract client IP from request
            let client_ip = req
                .extensions()
                .get::<ConnectInfo<SocketAddr>>()
                .map(|ci| ci.0.ip().to_string())
                .unwrap_or_else(|| {
                    req.headers()
                        .get("x-forwarded-for")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.split(',').next().unwrap_or("unknown").trim().to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                });

            match state.check_rate_limit(&client_ip).await {
                Ok(()) => inner.call(req).await,
                Err(rejection) => {
                    let body = ApiError::new("Too many requests. Please try again later.")
                        .with_code("RATE_LIMITED")
                        .with_details(json!({
                            "retry_after_seconds": rejection.retry_after_seconds,
                            "reason": rejection.reason,
                        }));

                    let mut response = (StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response();
                    if let Ok(value) = rejection.retry_after_seconds.to_string().parse() {
                        response.headers_mut().insert("Retry-After", value);
                    }
                    Ok(response)
                }
            }
        })
    }
}
