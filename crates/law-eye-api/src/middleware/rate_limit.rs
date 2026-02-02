use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, Response, StatusCode},
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::{
    collections::HashMap,
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::{Duration, Instant},
};
use tokio::sync::RwLock;
use tower::{Layer, Service};

use crate::ApiError;

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

#[derive(Debug, Clone)]
struct RateLimitEntry {
    count: u32,
    window_start: Instant,
}

#[derive(Clone)]
pub struct RateLimitState {
    entries: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
    max_requests: u32,
    window_duration: Duration,
}

impl RateLimitState {
    pub fn new(max_requests: u32, window_seconds: u64) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            max_requests,
            window_duration: Duration::from_secs(window_seconds),
        }
    }

    async fn check_rate_limit(&self, key: &str) -> Result<(), u64> {
        let now = Instant::now();
        let mut entries = self.entries.write().await;

        if let Some(entry) = entries.get_mut(key) {
            let elapsed = now.duration_since(entry.window_start);

            if elapsed >= self.window_duration {
                // Window expired, reset
                entry.count = 1;
                entry.window_start = now;
                Ok(())
            } else if entry.count >= self.max_requests {
                // Rate limit exceeded
                let retry_after = (self.window_duration - elapsed).as_secs();
                Err(retry_after)
            } else {
                // Increment counter
                entry.count += 1;
                Ok(())
            }
        } else {
            // First request from this key
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

    pub async fn cleanup_expired(&self) {
        let now = Instant::now();
        let mut entries = self.entries.write().await;
        entries
            .retain(|_, entry| now.duration_since(entry.window_start) < self.window_duration * 2);
    }
}

#[derive(Clone)]
pub struct RateLimitLayer {
    state: RateLimitState,
}

impl RateLimitLayer {
    pub fn new(max_requests: u32, window_seconds: u64) -> Self {
        let state = RateLimitState::new(max_requests, window_seconds);

        // Spawn cleanup task
        let cleanup_state = state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                cleanup_state.cleanup_expired().await;
            }
        });

        Self { state }
    }

    pub fn login() -> Self {
        // Stricter limits for login attempts per client IP.
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__LOGIN_MAX_REQUESTS").unwrap_or(5);
        let window_seconds = env_u64("LAW_EYE__RATE_LIMIT__LOGIN_WINDOW_SECONDS").unwrap_or(60);
        Self::new(max_requests, window_seconds)
    }

    pub fn register() -> Self {
        // Registrations per client IP (default: 3 per hour).
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__REGISTER_MAX_REQUESTS").unwrap_or(3);
        let window_seconds =
            env_u64("LAW_EYE__RATE_LIMIT__REGISTER_WINDOW_SECONDS").unwrap_or(3600);
        Self::new(max_requests, window_seconds)
    }

    pub fn api() -> Self {
        // General API per client IP.
        //
        // NOTE: The earlier default (100/minute) is too low for a modern SPA with background
        // refetching and can cause legitimate user journeys (and E2E) to trip 429s.
        // Keep it configurable for production tuning.
        let max_requests = env_u32("LAW_EYE__RATE_LIMIT__API_MAX_REQUESTS").unwrap_or(1200);
        let window_seconds = env_u64("LAW_EYE__RATE_LIMIT__API_WINDOW_SECONDS").unwrap_or(60);
        Self::new(max_requests, window_seconds)
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
                Err(retry_after) => {
                    let body = ApiError::new("Too many requests. Please try again later.")
                        .with_code("RATE_LIMITED")
                        .with_details(json!({ "retry_after_seconds": retry_after }));

                    let mut response = (StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response();
                    if let Ok(value) = retry_after.to_string().parse() {
                        response.headers_mut().insert("Retry-After", value);
                    }
                    Ok(response)
                }
            }
        })
    }
}
