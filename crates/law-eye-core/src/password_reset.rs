use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::PasswordResetToken;
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

const TOKEN_PREFIX_LEN: usize = 8;
const TOKEN_RANDOM_LEN: usize = 48;

pub struct PasswordResetService {
    pool: PgPool,
}

impl PasswordResetService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_token(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        ttl_seconds: u64,
        requested_ip: Option<String>,
        requested_user_agent: Option<String>,
    ) -> Result<(PasswordResetToken, String)> {
        if ttl_seconds == 0 {
            return Err(Error::Validation(
                "password reset token ttl_seconds must be > 0".to_string(),
            ));
        }

        let raw_token = Self::generate_token();
        let token_prefix = Self::token_prefix(&raw_token)?;
        let token_hash = Self::hash_token(&raw_token)?;
        let expires_at = Utc::now() + Duration::seconds(ttl_seconds.min(i64::MAX as u64) as i64);

        let token = with_tenant_tx(&self.pool, tenant_id, |tx| {
            let token_hash = token_hash.clone();
            let token_prefix = token_prefix.clone();
            let requested_ip = requested_ip.clone();
            let requested_user_agent = requested_user_agent.clone();

            Box::pin(async move {
                // Invalidate existing active tokens to keep the surface minimal.
                sqlx::query(
                    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
                )
                .bind(user_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let token = sqlx::query_as::<_, PasswordResetToken>(
                    r#"
                    INSERT INTO password_reset_tokens
                        (user_id, token_hash, token_prefix, requested_ip, requested_user_agent, expires_at)
                    VALUES
                        ($1, $2, $3, $4::inet, $5, $6)
                    RETURNING
                        id,
                        tenant_id,
                        user_id,
                        token_hash,
                        token_prefix,
                        requested_ip::text AS requested_ip,
                        requested_user_agent,
                        expires_at,
                        used_at,
                        created_at
                    "#,
                )
                .bind(user_id)
                .bind(&token_hash)
                .bind(&token_prefix)
                .bind(&requested_ip)
                .bind(&requested_user_agent)
                .bind(expires_at)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(token)
            })
        })
        .await?;

        Ok((token, raw_token))
    }

    pub async fn consume_and_reset_password(
        &self,
        tenant_id: Uuid,
        expected_user_id: Uuid,
        raw_token: &str,
        new_password_hash: &str,
    ) -> Result<Uuid> {
        let raw_token = raw_token.trim();
        let token_prefix = Self::token_prefix(raw_token)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let token_prefix = token_prefix.clone();
            let raw_token = raw_token.to_string();
            let new_password_hash = new_password_hash.to_string();

            Box::pin(async move {
                // Lock candidates to prevent concurrent reuse.
                let candidates: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
                    r#"
                    SELECT id, user_id, token_hash
                    FROM password_reset_tokens
                    WHERE token_prefix = $1
                      AND used_at IS NULL
                      AND expires_at > NOW()
                    ORDER BY created_at DESC
                    LIMIT 20
                    FOR UPDATE
                    "#,
                )
                .bind(&token_prefix)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let mut matched: Option<(Uuid, Uuid)> = None;
                for (token_id, user_id, token_hash) in candidates {
                    let parsed =
                        PasswordHash::new(&token_hash).map_err(|e| Error::Internal(e.to_string()))?;
                    if Argon2::default()
                        .verify_password(raw_token.as_bytes(), &parsed)
                        .is_ok()
                    {
                        matched = Some((token_id, user_id));
                        break;
                    }
                }

                let Some((_token_id, user_id)) = matched else {
                    return Err(Error::Unauthorized("Invalid or expired token".to_string()));
                };

                if user_id != expected_user_id {
                    return Err(Error::Unauthorized("Invalid or expired token".to_string()));
                }

                // Mark all tokens for the user as used, then rotate password.
                sqlx::query(
                    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
                )
                .bind(user_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let result = sqlx::query(
                    "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
                )
                .bind(&new_password_hash)
                .bind(user_id)
                .bind(tenant_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if result.rows_affected() == 0 {
                    return Err(Error::NotFound("User not found".to_string()));
                }

                Ok(user_id)
            })
        })
        .await
    }

    pub fn hash_password(password: &str) -> Result<String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| Error::Internal(format!("Failed to hash password: {}", e)))?
            .to_string();
        Ok(password_hash)
    }

    fn hash_token(raw_token: &str) -> Result<String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let token_hash = argon2
            .hash_password(raw_token.as_bytes(), &salt)
            .map_err(|e| Error::Internal(format!("Failed to hash reset token: {}", e)))?
            .to_string();
        Ok(token_hash)
    }

    fn token_prefix(raw_token: &str) -> Result<String> {
        if raw_token.len() < TOKEN_PREFIX_LEN {
            return Err(Error::Unauthorized("Invalid token".to_string()));
        }
        Ok(raw_token[..TOKEN_PREFIX_LEN].to_string())
    }

    fn generate_token() -> String {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let mut rng = rand::thread_rng();

        let token: String = (0..TOKEN_RANDOM_LEN)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect();

        format!("pr_{}", token)
    }
}
