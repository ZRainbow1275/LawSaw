use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::{OAuthIdentity, OAuthStateToken, User};
use rand::Rng;
use regex::Regex;
use sqlx::PgPool;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

const STATE_PREFIX_LEN: usize = 8;
const STATE_RANDOM_LEN: usize = 48;
const PROVIDER_MAX_LEN: usize = 32;
const PROVIDER_USER_ID_MAX_LEN: usize = 128;
const PROVIDER_EMAIL_MAX_LEN: usize = 320;

pub struct OAuthIdentityService {
    pool: PgPool,
}

#[derive(Debug, Clone)]
pub struct OAuthProviderIdentity {
    pub provider: String,
    pub provider_user_id: String,
    pub provider_email: String,
}

#[derive(Debug, Clone)]
pub struct OAuthStateIssued {
    pub token: OAuthStateToken,
    pub raw_state: String,
}

impl OAuthIdentityService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn issue_state_token(
        &self,
        tenant_id: Uuid,
        provider: &str,
        ttl_seconds: u64,
    ) -> Result<OAuthStateIssued> {
        if ttl_seconds == 0 {
            return Err(Error::Validation(
                "oauth state ttl_seconds must be > 0".to_string(),
            ));
        }

        let provider = normalize_provider(provider)?;

        let raw_state = generate_state();
        let state_prefix = state_prefix(&raw_state)?;
        let state_hash = hash_secret(&raw_state)?;
        let expires_at = Utc::now() + Duration::seconds(ttl_seconds.min(i64::MAX as u64) as i64);

        let token = with_tenant_tx(&self.pool, tenant_id, |tx| {
            let provider = provider.clone();
            let state_hash = state_hash.clone();
            let state_prefix = state_prefix.clone();

            Box::pin(async move {
                let token = sqlx::query_as::<_, OAuthStateToken>(
                    r#"
                    INSERT INTO oauth_state_tokens (provider, state_hash, state_prefix, expires_at)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, tenant_id, provider, state_hash, state_prefix, expires_at, used_at, created_at
                    "#,
                )
                .bind(&provider)
                .bind(&state_hash)
                .bind(&state_prefix)
                .bind(expires_at)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(token)
            })
        })
        .await?;

        Ok(OAuthStateIssued { token, raw_state })
    }

    pub async fn consume_state_token(
        &self,
        tenant_id: Uuid,
        provider: &str,
        raw_state: &str,
    ) -> Result<()> {
        let provider = normalize_provider(provider)?;
        let raw_state = raw_state.trim();
        let state_prefix = state_prefix(raw_state)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let provider = provider.clone();
            let raw_state = raw_state.to_string();
            let state_prefix = state_prefix.clone();

            Box::pin(async move {
                let candidates: Vec<(Uuid, String)> = sqlx::query_as(
                    r#"
                    SELECT id, state_hash
                    FROM oauth_state_tokens
                    WHERE provider = $1
                      AND state_prefix = $2
                      AND used_at IS NULL
                      AND expires_at > NOW()
                    ORDER BY created_at DESC
                    LIMIT 20
                    FOR UPDATE
                    "#,
                )
                .bind(&provider)
                .bind(&state_prefix)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let mut matched_id: Option<Uuid> = None;
                for (id, hash) in candidates {
                    let parsed =
                        PasswordHash::new(&hash).map_err(|e| Error::Internal(e.to_string()))?;
                    if Argon2::default()
                        .verify_password(raw_state.as_bytes(), &parsed)
                        .is_ok()
                    {
                        matched_id = Some(id);
                        break;
                    }
                }

                let Some(token_id) = matched_id else {
                    return Err(Error::Unauthorized(
                        "Invalid or expired OAuth state".to_string(),
                    ));
                };

                sqlx::query("UPDATE oauth_state_tokens SET used_at = NOW() WHERE id = $1")
                    .bind(token_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok(())
            })
        })
        .await
    }

    pub async fn find_user_by_identity(
        &self,
        tenant_id: Uuid,
        identity: &OAuthProviderIdentity,
    ) -> Result<Option<User>> {
        let provider = normalize_provider(&identity.provider)?;
        let provider_user_id = normalize_provider_user_id(&identity.provider_user_id)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let provider = provider.clone();
            let provider_user_id = provider_user_id.clone();

            Box::pin(async move {
                let user = sqlx::query_as::<_, User>(
                    r#"
                    SELECT u.*
                    FROM oauth_identities oi
                    INNER JOIN users u ON u.id = oi.user_id AND u.tenant_id = oi.tenant_id
                    WHERE oi.provider = $1
                      AND oi.provider_user_id = $2
                    LIMIT 1
                    "#,
                )
                .bind(&provider)
                .bind(&provider_user_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(user)
            })
        })
        .await
    }

    pub async fn link_identity(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        identity: &OAuthProviderIdentity,
    ) -> Result<OAuthIdentity> {
        let provider = normalize_provider(&identity.provider)?;
        let provider_user_id = normalize_provider_user_id(&identity.provider_user_id)?;
        let provider_email = normalize_email(&identity.provider_email)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let provider = provider.clone();
            let provider_user_id = provider_user_id.clone();
            let provider_email = provider_email.clone();

            Box::pin(async move {
                let identity = sqlx::query_as::<_, OAuthIdentity>(
                    r#"
                    INSERT INTO oauth_identities (user_id, provider, provider_user_id, provider_email, last_login_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (tenant_id, provider, provider_user_id)
                    DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        provider_email = EXCLUDED.provider_email,
                        last_login_at = NOW()
                    RETURNING
                        id,
                        tenant_id,
                        user_id,
                        provider,
                        provider_user_id,
                        provider_email,
                        linked_at,
                        last_login_at,
                        created_at
                    "#,
                )
                .bind(user_id)
                .bind(&provider)
                .bind(&provider_user_id)
                .bind(&provider_email)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(identity)
            })
        })
        .await
    }

    pub async fn get_user_by_email(&self, tenant_id: Uuid, email: &str) -> Result<Option<User>> {
        let email = normalize_email(email)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let email = email.clone();

            Box::pin(async move {
                let user = sqlx::query_as::<_, User>(
                    "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
                )
                .bind(&email)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(user)
            })
        })
        .await
    }
}

fn normalize_provider(provider: &str) -> Result<String> {
    let value = provider.trim().to_ascii_lowercase();
    if value.is_empty() || value.len() > PROVIDER_MAX_LEN {
        return Err(Error::Validation("Invalid oauth provider".to_string()));
    }

    if !value
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-')
    {
        return Err(Error::Validation("Invalid oauth provider".to_string()));
    }

    Ok(value)
}

fn normalize_provider_user_id(provider_user_id: &str) -> Result<String> {
    let value = provider_user_id.trim().to_string();
    if value.is_empty() || value.len() > PROVIDER_USER_ID_MAX_LEN {
        return Err(Error::Validation(
            "Invalid oauth provider user id".to_string(),
        ));
    }

    if value.chars().any(|ch| ch.is_control()) {
        return Err(Error::Validation(
            "Invalid oauth provider user id".to_string(),
        ));
    }

    Ok(value)
}

fn normalize_email(email: &str) -> Result<String> {
    let value = email.trim().to_string();
    if value.is_empty() || value.len() > PROVIDER_EMAIL_MAX_LEN {
        return Err(Error::Validation("Invalid email address".to_string()));
    }

    let email_re = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        .map_err(|e| Error::Internal(format!("regex init failed: {e}")))?;
    if !email_re.is_match(&value) {
        return Err(Error::Validation("Invalid email address".to_string()));
    }

    Ok(value)
}

fn hash_secret(raw: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(raw.as_bytes(), &salt)
        .map_err(|e| Error::Internal(format!("Failed to hash oauth secret: {e}")))
        .map(|hash| hash.to_string())
}

fn state_prefix(raw: &str) -> Result<String> {
    if raw.len() < STATE_PREFIX_LEN {
        return Err(Error::Unauthorized("Invalid oauth state".to_string()));
    }
    Ok(raw[..STATE_PREFIX_LEN].to_string())
}

fn generate_state() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    let token: String = (0..STATE_RANDOM_LEN)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();

    format!("os_{token}")
}
