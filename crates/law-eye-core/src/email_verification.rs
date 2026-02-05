use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::EmailVerificationToken;
use rand::Rng;
use sqlx::PgPool;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

const TOKEN_PREFIX_LEN: usize = 8;
const TOKEN_RANDOM_LEN: usize = 48;

pub struct EmailVerificationService {
    pool: PgPool,
}

impl EmailVerificationService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_token(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        email: &str,
        ttl_seconds: u64,
        requested_ip: Option<String>,
        requested_user_agent: Option<String>,
    ) -> Result<(EmailVerificationToken, String)> {
        if ttl_seconds == 0 {
            return Err(Error::Validation(
                "email verification token ttl_seconds must be > 0".to_string(),
            ));
        }

        let email = email.trim();
        if email.is_empty() {
            return Err(Error::Validation("email must not be empty".to_string()));
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
            let email = email.to_string();

            Box::pin(async move {
                // Invalidate existing active tokens to keep the surface minimal.
                sqlx::query(
                    "UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
                )
                .bind(user_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let token = sqlx::query_as::<_, EmailVerificationToken>(
                    r#"
                    INSERT INTO email_verification_tokens
                        (user_id, email, token_hash, token_prefix, requested_ip, requested_user_agent, expires_at)
                    VALUES
                        ($1, $2, $3, $4, $5::inet, $6, $7)
                    RETURNING
                        id,
                        tenant_id,
                        user_id,
                        email,
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
                .bind(&email)
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

    pub async fn consume_and_verify(
        &self,
        tenant_id: Uuid,
        expected_user_id: Uuid,
        expected_email: &str,
        raw_token: &str,
    ) -> Result<Uuid> {
        let raw_token = raw_token.trim();
        let token_prefix = Self::token_prefix(raw_token)?;
        let expected_email = expected_email.trim();
        if expected_email.is_empty() {
            return Err(Error::Validation("email must not be empty".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let token_prefix = token_prefix.clone();
            let raw_token = raw_token.to_string();
            let expected_email = expected_email.to_string();

            Box::pin(async move {
                // Lock candidates to prevent concurrent reuse.
                let candidates: Vec<(Uuid, Uuid, String, String)> = sqlx::query_as(
                    r#"
                    SELECT id, user_id, email, token_hash
                    FROM email_verification_tokens
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

                let mut matched: Option<(Uuid, Uuid, String)> = None;
                for (token_id, user_id, email, token_hash) in candidates {
                    let parsed =
                        PasswordHash::new(&token_hash).map_err(|e| Error::Internal(e.to_string()))?;
                    if Argon2::default()
                        .verify_password(raw_token.as_bytes(), &parsed)
                        .is_ok()
                    {
                        matched = Some((token_id, user_id, email));
                        break;
                    }
                }

                let Some((_token_id, user_id, token_email)) = matched else {
                    return Err(Error::Unauthorized("Invalid or expired token".to_string()));
                };

                if user_id != expected_user_id {
                    return Err(Error::Unauthorized("Invalid or expired token".to_string()));
                }

                if !token_email.eq_ignore_ascii_case(&expected_email) {
                    return Err(Error::Unauthorized("Invalid or expired token".to_string()));
                }

                let current_email: Option<String> = sqlx::query_scalar(
                    "SELECT email FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
                )
                .bind(user_id)
                .bind(tenant_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let Some(current_email) = current_email else {
                    return Err(Error::NotFound("User not found".to_string()));
                };

                if !current_email.eq_ignore_ascii_case(&expected_email) {
                    return Err(Error::Unauthorized("Invalid or expired token".to_string()));
                }

                // Mark all tokens for the user as used, then set verified timestamp.
                sqlx::query(
                    "UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
                )
                .bind(user_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                sqlx::query(
                    "UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
                )
                .bind(user_id)
                .bind(tenant_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(user_id)
            })
        })
        .await
    }

    fn hash_token(raw_token: &str) -> Result<String> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let token_hash = argon2
            .hash_password(raw_token.as_bytes(), &salt)
            .map_err(|e| Error::Internal(format!("Failed to hash verification token: {}", e)))?
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

        format!("ev_{}", token)
    }
}
