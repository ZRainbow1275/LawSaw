use async_trait::async_trait;
use chrono::{DateTime, Utc};
use law_eye_ai::{AiTelemetryEvent, AiTelemetrySink};
use law_eye_common::{Error, Result};
use law_eye_db::{AiUsageEvent, CreateAiUsageEvent};
use sqlx::PgPool;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

#[derive(Debug, Clone, Default)]
pub struct AiUsageFilters {
    pub operation: Option<String>,
    pub request_scope: Option<String>,
    pub success: Option<bool>,
    pub model: Option<String>,
    pub article_id: Option<Uuid>,
    pub report_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub created_after: Option<DateTime<Utc>>,
    pub created_before: Option<DateTime<Utc>>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Clone)]
pub struct AiUsageService {
    pool: PgPool,
}

impl AiUsageService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn record_event(&self, event: AiTelemetryEvent) -> Result<()> {
        let tenant_id = event.tenant_id;
        let input = CreateAiUsageEvent {
            occurred_at: event.occurred_at,
            request_scope: event.request_scope,
            operation: event.operation.as_str().to_string(),
            provider: event.provider,
            model: event.model,
            success: event.success,
            error_category: event.error_category,
            error_message: event.error_message,
            latency_ms: event.latency_ms.max(0),
            prompt_tokens: event.prompt_tokens.map(i64::from),
            completion_tokens: event.completion_tokens.map(i64::from),
            total_tokens: event.total_tokens.map(i64::from),
            estimated_input_tokens: event.estimated_input_tokens.map(i64::from),
            trace_id: event.trace_id,
            request_id: event.request_id,
            dedupe_key: event.dedupe_key,
            attempt: event.attempt,
            article_id: event.article_id,
            report_id: event.report_id,
            user_id: event.user_id,
            metadata: event.metadata,
        };

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query(
                    r#"
                    INSERT INTO ai_usage_events (
                        occurred_at,
                        request_scope,
                        operation,
                        provider,
                        model,
                        success,
                        error_category,
                        error_message,
                        latency_ms,
                        prompt_tokens,
                        completion_tokens,
                        total_tokens,
                        estimated_input_tokens,
                        trace_id,
                        request_id,
                        dedupe_key,
                        attempt,
                        article_id,
                        report_id,
                        user_id,
                        metadata
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
                    )
                    "#,
                )
                .bind(input.occurred_at)
                .bind(&input.request_scope)
                .bind(&input.operation)
                .bind(&input.provider)
                .bind(&input.model)
                .bind(input.success)
                .bind(&input.error_category)
                .bind(&input.error_message)
                .bind(input.latency_ms)
                .bind(input.prompt_tokens)
                .bind(input.completion_tokens)
                .bind(input.total_tokens)
                .bind(input.estimated_input_tokens)
                .bind(&input.trace_id)
                .bind(&input.request_id)
                .bind(&input.dedupe_key)
                .bind(input.attempt)
                .bind(input.article_id)
                .bind(input.report_id)
                .bind(input.user_id)
                .bind(&input.metadata)
                .execute(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                Ok(())
            })
        })
        .await
    }

    pub async fn list(
        &self,
        tenant_id: Uuid,
        filters: AiUsageFilters,
    ) -> Result<Vec<AiUsageEvent>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AiUsageEvent>(
                    r#"
                    SELECT *
                    FROM ai_usage_events
                    WHERE ($1::text IS NULL OR operation = $1)
                      AND ($2::text IS NULL OR request_scope = $2)
                      AND ($3::boolean IS NULL OR success = $3)
                      AND ($4::text IS NULL OR model = $4)
                      AND ($5::uuid IS NULL OR article_id = $5)
                      AND ($6::uuid IS NULL OR report_id = $6)
                      AND ($7::uuid IS NULL OR user_id = $7)
                      AND ($8::timestamptz IS NULL OR occurred_at >= $8)
                      AND ($9::timestamptz IS NULL OR occurred_at <= $9)
                    ORDER BY occurred_at DESC, id DESC
                    LIMIT $10 OFFSET $11
                    "#,
                )
                .bind(filters.operation.as_deref())
                .bind(filters.request_scope.as_deref())
                .bind(filters.success)
                .bind(filters.model.as_deref())
                .bind(filters.article_id)
                .bind(filters.report_id)
                .bind(filters.user_id)
                .bind(filters.created_after)
                .bind(filters.created_before)
                .bind(filters.limit)
                .bind(filters.offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))
            })
        })
        .await
    }

    pub async fn count(&self, tenant_id: Uuid, filters: AiUsageFilters) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result = sqlx::query_as::<_, (i64,)>(
                    r#"
                    SELECT COUNT(*)
                    FROM ai_usage_events
                    WHERE ($1::text IS NULL OR operation = $1)
                      AND ($2::text IS NULL OR request_scope = $2)
                      AND ($3::boolean IS NULL OR success = $3)
                      AND ($4::text IS NULL OR model = $4)
                      AND ($5::uuid IS NULL OR article_id = $5)
                      AND ($6::uuid IS NULL OR report_id = $6)
                      AND ($7::uuid IS NULL OR user_id = $7)
                      AND ($8::timestamptz IS NULL OR occurred_at >= $8)
                      AND ($9::timestamptz IS NULL OR occurred_at <= $9)
                    "#,
                )
                .bind(filters.operation.as_deref())
                .bind(filters.request_scope.as_deref())
                .bind(filters.success)
                .bind(filters.model.as_deref())
                .bind(filters.article_id)
                .bind(filters.report_id)
                .bind(filters.user_id)
                .bind(filters.created_after)
                .bind(filters.created_before)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                Ok(result.0)
            })
        })
        .await
    }
}

#[async_trait]
impl AiTelemetrySink for AiUsageService {
    async fn record(&self, event: AiTelemetryEvent) -> Result<()> {
        self.record_event(event).await
    }
}
