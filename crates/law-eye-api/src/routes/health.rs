use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
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
        .route("/full", get(full_check))
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
                .map(
                    |(query, calls, total_exec_time, mean_exec_time, rows)| SlowQueryItem {
                        query,
                        calls,
                        total_exec_time_ms: total_exec_time,
                        mean_exec_time_ms: mean_exec_time,
                        rows: rows.round().max(0.0) as i64,
                    },
                )
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

// ══════════════════════════════════════════════════════════════
// Phase G.1 — `/health/full` aggregated subsystem health
// ══════════════════════════════════════════════════════════════

/// Queues whose depth is surfaced in `/health/full`. Aligned with worker
/// `QUEUE_*` constants in `crates/law-eye-worker/src/main.rs`.
const FULL_HEALTH_TRACKED_QUEUES: &[&str] = &[
    "queue:ingest",
    "queue:ingest:priority",
    "queue:ai",
    "queue:push",
    "queue:report-export",
    "queue:report",
    "queue:tenant_export",
];

const FULL_HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(2);

#[utoipa::path(
    get,
    path = "/health/full",
    responses(
        (status = 200, description = "Aggregated subsystem health", body = Value),
        (status = 503, description = "Database is down — overall status=down", body = Value)
    )
)]
pub(crate) async fn full_check(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    // database — critical: failure flips overall to "down".
    let db_started = Instant::now();
    let db_check = match timeout(
        FULL_HEALTH_CHECK_TIMEOUT,
        sqlx::query("SELECT 1").execute(&state.pool),
    )
    .await
    {
        Ok(Ok(_)) => json!({
            "status": "ok",
            "latency_ms": db_started.elapsed().as_millis() as u64,
        }),
        Ok(Err(err)) => {
            warn!(error = %err, "/health/full: postgres SELECT 1 failed");
            json!({ "status": "down", "error": err.to_string() })
        }
        Err(_) => {
            warn!("/health/full: postgres SELECT 1 timed out");
            json!({ "status": "down", "error": "timeout" })
        }
    };
    let db_down = db_check
        .get("status")
        .and_then(Value::as_str)
        .map(|s| s == "down")
        .unwrap_or(true);

    // redis — non-critical: failure -> degraded. cache_service is the dedicated
    // CacheService::ping (separate from task_queue redis connection pool).
    let redis_check = match state.cache_service.as_ref() {
        Some(cache) => {
            let started = Instant::now();
            match timeout(FULL_HEALTH_CHECK_TIMEOUT, cache.ping()).await {
                Ok(Ok(())) => json!({
                    "status": "ok",
                    "latency_ms": started.elapsed().as_millis() as u64,
                }),
                Ok(Err(err)) => {
                    warn!(error = %err, "/health/full: redis ping failed");
                    json!({ "status": "down", "error": err.to_string() })
                }
                Err(_) => json!({ "status": "down", "error": "timeout" }),
            }
        }
        None => json!({ "status": "not_configured" }),
    };

    // task_queue — non-critical: surface depth per queue + ping result.
    let mut depths = serde_json::Map::new();
    let mut queue_ok = true;
    for queue in FULL_HEALTH_TRACKED_QUEUES {
        match timeout(
            FULL_HEALTH_CHECK_TIMEOUT,
            state.task_queue.queue_length(queue),
        )
        .await
        {
            Ok(Ok(len)) => {
                depths.insert((*queue).to_string(), Value::from(len));
            }
            Ok(Err(err)) => {
                warn!(queue = %queue, error = %err, "/health/full: queue_length failed");
                queue_ok = false;
                depths.insert((*queue).to_string(), Value::Null);
            }
            Err(_) => {
                queue_ok = false;
                depths.insert((*queue).to_string(), Value::Null);
            }
        }
    }
    let task_queue_check = if queue_ok {
        json!({ "status": "ok", "depths": Value::Object(depths) })
    } else {
        json!({ "status": "degraded", "depths": Value::Object(depths) })
    };

    // object_store — non-critical: failure -> degraded.
    let object_store_check = match state.object_service.as_ref() {
        Some(svc) => {
            let started = Instant::now();
            match timeout(FULL_HEALTH_CHECK_TIMEOUT, svc.health_check()).await {
                Ok(Ok(())) => json!({
                    "status": "ok",
                    "latency_ms": started.elapsed().as_millis() as u64,
                }),
                Ok(Err(err)) => {
                    warn!(error = %err, "/health/full: object_store probe failed");
                    json!({ "status": "down", "error": err.to_string() })
                }
                Err(_) => json!({ "status": "down", "error": "timeout" }),
            }
        }
        None => json!({ "status": "not_configured" }),
    };

    // ai_gateway — non-critical: skipped if no API key OR ai_service absent.
    // health_check on LlmGateway uses models().list() — no token burn.
    let ai_gateway_check = match state.ai_service.as_ref() {
        Some(svc) => {
            if std::env::var("OPENAI_API_KEY")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .is_none()
            {
                json!({ "status": "skipped", "reason": "no API key" })
            } else {
                let started = Instant::now();
                match timeout(FULL_HEALTH_CHECK_TIMEOUT, svc.health_check()).await {
                    Ok(Ok(())) => json!({
                        "status": "ok",
                        "latency_ms": started.elapsed().as_millis() as u64,
                    }),
                    Ok(Err(err)) => {
                        warn!(error = %err, "/health/full: ai_gateway probe failed");
                        json!({ "status": "down", "error": err.to_string() })
                    }
                    Err(_) => json!({ "status": "down", "error": "timeout" }),
                }
            }
        }
        None => json!({ "status": "skipped", "reason": "ai_service not configured" }),
    };

    // Overall:
    //   - down       if database fails
    //   - degraded   if any non-critical reports status != ok && != skipped && != not_configured
    //   - ok         otherwise
    let status_str = if db_down {
        "down"
    } else {
        let any_degraded = [
            &redis_check,
            &task_queue_check,
            &object_store_check,
            &ai_gateway_check,
        ]
        .iter()
        .any(|c| {
            c.get("status")
                .and_then(Value::as_str)
                .map(|s| s != "ok" && s != "skipped" && s != "not_configured")
                .unwrap_or(false)
        });
        if any_degraded {
            "degraded"
        } else {
            "ok"
        }
    };

    let response_status_code = if db_down {
        StatusCode::SERVICE_UNAVAILABLE
    } else {
        StatusCode::OK
    };

    let body = json!({
        "status": status_str,
        "checks": {
            "database": db_check,
            "redis": redis_check,
            "task_queue": task_queue_check,
            "object_store": object_store_check,
            "ai_gateway": ai_gateway_check,
        },
        "version": env!("CARGO_PKG_VERSION"),
        "checked_at": chrono::Utc::now().to_rfc3339(),
    });

    (response_status_code, Json(body))
}
