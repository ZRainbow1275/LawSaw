use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{CreateSource, Source};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct SourceStats {
    pub total: i64,
    pub active_count: i64,
    pub error_count: i64,
}

pub struct SourceService {
    pool: PgPool,
}

impl SourceService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn count(&self, tenant_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sources")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(result.0)
            })
        })
        .await
    }

    pub async fn stats(&self, tenant_id: Uuid) -> Result<SourceStats> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let (total, active_count, error_count): (i64, i64, i64) = sqlx::query_as(
                    r#"
                    SELECT
                        COUNT(*)::bigint AS total,
                        COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_count,
                        COUNT(*) FILTER (WHERE last_error IS NOT NULL AND last_error <> '')::bigint AS error_count
                    FROM sources
                    "#,
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(SourceStats {
                    total,
                    active_count,
                    error_count,
                })
            })
        })
        .await
    }

    pub async fn list(&self, tenant_id: Uuid, limit: i64, offset: i64) -> Result<Vec<Source>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }
        if offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Source>(
                    "SELECT * FROM sources ORDER BY priority DESC, name LIMIT $1 OFFSET $2",
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

    pub async fn list_active(&self, tenant_id: Uuid) -> Result<Vec<Source>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Source>(
                    "SELECT * FROM sources WHERE is_active = true ORDER BY priority DESC",
                )
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<Source> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Source>("SELECT * FROM sources WHERE id = $1")
                    .bind(id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
                    .ok_or_else(|| Error::NotFound(format!("Source {} not found", id)))
            })
        })
        .await
    }

    pub async fn create(&self, tenant_id: Uuid, input: CreateSource) -> Result<Source> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { self.create_tx(tenant_id, tx, input).await })
        })
        .await
    }

    pub async fn create_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        input: CreateSource,
    ) -> Result<Source> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        sqlx::query_as::<_, Source>(
            r#"
            INSERT INTO sources (name, url, type, config, schedule, priority)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(&input.name)
        .bind(&input.url)
        .bind(&input.source_type)
        .bind(&input.config)
        .bind(&input.schedule)
        .bind(input.priority.unwrap_or(5))
        .fetch_one(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn update_last_fetch(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        error: Option<&str>,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query(
                    r#"
                UPDATE sources
                SET last_fetch = NOW(), last_error = $2
                WHERE id = $1
                "#,
                )
                .bind(id)
                .bind(error)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await
    }
}
