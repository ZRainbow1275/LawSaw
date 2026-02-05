use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use serde::Serialize;
use std::time::Duration;
use tokio::time::timeout;
use tracing::warn;
use utoipa::ToSchema;

use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct DependencyHealth {
    pub ok: bool,
}

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub postgres: DependencyHealth,
    pub redis: DependencyHealth,
}

#[derive(Serialize, ToSchema)]
pub struct LivenessResponse {
    pub status: String,
    pub version: String,
}

pub fn router() -> Router<crate::state::AppState> {
    Router::new()
        // Backward-compatible: keep `/health` as readiness check.
        .route("/", get(health_check))
        .route("/ready", get(ready_check))
        .route("/live", get(live_check))
}

#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = 200, description = "Service is healthy", body = HealthResponse),
        (status = 503, description = "Service is unhealthy", body = HealthResponse)
    )
)]
pub(crate) async fn health_check(
    State(state): State<AppState>,
) -> (StatusCode, Json<HealthResponse>) {
    readiness_check(State(state)).await
}

#[utoipa::path(
    get,
    path = "/health/ready",
    responses(
        (status = 200, description = "Service is ready", body = HealthResponse),
        (status = 503, description = "Service is not ready", body = HealthResponse)
    )
)]
pub(crate) async fn ready_check(
    State(state): State<AppState>,
) -> (StatusCode, Json<HealthResponse>) {
    readiness_check(State(state)).await
}

async fn readiness_check(State(state): State<AppState>) -> (StatusCode, Json<HealthResponse>) {
    let check_timeout = Duration::from_secs(2);

    let postgres_ok =
        match timeout(check_timeout, sqlx::query("SELECT 1").execute(&state.pool)).await {
            Ok(Ok(_)) => true,
            Ok(Err(err)) => {
                warn!(error = %err, "healthcheck: postgres query failed");
                false
            }
            Err(_) => {
                warn!("healthcheck: postgres query timed out");
                false
            }
        };

    let redis_ok = match timeout(check_timeout, state.task_queue.ping()).await {
        Ok(Ok(())) => true,
        Ok(Err(err)) => {
            warn!(error = %err, "healthcheck: redis ping failed");
            false
        }
        Err(_) => {
            warn!("healthcheck: redis ping timed out");
            false
        }
    };

    let ok = postgres_ok && redis_ok;
    let status_code = if ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(HealthResponse {
            status: if ok {
                "ok".to_string()
            } else {
                "error".to_string()
            },
            version: env!("CARGO_PKG_VERSION").to_string(),
            postgres: DependencyHealth { ok: postgres_ok },
            redis: DependencyHealth { ok: redis_ok },
        }),
    )
}

#[utoipa::path(
    get,
    path = "/health/live",
    responses((status = 200, description = "Service is alive", body = LivenessResponse))
)]
pub(crate) async fn live_check() -> (StatusCode, Json<LivenessResponse>) {
    (
        StatusCode::OK,
        Json(LivenessResponse {
            status: "ok".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }),
    )
}
