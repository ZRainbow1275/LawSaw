use chrono::NaiveDate;
use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{Article, CreateArticle};
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

pub struct ArticleService {
    pool: PgPool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleStats {
    pub total: i64,
    pub published: i64,
    pub pending: i64,
    pub high_risk: i64,
    pub today: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleDailyTrendPoint {
    pub date: NaiveDate,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleCategoryCount {
    pub category_id: Option<Uuid>,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleSearchHit {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    /// Normalized relevance score in [0, 1].
    pub score: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleStatusCounts {
    pub pending: i64,
    pub processing: i64,
    pub published: i64,
    pub archived: i64,
    pub rejected: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleRiskCounts {
    pub unknown: i64,
    pub low: i64,
    pub medium: i64,
    pub high: i64,
    pub critical: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleSentimentCounts {
    pub unknown: i64,
    pub positive: i64,
    pub neutral: i64,
    pub negative: i64,
    pub mixed: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleAnalyticsSummary {
    pub total: i64,
    pub status: ArticleStatusCounts,
    pub risk: ArticleRiskCounts,
    pub sentiment: ArticleSentimentCounts,
}

#[derive(Debug, sqlx::FromRow)]
struct ArticleAnalyticsSummaryRow {
    total: i64,
    pending: i64,
    processing: i64,
    published: i64,
    archived: i64,
    rejected: i64,
    risk_unknown: i64,
    risk_low: i64,
    risk_medium: i64,
    risk_high: i64,
    risk_critical: i64,
    sentiment_unknown: i64,
    sentiment_positive: i64,
    sentiment_neutral: i64,
    sentiment_negative: i64,
    sentiment_mixed: i64,
}

impl ArticleService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get total count of articles (for pagination)
    pub async fn count(&self, tenant_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let result: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles")
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
            Ok(result.0)
        }))
        .await
    }

    pub async fn list(&self, tenant_id: Uuid, limit: i64, offset: i64) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                SELECT * FROM articles
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
                "#,
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    pub async fn count_filtered<'a>(
        &self,
        tenant_id: Uuid,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let mut qb: QueryBuilder<'a, Postgres> =
                QueryBuilder::new("SELECT COUNT(*) FROM articles");
            push_article_filters(&mut qb, category_id, status);

            let result: (i64,) = qb
                .build_query_as()
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

            Ok(result.0)
        }))
        .await
    }

    pub async fn list_filtered<'a>(
        &self,
        tenant_id: Uuid,
        limit: i64,
        offset: i64,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let mut qb: QueryBuilder<'a, Postgres> = QueryBuilder::new("SELECT * FROM articles");
            push_article_filters(&mut qb, category_id, status);

            qb.push(" ORDER BY created_at DESC");
            qb.push(" LIMIT ").push_bind(limit);
            qb.push(" OFFSET ").push_bind(offset);

            qb.build_query_as::<Article>()
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = $1")
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
        }))
        .await
    }

    pub async fn create(&self, tenant_id: Uuid, input: CreateArticle) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                INSERT INTO articles (source_id, title, link, content, author, published_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                "#,
            )
            .bind(input.source_id)
            .bind(&input.title)
            .bind(&input.link)
            .bind(&input.content)
            .bind(&input.author)
            .bind(input.published_at)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    /// Update article
    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        title: Option<&str>,
        content: Option<&str>,
        summary: Option<&str>,
        category_id: Option<Uuid>,
    ) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                UPDATE articles SET
                    title = COALESCE($2, title),
                    content = COALESCE($3, content),
                    summary = COALESCE($4, summary),
                    category_id = COALESCE($5, category_id),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
                "#,
            )
            .bind(id)
            .bind(title)
            .bind(content)
            .bind(summary)
            .bind(category_id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
        }))
        .await
    }

    /// Delete article
    pub async fn delete(&self, tenant_id: Uuid, id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let result = sqlx::query("DELETE FROM articles WHERE id = $1")
                .bind(id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

            if result.rows_affected() == 0 {
                return Err(Error::NotFound(format!("Article {} not found", id)));
            }
            Ok(())
        }))
        .await
    }

    pub async fn exists_by_link(&self, tenant_id: Uuid, link: &str) -> Result<bool> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let result: (bool,) =
                sqlx::query_as("SELECT EXISTS(SELECT 1 FROM articles WHERE link = $1)")
                    .bind(link)
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
            Ok(result.0)
        }))
        .await
    }

    pub async fn update_status(&self, tenant_id: Uuid, id: Uuid, status: &str) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                UPDATE articles SET status = $2, updated_at = NOW() WHERE id = $1
                RETURNING *
                "#,
            )
            .bind(id)
            .bind(status)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
        }))
        .await
    }

    /// Batch update status
    pub async fn batch_update_status(&self, tenant_id: Uuid, ids: &[Uuid], status: &str) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let result = sqlx::query(
                r#"
                UPDATE articles SET status = $2, updated_at = NOW()
                WHERE id = ANY($1)
                "#,
            )
            .bind(ids)
            .bind(status)
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            Ok(result.rows_affected() as i64)
        }))
        .await
    }

    pub async fn list_by_category(
        &self,
        tenant_id: Uuid,
        category_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                SELECT * FROM articles
                WHERE category_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                "#,
            )
            .bind(category_id)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    pub async fn search(&self, tenant_id: Uuid, query: &str, limit: i64) -> Result<Vec<Article>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(vec![]);
        }

        // Legacy API: return articles only (no ranking/total). Keep for backward compatibility.
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                SELECT * FROM articles
                WHERE to_tsvector('simple', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('simple', $1)
                ORDER BY created_at DESC
                LIMIT $2
                "#,
            )
            .bind(query)
            .bind(limit.clamp(1, 100))
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    /// Keyword search with normalized relevance score and total count.
    pub async fn search_ranked(
        &self,
        tenant_id: Uuid,
        query: &str,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<ArticleSearchHit>, i64)> {
        let query = query.trim();
        if query.is_empty() {
            return Ok((vec![], 0));
        }

        let limit = limit.clamp(1, 50);
        let offset = offset.max(0);

        let rows: Vec<(Uuid, String, String, f64, i64)> =
            with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
                sqlx::query_as(
                    r#"
                    WITH q AS (
                        SELECT plainto_tsquery('simple', $1) AS query
                    ),
                    ranked AS (
                        SELECT
                            a.id,
                            a.title,
                            COALESCE(a.summary, LEFT(a.content, 200), '') AS excerpt,
                            ts_rank(
                                to_tsvector('simple', a.title || ' ' || COALESCE(a.content, '')),
                                q.query
                            ) AS rank,
                            a.created_at AS created_at,
                            COUNT(*) OVER() AS total
                        FROM articles a, q
                        WHERE to_tsvector('simple', a.title || ' ' || COALESCE(a.content, '')) @@ q.query
                    ),
                    scored AS (
                        SELECT
                            id,
                            title,
                            excerpt,
                            created_at,
                            total,
                            CASE
                                WHEN MAX(rank) OVER() > 0 THEN rank / MAX(rank) OVER()
                                ELSE 0
                            END AS score
                        FROM ranked
                    )
                    SELECT
                        id,
                        title,
                        excerpt,
                        GREATEST(LEAST(score, 1.0), 0.0)::float8 AS score,
                        total
                    FROM scored
                    ORDER BY score DESC, created_at DESC
                    LIMIT $2 OFFSET $3
                    "#,
                )
                .bind(query)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            }))
            .await?;

        let total = rows.first().map(|(_, _, _, _, total)| *total).unwrap_or(0);
        let hits = rows
            .into_iter()
            .map(
                |(article_id, title, excerpt, score, _total)| ArticleSearchHit {
                    article_id,
                    title,
                    excerpt,
                    score,
                },
            )
            .collect();

        Ok((hits, total))
    }

    /// Get statistics for dashboard
    pub async fn get_stats(&self, tenant_id: Uuid) -> Result<ArticleStats> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles")
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

            let published: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM articles WHERE status = 'published'")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

            let pending: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM articles WHERE status = 'pending'")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

            // Count high risk articles (risk_score > 70). `NULL` risk_score will be excluded naturally.
            let high_risk: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM articles WHERE risk_score > 70")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

            let today: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM articles WHERE created_at >= CURRENT_DATE")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

            Ok(ArticleStats {
                total: total.0,
                published: published.0,
                pending: pending.0,
                high_risk: high_risk.0,
                today: today.0,
            })
        }))
        .await
    }

    /// Get recent articles for dashboard
    pub async fn list_recent(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                SELECT * FROM articles
                WHERE status = 'published'
                ORDER BY published_at DESC NULLS LAST, created_at DESC
                LIMIT $1
                "#,
            )
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    pub async fn get_daily_trend(
        &self,
        tenant_id: Uuid,
        days: i64,
    ) -> Result<Vec<ArticleDailyTrendPoint>> {
        let days = days.clamp(1, 90);

        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, (NaiveDate, i64)>(
                r#"
                WITH days AS (
                    SELECT generate_series(
                        CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'),
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    )::date AS day
                )
                SELECT
                    days.day AS date,
                    COALESCE(COUNT(a.id), 0)::bigint AS count
                FROM days
                LEFT JOIN articles a
                    ON a.created_at >= days.day::timestamptz
                   AND a.created_at < (days.day::timestamptz + INTERVAL '1 day')
                GROUP BY days.day
                ORDER BY days.day ASC
                "#,
            )
            .bind(days)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await?;

        Ok(rows
            .into_iter()
            .map(|(date, count)| ArticleDailyTrendPoint { date, count })
            .collect())
    }

    pub async fn get_category_counts(&self, tenant_id: Uuid) -> Result<Vec<ArticleCategoryCount>> {
        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, (Option<Uuid>, i64)>(
                r#"
                SELECT category_id, COUNT(*)::bigint AS count
                FROM articles
                GROUP BY category_id
                "#,
            )
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await?;

        Ok(rows
            .into_iter()
            .map(|(category_id, count)| ArticleCategoryCount { category_id, count })
            .collect())
    }

    pub async fn get_analytics_summary(
        &self,
        tenant_id: Uuid,
    ) -> Result<ArticleAnalyticsSummary> {
        let row: ArticleAnalyticsSummaryRow = with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as(
                r#"
                SELECT
                    COUNT(*)::bigint AS total,

                    COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
                    COUNT(*) FILTER (WHERE status = 'processing')::bigint AS processing,
                    COUNT(*) FILTER (WHERE status = 'published')::bigint AS published,
                    COUNT(*) FILTER (WHERE status = 'archived')::bigint AS archived,
                    COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected,

                    COUNT(*) FILTER (WHERE risk_score IS NULL)::bigint AS risk_unknown,
                    COUNT(*) FILTER (WHERE risk_score BETWEEN 0 AND 25)::bigint AS risk_low,
                    COUNT(*) FILTER (WHERE risk_score BETWEEN 26 AND 50)::bigint AS risk_medium,
                    COUNT(*) FILTER (WHERE risk_score BETWEEN 51 AND 75)::bigint AS risk_high,
                    COUNT(*) FILTER (WHERE risk_score >= 76)::bigint AS risk_critical,

                    COUNT(*) FILTER (WHERE sentiment IS NULL)::bigint AS sentiment_unknown,
                    COUNT(*) FILTER (WHERE sentiment = 'positive')::bigint AS sentiment_positive,
                    COUNT(*) FILTER (WHERE sentiment = 'neutral')::bigint AS sentiment_neutral,
                    COUNT(*) FILTER (WHERE sentiment = 'negative')::bigint AS sentiment_negative,
                    COUNT(*) FILTER (WHERE sentiment = 'mixed')::bigint AS sentiment_mixed
                FROM articles
                "#,
            )
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await?;

        Ok(ArticleAnalyticsSummary {
            total: row.total,
            status: ArticleStatusCounts {
                pending: row.pending,
                processing: row.processing,
                published: row.published,
                archived: row.archived,
                rejected: row.rejected,
            },
            risk: ArticleRiskCounts {
                unknown: row.risk_unknown,
                low: row.risk_low,
                medium: row.risk_medium,
                high: row.risk_high,
                critical: row.risk_critical,
            },
            sentiment: ArticleSentimentCounts {
                unknown: row.sentiment_unknown,
                positive: row.sentiment_positive,
                neutral: row.sentiment_neutral,
                negative: row.sentiment_negative,
                mixed: row.sentiment_mixed,
            },
        })
    }
}

fn push_article_filters<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    category_id: Option<Uuid>,
    status: Option<&'a str>,
) {
    let mut has_where = false;

    if let Some(category_id) = category_id {
        qb.push(" WHERE category_id = ");
        qb.push_bind(category_id);
        has_where = true;
    }

    if let Some(status) = status {
        qb.push(if has_where { " AND " } else { " WHERE " });
        qb.push("status = ");
        qb.push_bind(status);
    }
}
