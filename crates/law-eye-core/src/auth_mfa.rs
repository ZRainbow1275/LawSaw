use argon2::password_hash::rand_core::OsRng as ArgonOsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use law_eye_common::vault::SensitiveStringCipher;
use law_eye_common::{Error, Result};
use law_eye_db::{MfaLoginChallenge, UserMfaTotp};
use rand::{rngs::OsRng, Rng, RngCore};
use sha1::Sha1;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

type HmacSha1 = Hmac<Sha1>;

const TOTP_STEP_SECONDS: u64 = 30;
const TOTP_DIGITS: u32 = 6;
const TOTP_SECRET_BYTES: usize = 20;
const CHALLENGE_PREFIX_LEN: usize = 8;
const CHALLENGE_RANDOM_LEN: usize = 48;

pub struct MfaTotpService {
    pool: PgPool,
    cipher: Arc<dyn SensitiveStringCipher>,
}

#[derive(Debug, Clone)]
pub struct TotpProvisioning {
    pub secret: String,
    pub provisioning_uri: String,
}

#[derive(Debug, Clone)]
pub struct MfaChallengeIssued {
    pub token: MfaLoginChallenge,
    pub raw_challenge: String,
}

impl MfaTotpService {
    pub fn new(pool: PgPool, cipher: Arc<dyn SensitiveStringCipher>) -> Self {
        Self { pool, cipher }
    }

    pub async fn setup_totp(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        issuer: &str,
        account_label: &str,
    ) -> Result<TotpProvisioning> {
        let issuer = normalize_issuer(issuer)?;
        let account_label = normalize_account_label(account_label)?;
        let secret = generate_totp_secret();
        let secret_ciphertext = self.cipher.encrypt(&secret).await?;
        let provisioning_uri = build_provisioning_uri(&issuer, &account_label, &secret);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let issuer = issuer.clone();
            let secret_ciphertext = secret_ciphertext.clone();

            Box::pin(async move {
                let _ = sqlx::query_as::<_, UserMfaTotp>(
                    r#"
                    INSERT INTO user_mfa_totp (user_id, issuer, secret_ciphertext, enabled, verified_at, last_used_at)
                    VALUES ($1, $2, $3, false, NULL, NULL)
                    ON CONFLICT (tenant_id, user_id)
                    DO UPDATE SET
                        issuer = EXCLUDED.issuer,
                        secret_ciphertext = EXCLUDED.secret_ciphertext,
                        enabled = false,
                        verified_at = NULL,
                        last_used_at = NULL,
                        updated_at = NOW()
                    RETURNING
                        id,
                        tenant_id,
                        user_id,
                        issuer,
                        secret_ciphertext,
                        enabled,
                        verified_at,
                        last_used_at,
                        created_at,
                        updated_at
                    "#,
                )
                .bind(user_id)
                .bind(&issuer)
                .bind(&secret_ciphertext)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(())
            })
        })
        .await?;

        Ok(TotpProvisioning {
            secret,
            provisioning_uri,
        })
    }

    pub async fn confirm_totp(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        code: &str,
    ) -> Result<UserMfaTotp> {
        let code = normalize_totp_code(code)?;
        let cipher = self.cipher.clone();

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let code = code.clone();
            let cipher = cipher.clone();

            Box::pin(async move {
                let record = sqlx::query_as::<_, UserMfaTotp>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        user_id,
                        issuer,
                        secret_ciphertext,
                        enabled,
                        verified_at,
                        last_used_at,
                        created_at,
                        updated_at
                    FROM user_mfa_totp
                    WHERE user_id = $1
                    FOR UPDATE
                    "#,
                )
                .bind(user_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound("MFA TOTP is not set up".to_string()))?;

                let secret = cipher.decrypt(&record.secret_ciphertext).await?;
                if !verify_totp_code(&secret, &code, Utc::now().timestamp())? {
                    return Err(Error::Unauthorized("Invalid TOTP code".to_string()));
                }

                let updated = sqlx::query_as::<_, UserMfaTotp>(
                    r#"
                    UPDATE user_mfa_totp
                    SET enabled = true,
                        verified_at = NOW(),
                        last_used_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING
                        id,
                        tenant_id,
                        user_id,
                        issuer,
                        secret_ciphertext,
                        enabled,
                        verified_at,
                        last_used_at,
                        created_at,
                        updated_at
                    "#,
                )
                .bind(record.id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    pub async fn disable_totp(&self, tenant_id: Uuid, user_id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query("DELETE FROM user_mfa_totp WHERE user_id = $1")
                    .bind(user_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await
    }

    pub async fn get_totp_status(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<UserMfaTotp>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let record = sqlx::query_as::<_, UserMfaTotp>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        user_id,
                        issuer,
                        secret_ciphertext,
                        enabled,
                        verified_at,
                        last_used_at,
                        created_at,
                        updated_at
                    FROM user_mfa_totp
                    WHERE user_id = $1
                    LIMIT 1
                    "#,
                )
                .bind(user_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(record)
            })
        })
        .await
    }

    pub async fn issue_login_challenge(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        ttl_seconds: u64,
    ) -> Result<MfaChallengeIssued> {
        if ttl_seconds == 0 {
            return Err(Error::Validation(
                "mfa login challenge ttl_seconds must be > 0".to_string(),
            ));
        }

        let raw_challenge = generate_challenge();
        let challenge_prefix = challenge_prefix(&raw_challenge)?;
        let challenge_hash = hash_challenge(&raw_challenge)?;
        let expires_at = Utc::now() + Duration::seconds(ttl_seconds.min(i64::MAX as u64) as i64);

        let token = with_tenant_tx(&self.pool, tenant_id, |tx| {
            let challenge_prefix = challenge_prefix.clone();
            let challenge_hash = challenge_hash.clone();

            Box::pin(async move {
                sqlx::query("UPDATE mfa_login_challenges SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL")
                    .bind(user_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                let token = sqlx::query_as::<_, MfaLoginChallenge>(
                    r#"
                    INSERT INTO mfa_login_challenges (user_id, challenge_hash, challenge_prefix, expires_at)
                    VALUES ($1, $2, $3, $4)
                    RETURNING
                        id,
                        tenant_id,
                        user_id,
                        challenge_hash,
                        challenge_prefix,
                        expires_at,
                        used_at,
                        created_at
                    "#,
                )
                .bind(user_id)
                .bind(&challenge_hash)
                .bind(&challenge_prefix)
                .bind(expires_at)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(token)
            })
        })
        .await?;

        Ok(MfaChallengeIssued {
            token,
            raw_challenge,
        })
    }

    pub async fn consume_login_challenge_and_verify(
        &self,
        tenant_id: Uuid,
        raw_challenge: &str,
        code: &str,
    ) -> Result<Uuid> {
        let raw_challenge = raw_challenge.trim();
        let challenge_prefix = challenge_prefix(raw_challenge)?;
        let code = normalize_totp_code(code)?;
        let cipher = self.cipher.clone();

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let challenge_prefix = challenge_prefix.clone();
            let raw_challenge = raw_challenge.to_string();
            let code = code.clone();
            let cipher = cipher.clone();

            Box::pin(async move {
                let candidates: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
                    r#"
                    SELECT id, user_id, challenge_hash
                    FROM mfa_login_challenges
                    WHERE challenge_prefix = $1
                      AND used_at IS NULL
                      AND expires_at > NOW()
                    ORDER BY created_at DESC
                    LIMIT 20
                    FOR UPDATE
                    "#,
                )
                .bind(&challenge_prefix)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let mut matched: Option<(Uuid, Uuid)> = None;
                for (id, challenge_user_id, hash) in candidates {
                    if verify_hashed_challenge(&raw_challenge, &hash)? {
                        matched = Some((id, challenge_user_id));
                        break;
                    }
                }

                let Some((challenge_id, user_id)) = matched else {
                    return Err(Error::Unauthorized(
                        "Invalid or expired MFA challenge".to_string(),
                    ));
                };

                let record = sqlx::query_as::<_, UserMfaTotp>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        user_id,
                        issuer,
                        secret_ciphertext,
                        enabled,
                        verified_at,
                        last_used_at,
                        created_at,
                        updated_at
                    FROM user_mfa_totp
                    WHERE user_id = $1
                    FOR UPDATE
                    "#,
                )
                .bind(user_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::Unauthorized("MFA is not enabled".to_string()))?;

                if !record.enabled {
                    return Err(Error::Unauthorized("MFA is not enabled".to_string()));
                }

                let secret = cipher.decrypt(&record.secret_ciphertext).await?;
                if !verify_totp_code(&secret, &code, Utc::now().timestamp())? {
                    return Err(Error::Unauthorized("Invalid TOTP code".to_string()));
                }

                sqlx::query("UPDATE mfa_login_challenges SET used_at = NOW() WHERE id = $1")
                    .bind(challenge_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                sqlx::query(
                    "UPDATE user_mfa_totp SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1",
                )
                .bind(record.id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(user_id)
            })
        })
        .await
    }
}

fn generate_totp_secret() -> String {
    let mut raw = [0u8; TOTP_SECRET_BYTES];
    OsRng.fill_bytes(&mut raw);
    base32_encode_nopad(&raw)
}

fn base32_encode_nopad(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut out = String::new();
    let mut buffer: u32 = 0;
    let mut bits_left: u8 = 0;

    for b in bytes {
        buffer = (buffer << 8) | u32::from(*b);
        bits_left += 8;
        while bits_left >= 5 {
            let idx = ((buffer >> (bits_left - 5)) & 0x1f) as usize;
            out.push(ALPHABET[idx] as char);
            bits_left -= 5;
        }
    }

    if bits_left > 0 {
        let idx = ((buffer << (5 - bits_left)) & 0x1f) as usize;
        out.push(ALPHABET[idx] as char);
    }

    out
}

fn base32_decode_nopad(input: &str) -> Result<Vec<u8>> {
    let mut cleaned = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_whitespace() || ch == '=' {
            continue;
        }
        cleaned.push(ch.to_ascii_uppercase());
    }

    if cleaned.is_empty() {
        return Err(Error::Validation("Invalid TOTP secret".to_string()));
    }

    let mut out = Vec::new();
    let mut buffer: u32 = 0;
    let mut bits_left: u8 = 0;

    for ch in cleaned.bytes() {
        let value = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'2'..=b'7' => ch - b'2' + 26,
            _ => return Err(Error::Validation("Invalid TOTP secret".to_string())),
        };

        buffer = (buffer << 5) | u32::from(value);
        bits_left += 5;

        if bits_left >= 8 {
            let byte = ((buffer >> (bits_left - 8)) & 0xff) as u8;
            out.push(byte);
            bits_left -= 8;
        }
    }

    Ok(out)
}

fn build_provisioning_uri(issuer: &str, account_label: &str, secret: &str) -> String {
    let issuer_encoded = percent_encode(issuer);
    let label = format!("{issuer}:{account_label}");
    let label_encoded = percent_encode(&label);

    format!(
        "otpauth://totp/{label_encoded}?secret={secret}&issuer={issuer_encoded}&algorithm=SHA1&digits=6&period=30"
    )
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![b as char]
            }
            _ => format!("%{:02X}", b).chars().collect(),
        })
        .collect()
}

fn normalize_issuer(issuer: &str) -> Result<String> {
    let value = issuer.trim().to_string();
    if value.is_empty() || value.len() > 64 {
        return Err(Error::Validation("Invalid MFA issuer".to_string()));
    }
    if value.chars().any(|ch| ch.is_control()) {
        return Err(Error::Validation("Invalid MFA issuer".to_string()));
    }
    Ok(value)
}

fn normalize_account_label(account_label: &str) -> Result<String> {
    let value = account_label.trim().to_string();
    if value.is_empty() || value.len() > 320 {
        return Err(Error::Validation("Invalid account label".to_string()));
    }
    if value.chars().any(|ch| ch.is_control()) {
        return Err(Error::Validation("Invalid account label".to_string()));
    }
    Ok(value)
}

fn normalize_totp_code(code: &str) -> Result<String> {
    let value = code.trim();
    if value.len() != TOTP_DIGITS as usize || !value.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(Error::Validation("Invalid TOTP code format".to_string()));
    }
    Ok(value.to_string())
}

fn totp_code(secret: &[u8], unix_timestamp: i64) -> Result<String> {
    let counter = (unix_timestamp.max(0) as u64) / TOTP_STEP_SECONDS;
    let mut msg = [0u8; 8];
    msg.copy_from_slice(&counter.to_be_bytes());

    let mut mac = HmacSha1::new_from_slice(secret)
        .map_err(|e| Error::Internal(format!("Failed to init HMAC: {e}")))?;
    mac.update(&msg);
    let digest = mac.finalize().into_bytes();

    let offset = usize::from(digest[19] & 0x0f);
    let binary = (u32::from(digest[offset] & 0x7f) << 24)
        | (u32::from(digest[offset + 1]) << 16)
        | (u32::from(digest[offset + 2]) << 8)
        | u32::from(digest[offset + 3]);
    let code = binary % 10u32.pow(TOTP_DIGITS);
    Ok(format!("{code:06}"))
}

fn verify_totp_code(secret_b32: &str, code: &str, unix_timestamp: i64) -> Result<bool> {
    let secret = base32_decode_nopad(secret_b32)?;

    for drift in -1i64..=1i64 {
        let timestamp = unix_timestamp.saturating_add(drift * TOTP_STEP_SECONDS as i64);
        let expected = totp_code(&secret, timestamp)?;
        if expected == code {
            return Ok(true);
        }
    }

    Ok(false)
}

fn generate_challenge() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();

    let value: String = (0..CHALLENGE_RANDOM_LEN)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect();

    format!("mfa_{value}")
}

fn challenge_prefix(challenge: &str) -> Result<String> {
    if challenge.len() < CHALLENGE_PREFIX_LEN {
        return Err(Error::Unauthorized("Invalid MFA challenge".to_string()));
    }
    Ok(challenge[..CHALLENGE_PREFIX_LEN].to_string())
}

fn hash_challenge(raw: &str) -> Result<String> {
    let salt = SaltString::generate(&mut ArgonOsRng);
    Argon2::default()
        .hash_password(raw.as_bytes(), &salt)
        .map_err(|e| Error::Internal(format!("Failed to hash MFA challenge: {e}")))
        .map(|hash| hash.to_string())
}

fn verify_hashed_challenge(raw: &str, hash: &str) -> Result<bool> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| Error::Internal(format!("Invalid MFA challenge hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(raw.as_bytes(), &parsed)
        .is_ok())
}
