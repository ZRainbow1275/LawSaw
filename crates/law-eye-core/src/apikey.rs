use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use law_eye_common::{Error, Result};
use law_eye_db::{ApiKey, CreateApiKey};
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

pub struct ApiKeyService {
    pool: PgPool,
}

impl ApiKeyService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Generate a new API key
    pub async fn create(&self, input: CreateApiKey) -> Result<(ApiKey, String)> {
        // Generate random API key
        let raw_key = self.generate_key();
        let key_prefix = &raw_key[..8];

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

        let api_key = sqlx::query_as::<_, ApiKey>(
            r#"
            INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, rate_limit, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(input.user_id)
        .bind(&input.name)
        .bind(&key_hash)
        .bind(key_prefix)
        .bind(serde_json::json!(permissions))
        .bind(rate_limit)
        .bind(input.expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

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
            if expires_at < chrono::Utc::now() {
                return Err(Error::Unauthorized("API key expired".to_string()));
            }
        }

        // Verify hash
        let parsed_hash = PasswordHash::new(&api_key.key_hash)
            .map_err(|e| Error::Internal(format!("Invalid hash: {}", e)))?;

        Argon2::default()
            .verify_password(raw_key.as_bytes(), &parsed_hash)
            .map_err(|_| Error::Unauthorized("Invalid API key".to_string()))?;

        // Update last_used
        sqlx::query("UPDATE api_keys SET last_used = NOW() WHERE id = $1")
            .bind(api_key.id)
            .execute(&self.pool)
            .await
            .ok();

        Ok(api_key)
    }

    /// List API keys for a user (without hashes)
    pub async fn count_by_user(&self, user_id: Uuid) -> Result<i64> {
        let result: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM api_keys WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.0)
    }

    /// List API keys for a user (without hashes)
    pub async fn list_by_user(&self, user_id: Uuid, limit: i64, offset: i64) -> Result<Vec<ApiKey>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }
        if offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }

        let keys = sqlx::query_as::<_, ApiKey>(
            "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(keys)
    }

    /// Revoke an API key
    pub async fn revoke(&self, id: Uuid, user_id: Uuid) -> Result<()> {
        let result =
            sqlx::query("UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(user_id)
                .execute(&self.pool)
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(Error::NotFound("API key not found".to_string()));
        }

        Ok(())
    }

    /// Delete an API key
    pub async fn delete(&self, id: Uuid, user_id: Uuid) -> Result<()> {
        let result = sqlx::query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(Error::NotFound("API key not found".to_string()));
        }

        Ok(())
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
