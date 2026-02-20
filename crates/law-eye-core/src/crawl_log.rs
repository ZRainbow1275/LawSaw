use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{CrawlLog, CreateCrawlLog, FinishCrawlLog};
use sqlx::PgPool;
use uuid::Uuid;

pub struct CrawlLogService {
    pool: PgPool,
}

impl CrawlLogService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Start a new crawl log entry (status = 'running').
    ///
    /// Returns the ID of the new crawl log.
    pub async fn start(&self, tenant_id: Uuid, input: CreateCrawlLog) -> Result<Uuid> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let id: (Uuid,) = sqlx::query_as(
                    r#"
                    INSERT INTO crawl_logs (tenant_id, source_id, started_at, status)
                    VALUES ($1, $2, NOW(), 'running')
                    RETURNING id
                    "#,
                )
                .bind(input.tenant_id)
                .bind(input.source_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(id.0)
            })
        })
        .await
    }

    /// Complete a crawl log entry with final stats.
    pub async fn finish(
        &self,
        tenant_id: Uuid,
        crawl_log_id: Uuid,
        input: FinishCrawlLog,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows = sqlx::query(
                    r#"
                    UPDATE crawl_logs
                    SET finished_at = NOW(),
                        status = $2,
                        articles_found = $3,
                        articles_new = $4,
                        articles_updated = $5,
                        articles_skipped = $6,
                        error_message = $7,
                        duration_ms = $8,
                        metadata = COALESCE($9, metadata)
                    WHERE id = $1
                    "#,
                )
                .bind(crawl_log_id)
                .bind(&input.status)
                .bind(input.articles_found)
                .bind(input.articles_new)
                .bind(input.articles_updated)
                .bind(input.articles_skipped)
                .bind(&input.error_message)
                .bind(input.duration_ms)
                .bind(&input.metadata)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if rows.rows_affected() == 0 {
                    return Err(Error::NotFound(format!(
                        "CrawlLog {} not found",
                        crawl_log_id
                    )));
                }

                Ok(())
            })
        })
        .await
    }

    /// Get recent crawl logs for a source.
    pub async fn list_by_source(
        &self,
        tenant_id: Uuid,
        source_id: Uuid,
        limit: i64,
    ) -> Result<Vec<CrawlLog>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, CrawlLog>(
                    r#"
                    SELECT * FROM crawl_logs
                    WHERE source_id = $1
                    ORDER BY started_at DESC
                    LIMIT $2
                    "#,
                )
                .bind(source_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }
}
