use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{CreateDomainEvent, DomainEvent};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

const EVENT_BUS_CHANNEL: &str = "law_eye_domain_events";

#[derive(Debug, Clone)]
pub struct DomainEventInput {
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub aggregate_version: i64,
    pub event_type: String,
    pub event_version: i32,
    pub dedupe_key: String,
    pub payload: serde_json::Value,
    pub metadata: serde_json::Value,
    pub occurred_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<DomainEventInput> for CreateDomainEvent {
    fn from(value: DomainEventInput) -> Self {
        Self {
            aggregate_type: value.aggregate_type,
            aggregate_id: value.aggregate_id,
            aggregate_version: value.aggregate_version,
            event_type: value.event_type,
            event_version: value.event_version,
            dedupe_key: value.dedupe_key,
            payload: value.payload,
            metadata: value.metadata,
            occurred_at: value.occurred_at,
        }
    }
}

pub struct DomainEventService {
    pool: PgPool,
}

impl DomainEventService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn append(&self, tenant_id: Uuid, input: DomainEventInput) -> Result<Option<DomainEvent>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { self.append_tx(tenant_id, tx, input).await })
        })
        .await
    }

    pub async fn append_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        input: DomainEventInput,
    ) -> Result<Option<DomainEvent>> {
        let aggregate_type = input.aggregate_type.trim().to_string();
        if aggregate_type.is_empty() {
            return Err(Error::Validation("aggregate_type cannot be empty".to_string()));
        }

        let event_type = input.event_type.trim().to_string();
        if event_type.is_empty() {
            return Err(Error::Validation("event_type cannot be empty".to_string()));
        }

        if input.event_version <= 0 {
            return Err(Error::Validation("event_version must be positive".to_string()));
        }

        let dedupe_key = input.dedupe_key.trim().to_string();
        if dedupe_key.is_empty() {
            return Err(Error::Validation("dedupe_key cannot be empty".to_string()));
        }

        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let aggregate_version = if input.aggregate_version > 0 {
            input.aggregate_version
        } else {
            sqlx::query_scalar::<_, i64>(
                r#"
                SELECT COALESCE(MAX(aggregate_version), 0) + 1
                FROM domain_events
                WHERE aggregate_type = $1
                  AND aggregate_id = $2
                "#,
            )
            .bind(&aggregate_type)
            .bind(input.aggregate_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
        };

        let occurred_at = input.occurred_at.unwrap_or_else(chrono::Utc::now);
        let event = sqlx::query_as::<_, DomainEvent>(
            r#"
            INSERT INTO domain_events (
                aggregate_type,
                aggregate_id,
                aggregate_version,
                event_type,
                event_version,
                dedupe_key,
                payload,
                metadata,
                occurred_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (tenant_id, dedupe_key)
            DO NOTHING
            RETURNING
                id,
                tenant_id,
                aggregate_type,
                aggregate_id,
                aggregate_version,
                event_type,
                event_version,
                dedupe_key,
                payload,
                metadata,
                occurred_at,
                created_at
            "#,
        )
        .bind(aggregate_type)
        .bind(input.aggregate_id)
        .bind(aggregate_version)
        .bind(event_type)
        .bind(input.event_version)
        .bind(dedupe_key)
        .bind(input.payload)
        .bind(input.metadata)
        .bind(occurred_at)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if let Some(event) = &event {
            let notification = serde_json::json!({
                "event_id": event.id,
                "tenant_id": event.tenant_id,
                "aggregate_type": event.aggregate_type,
                "aggregate_id": event.aggregate_id,
                "aggregate_version": event.aggregate_version,
                "event_type": event.event_type,
                "event_version": event.event_version,
                "occurred_at": event.occurred_at,
            })
            .to_string();

            sqlx::query("SELECT pg_notify($1, $2)")
                .bind(EVENT_BUS_CHANNEL)
                .bind(notification)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
        }

        Ok(event)
    }

    pub async fn stream(
        &self,
        tenant_id: Uuid,
        aggregate_type: &str,
        aggregate_id: Uuid,
        from_version: Option<i64>,
        limit: i64,
    ) -> Result<Vec<DomainEvent>> {
        let aggregate_type = aggregate_type.trim().to_string();
        if aggregate_type.is_empty() {
            return Err(Error::Validation("aggregate_type cannot be empty".to_string()));
        }

        let from_version = from_version.unwrap_or(1).max(1);
        let limit = limit.clamp(1, 1000);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let aggregate_type = aggregate_type.clone();
            Box::pin(async move {
                sqlx::query_as::<_, DomainEvent>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        aggregate_type,
                        aggregate_id,
                        aggregate_version,
                        event_type,
                        event_version,
                        dedupe_key,
                        payload,
                        metadata,
                        occurred_at,
                        created_at
                    FROM domain_events
                    WHERE aggregate_type = $1
                      AND aggregate_id = $2
                      AND aggregate_version >= $3
                    ORDER BY aggregate_version ASC
                    LIMIT $4
                    "#,
                )
                .bind(&aggregate_type)
                .bind(aggregate_id)
                .bind(from_version)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }
}
