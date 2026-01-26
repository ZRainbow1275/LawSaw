use law_eye_common::{Error, Result};
use law_eye_db::{Article, CreateArticle};
use chrono::NaiveDate;
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

impl ArticleService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get total count of articles (for pagination)
    pub async fn count(&self) -> Result<i64> {
        let result: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(result.0)
    }

    pub async fn list(&self, limit: i64, offset: i64) -> Result<Vec<Article>> {
        sqlx::query_as::<_, Article>(
            r#"
            SELECT * FROM articles
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn count_filtered<'a>(
        &self,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<i64> {
        let mut qb: QueryBuilder<'a, Postgres> =
            QueryBuilder::new("SELECT COUNT(*) FROM articles");
        push_article_filters(&mut qb, category_id, status);

        let result: (i64,) = qb
            .build_query_as()
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.0)
    }

    pub async fn list_filtered<'a>(
        &self,
        limit: i64,
        offset: i64,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<Vec<Article>> {
        let mut qb: QueryBuilder<'a, Postgres> = QueryBuilder::new("SELECT * FROM articles");
        push_article_filters(&mut qb, category_id, status);

        qb.push(" ORDER BY created_at DESC");
        qb.push(" LIMIT ").push_bind(limit);
        qb.push(" OFFSET ").push_bind(offset);

        qb.build_query_as::<Article>()
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Article> {
        sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
    }

    pub async fn create(&self, input: CreateArticle) -> Result<Article> {
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
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    /// Update article
    pub async fn update(
        &self,
        id: Uuid,
        title: Option<&str>,
        content: Option<&str>,
        summary: Option<&str>,
        category_id: Option<Uuid>,
    ) -> Result<Article> {
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
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    /// Delete article
    pub async fn delete(&self, id: Uuid) -> Result<()> {
        let result = sqlx::query("DELETE FROM articles WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(Error::NotFound(format!("Article {} not found", id)));
        }
        Ok(())
    }

    pub async fn exists_by_link(&self, link: &str) -> Result<bool> {
        let result: (bool,) =
            sqlx::query_as("SELECT EXISTS(SELECT 1 FROM articles WHERE link = $1)")
                .bind(link)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
        Ok(result.0)
    }

    pub async fn update_status(&self, id: Uuid, status: &str) -> Result<Article> {
        sqlx::query_as::<_, Article>(
            r#"
            UPDATE articles SET status = $2, updated_at = NOW() WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    /// Batch update status
    pub async fn batch_update_status(&self, ids: &[Uuid], status: &str) -> Result<i64> {
        let result = sqlx::query(
            r#"
            UPDATE articles SET status = $2, updated_at = NOW()
            WHERE id = ANY($1)
            "#,
        )
        .bind(ids)
        .bind(status)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.rows_affected() as i64)
    }

    pub async fn list_by_category(&self, category_id: Uuid, limit: i64) -> Result<Vec<Article>> {
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
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn search(&self, query: &str, limit: i64) -> Result<Vec<Article>> {
        sqlx::query_as::<_, Article>(
            r#"
            SELECT * FROM articles
            WHERE to_tsvector('simple', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('simple', $1)
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(query)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    /// Get statistics for dashboard
    pub async fn get_stats(&self) -> Result<ArticleStats> {
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let published: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles WHERE status = 'published'")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let pending: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles WHERE status = 'pending'")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // Count high risk articles (risk_score > 70). `NULL` risk_score will be excluded naturally.
        let high_risk: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles WHERE risk_score > 70")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let today: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM articles WHERE created_at >= CURRENT_DATE"
        )
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(ArticleStats {
            total: total.0,
            published: published.0,
            pending: pending.0,
            high_risk: high_risk.0,
            today: today.0,
        })
    }

    /// Get recent articles for dashboard
    pub async fn list_recent(&self, limit: i64) -> Result<Vec<Article>> {
        sqlx::query_as::<_, Article>(
            r#"
            SELECT * FROM articles
            WHERE status = 'published'
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_daily_trend(&self, days: i64) -> Result<Vec<ArticleDailyTrendPoint>> {
        let days = days.clamp(1, 90);

        let rows = sqlx::query_as::<_, (NaiveDate, i64)>(
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
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|(date, count)| ArticleDailyTrendPoint { date, count })
            .collect())
    }

    pub async fn get_category_counts(&self) -> Result<Vec<ArticleCategoryCount>> {
        let rows = sqlx::query_as::<_, (Option<Uuid>, i64)>(
            r#"
            SELECT category_id, COUNT(*)::bigint AS count
            FROM articles
            GROUP BY category_id
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|(category_id, count)| ArticleCategoryCount { category_id, count })
            .collect())
    }

    pub async fn get_analytics_summary(&self) -> Result<ArticleAnalyticsSummary> {
        let row: (
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
        ) = sqlx::query_as(
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
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let (
            total,
            pending,
            processing,
            published,
            archived,
            rejected,
            risk_unknown,
            risk_low,
            risk_medium,
            risk_high,
            risk_critical,
            sentiment_unknown,
            sentiment_positive,
            sentiment_neutral,
            sentiment_negative,
            sentiment_mixed,
        ) = row;

        Ok(ArticleAnalyticsSummary {
            total,
            status: ArticleStatusCounts {
                pending,
                processing,
                published,
                archived,
                rejected,
            },
            risk: ArticleRiskCounts {
                unknown: risk_unknown,
                low: risk_low,
                medium: risk_medium,
                high: risk_high,
                critical: risk_critical,
            },
            sentiment: ArticleSentimentCounts {
                unknown: sentiment_unknown,
                positive: sentiment_positive,
                neutral: sentiment_neutral,
                negative: sentiment_negative,
                mixed: sentiment_mixed,
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
