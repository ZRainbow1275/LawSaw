use crate::{Error, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, RwLock};

use crate::config::VaultSecretsConfig;

#[async_trait]
pub trait SensitiveStringCipher: Send + Sync {
    fn is_enabled(&self) -> bool;
    async fn encrypt(&self, plaintext: &str) -> Result<String>;
    async fn decrypt(&self, ciphertext: &str) -> Result<String>;
}

#[derive(Debug, Default, Clone)]
pub struct PlaintextCipher;

#[async_trait]
impl SensitiveStringCipher for PlaintextCipher {
    fn is_enabled(&self) -> bool {
        false
    }

    async fn encrypt(&self, plaintext: &str) -> Result<String> {
        Ok(plaintext.to_string())
    }

    async fn decrypt(&self, ciphertext: &str) -> Result<String> {
        Ok(ciphertext.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct VaultTransitCipher {
    vault: VaultClient,
    mount: String,
    key: String,
}

impl VaultTransitCipher {
    pub async fn new(cfg: &VaultSecretsConfig, mount: String, key: String) -> Result<Self> {
        let vault = VaultClient::new(cfg).await?;
        let mount = mount.trim().trim_matches('/').to_string();
        if mount.is_empty() {
            return Err(Error::Config(
                "Vault transit mount must not be empty".into(),
            ));
        }
        if !is_valid_vault_path_segment(&mount) {
            return Err(Error::Config(format!(
                "Invalid Vault transit mount name: {}",
                mount
            )));
        }
        let key = key.trim().to_string();
        if key.is_empty() {
            return Err(Error::Config("Vault transit key must not be empty".into()));
        }
        if !is_valid_vault_path_segment(&key) {
            return Err(Error::Config(format!(
                "Invalid Vault transit key name: {}",
                key
            )));
        }
        Ok(Self { vault, mount, key })
    }

    fn encrypt_url(&self) -> String {
        format!(
            "{}/v1/{}/encrypt/{}",
            self.vault.addr(),
            self.mount,
            self.key
        )
    }

    fn decrypt_url(&self) -> String {
        format!(
            "{}/v1/{}/decrypt/{}",
            self.vault.addr(),
            self.mount,
            self.key
        )
    }
}

fn is_valid_vault_path_segment(value: &str) -> bool {
    if value.is_empty() || value.len() > 128 {
        return false;
    }

    value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

#[async_trait]
impl SensitiveStringCipher for VaultTransitCipher {
    fn is_enabled(&self) -> bool {
        true
    }

    async fn encrypt(&self, plaintext: &str) -> Result<String> {
        let payload = TransitEncryptRequest {
            plaintext: BASE64.encode(plaintext.as_bytes()),
        };
        let url = self.encrypt_url();
        let response = self.vault.post_json(&url, &payload).await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Http(format!(
                "Vault transit encrypt failed: {status} {body}"
            )));
        }

        let parsed: TransitEncryptResponse = response
            .json()
            .await
            .map_err(|err| Error::Http(format!("{err:?}")))?;
        Ok(parsed.data.ciphertext)
    }

    async fn decrypt(&self, ciphertext: &str) -> Result<String> {
        let payload = TransitDecryptRequest {
            ciphertext: ciphertext.to_string(),
        };
        let url = self.decrypt_url();
        let response = self.vault.post_json(&url, &payload).await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::Http(format!(
                "Vault transit decrypt failed: {status} {body}"
            )));
        }

        let parsed: TransitDecryptResponse = response
            .json()
            .await
            .map_err(|err| Error::Http(format!("{err:?}")))?;

        let decoded = BASE64
            .decode(parsed.data.plaintext.as_bytes())
            .map_err(|err| Error::Parse(format!("Base64 decode failed: {err}")))?;
        String::from_utf8(decoded)
            .map_err(|err| Error::Parse(format!("UTF-8 decode failed: {err}")))
    }
}

#[derive(Debug, Serialize)]
struct TransitEncryptRequest {
    plaintext: String,
}

#[derive(Debug, Deserialize)]
struct TransitEncryptResponse {
    data: TransitEncryptData,
}

#[derive(Debug, Deserialize)]
struct TransitEncryptData {
    ciphertext: String,
}

#[derive(Debug, Serialize)]
struct TransitDecryptRequest {
    ciphertext: String,
}

#[derive(Debug, Deserialize)]
struct TransitDecryptResponse {
    data: TransitDecryptData,
}

#[derive(Debug, Deserialize)]
struct TransitDecryptData {
    plaintext: String,
}

#[derive(Debug, Clone)]
struct VaultClient {
    inner: Arc<VaultClientInner>,
}

#[derive(Debug)]
struct VaultClientInner {
    addr: String,
    client: reqwest::Client,
    token: RwLock<Option<String>>,
    login_lock: Mutex<()>,
}

impl VaultClient {
    async fn new(cfg: &VaultSecretsConfig) -> Result<Self> {
        let ca_cert_path = cfg.ca_cert_path.as_deref().ok_or_else(|| {
            Error::Config("LAW_EYE__SECRETS__VAULT__CA_CERT_PATH is required".into())
        })?;
        let client_cert_path = cfg.client_cert_path.as_deref().ok_or_else(|| {
            Error::Config("LAW_EYE__SECRETS__VAULT__CLIENT_CERT_PATH is required".into())
        })?;
        let client_key_path = cfg.client_key_path.as_deref().ok_or_else(|| {
            Error::Config("LAW_EYE__SECRETS__VAULT__CLIENT_KEY_PATH is required".into())
        })?;

        let ca_pem = tokio::fs::read(ca_cert_path)
            .await
            .map_err(|err| Error::Config(format!("Read CA cert failed: {err}")))?;
        let cert_pem = tokio::fs::read(client_cert_path)
            .await
            .map_err(|err| Error::Config(format!("Read client cert failed: {err}")))?;
        let key_pem = tokio::fs::read(client_key_path)
            .await
            .map_err(|err| Error::Config(format!("Read client key failed: {err}")))?;

        let mut identity_pem = Vec::with_capacity(cert_pem.len() + key_pem.len() + 1);
        identity_pem.extend_from_slice(&cert_pem);
        identity_pem.push(b'\n');
        identity_pem.extend_from_slice(&key_pem);

        let ca_cert = reqwest::Certificate::from_pem(&ca_pem)
            .map_err(|err| Error::Config(format!("Parse Vault CA cert failed: {err}")))?;
        let identity = reqwest::Identity::from_pem(&identity_pem)
            .map_err(|err| Error::Config(format!("Parse Vault client identity failed: {err}")))?;

        let client = reqwest::Client::builder()
            .use_rustls_tls()
            .add_root_certificate(ca_cert)
            .identity(identity)
            .timeout(Duration::from_millis(cfg.request_timeout_ms))
            .build()
            .map_err(|err| Error::Config(format!("Build Vault HTTP client failed: {err:?}")))?;

        let addr = cfg.addr.trim().trim_end_matches('/').to_string();
        if addr.is_empty() {
            return Err(Error::Config(
                "LAW_EYE__SECRETS__VAULT__ADDR must not be empty".into(),
            ));
        }

        let inner = Arc::new(VaultClientInner {
            addr,
            client,
            token: RwLock::new(None),
            login_lock: Mutex::new(()),
        });

        let vault = Self { inner };
        let token = vault.login().await?;
        *vault.inner.token.write().await = Some(token);
        Ok(vault)
    }

    fn addr(&self) -> &str {
        &self.inner.addr
    }

    async fn login(&self) -> Result<String> {
        let login_url = format!("{}/v1/auth/cert/login", self.inner.addr);
        let resp = self
            .inner
            .client
            .post(login_url)
            .send()
            .await
            .map_err(|err| Error::Http(format!("{err:?}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(Error::Config(format!(
                "Vault cert login failed: {status} {body}"
            )));
        }

        let login: VaultAuthLoginResponse = resp
            .json()
            .await
            .map_err(|err| Error::Http(format!("{err:?}")))?;
        Ok(login.auth.client_token)
    }

    async fn get_token(&self) -> Result<String> {
        if let Some(token) = self.inner.token.read().await.clone() {
            return Ok(token);
        }

        let _guard = self.inner.login_lock.lock().await;
        if let Some(token) = self.inner.token.read().await.clone() {
            return Ok(token);
        }

        let token = self.login().await?;
        *self.inner.token.write().await = Some(token.clone());
        Ok(token)
    }

    async fn post_json<T: Serialize>(&self, url: &str, body: &T) -> Result<reqwest::Response> {
        let token = self.get_token().await?;
        let resp = self
            .inner
            .client
            .post(url)
            .header("X-Vault-Token", token)
            .json(body)
            .send()
            .await
            .map_err(|err| Error::Http(format!("{err:?}")))?;

        if resp.status() == reqwest::StatusCode::FORBIDDEN
            || resp.status() == reqwest::StatusCode::UNAUTHORIZED
        {
            // Retry once in case token expired / was revoked.
            let _guard = self.inner.login_lock.lock().await;
            let token = self.login().await?;
            *self.inner.token.write().await = Some(token.clone());
            let retry = self
                .inner
                .client
                .post(url)
                .header("X-Vault-Token", token)
                .json(body)
                .send()
                .await
                .map_err(|err| Error::Http(format!("{err:?}")))?;
            return Ok(retry);
        }

        Ok(resp)
    }
}

#[derive(Debug, Deserialize)]
struct VaultAuthLoginResponse {
    auth: VaultAuthLoginAuth,
}

#[derive(Debug, Deserialize)]
struct VaultAuthLoginAuth {
    client_token: String,
}
