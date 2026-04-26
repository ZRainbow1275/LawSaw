use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use law_eye_common::Error;
use law_eye_core::with_tenant_tx;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/timeseries", get(get_usage_timeseries))
        .route("/by-model", get(get_usage_by_model))
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct TimeseriesQuery {
    /// Bucket granularity. Currently supports `hour` (default) or `day`.
    pub bucket: Option<String>,
    /// Lookback window in hours. Default 24, max 720 (30 days).
    pub hours: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UsageBucket {
    pub bucket_at: DateTime<Utc>,
    pub calls: i64,
    pub total_tokens: i64,
    pub p95_latency_ms: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UsageTimeseriesResponse {
    pub bucket: String,
    pub since: DateTime<Utc>,
    pub until: DateTime<Utc>,
    pub buckets: Vec<UsageBucket>,
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/ai/usage/timeseries",
    params(TimeseriesQuery),
    security(("session" = [])),
    responses(
        (status = 200, description = "Bucketed AI usage timeseries", body = UsageTimeseriesResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
pub(crate) async fn get_usage_timeseries(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<TimeseriesQuery>,
) -> ApiResult<Json<UsageTimeseriesResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "ai:usage:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let bucket = match query.bucket.as_deref().unwrap_or("hour") {
        "hour" => "hour",
        "day" => "day",
        other => {
            return Err(AppError::validation(format!(
                "bucket must be 'hour' or 'day', got '{other}'"
            )));
        }
    };

    let hours = query.hours.unwrap_or(24).clamp(1, 720);
    let until = Utc::now();
    let since = until - Duration::hours(hours);

    let tenant_id = user.tenant_id;
    let buckets = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let sql = format!(
                r#"
                SELECT
                    date_trunc('{bucket}', occurred_at) AS bucket_at,
                    COUNT(*)::BIGINT AS calls,
                    COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
                    COALESCE(
                        PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY latency_ms),
                        0
                    )::BIGINT AS p95_latency_ms
                FROM ai_usage_events
                WHERE occurred_at >= $1 AND occurred_at < $2
                GROUP BY bucket_at
                ORDER BY bucket_at ASC
                "#
            );

            sqlx::query_as::<_, (DateTime<Utc>, i64, i64, i64)>(&sql)
                .bind(since)
                .bind(until)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
    .map_err(AppError::from)?;

    let buckets = buckets
        .into_iter()
        .map(
            |(bucket_at, calls, total_tokens, p95_latency_ms)| UsageBucket {
                bucket_at,
                calls,
                total_tokens,
                p95_latency_ms,
            },
        )
        .collect();

    Ok(Json(UsageTimeseriesResponse {
        bucket: bucket.to_string(),
        since,
        until,
        buckets,
    }))
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ByModelQuery {
    /// Lookback period. Accepts `24h`, `7d`, `30d`. Default `24h`.
    pub period: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UsageByModelEntry {
    pub model: Option<String>,
    pub calls: i64,
    pub total_tokens: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub estimated_cost_usd: f64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UsageByModelResponse {
    pub period: String,
    pub since: DateTime<Utc>,
    pub until: DateTime<Utc>,
    pub data: Vec<UsageByModelEntry>,
}

fn parse_period_to_hours(period: &str) -> Result<i64, AppError> {
    match period {
        "24h" => Ok(24),
        "7d" => Ok(24 * 7),
        "30d" => Ok(24 * 30),
        other => Err(AppError::validation(format!(
            "period must be '24h' / '7d' / '30d', got '{other}'"
        ))),
    }
}

/// Rough USD cost estimate per 1K tokens. Values are conservative defaults
/// for OpenAI-tier models; tenants requiring per-tenant pricing should plug
/// in a billing service later. This keeps the dashboard meaningful without
/// blocking on a full pricing table.
fn estimate_cost_usd(model: Option<&str>, prompt_tokens: i64, completion_tokens: i64) -> f64 {
    let (prompt_per_1k, completion_per_1k) = match model.unwrap_or("") {
        m if m.contains("gpt-4o-mini") => (0.00015, 0.00060),
        m if m.contains("gpt-4o") => (0.00250, 0.01000),
        m if m.contains("gpt-4") => (0.03000, 0.06000),
        m if m.contains("gpt-3.5") => (0.00050, 0.00150),
        m if m.contains("embedding") => (0.00010, 0.0),
        _ => (0.00100, 0.00200),
    };
    (prompt_tokens as f64 / 1000.0) * prompt_per_1k
        + (completion_tokens as f64 / 1000.0) * completion_per_1k
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/ai/usage/by-model",
    params(ByModelQuery),
    security(("session" = [])),
    responses(
        (status = 200, description = "AI usage grouped by model", body = UsageByModelResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
pub(crate) async fn get_usage_by_model(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ByModelQuery>,
) -> ApiResult<Json<UsageByModelResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "ai:usage:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let period = query.period.as_deref().unwrap_or("24h").to_string();
    let hours = parse_period_to_hours(&period)?;
    let until = Utc::now();
    let since = until - Duration::hours(hours);

    let tenant_id = user.tenant_id;
    let rows = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, (Option<String>, i64, i64, i64, i64)>(
                r#"
                SELECT
                    model,
                    COUNT(*)::BIGINT AS calls,
                    COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
                    COALESCE(SUM(prompt_tokens), 0)::BIGINT AS prompt_tokens,
                    COALESCE(SUM(completion_tokens), 0)::BIGINT AS completion_tokens
                FROM ai_usage_events
                WHERE occurred_at >= $1 AND occurred_at < $2
                GROUP BY model
                ORDER BY total_tokens DESC, calls DESC
                "#,
            )
            .bind(since)
            .bind(until)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
    .map_err(AppError::from)?;

    let data = rows
        .into_iter()
        .map(
            |(model, calls, total_tokens, prompt_tokens, completion_tokens)| {
                let estimated_cost_usd =
                    estimate_cost_usd(model.as_deref(), prompt_tokens, completion_tokens);
                UsageByModelEntry {
                    model,
                    calls,
                    total_tokens,
                    prompt_tokens,
                    completion_tokens,
                    estimated_cost_usd,
                }
            },
        )
        .collect();

    Ok(Json(UsageByModelResponse {
        period,
        since,
        until,
        data,
    }))
}
