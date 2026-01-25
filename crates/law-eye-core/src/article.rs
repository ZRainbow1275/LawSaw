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
    pub today: i64,
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
