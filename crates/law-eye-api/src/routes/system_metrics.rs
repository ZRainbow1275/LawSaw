//! Phase G.1 — `/admin/system/metrics` operational metrics aggregator.
//!
//! Tenant-admin / super-admin gated. All counts are tenant-scoped via RLS
//! (`with_tenant_tx` sets `app.tenant_id`). Complements the Prometheus
//! `/metrics` endpoint, which exposes process metrics; this endpoint
//! aggregates business-level KPIs for the admin dashboard.

use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Duration, Utc};
use law_eye_common::Error;
use law_eye_core::with_tenant_tx;
use serde::Serialize;
use serde_json::{Map, Value};
use std::time::Duration as StdDuration;
use tokio::time::timeout;
use tracing::warn;
use utoipa::ToSchema;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiResult, AppError};

const TRACKED_QUEUES: &[&str] = &[
    "queue:ingest",
    "queue:ingest:priority",
    "queue:ai",
    "queue:push",
    "queue:report-export",
    "queue:report",
    "queue:tenant_export",
];

const QUEUE_DEPTH_TIMEOUT: StdDuration = StdDuration::from_secs(2);

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SystemMetricsResponse {
    pub active_users: u64,
    pub articles_ingested_24h: u64,
    pub reports_generated_7d: u64,
    pub ai_tokens_consumed_24h: u64,
    pub storage_used_mb: u64,
    pub queue_depths: Value,
    pub error_rate_5min: f64,
    pub checked_at: DateTime<Utc>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/metrics", get(get_system_metrics))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/system/metrics",
    security(("session" = [])),
    responses(
        (status = 200, description = "System metrics snapshot", body = SystemMetricsResponse),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Permission denied"),
        (status = 500, description = "Server error")
    ),
    tag = "admin"
)]
pub(crate) async fn get_system_metrics(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<SystemMetricsResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    let tenant_id = user.tenant_id;

    let now = Utc::now();
    let since_24h = now - Duration::hours(24);
    let since_7d = now - Duration::days(7);
    let since_5min = now - Duration::minutes(5);

    let pool_active = state.pool.clone();
    let pool_articles = state.pool.clone();
    let pool_reports = state.pool.clone();
    let pool_ai = state.pool.clone();
    let pool_storage = state.pool.clone();
    let pool_errors = state.pool.clone();

    let (
        active_users,
        articles_ingested,
        reports_generated,
        ai_tokens,
        storage_bytes,
        error_rate,
    ) = tokio::join!(
        fetch_active_users_7d(&pool_active, tenant_id, since_7d),
        fetch_articles_ingested_24h(&pool_articles, tenant_id, since_24h),
        fetch_reports_generated_7d(&pool_reports, tenant_id, since_7d),
        fetch_ai_tokens_24h(&pool_ai, tenant_id, since_24h),
        fetch_storage_used_bytes(&pool_storage, tenant_id),
        fetch_error_rate_5min(&pool_errors, tenant_id, since_5min),
    );

    let active_users = active_users.map_err(map_db_err)?;
    let articles_ingested = articles_ingested.map_err(map_db_err)?;
    let reports_generated = reports_generated.map_err(map_db_err)?;
    let ai_tokens = ai_tokens.map_err(map_db_err)?;
    let storage_bytes = storage_bytes.map_err(map_db_err)?;
    let error_rate = error_rate.map_err(map_db_err)?;

    let storage_mb = storage_bytes / 1_048_576;

    // queue_depths: best-effort. Failures surface as null entries; never aborts
    // the response (queue depth probes are observability, not gating).
    let mut depths = Map::new();
    for queue in TRACKED_QUEUES {
        match timeout(QUEUE_DEPTH_TIMEOUT, state.task_queue.queue_length(queue)).await {
            Ok(Ok(len)) => {
                depths.insert((*queue).to_string(), Value::from(len));
            }
            Ok(Err(err)) => {
                warn!(queue = %queue, error = %err, "system/metrics: queue_length failed");
                depths.insert((*queue).to_string(), Value::Null);
            }
            Err(_) => {
                warn!(queue = %queue, "system/metrics: queue_length timed out");
                depths.insert((*queue).to_string(), Value::Null);
            }
        }
    }

    Ok(Json(SystemMetricsResponse {
        active_users: nonneg_u64(active_users),
        articles_ingested_24h: nonneg_u64(articles_ingested),
        reports_generated_7d: nonneg_u64(reports_generated),
        ai_tokens_consumed_24h: nonneg_u64(ai_tokens),
        storage_used_mb: nonneg_u64(storage_mb),
        queue_depths: Value::Object(depths),
        error_rate_5min: error_rate,
        checked_at: now,
    }))
}

#[inline]
fn nonneg_u64(value: i64) -> u64 {
    value.max(0) as u64
}

fn map_db_err(err: Error) -> AppError {
    AppError::internal(format!("system metrics query failed: {}", err))
}

async fn fetch_active_users_7d(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<i64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(DISTINCT user_id) FROM audit_logs \
                 WHERE tenant_id = $1 AND user_id IS NOT NULL AND created_at >= $2",
            )
            .bind(tenant_id)
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
}

async fn fetch_articles_ingested_24h(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<i64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM articles \
                 WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2",
            )
            .bind(tenant_id)
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
}

async fn fetch_reports_generated_7d(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<i64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM reports \
                 WHERE tenant_id = $1 AND created_at >= $2",
            )
            .bind(tenant_id)
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
}

async fn fetch_ai_tokens_24h(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<i64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let raw: Option<i64> = sqlx::query_scalar(
                "SELECT COALESCE(SUM(total_tokens), 0)::BIGINT FROM ai_usage_events \
                 WHERE tenant_id = $1 AND occurred_at >= $2",
            )
            .bind(tenant_id)
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
            Ok(raw.unwrap_or(0))
        })
    })
    .await
}

async fn fetch_storage_used_bytes(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
) -> Result<i64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let raw: Option<i64> = sqlx::query_scalar(
                "SELECT COALESCE(SUM(byte_size), 0)::BIGINT FROM objects WHERE tenant_id = $1",
            )
            .bind(tenant_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
            Ok(raw.unwrap_or(0))
        })
    })
    .await
}

/// `error_rate_5min` = errors / total within last 5 minutes.
/// If total is 0, returns 0.0.
async fn fetch_error_rate_5min(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<f64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let row: (i64, i64) = sqlx::query_as(
                "SELECT \
                   COUNT(*) FILTER (WHERE action LIKE 'error.%')::BIGINT, \
                   COUNT(*)::BIGINT \
                 FROM audit_logs \
                 WHERE tenant_id = $1 AND created_at >= $2",
            )
            .bind(tenant_id)
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
            let (errors, total) = row;
            if total <= 0 {
                Ok(0.0_f64)
            } else {
                Ok(errors as f64 / total as f64)
            }
        })
    })
    .await
}
