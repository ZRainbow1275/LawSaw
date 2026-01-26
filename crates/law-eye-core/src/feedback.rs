use law_eye_common::{Error, Result};
use law_eye_db::{CreateFeedback, Feedback, UpdateFeedback};
use sqlx::PgPool;
use uuid::Uuid;

pub struct FeedbackService {
    pool: PgPool,
}

impl FeedbackService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: CreateFeedback) -> Result<Feedback> {
        sqlx::query_as::<_, Feedback>(
            r#"
            INSERT INTO feedbacks (user_id, type, title, content, contact_email, source_url, source_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(input.user_id)
        .bind(&input.feedback_type)
        .bind(&input.title)
        .bind(&input.content)
        .bind(&input.contact_email)
        .bind(&input.source_url)
        .bind(&input.source_name)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn list_by_user(
        &self,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Feedback>> {
        sqlx::query_as::<_, Feedback>(
            r#"
            SELECT * FROM feedbacks
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn list_all(&self, limit: i64, offset: i64) -> Result<Vec<Feedback>> {
        sqlx::query_as::<_, Feedback>(
            r#"
            SELECT * FROM feedbacks
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

    pub async fn get_by_id(&self, id: Uuid) -> Result<Feedback> {
        sqlx::query_as::<_, Feedback>("SELECT * FROM feedbacks WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))
    }

    pub async fn update(&self, id: Uuid, input: UpdateFeedback) -> Result<Feedback> {
        sqlx::query_as::<_, Feedback>(
            r#"
            UPDATE feedbacks SET
                status = COALESCE($2, status),
                admin_response = COALESCE($3, admin_response),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&input.status)
        .bind(&input.admin_response)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))
    }
}
