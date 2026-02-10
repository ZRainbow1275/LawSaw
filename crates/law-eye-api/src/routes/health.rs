use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::timeout;
use tracing::warn;
use utoipa::ToSchema;

use crate::state::AppState;

const DEGRADED_REASON_RULE_BASED_FALLBACK: &str = "rule-based fallback";
const DEGRADED_REASON_NOT_CONFIGURED: &str = "not_configured";
const DEGRADED_REASON_UPSTREAM_UNREACHABLE: &str = "upstream_unreachable";
const DEGRADED_REASON_CHECK_TIMEOUT: &str = "check_timeout";

#[derive(Serialize, ToSchema)]
pub struct DependencyHealth {
    pub ok: bool,
}

#[derive(Serialize, ToSchema)]
pub struct CapabilityHealth {
    pub available: bool,
    pub degraded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degraded_reason: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct ConfigReloadHealth {
    pub enabled: bool,
    pub revision: u64,
}

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub postgres: DependencyHealth,
    pub redis: DependencyHealth,
    pub object_storage: CapabilityHealth,
    pub ai: CapabilityHealth,
    pub config_reload: ConfigReloadHealth,
}

#[derive(Serialize, ToSchema)]
pub struct LivenessResponse {
    pub status: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct SlowQueryParams {
    pub limit: Option<i64>,
}

#[derive(Serialize, ToSchema)]
pub struct SlowQueryItem {
    pub query: String,
    pub calls: i64,
    pub total_exec_time_ms: f64,
    pub mean_exec_time_ms: f64,
    pub rows: i64,
}

#[derive(Serialize, ToSchema)]
pub struct SlowQueryResponse {
    pub enabled: bool,
    pub collected_at: chrono::DateTime<chrono::Utc>,
    pub limit: i64,
    pub entries: Vec<SlowQueryItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}


fn allow_slow_query_access(state: &AppState, headers: &HeaderMap) -> bool {
    if std::env::var_os("PRODUCTION").is_none() {
        return true;
    }

    let Some(token) = state
        .metrics_token
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty())
    else {
        return false;
    };

    let expected = format!("Bearer {}", token);
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.trim() == expected)
}

pub fn router() -> Router<crate::state::AppState> {
    Router::new()
        // Backward-compatible: keep `/health` as readiness check.
        .route("/", get(health_check))
        .route("/ready", get(ready_check))
        .route("/live", get(live_check))
        .route("/slow-queries", get(slow_queries))
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

    let object_storage = match state.object_service.as_ref() {
        Some(service) => match timeout(check_timeout, service.health_check()).await {
            Ok(Ok(())) => CapabilityHealth {
                available: true,
                degraded: false,
                degraded_reason: None,
            },
            Ok(Err(err)) => {
                warn!(error = %err, "healthcheck: object storage probe failed");
                CapabilityHealth {
                    available: true,
                    degraded: true,
                    degraded_reason: Some(DEGRADED_REASON_UPSTREAM_UNREACHABLE.to_string()),
                }
            }
            Err(_) => {
                warn!("healthcheck: object storage probe timed out");
                CapabilityHealth {
                    available: true,
                    degraded: true,
                    degraded_reason: Some(DEGRADED_REASON_CHECK_TIMEOUT.to_string()),
                }
            }
        },
        None => CapabilityHealth {
            available: false,
            degraded: true,
            degraded_reason: Some(DEGRADED_REASON_NOT_CONFIGURED.to_string()),
        },
    };

    let ai = match state.ai_service.as_ref() {
        Some(service) => match timeout(check_timeout, service.health_check()).await {
            Ok(Ok(())) => CapabilityHealth {
                available: true,
                degraded: false,
                degraded_reason: None,
            },
            Ok(Err(err)) => {
                warn!(error = %err, "healthcheck: ai probe failed");
                CapabilityHealth {
                    available: true,
                    degraded: true,
                    degraded_reason: Some(DEGRADED_REASON_UPSTREAM_UNREACHABLE.to_string()),
                }
            }
            Err(_) => {
                warn!("healthcheck: ai probe timed out");
                CapabilityHealth {
                    available: true,
                    degraded: true,
                    degraded_reason: Some(DEGRADED_REASON_CHECK_TIMEOUT.to_string()),
                }
            }
        },
        None => CapabilityHealth {
            available: false,
            degraded: true,
            degraded_reason: Some(DEGRADED_REASON_RULE_BASED_FALLBACK.to_string()),
        },
    };

    let config_reload = match state.config_runtime.as_ref() {
        Some(runtime) => ConfigReloadHealth {
            enabled: true,
            revision: runtime.revision(),
        },
        None => ConfigReloadHealth {
            enabled: false,
            revision: 0,
        },
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
            object_storage,
            ai,
            config_reload,
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


#[utoipa::path(
    get,
    path = "/health/slow-queries",
    responses(
        (status = 200, description = "Slow query metrics", body = SlowQueryResponse),
        (status = 404, description = "Not found", body = SlowQueryResponse),
        (status = 500, description = "Server error", body = SlowQueryResponse)
    )
)]
pub(crate) async fn slow_queries(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<SlowQueryParams>,
) -> (StatusCode, Json<SlowQueryResponse>) {
    let limit = params.limit.unwrap_or(20).clamp(1, 100);

    if !allow_slow_query_access(&state, &headers) {
        return (
            StatusCode::NOT_FOUND,
            Json(SlowQueryResponse {
                enabled: false,
                collected_at: chrono::Utc::now(),
                limit,
                entries: Vec::new(),
                error: None,
            }),
        );
    }

    let result = sqlx::query_as::<_, (String, i64, f64, f64, f64)>(
        r#"
        SELECT
            query,
            calls::BIGINT,
            total_exec_time,
            mean_exec_time,
            rows::DOUBLE PRECISION
        FROM pg_stat_statements
        ORDER BY mean_exec_time DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await;

    match result {
        Ok(rows) => {
            let entries = rows
                .into_iter()
                .map(|(query, calls, total_exec_time, mean_exec_time, rows)| SlowQueryItem {
                    query,
                    calls,
                    total_exec_time_ms: total_exec_time,
                    mean_exec_time_ms: mean_exec_time,
                    rows: rows.round().max(0.0) as i64,
                })
                .collect();

            (
                StatusCode::OK,
                Json(SlowQueryResponse {
                    enabled: true,
                    collected_at: chrono::Utc::now(),
                    limit,
                    entries,
                    error: None,
                }),
            )
        }
        Err(err) => {
            warn!(error = %err, "healthcheck: slow query metrics unavailable");
            (
                StatusCode::OK,
                Json(SlowQueryResponse {
                    enabled: false,
                    collected_at: chrono::Utc::now(),
                    limit,
                    entries: Vec::new(),
                    error: Some("pg_stat_statements_unavailable".to_string()),
                }),
            )
        }
    }
}
