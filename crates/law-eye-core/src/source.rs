use law_eye_common::{Error, Result};
use law_eye_db::{CreateSource, Source};
use sqlx::PgPool;
use uuid::Uuid;

pub struct SourceService {
    pool: PgPool,
}

impl SourceService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Source>> {
        sqlx::query_as::<_, Source>("SELECT * FROM sources ORDER BY priority DESC, name")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn list_active(&self) -> Result<Vec<Source>> {
        sqlx::query_as::<_, Source>(
            "SELECT * FROM sources WHERE is_active = true ORDER BY priority DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Source> {
        sqlx::query_as::<_, Source>("SELECT * FROM sources WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Source {} not found", id)))
    }

    pub async fn create(&self, input: CreateSource) -> Result<Source> {
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
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn update_last_fetch(&self, id: Uuid, error: Option<&str>) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sources
            SET last_fetch = NOW(), last_error = $2
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }
}
