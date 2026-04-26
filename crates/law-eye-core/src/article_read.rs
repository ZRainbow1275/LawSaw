//! Per-user article reading history.
//!
//! Powers the personalized recommendation loop introduced in Phase E.6:
//! every `POST /api/v1/me/articles/{id}/read` from the reader page lands
//! here and the recommendation algorithm reads back the user's recently
//! finished article ids to assemble a centroid embedding for cosine search.

use chrono::{DateTime, Utc};
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

/// Input from the HTTP layer for an upsert. Fields default to safe values
/// when the client omits them (e.g. a tap-to-read with no engagement signal).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ArticleReadInput {
    pub dwell_ms: Option<i32>,
    pub scroll_pct: Option<i32>,
    pub finished: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArticleReadRecord {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub article_id: Uuid,
    pub read_at: DateTime<Utc>,
    pub dwell_ms: i32,
    pub scroll_pct: i32,
    pub finished: bool,
}

/// Reading history row joined with article + category metadata.
/// Powers `GET /api/v1/me/reading-history` (Phase E.7).
///
/// Note: schema stores per-day rows with merged max(dwell)/max(scroll)/OR(finished),
/// so a single row already represents the user's best engagement that day —
/// no aggregation needed at SELECT time.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ReadingHistoryRow {
    pub article_id: Uuid,
    pub title: String,
    pub category_slug: Option<String>,
    pub dwell_ms_total: i32,
    pub scroll_pct_peak: i32,
    pub finished: bool,
    pub last_read_at: DateTime<Utc>,
}

pub struct ArticleReadService {
    pool: PgPool,
}

impl ArticleReadService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Upsert an article-read record. Same-day duplicates are merged by
    /// taking the max of dwell/scroll and OR-ing finished, so a user who
    /// re-opens the same article gets credited their best engagement.
    pub async fn record_read(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        article_id: Uuid,
        input: ArticleReadInput,
    ) -> Result<ArticleReadRecord> {
        let dwell_ms = input.dwell_ms.unwrap_or(0).max(0);
        let scroll_pct = input.scroll_pct.unwrap_or(0).clamp(0, 100);
        let finished = input.finished.unwrap_or(false);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ArticleReadRecord>(
                    r#"
                    INSERT INTO article_reads
                        (tenant_id, user_id, article_id, dwell_ms, scroll_pct, finished)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (tenant_id, user_id, article_id, read_day) DO UPDATE
                        SET dwell_ms   = GREATEST(article_reads.dwell_ms, EXCLUDED.dwell_ms),
                            scroll_pct = GREATEST(article_reads.scroll_pct, EXCLUDED.scroll_pct),
                            finished   = article_reads.finished OR EXCLUDED.finished,
                            read_at    = NOW()
                    RETURNING id, tenant_id, user_id, article_id, read_at,
                              dwell_ms, scroll_pct, finished
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(article_id)
                .bind(dwell_ms)
                .bind(scroll_pct)
                .bind(finished)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// Most recently finished article ids for a user (newest first). Used
    /// by the recommendation algorithm to seed the embedding centroid.
    pub async fn recent_finished_article_ids(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Uuid>> {
        let limit = limit.clamp(1, 200);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, Uuid>(
                    r#"
                    SELECT article_id
                    FROM article_reads
                    WHERE tenant_id = $1
                      AND user_id = $2
                      AND finished = true
                    ORDER BY read_at DESC
                    LIMIT $3
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// All article ids the user has read at least once (for excluding
    /// already-read articles from recommendation results).
    pub async fn all_read_article_ids(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<Uuid>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, Uuid>(
                    r#"
                    SELECT DISTINCT article_id
                    FROM article_reads
                    WHERE tenant_id = $1 AND user_id = $2
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// Phase E.7: paginated reading history with article + category metadata.
    /// Returns `(rows, total)` for the user's reads. `finished_only=true`
    /// hits the `idx_article_reads_user_finished_recent` partial index;
    /// the unfiltered path currently has no covering index (acceptable at
    /// MVP volume; revisit when row count > 1M per user).
    pub async fn list_with_articles(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        offset: i64,
        finished_only: bool,
    ) -> Result<(Vec<ReadingHistoryRow>, i64)> {
        let limit = limit.clamp(1, 100);
        let offset = offset.max(0);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let total: i64 = sqlx::query_scalar(
                    r#"
                    SELECT COUNT(*)
                    FROM article_reads ar
                    JOIN articles a
                      ON a.tenant_id = ar.tenant_id
                     AND a.id = ar.article_id
                     AND a.deleted_at IS NULL
                    WHERE ar.tenant_id = $1
                      AND ar.user_id = $2
                      AND (NOT $3::bool OR ar.finished = true)
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(finished_only)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let rows = sqlx::query_as::<_, ReadingHistoryRow>(
                    r#"
                    SELECT
                        ar.article_id,
                        a.title,
                        c.slug AS category_slug,
                        ar.dwell_ms   AS dwell_ms_total,
                        ar.scroll_pct AS scroll_pct_peak,
                        ar.finished,
                        ar.read_at    AS last_read_at
                    FROM article_reads ar
                    JOIN articles a
                      ON a.tenant_id = ar.tenant_id
                     AND a.id = ar.article_id
                     AND a.deleted_at IS NULL
                    LEFT JOIN categories c
                      ON c.tenant_id = ar.tenant_id
                     AND c.id = a.category_id
                    WHERE ar.tenant_id = $1
                      AND ar.user_id = $2
                      AND (NOT $3::bool OR ar.finished = true)
                    ORDER BY ar.read_at DESC, ar.article_id DESC
                    LIMIT $4 OFFSET $5
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(finished_only)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok((rows, total))
            })
        })
        .await
    }
}
