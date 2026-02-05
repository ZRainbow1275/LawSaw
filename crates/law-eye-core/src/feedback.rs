use crate::tenant::with_tenant_tx;
use chrono::{DateTime, Utc};
use law_eye_common::vault::SensitiveStringCipher;
use law_eye_common::{Error, Result};
use law_eye_db::{CreateFeedback, Feedback, UpdateFeedback};
use sqlx::{PgPool, Postgres, Transaction};
use std::sync::Arc;
use tracing::warn;
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
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { Self::create_tx_inner(tenant_id, tx, &cipher, input).await })
        })
        .await
    }

    pub async fn create_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        input: CreateFeedback,
    ) -> Result<Feedback> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let cipher = self.cipher.clone();
        Self::create_tx_inner(tenant_id, tx, &cipher, input).await
    }

    async fn create_tx_inner(
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        cipher: &Arc<dyn SensitiveStringCipher>,
        input: CreateFeedback,
    ) -> Result<Feedback> {
        // tenant_id kept in signature for future-proofing / explicitness (even if RLS already set).
        let _ = tenant_id;

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
    }

    pub async fn list_by_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Feedback>> {
        let cipher = self.cipher.clone();
        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Feedback>(
                    r#"
                SELECT * FROM feedbacks
                WHERE user_id = $1
                ORDER BY created_at DESC, id DESC
                LIMIT $2 OFFSET $3
                "#,
                )
                .bind(user_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        let plaintext_count = if cipher.is_enabled() {
            rows.iter()
                .filter(|row| row.encryption_version == 0)
                .count()
        } else {
            0
        };
        if plaintext_count > 0 {
            warn!(
                feedbacks_plaintext_count = plaintext_count,
                "Feedback 列表包含未加密历史数据（encryption_version=0）。为保证可预测的读路径延迟，列表接口不再执行逐条回填加密；请通过离线迁移/后台任务完成数据加密回填。"
            );
        }

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(decrypt_feedback(&cipher, row).await?);
        }
        Ok(out)
    }

    pub async fn list_by_user_cursor(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        cursor_created_at: DateTime<Utc>,
        cursor_id: Uuid,
    ) -> Result<Vec<Feedback>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }

        let cipher = self.cipher.clone();
        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Feedback>(
                    r#"
                SELECT * FROM feedbacks
                WHERE user_id = $1
                  AND (created_at, id) < ($2, $3)
                ORDER BY created_at DESC, id DESC
                LIMIT $4
                "#,
                )
                .bind(user_id)
                .bind(cursor_created_at)
                .bind(cursor_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        let plaintext_count = if cipher.is_enabled() {
            rows.iter()
                .filter(|row| row.encryption_version == 0)
                .count()
        } else {
            0
        };
        if plaintext_count > 0 {
            warn!(
                feedbacks_plaintext_count = plaintext_count,
                "Feedback 列表包含未加密历史数据（encryption_version=0）。为保证可预测的读路径延迟，列表接口不再执行逐条回填加密；请通过离线迁移/后台任务完成数据加密回填。"
            );
        }

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(decrypt_feedback(&cipher, row).await?);
        }
        Ok(out)
    }

    pub async fn list_all(
        &self,
        tenant_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Feedback>> {
        let cipher = self.cipher.clone();
        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Feedback>(
                    r#"
                SELECT * FROM feedbacks
                ORDER BY created_at DESC, id DESC
                LIMIT $1 OFFSET $2
                "#,
                )
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        let plaintext_count = if cipher.is_enabled() {
            rows.iter()
                .filter(|row| row.encryption_version == 0)
                .count()
        } else {
            0
        };
        if plaintext_count > 0 {
            warn!(
                feedbacks_plaintext_count = plaintext_count,
                "Feedback 列表包含未加密历史数据（encryption_version=0）。为保证可预测的读路径延迟，列表接口不再执行逐条回填加密；请通过离线迁移/后台任务完成数据加密回填。"
            );
        }

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(decrypt_feedback(&cipher, row).await?);
        }
        Ok(out)
    }

    pub async fn list_all_cursor(
        &self,
        tenant_id: Uuid,
        limit: i64,
        cursor_created_at: DateTime<Utc>,
        cursor_id: Uuid,
    ) -> Result<Vec<Feedback>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }

        let cipher = self.cipher.clone();
        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Feedback>(
                    r#"
                SELECT * FROM feedbacks
                WHERE (created_at, id) < ($1, $2)
                ORDER BY created_at DESC, id DESC
                LIMIT $3
                "#,
                )
                .bind(cursor_created_at)
                .bind(cursor_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        let plaintext_count = if cipher.is_enabled() {
            rows.iter()
                .filter(|row| row.encryption_version == 0)
                .count()
        } else {
            0
        };
        if plaintext_count > 0 {
            warn!(
                feedbacks_plaintext_count = plaintext_count,
                "Feedback 列表包含未加密历史数据（encryption_version=0）。为保证可预测的读路径延迟，列表接口不再执行逐条回填加密；请通过离线迁移/后台任务完成数据加密回填。"
            );
        }

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(decrypt_feedback(&cipher, row).await?);
        }
        Ok(out)
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<Feedback> {
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let row = sqlx::query_as::<_, Feedback>("SELECT * FROM feedbacks WHERE id = $1")
                    .bind(id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
                    .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))?;
                decrypt_or_backfill_feedback(tx, &cipher, row).await
            })
        })
        .await
    }

    pub async fn get_by_id_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
    ) -> Result<Feedback> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let cipher = self.cipher.clone();
        let row = sqlx::query_as::<_, Feedback>("SELECT * FROM feedbacks WHERE id = $1")
            .bind(id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Feedback {} not found", id)))?;

        decrypt_or_backfill_feedback(tx, &cipher, row).await
    }

    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        expected_version: i64,
        input: UpdateFeedback,
    ) -> Result<Feedback> {
        let cipher = self.cipher.clone();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                Self::update_tx_inner(tenant_id, tx, &cipher, id, expected_version, input).await
            })
        })
        .await
    }

    pub async fn update_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        expected_version: i64,
        input: UpdateFeedback,
    ) -> Result<Feedback> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let cipher = self.cipher.clone();
        Self::update_tx_inner(tenant_id, tx, &cipher, id, expected_version, input).await
    }

    async fn update_tx_inner(
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        cipher: &Arc<dyn SensitiveStringCipher>,
        id: Uuid,
        expected_version: i64,
        input: UpdateFeedback,
    ) -> Result<Feedback> {
        let _ = tenant_id;

        let row = sqlx::query_as::<_, Feedback>(
            r#"
            UPDATE feedbacks SET
                status = COALESCE($2, status),
                admin_response = COALESCE($3, admin_response),
                updated_at = NOW()
            WHERE id = $1 AND version = $4
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(&input.status)
        .bind(&input.admin_response)
        .bind(expected_version)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::Conflict("Feedback version conflict".to_string()))?;

        decrypt_or_backfill_feedback(tx, cipher, row).await
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

                let version: i64 = sqlx::query_scalar(
                    r#"
                    UPDATE feedbacks
                    SET content = $2,
                        contact_email = $3,
                        encryption_version = $4,
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING version
                    "#,
                )
                .bind(row.id)
                .bind(&ciphertext_content)
                .bind(&ciphertext_email)
                .bind(FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                row.version = version;

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

async fn decrypt_feedback(
    cipher: &Arc<dyn SensitiveStringCipher>,
    mut row: Feedback,
) -> Result<Feedback> {
    match row.encryption_version {
        0 => Ok(row),
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use law_eye_common::vault::PlaintextCipher;
    use uuid::Uuid;

    #[derive(Debug)]
    struct PanicEnabledCipher;

    #[async_trait::async_trait]
    impl SensitiveStringCipher for PanicEnabledCipher {
        fn is_enabled(&self) -> bool {
            true
        }

        async fn encrypt(&self, _plaintext: &str) -> Result<String> {
            panic!("encrypt should not be called in this test");
        }

        async fn decrypt(&self, _ciphertext: &str) -> Result<String> {
            panic!("decrypt should not be called in this test");
        }
    }

    #[derive(Debug)]
    struct TestEnabledCipher;

    #[async_trait::async_trait]
    impl SensitiveStringCipher for TestEnabledCipher {
        fn is_enabled(&self) -> bool {
            true
        }

        async fn encrypt(&self, plaintext: &str) -> Result<String> {
            Ok(format!("enc:{plaintext}"))
        }

        async fn decrypt(&self, ciphertext: &str) -> Result<String> {
            Ok(ciphertext
                .strip_prefix("enc:")
                .unwrap_or(ciphertext)
                .to_string())
        }
    }

    fn sample_feedback(encryption_version: i16, content: &str, email: Option<&str>) -> Feedback {
        Feedback {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            user_id: Some(Uuid::new_v4()),
            feedback_type: "bug_report".to_string(),
            title: "t".to_string(),
            content: content.to_string(),
            contact_email: email.map(|v| v.to_string()),
            encryption_version,
            source_url: None,
            source_name: None,
            status: "pending".to_string(),
            admin_response: None,
            version: 1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn decrypt_feedback_plaintext_does_not_touch_cipher() {
        let cipher: Arc<dyn SensitiveStringCipher> = Arc::new(PanicEnabledCipher);
        let row = sample_feedback(0, "hello", Some("a@b.com"));

        let out = decrypt_feedback(&cipher, row.clone()).await.unwrap();
        assert_eq!(out.content, "hello");
        assert_eq!(out.contact_email.as_deref(), Some("a@b.com"));
        assert_eq!(out.encryption_version, 0);
    }

    #[tokio::test]
    async fn decrypt_feedback_encrypted_requires_cipher() {
        let cipher: Arc<dyn SensitiveStringCipher> = Arc::new(PlaintextCipher);
        let row = sample_feedback(FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT, "enc:hello", None);

        let err = decrypt_feedback(&cipher, row).await.unwrap_err();
        match err {
            Error::Config(msg) => {
                assert!(msg.contains("runtime cipher is disabled"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[tokio::test]
    async fn decrypt_feedback_encrypted_decrypts_content_and_email() {
        let cipher: Arc<dyn SensitiveStringCipher> = Arc::new(TestEnabledCipher);
        let row = sample_feedback(
            FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT,
            "enc:secret",
            Some("enc:a@b.com"),
        );

        let out = decrypt_feedback(&cipher, row).await.unwrap();
        assert_eq!(out.content, "secret");
        assert_eq!(out.contact_email.as_deref(), Some("a@b.com"));
        assert_eq!(
            out.encryption_version,
            FEEDBACK_ENCRYPTION_VERSION_VAULT_TRANSIT
        );
    }
}
