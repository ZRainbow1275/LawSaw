use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

async fn enqueue_event_tx_inner(
    tenant_id: Uuid,
    tx: &mut Transaction<'_, Postgres>,
    event_type: &str,
    payload: &serde_json::Value,
    dedupe_key: &str,
) -> Result<u64> {
    let event_type = event_type.trim();
    if event_type.is_empty() {
        return Err(Error::Validation("event_type cannot be empty".to_string()));
    }

    let dedupe_key = dedupe_key.trim();
    if dedupe_key.is_empty() {
        return Err(Error::Validation("dedupe_key cannot be empty".to_string()));
    }

    sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
        .bind(tenant_id.to_string())
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    let inserted = sqlx::query(
        r#"
        INSERT INTO webhook_events (
            endpoint_id,
            event_type,
            payload,
            occurred_at,
            dedupe_key,
            max_retries,
            next_attempt_at
        )
        SELECT
            ep.id,
            $1,
            $2,
            NOW(),
            $3,
            ep.max_retries,
            NOW()
        FROM webhook_endpoints ep
        WHERE ep.deleted_at IS NULL
          AND ep.enabled = true
          AND ($1 = ANY(ep.events) OR '*' = ANY(ep.events))
        ON CONFLICT (tenant_id, endpoint_id, dedupe_key)
        WHERE delivered_at IS NULL
        DO NOTHING
        "#,
    )
    .bind(event_type)
    .bind(payload)
    .bind(dedupe_key)
    .execute(tx.as_mut())
    .await
    .map_err(|e| Error::Database(e.to_string()))?
    .rows_affected();

    Ok(inserted)
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WebhookEndpoint {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub events: Vec<String>,
    pub timeout_ms: i32,
    pub max_retries: i32,
    pub created_by: Option<Uuid>,
    pub last_success_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_failure_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_status_code: Option<i32>,
    pub last_error: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWebhookEndpointInput {
    pub name: String,
    pub url: String,
    pub signing_secret: String,
    pub enabled: bool,
    pub events: Vec<String>,
    pub timeout_ms: i32,
    pub max_retries: i32,
    pub created_by: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateWebhookEndpointInput {
    pub name: Option<String>,
    pub url: Option<String>,
    pub signing_secret: Option<String>,
    pub enabled: Option<bool>,
    pub events: Option<Vec<String>>,
    pub timeout_ms: Option<i32>,
    pub max_retries: Option<i32>,
}

pub struct WebhookService {
    pool: PgPool,
}

impl WebhookService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_endpoints(
        &self,
        tenant_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WebhookEndpoint>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, WebhookEndpoint>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        name,
                        url,
                        enabled,
                        events,
                        timeout_ms,
                        max_retries,
                        created_by,
                        last_success_at,
                        last_failure_at,
                        last_status_code,
                        last_error,
                        created_at,
                        updated_at
                    FROM webhook_endpoints
                    WHERE deleted_at IS NULL
                    ORDER BY created_at DESC, id DESC
                    LIMIT $1 OFFSET $2
                    "#,
                )
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn count_endpoints(&self, tenant_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let (count,) = sqlx::query_as::<_, (i64,)>(
                    "SELECT COUNT(*) FROM webhook_endpoints WHERE deleted_at IS NULL",
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(count)
            })
        })
        .await
    }

    pub async fn create_endpoint(
        &self,
        tenant_id: Uuid,
        input: CreateWebhookEndpointInput,
    ) -> Result<WebhookEndpoint> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, WebhookEndpoint>(
                    r#"
                    INSERT INTO webhook_endpoints (
                        name,
                        url,
                        signing_secret,
                        enabled,
                        events,
                        timeout_ms,
                        max_retries,
                        created_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING
                        id,
                        tenant_id,
                        name,
                        url,
                        enabled,
                        events,
                        timeout_ms,
                        max_retries,
                        created_by,
                        last_success_at,
                        last_failure_at,
                        last_status_code,
                        last_error,
                        created_at,
                        updated_at
                    "#,
                )
                .bind(&input.name)
                .bind(&input.url)
                .bind(&input.signing_secret)
                .bind(input.enabled)
                .bind(&input.events)
                .bind(input.timeout_ms)
                .bind(input.max_retries)
                .bind(input.created_by)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn update_endpoint(
        &self,
        tenant_id: Uuid,
        endpoint_id: Uuid,
        input: UpdateWebhookEndpointInput,
    ) -> Result<WebhookEndpoint> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let endpoint = sqlx::query_as::<_, WebhookEndpoint>(
                    r#"
                    UPDATE webhook_endpoints
                    SET
                        name = COALESCE($2, name),
                        url = COALESCE($3, url),
                        signing_secret = COALESCE($4, signing_secret),
                        enabled = COALESCE($5, enabled),
                        events = COALESCE($6, events),
                        timeout_ms = COALESCE($7, timeout_ms),
                        max_retries = COALESCE($8, max_retries),
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING
                        id,
                        tenant_id,
                        name,
                        url,
                        enabled,
                        events,
                        timeout_ms,
                        max_retries,
                        created_by,
                        last_success_at,
                        last_failure_at,
                        last_status_code,
                        last_error,
                        created_at,
                        updated_at
                    "#,
                )
                .bind(endpoint_id)
                .bind(&input.name)
                .bind(&input.url)
                .bind(&input.signing_secret)
                .bind(input.enabled)
                .bind(&input.events)
                .bind(input.timeout_ms)
                .bind(input.max_retries)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| {
                    Error::NotFound(format!("Webhook endpoint {} not found", endpoint_id))
                })?;

                Ok(endpoint)
            })
        })
        .await
    }

    pub async fn delete_endpoint(&self, tenant_id: Uuid, endpoint_id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let affected = sqlx::query(
                    "UPDATE webhook_endpoints SET deleted_at = NOW(), enabled = false, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(endpoint_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .rows_affected();

                if affected == 0 {
                    return Err(Error::NotFound(format!(
                        "Webhook endpoint {} not found",
                        endpoint_id
                    )));
                }

                Ok(())
            })
        })
        .await
    }

    pub async fn enqueue_event(
        &self,
        tenant_id: Uuid,
        event_type: &str,
        payload: serde_json::Value,
        dedupe_key: &str,
    ) -> Result<u64> {
        let event_type = event_type.to_string();
        let dedupe_key = dedupe_key.to_string();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                enqueue_event_tx_inner(tenant_id, tx, &event_type, &payload, &dedupe_key).await
            })
        })
        .await
    }

    pub async fn enqueue_event_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        event_type: &str,
        payload: &serde_json::Value,
        dedupe_key: &str,
    ) -> Result<u64> {
        enqueue_event_tx_inner(tenant_id, tx, event_type, payload, dedupe_key).await
    }

    pub async fn enqueue_test_event(
        &self,
        tenant_id: Uuid,
        endpoint_id: Uuid,
        event_type: &str,
        payload: serde_json::Value,
    ) -> Result<Uuid> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let event_type = event_type.to_string();
            Box::pin(async move {
                let row = sqlx::query_as::<_, (i32,)>(
                    "SELECT max_retries FROM webhook_endpoints WHERE id = $1 AND deleted_at IS NULL AND enabled = true",
                )
                .bind(endpoint_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| {
                    Error::NotFound(format!("Webhook endpoint {} not found", endpoint_id))
                })?;

                let event_id = Uuid::new_v4();
                let dedupe_key = format!("manual-test:{}:{}", endpoint_id, event_id);

                sqlx::query(
                    r#"
                    INSERT INTO webhook_events (
                        id,
                        endpoint_id,
                        event_type,
                        payload,
                        occurred_at,
                        dedupe_key,
                        max_retries,
                        next_attempt_at
                    )
                    VALUES ($1, $2, $3, $4, NOW(), $5, $6, NOW())
                    "#,
                )
                .bind(event_id)
                .bind(endpoint_id)
                .bind(event_type)
                .bind(payload)
                .bind(dedupe_key)
                .bind(row.0)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(event_id)
            })
        })
        .await
    }
}
