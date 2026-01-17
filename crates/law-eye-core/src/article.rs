use law_eye_common::{Error, Result};
use law_eye_db::{Article, CreateArticle};
use sqlx::PgPool;
use uuid::Uuid;

pub struct ArticleService {
    pool: PgPool,
}

impl ArticleService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
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
            UPDATE articles SET status = $2 WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
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
}
