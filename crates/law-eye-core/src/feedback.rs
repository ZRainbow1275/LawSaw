use crate::tenant::with_tenant_tx;
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

    pub async fn create(&self, tenant_id: Uuid, input: CreateFeedback) -> Result<Feedback> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
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
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    pub async fn list_by_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Feedback>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
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
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    pub async fn list_all(&self, tenant_id: Uuid, limit: i64, offset: i64) -> Result<Vec<Feedback>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Feedback>(
                r#"
                SELECT * FROM feedbacks
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

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<Feedback> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Feedback>("SELECT * FROM feedbacks WHERE id = $1")
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))
        }))
        .await
    }

    pub async fn update(&self, tenant_id: Uuid, id: Uuid, input: UpdateFeedback) -> Result<Feedback> {
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
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
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))
        }))
        .await
    }
}
