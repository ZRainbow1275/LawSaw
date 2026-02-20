use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{DateTime, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::{ApiKey, CreateApiKey};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::with_tenant_tx;

pub struct ApiKeyService {
    pool: PgPool,
}

impl ApiKeyService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Generate a new API key.
    ///
    /// Wraps the INSERT in `with_tenant_tx` so that `app.tenant_id` is set
    /// and RLS INSERT policy is satisfied.
    pub async fn create(&self, tenant_id: Uuid, input: CreateApiKey) -> Result<(ApiKey, String)> {
        // Generate random API key
        let raw_key = self.generate_key();
        let key_prefix = raw_key[..8].to_string();

        // Hash the key
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let key_hash = argon2
            .hash_password(raw_key.as_bytes(), &salt)
            .map_err(|e| Error::Internal(format!("Failed to hash API key: {}", e)))?
            .to_string();

        let permissions = input
            .permissions
            .unwrap_or_else(|| vec!["read".to_string()]);
        let rate_limit = input.rate_limit.unwrap_or(100);
        let name = input.name.clone();
        let user_id = input.user_id;
        let expires_at = input.expires_at;
        let permissions_json = serde_json::json!(permissions);

        let api_key = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ApiKey>(
                    r#"
                    INSERT INTO api_keys (tenant_id, user_id, name, key_hash, key_prefix, permissions, rate_limit, expires_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .bind(&name)
                .bind(&key_hash)
                .bind(&key_prefix)
                .bind(&permissions_json)
                .bind(rate_limit)
                .bind(expires_at)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        // Return the raw key only once - user must store it
        Ok((api_key, raw_key))
    }

    /// Verify an API key and return the key record
    pub async fn verify(&self, raw_key: &str) -> Result<ApiKey> {
        if raw_key.len() < 8 {
            return Err(Error::Unauthorized("Invalid API key".to_string()));
        }

        let prefix = &raw_key[..8];

        let api_key = sqlx::query_as::<_, ApiKey>(
            "SELECT * FROM api_keys WHERE key_prefix = $1 AND is_active = true",
        )
        .bind(prefix)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::Unauthorized("Invalid API key".to_string()))?;

        // Check expiration
        if let Some(expires_at) = api_key.expires_at {
            if expires_at < Utc::now() {
                return Err(Error::Unauthorized("API key expired".to_string()));
            }
        }

        // Verify hash
        let parsed_hash = PasswordHash::new(&api_key.key_hash)
            .map_err(|e| Error::Internal(format!("Invalid hash: {}", e)))?;

        Argon2::default()
            .verify_password(raw_key.as_bytes(), &parsed_hash)
            .map_err(|_| Error::Unauthorized("Invalid API key".to_string()))?;

        // Update last_used within proper tenant context so the UPDATE
        // respects RLS policies (api_keys_update_policy requires tenant match
        // or empty app.tenant_id).
        let key_id = api_key.id;
        let key_tenant_id = api_key.tenant_id;
        let _ = with_tenant_tx(&self.pool, key_tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query("UPDATE api_keys SET last_used = NOW() WHERE id = $1")
                    .bind(key_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await;

        Ok(api_key)
    }

    /// Count API keys for a user.
    ///
    /// Uses `with_tenant_tx` for defense-in-depth RLS compliance.
    pub async fn count_by_user(&self, tenant_id: Uuid, user_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result: (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM api_keys WHERE user_id = $1")
                        .bind(user_id)
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;
                Ok(result.0)
            })
        })
        .await
    }

    /// List API keys for a user (without hashes).
    ///
    /// Uses `with_tenant_tx` for defense-in-depth RLS compliance.
    pub async fn list_by_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApiKey>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }
        if offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let keys = sqlx::query_as::<_, ApiKey>(
                    "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
                )
                .bind(user_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(keys)
            })
        })
        .await
    }

    /// List API keys for a user with cursor-based pagination.
    ///
    /// Uses `with_tenant_tx` for defense-in-depth RLS compliance.
    pub async fn list_by_user_cursor(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        cursor_created_at: DateTime<Utc>,
        cursor_id: Uuid,
    ) -> Result<Vec<ApiKey>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let keys = sqlx::query_as::<_, ApiKey>(
                    "SELECT * FROM api_keys WHERE user_id = $1 AND (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC LIMIT $4",
                )
                .bind(user_id)
                .bind(cursor_created_at)
                .bind(cursor_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(keys)
            })
        })
        .await
    }

    /// Revoke an API key.
    ///
    /// Wraps in `with_tenant_tx` so the UPDATE respects RLS policies.
    pub async fn revoke(&self, tenant_id: Uuid, id: Uuid, user_id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result = sqlx::query(
                    "UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2",
                )
                .bind(id)
                .bind(user_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if result.rows_affected() == 0 {
                    return Err(Error::NotFound("API key not found".to_string()));
                }
                Ok(())
            })
        })
        .await
    }

    /// Delete an API key.
    ///
    /// Wraps in `with_tenant_tx` so the DELETE respects RLS policies.
    pub async fn delete(&self, tenant_id: Uuid, id: Uuid, user_id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result = sqlx::query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2")
                    .bind(id)
                    .bind(user_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                if result.rows_affected() == 0 {
                    return Err(Error::NotFound("API key not found".to_string()));
                }
                Ok(())
            })
        })
        .await
    }

    fn generate_key(&self) -> String {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let mut rng = rand::thread_rng();

        let key: String = (0..32)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect();

        format!("le_{}", key) // le_ prefix for Law Eye
    }
}
