use law_eye_common::{Error, Result};
use law_eye_db::Category;
use sqlx::PgPool;
use uuid::Uuid;

pub struct CategoryService {
    pool: PgPool,
}

impl CategoryService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Category>> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories ORDER BY sort_order")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_slug(&self, slug: &str) -> Result<Category> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE slug = $1")
            .bind(slug)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Category {} not found", slug)))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Category> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Category {} not found", id)))
    }
}
