use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Duration, Utc};
use law_eye_common::Error;
use law_eye_core::with_tenant_tx;
use serde::Serialize;
use utoipa::ToSchema;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiResult, AppError};

/// AI 网关健康状态。
#[derive(Debug, Clone, Copy, Serialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiGatewayStatus {
    Healthy,
    Degraded,
    Down,
}

/// `/admin/dashboard/summary` 返回的运营 KPI 聚合。
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AdminDashboardSummary {
    pub active_users_24h: u64,
    pub articles_ingested_24h: u64,
    pub articles_total: u64,
    pub ai_tokens_24h: u64,
    pub ai_calls_24h: u64,
    pub feedbacks_pending: u64,
    pub feedbacks_total: u64,
    pub ai_gateway_status: AiGatewayStatus,
    pub last_updated_at: DateTime<Utc>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/summary", get(get_dashboard_summary))
}

async fn fetch_active_users_24h(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<i64, Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM users \
                 WHERE tenant_id = $1 AND last_login IS NOT NULL AND last_login >= $2",
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

async fn fetch_articles_counts(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<(i64, i64), Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let total: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM articles \
                 WHERE tenant_id = $1 AND deleted_at IS NULL",
            )
            .bind(tenant_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            let ingested: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM articles \
                 WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2",
            )
            .bind(tenant_id)
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok((total, ingested))
        })
    })
    .await
}

async fn fetch_ai_usage_24h(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
    since: DateTime<Utc>,
) -> Result<(i64, i64), Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let row: (Option<i64>, i64) = sqlx::query_as(
                "SELECT COALESCE(SUM(total_tokens), 0)::BIGINT, COUNT(*)::BIGINT \
                 FROM ai_usage_events WHERE occurred_at >= $1",
            )
            .bind(since)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok((row.0.unwrap_or(0), row.1))
        })
    })
    .await
}

async fn fetch_feedback_counts(
    pool: &sqlx::PgPool,
    tenant_id: uuid::Uuid,
) -> Result<(i64, i64), Error> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let total: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM feedbacks WHERE deleted_at IS NULL")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

            let pending: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM feedbacks WHERE deleted_at IS NULL AND status = 'pending'",
            )
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok((pending, total))
        })
    })
    .await
}

async fn classify_ai_gateway_status(state: &AppState) -> AiGatewayStatus {
    let Some(service) = state.ai_service.as_ref() else {
        return AiGatewayStatus::Down;
    };
    match tokio::time::timeout(std::time::Duration::from_secs(2), service.health_check()).await {
        Ok(Ok(())) => AiGatewayStatus::Healthy,
        Ok(Err(_)) => AiGatewayStatus::Degraded,
        Err(_) => AiGatewayStatus::Degraded,
    }
}

#[inline]
fn nonneg_u64(value: i64) -> u64 {
    value.max(0) as u64
}

/// Aggregated admin dashboard summary (KPI strip).
///
/// Returns 5 core admin KPIs plus a metadata timestamp. All counts are
/// scoped by RLS tenant context (set via `with_tenant_tx`); AI gateway
/// status is sourced from `LlmGateway::health_check` via `AiService`.
#[utoipa::path(
    get,
    path = "/api/v1/admin/dashboard/summary",
    security(("session" = [])),
    responses(
        (status = 200, description = "Admin dashboard KPI summary", body = AdminDashboardSummary),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Permission denied"),
        (status = 500, description = "Server error")
    ),
    tag = "admin"
)]
pub(crate) async fn get_dashboard_summary(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<AdminDashboardSummary>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    let tenant_id = user.tenant_id;

    let now = Utc::now();
    let since = now - Duration::hours(24);

    let pool = state.pool.clone();
    let pool_users = pool.clone();
    let pool_articles = pool.clone();
    let pool_ai = pool.clone();
    let pool_feedback = pool.clone();

    // Fan out the SELECTs concurrently. Each lives in its own RLS-scoped tx.
    let (active_users, article_counts, ai_usage, feedback_counts, gateway_status) = tokio::join!(
        fetch_active_users_24h(&pool_users, tenant_id, since),
        fetch_articles_counts(&pool_articles, tenant_id, since),
        fetch_ai_usage_24h(&pool_ai, tenant_id, since),
        fetch_feedback_counts(&pool_feedback, tenant_id),
        classify_ai_gateway_status(&state),
    );

    let active_users_24h = nonneg_u64(active_users.map_err(AppError::from)?);
    let (articles_total, articles_ingested_24h) = {
        let (total, ingested) = article_counts.map_err(AppError::from)?;
        (nonneg_u64(total), nonneg_u64(ingested))
    };
    let (ai_tokens_24h, ai_calls_24h) = {
        let (tokens, calls) = ai_usage.map_err(AppError::from)?;
        (nonneg_u64(tokens), nonneg_u64(calls))
    };
    let (feedbacks_pending, feedbacks_total) = {
        let (pending, total) = feedback_counts.map_err(AppError::from)?;
        (nonneg_u64(pending), nonneg_u64(total))
    };

    Ok(Json(AdminDashboardSummary {
        active_users_24h,
        articles_ingested_24h,
        articles_total,
        ai_tokens_24h,
        ai_calls_24h,
        feedbacks_pending,
        feedbacks_total,
        ai_gateway_status: gateway_status,
        last_updated_at: now,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Method, Request, StatusCode};
    use axum::Router;
    use axum_login::AuthManagerLayerBuilder;
    use law_eye_ai::LlmGateway;
    use law_eye_common::vault::PlaintextCipher;
    use law_eye_queue::TaskQueue;
    use metrics_exporter_prometheus::PrometheusBuilder;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use tower::ServiceExt;
    use tower_sessions::SessionManagerLayer;

    use crate::auth::AuthBackend;

    fn test_state() -> AppState {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_lazy("postgres://postgres:postgres@localhost/law_eye")
            .expect("lazy postgres pool");
        let queue = TaskQueue::new("redis://127.0.0.1/").expect("redis pool config");
        let recorder = PrometheusBuilder::new().build_recorder();
        let metrics_handle = recorder.handle();

        AppState::new(
            pool,
            queue,
            None,
            None,
            Some(LlmGateway::new("", None, None)),
            None,
            metrics_handle,
            None,
            false,
            false,
            300,
            vec!["google".to_string()],
            "LawSaw".to_string(),
            300,
            Arc::new(PlaintextCipher),
            None,
        )
    }

    fn test_app() -> Router {
        let state = test_state();
        let session_layer = SessionManagerLayer::new(tower_sessions::MemoryStore::default())
            .with_secure(false)
            .with_http_only(true);
        let auth_backend = AuthBackend::new(state.pool.clone());
        let auth_layer = AuthManagerLayerBuilder::new(auth_backend, session_layer).build();

        crate::routes::create_router(state).layer(auth_layer)
    }

    /// Without a session cookie the protected admin nest must short-circuit
    /// to 401/403 — never 200, never 404. This guarantees the route is
    /// mounted *and* the auth/permission stack is wired up correctly.
    #[tokio::test]
    async fn dashboard_summary_route_is_mounted_and_protected() {
        let app = test_app();

        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/v1/admin/dashboard/summary")
            .body(Body::empty())
            .expect("request");

        let status = app.oneshot(request).await.expect("response").status();

        assert_ne!(
            status,
            StatusCode::NOT_FOUND,
            "admin dashboard summary must be mounted under /api/v1"
        );
        assert!(
            status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN,
            "anonymous request must be rejected (401/403), got {status}"
        );
    }
}
