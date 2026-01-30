use crate::tenant::with_tenant_tx;
use law_eye_common::vault::SensitiveStringCipher;
use law_eye_common::{Error, Result};
use law_eye_db::{CreateFeedback, Feedback, UpdateFeedback};
use sqlx::{PgPool, Postgres, Transaction};
use std::sync::Arc;
use uuid::Uuid;

const FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT: i16 = 1;

pub struct FeedbackService {
    pool: PgPool,
    cipher: Arc<dyn SensitiveStringCipher>,
}

impl FeedbackService {
    pub fn new(pool: PgPool, cipher: Arc<dyn SensitiveStringCipher>) -> Self {
        Self { pool, cipher }
    }

    pub async fn create(&self, tenant_id: Uuid, input: CreateFeedback) -> Result<Feedback> {
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let plaintext_content = input.content.clone();
            let plaintext_contact_email = input.contact_email.clone();

            let (content_to_store, contact_email_to_store, encryption_version) = if cipher.is_enabled()
            {
                let content = cipher.encrypt(&input.content).await?;
                let email = match input.contact_email.as_deref() {
                    Some(v) => Some(cipher.encrypt(v).await?),
                    None => None,
                };
                (content, email, FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT)
            } else {
                (input.content, input.contact_email, 0)
            };

            let mut row = sqlx::query_as::<_, Feedback>(
                r#"
                INSERT INTO feedbacks (user_id, type, title, content, contact_email, source_url, source_name, encryption_version)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                "#,
            )
            .bind(input.user_id)
            .bind(&input.feedback_type)
            .bind(&input.title)
            .bind(&content_to_store)
            .bind(&contact_email_to_store)
            .bind(&input.source_url)
            .bind(&input.source_name)
            .bind(encryption_version)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            // Return plaintext to callers (API/UI) even if stored as ciphertext.
            row.content = plaintext_content;
            row.contact_email = plaintext_contact_email;
            Ok(row)
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
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let rows = sqlx::query_as::<_, Feedback>(
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
            .map_err(|e| Error::Database(e.to_string()))?;

            let mut out = Vec::with_capacity(rows.len());
            for row in rows {
                out.push(decrypt_or_backfill_feedback(tx, &cipher, row).await?);
            }
            Ok(out)
        }))
        .await
    }

    pub async fn list_all(&self, tenant_id: Uuid, limit: i64, offset: i64) -> Result<Vec<Feedback>> {
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let rows = sqlx::query_as::<_, Feedback>(
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
            .map_err(|e| Error::Database(e.to_string()))?;

            let mut out = Vec::with_capacity(rows.len());
            for row in rows {
                out.push(decrypt_or_backfill_feedback(tx, &cipher, row).await?);
            }
            Ok(out)
        }))
        .await
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<Feedback> {
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let row = sqlx::query_as::<_, Feedback>("SELECT * FROM feedbacks WHERE id = $1")
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))?;
            decrypt_or_backfill_feedback(tx, &cipher, row).await
        }))
        .await
    }

    pub async fn update(&self, tenant_id: Uuid, id: Uuid, input: UpdateFeedback) -> Result<Feedback> {
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            let row = sqlx::query_as::<_, Feedback>(
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
            .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))?;

            decrypt_or_backfill_feedback(tx, &cipher, row).await
        }))
        .await
    }
}

async fn decrypt_or_backfill_feedback(
    tx: &mut Transaction<'_, Postgres>,
    cipher: &Arc<dyn SensitiveStringCipher>,
    mut row: Feedback,
) -> Result<Feedback> {
    match row.encryption_version {
        0 => {
            if cipher.is_enabled() {
                let ciphertext_content = cipher.encrypt(&row.content).await?;
                let ciphertext_email = match row.contact_email.as_deref() {
                    Some(v) => Some(cipher.encrypt(v).await?),
                    None => None,
                };

                sqlx::query(
                    r#"
                    UPDATE feedbacks
                    SET content = $2,
                        contact_email = $3,
                        encryption_version = $4,
                        updated_at = NOW()
                    WHERE id = $1
                    "#,
                )
                .bind(row.id)
                .bind(&ciphertext_content)
                .bind(&ciphertext_email)
                .bind(FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                row.encryption_version = FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT;
            }

            Ok(row)
        }
        FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT => {
            if !cipher.is_enabled() {
                return Err(Error::Config(
                    "Feedback encryption is enabled in DB but runtime cipher is disabled".into(),
                ));
            }

            row.content = cipher.decrypt(&row.content).await?;
            if let Some(email) = row.contact_email.take() {
                row.contact_email = Some(cipher.decrypt(&email).await?);
            }
            Ok(row)
        }
        other => Err(Error::Validation(format!(
            "Unsupported feedback encryption_version: {other}"
        ))),
    }
}
