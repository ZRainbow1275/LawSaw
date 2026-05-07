//! Postgres-backed reaction repository.
//!
//! All read/write paths route through `with_tenant_tx` so that RLS sees the
//! correct `app.tenant_id` setting; the table itself is RLS-enforced (see
//! migration 083).

use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use law_eye_common::{Error, Result};
use sqlx::PgPool;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

use super::model::{
    CategoryReactionStat, ColdStartTargetRow, NegativeSignalRow, Reaction, ReactionInsightWindow,
    ReactionKind, ReactionTarget, ReactionTrendGranularity, ReactionTrendPoint, SourceHealthRow,
    TopReactionRow, TopReactionUserRow,
};

/// Per-target aggregate row used by both `get_summary` and the public batch
/// endpoint. `viewer_kind` is filled in by a separate viewer lookup.
#[derive(Debug, Clone, Copy)]
pub struct AggregateRow {
    pub likes: i64,
    pub dislikes: i64,
}

#[async_trait]
pub trait ReactionRepo: Send + Sync {
    async fn upsert_reaction(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
        kind: ReactionKind,
    ) -> Result<Reaction>;

    async fn delete_reaction(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
    ) -> Result<u64>;

    async fn get_aggregate(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
    ) -> Result<AggregateRow>;

    async fn get_aggregates_batch(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, AggregateRow>>;

    async fn get_viewer_kinds_batch(
        &self,
        tenant_id: Uuid,
        viewer_id: Uuid,
        target_type: ReactionTarget,
        target_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, ReactionKind>>;

    async fn list_user_reactions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        since: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<Reaction>>;

    /// Article/source must exist for the given tenant. Returns
    /// `Err(Error::NotFound)` if not.
    async fn ensure_target_exists(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
    ) -> Result<()>;

    // Admin insights ---------------------------------------------------------

    async fn top_score(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>>;

    async fn controversy(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        min_likes: i64,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>>;

    async fn trend(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        granularity: ReactionTrendGranularity,
        window: ReactionInsightWindow,
    ) -> Result<Vec<ReactionTrendPoint>>;

    async fn by_category(
        &self,
        tenant_id: Uuid,
        window: ReactionInsightWindow,
    ) -> Result<Vec<CategoryReactionStat>>;

    async fn source_health(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<SourceHealthRow>>;

    async fn top_users(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<TopReactionUserRow>>;

    async fn cold_start(
        &self,
        tenant_id: Uuid,
        days: i32,
        target_type: ReactionTarget,
        limit: i64,
    ) -> Result<Vec<ColdStartTargetRow>>;

    async fn negative_signal(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        dislike_ratio: f64,
        min_total: i64,
        limit: i64,
    ) -> Result<Vec<NegativeSignalRow>>;
}

#[derive(Clone)]
pub struct PgReactionRepo {
    pool: PgPool,
}

impl PgReactionRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn target_table(target_type: ReactionTarget) -> &'static str {
    match target_type {
        ReactionTarget::Article => "articles",
        ReactionTarget::Source => "sources",
    }
}

fn target_label_column(target_type: ReactionTarget) -> &'static str {
    match target_type {
        ReactionTarget::Article => "title",
        ReactionTarget::Source => "name",
    }
}

#[async_trait]
impl ReactionRepo for PgReactionRepo {
    async fn upsert_reaction(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
        kind: ReactionKind,
    ) -> Result<Reaction> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Reaction>(
                    r#"
                    INSERT INTO reactions (tenant_id, user_id, target_type, target_id, kind)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (tenant_id, user_id, target_type, target_id) DO UPDATE
                        SET kind = EXCLUDED.kind,
                            updated_at = NOW()
                    RETURNING id, tenant_id, user_id, target_type, target_id, kind, created_at, updated_at
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(target_type)
                .bind(target_id)
                .bind(kind)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    async fn delete_reaction(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
    ) -> Result<u64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result = sqlx::query(
                    r#"
                    DELETE FROM reactions
                     WHERE tenant_id = $1
                       AND user_id = $2
                       AND target_type = $3
                       AND target_id = $4
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(target_type)
                .bind(target_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(result.rows_affected())
            })
        })
        .await
    }

    async fn get_aggregate(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
    ) -> Result<AggregateRow> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let row: (i64, i64) = sqlx::query_as(
                    r#"
                    SELECT
                        COUNT(*) FILTER (WHERE kind = 'like')::bigint     AS likes,
                        COUNT(*) FILTER (WHERE kind = 'dislike')::bigint  AS dislikes
                    FROM reactions
                    WHERE tenant_id = $1
                      AND target_type = $2
                      AND target_id = $3
                    "#,
                )
                .bind(tenant_id)
                .bind(target_type)
                .bind(target_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(AggregateRow {
                    likes: row.0,
                    dislikes: row.1,
                })
            })
        })
        .await
    }

    async fn get_aggregates_batch(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, AggregateRow>> {
        if target_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let target_ids = target_ids.to_vec();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows: Vec<(Uuid, i64, i64)> = sqlx::query_as(
                    r#"
                    SELECT target_id,
                           COUNT(*) FILTER (WHERE kind = 'like')::bigint     AS likes,
                           COUNT(*) FILTER (WHERE kind = 'dislike')::bigint  AS dislikes
                      FROM reactions
                     WHERE tenant_id = $1
                       AND target_type = $2
                       AND target_id = ANY($3)
                     GROUP BY target_id
                    "#,
                )
                .bind(tenant_id)
                .bind(target_type)
                .bind(&target_ids)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                let mut out = HashMap::with_capacity(rows.len());
                for (id, likes, dislikes) in rows {
                    out.insert(id, AggregateRow { likes, dislikes });
                }
                Ok(out)
            })
        })
        .await
    }

    async fn get_viewer_kinds_batch(
        &self,
        tenant_id: Uuid,
        viewer_id: Uuid,
        target_type: ReactionTarget,
        target_ids: &[Uuid],
    ) -> Result<HashMap<Uuid, ReactionKind>> {
        if target_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let target_ids = target_ids.to_vec();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows: Vec<(Uuid, ReactionKind)> = sqlx::query_as(
                    r#"
                    SELECT target_id, kind
                      FROM reactions
                     WHERE tenant_id = $1
                       AND user_id = $2
                       AND target_type = $3
                       AND target_id = ANY($4)
                    "#,
                )
                .bind(tenant_id)
                .bind(viewer_id)
                .bind(target_type)
                .bind(&target_ids)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows.into_iter().collect())
            })
        })
        .await
    }

    async fn list_user_reactions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        since: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<Reaction>> {
        let limit = limit.clamp(1, 500);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Reaction>(
                    r#"
                    SELECT id, tenant_id, user_id, target_type, target_id, kind, created_at, updated_at
                      FROM reactions
                     WHERE tenant_id = $1
                       AND user_id = $2
                       AND ($3::timestamptz IS NULL OR created_at >= $3)
                     ORDER BY created_at DESC, id DESC
                     LIMIT $4
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(since)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    async fn ensure_target_exists(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
    ) -> Result<()> {
        let table = target_table(target_type);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let sql = format!(
                    "SELECT 1 FROM {table} WHERE id = $1 AND tenant_id = $2 \
                     AND COALESCE(deleted_at::text, '') = ''"
                );
                let exists: Option<i32> = sqlx::query_scalar(&sql)
                    .bind(target_id)
                    .bind(tenant_id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                if exists.is_none() {
                    return Err(Error::NotFound(format!(
                        "{} {} not found",
                        target_type.as_str(),
                        target_id
                    )));
                }
                Ok(())
            })
        })
        .await
    }

    async fn top_score(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>> {
        let limit = limit.clamp(1, 200);
        let cutoff = window.cutoff();
        let label_col = target_label_column(target_type);
        let target_table = target_table(target_type);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let sql = format!(
                    r#"
                    SELECT r.target_id,
                           COUNT(*) FILTER (WHERE r.kind = 'like')::bigint    AS likes,
                           COUNT(*) FILTER (WHERE r.kind = 'dislike')::bigint AS dislikes,
                           t.{label_col}                                       AS label
                      FROM reactions r
                      LEFT JOIN {target_table} t
                             ON t.id = r.target_id AND t.tenant_id = r.tenant_id
                     WHERE r.tenant_id = $1
                       AND r.target_type = $2
                       AND ($3::timestamptz IS NULL OR r.created_at >= $3)
                     GROUP BY r.target_id, t.{label_col}
                     ORDER BY (COUNT(*) FILTER (WHERE r.kind = 'like')
                              - COUNT(*) FILTER (WHERE r.kind = 'dislike')) DESC,
                              likes DESC
                     LIMIT $4
                    "#
                );
                let rows: Vec<(Uuid, i64, i64, Option<String>)> = sqlx::query_as(&sql)
                    .bind(tenant_id)
                    .bind(target_type)
                    .bind(cutoff)
                    .bind(limit)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(target_id, likes, dislikes, label)| TopReactionRow {
                        target_type,
                        target_id,
                        likes,
                        dislikes,
                        score: likes - dislikes,
                        label,
                    })
                    .collect())
            })
        })
        .await
    }

    async fn controversy(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        min_likes: i64,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>> {
        let limit = limit.clamp(1, 200);
        let cutoff = window.cutoff();
        let label_col = target_label_column(target_type);
        let target_table = target_table(target_type);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let sql = format!(
                    r#"
                    SELECT r.target_id,
                           COUNT(*) FILTER (WHERE r.kind = 'like')::bigint    AS likes,
                           COUNT(*) FILTER (WHERE r.kind = 'dislike')::bigint AS dislikes,
                           t.{label_col}                                      AS label
                      FROM reactions r
                      LEFT JOIN {target_table} t
                             ON t.id = r.target_id AND t.tenant_id = r.tenant_id
                     WHERE r.tenant_id = $1
                       AND r.target_type = $2
                       AND ($3::timestamptz IS NULL OR r.created_at >= $3)
                     GROUP BY r.target_id, t.{label_col}
                     HAVING COUNT(*) FILTER (WHERE r.kind = 'like') >= $4
                        AND COUNT(*) FILTER (WHERE r.kind = 'dislike') >= $4
                     ORDER BY LEAST(
                                  COUNT(*) FILTER (WHERE r.kind = 'like'),
                                  COUNT(*) FILTER (WHERE r.kind = 'dislike')
                              ) DESC,
                              (COUNT(*) FILTER (WHERE r.kind = 'like')
                               + COUNT(*) FILTER (WHERE r.kind = 'dislike')) DESC
                     LIMIT $5
                    "#
                );
                let rows: Vec<(Uuid, i64, i64, Option<String>)> = sqlx::query_as(&sql)
                    .bind(tenant_id)
                    .bind(target_type)
                    .bind(cutoff)
                    .bind(min_likes)
                    .bind(limit)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(target_id, likes, dislikes, label)| TopReactionRow {
                        target_type,
                        target_id,
                        likes,
                        dislikes,
                        score: likes - dislikes,
                        label,
                    })
                    .collect())
            })
        })
        .await
    }

    async fn trend(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        granularity: ReactionTrendGranularity,
        window: ReactionInsightWindow,
    ) -> Result<Vec<ReactionTrendPoint>> {
        let cutoff = window.cutoff();
        let trunc_unit = match granularity {
            ReactionTrendGranularity::Hour => "hour",
            ReactionTrendGranularity::Day => "day",
        };
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let sql = format!(
                    r#"
                    SELECT date_trunc('{trunc_unit}', created_at) AS bucket,
                           COUNT(*) FILTER (WHERE kind = 'like')::bigint    AS likes,
                           COUNT(*) FILTER (WHERE kind = 'dislike')::bigint AS dislikes
                      FROM reactions
                     WHERE tenant_id = $1
                       AND target_type = $2
                       AND ($3::timestamptz IS NULL OR created_at >= $3)
                     GROUP BY bucket
                     ORDER BY bucket ASC
                    "#
                );
                let rows: Vec<(DateTime<Utc>, i64, i64)> = sqlx::query_as(&sql)
                    .bind(tenant_id)
                    .bind(target_type)
                    .bind(cutoff)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(bucket, likes, dislikes)| ReactionTrendPoint {
                        bucket,
                        likes,
                        dislikes,
                    })
                    .collect())
            })
        })
        .await
    }

    async fn by_category(
        &self,
        tenant_id: Uuid,
        window: ReactionInsightWindow,
    ) -> Result<Vec<CategoryReactionStat>> {
        let cutoff = window.cutoff();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows: Vec<(Option<Uuid>, Option<String>, Option<String>, i64, i64)> =
                    sqlx::query_as(
                        r#"
                        SELECT a.category_id,
                               c.slug                                              AS category_slug,
                               c.name                                              AS category_name,
                               COUNT(*) FILTER (WHERE r.kind = 'like')::bigint    AS likes,
                               COUNT(*) FILTER (WHERE r.kind = 'dislike')::bigint AS dislikes
                          FROM reactions r
                          JOIN articles a
                                 ON a.id = r.target_id AND a.tenant_id = r.tenant_id
                          LEFT JOIN categories c ON c.id = a.category_id
                         WHERE r.tenant_id = $1
                           AND r.target_type = 'article'
                           AND ($2::timestamptz IS NULL OR r.created_at >= $2)
                         GROUP BY a.category_id, c.slug, c.name
                         ORDER BY likes + dislikes DESC
                        "#,
                    )
                    .bind(tenant_id)
                    .bind(cutoff)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(
                        |(category_id, category_slug, category_name, likes, dislikes)| {
                            CategoryReactionStat {
                                category_id,
                                category_slug,
                                category_name,
                                likes,
                                dislikes,
                                score: likes - dislikes,
                            }
                        },
                    )
                    .collect())
            })
        })
        .await
    }

    async fn source_health(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<SourceHealthRow>> {
        let limit = limit.clamp(1, 500);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // No `channel_subscriptions` table in MVP — subscriber_count
                // approximated as the count of distinct users who reacted on
                // the source itself. Switch to a real subscription join if
                // that table is introduced later.
                let rows: Vec<(Uuid, String, i64, i64, i64)> = sqlx::query_as(
                    r#"
                    SELECT s.id,
                           s.name,
                           COUNT(*) FILTER (WHERE r.kind = 'like')::bigint    AS likes,
                           COUNT(*) FILTER (WHERE r.kind = 'dislike')::bigint AS dislikes,
                           COUNT(DISTINCT r.user_id)::bigint                   AS distinct_users
                      FROM sources s
                      LEFT JOIN reactions r
                             ON r.target_type = 'source'
                            AND r.target_id = s.id
                            AND r.tenant_id = s.tenant_id
                     WHERE s.tenant_id = $1
                       AND s.deleted_at IS NULL
                     GROUP BY s.id, s.name
                     ORDER BY likes + dislikes DESC, s.name ASC
                     LIMIT $2
                    "#,
                )
                .bind(tenant_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(source_id, source_name, likes, dislikes, distinct_users)| {
                        let ratio = if dislikes == 0 {
                            if likes == 0 {
                                0.0
                            } else {
                                f64::INFINITY
                            }
                        } else {
                            (likes as f64) / (dislikes as f64)
                        };
                        SourceHealthRow {
                            source_id,
                            source_name,
                            likes,
                            dislikes,
                            like_dislike_ratio: ratio,
                            subscriber_count: distinct_users,
                        }
                    })
                    .collect())
            })
        })
        .await
    }

    async fn top_users(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<TopReactionUserRow>> {
        let limit = limit.clamp(1, 200);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows: Vec<(Uuid, Option<String>, i64, i64)> = sqlx::query_as(
                    r#"
                    SELECT r.user_id,
                           u.display_name,
                           COUNT(*) FILTER (WHERE r.kind = 'like')::bigint    AS likes_given,
                           COUNT(*) FILTER (WHERE r.kind = 'dislike')::bigint AS dislikes_given
                      FROM reactions r
                      LEFT JOIN users u
                             ON u.id = r.user_id AND u.tenant_id = r.tenant_id
                     WHERE r.tenant_id = $1
                     GROUP BY r.user_id, u.display_name
                     ORDER BY likes_given + dislikes_given DESC
                     LIMIT $2
                    "#,
                )
                .bind(tenant_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(user_id, display_name, likes, dislikes)| TopReactionUserRow {
                        user_id,
                        display_name,
                        likes_given: likes,
                        dislikes_given: dislikes,
                        total: likes + dislikes,
                    })
                    .collect())
            })
        })
        .await
    }

    async fn cold_start(
        &self,
        tenant_id: Uuid,
        days: i32,
        target_type: ReactionTarget,
        limit: i64,
    ) -> Result<Vec<ColdStartTargetRow>> {
        let days = days.clamp(1, 365);
        let limit = limit.clamp(1, 500);
        let table = target_table(target_type);
        let label_col = target_label_column(target_type);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let sql = format!(
                    r#"
                    SELECT t.id,
                           t.{label_col} AS label,
                           t.created_at
                      FROM {table} t
                     WHERE t.tenant_id = $1
                       AND t.deleted_at IS NULL
                       AND t.created_at >= NOW() - ($2::int * INTERVAL '1 day')
                       AND NOT EXISTS (
                            SELECT 1 FROM reactions r
                             WHERE r.tenant_id = t.tenant_id
                               AND r.target_type = $3
                               AND r.target_id = t.id
                       )
                     ORDER BY t.created_at DESC
                     LIMIT $4
                    "#
                );
                let rows: Vec<(Uuid, Option<String>, DateTime<Utc>)> = sqlx::query_as(&sql)
                    .bind(tenant_id)
                    .bind(days)
                    .bind(target_type)
                    .bind(limit)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(id, label, created_at)| ColdStartTargetRow {
                        target_type,
                        target_id: id,
                        label,
                        created_at,
                    })
                    .collect())
            })
        })
        .await
    }

    async fn negative_signal(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        dislike_ratio: f64,
        min_total: i64,
        limit: i64,
    ) -> Result<Vec<NegativeSignalRow>> {
        let limit = limit.clamp(1, 500);
        let table = target_table(target_type);
        let label_col = target_label_column(target_type);
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let sql = format!(
                    r#"
                    WITH agg AS (
                        SELECT r.target_id,
                               COUNT(*) FILTER (WHERE r.kind = 'like')::bigint    AS likes,
                               COUNT(*) FILTER (WHERE r.kind = 'dislike')::bigint AS dislikes
                          FROM reactions r
                         WHERE r.tenant_id = $1
                           AND r.target_type = $2
                         GROUP BY r.target_id
                    )
                    SELECT a.target_id,
                           t.{label_col} AS label,
                           a.likes,
                           a.dislikes,
                           CASE WHEN (a.likes + a.dislikes) = 0 THEN 0
                                ELSE a.dislikes::float8 / (a.likes + a.dislikes)::float8
                           END AS dislike_ratio
                      FROM agg a
                      LEFT JOIN {table} t
                             ON t.id = a.target_id AND t.tenant_id = $1
                     WHERE (a.likes + a.dislikes) >= $4
                       AND CASE WHEN (a.likes + a.dislikes) = 0 THEN 0
                                ELSE a.dislikes::float8 / (a.likes + a.dislikes)::float8
                           END >= $3
                     ORDER BY dislike_ratio DESC, a.dislikes DESC
                     LIMIT $5
                    "#
                );
                let rows: Vec<(Uuid, Option<String>, i64, i64, f64)> = sqlx::query_as(&sql)
                    .bind(tenant_id)
                    .bind(target_type)
                    .bind(dislike_ratio)
                    .bind(min_total)
                    .bind(limit)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows
                    .into_iter()
                    .map(|(target_id, label, likes, dislikes, ratio)| NegativeSignalRow {
                        target_type,
                        target_id,
                        label,
                        likes,
                        dislikes,
                        dislike_ratio: ratio,
                    })
                    .collect())
            })
        })
        .await
    }
}

