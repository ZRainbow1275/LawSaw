use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SecretsConfig {
    #[serde(default)]
    pub vault: VaultSecretsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VaultSecretsConfig {
    #[serde(default)]
    pub enabled: bool,
    /// Vault address, e.g. `https://vault:8200`.
    #[serde(default = "default_vault_addr")]
    pub addr: String,
    /// KV v2 path in `mount/path` form, e.g. `secret/law-eye/api`.
    #[serde(default)]
    pub kv_path: String,
    /// Path to the CA certificate PEM for verifying Vault server cert.
    #[serde(default)]
    pub ca_cert_path: Option<String>,
    /// Client certificate PEM (for Vault cert auth).
    #[serde(default)]
    pub client_cert_path: Option<String>,
    /// Client private key PEM (for Vault cert auth).
    #[serde(default)]
    pub client_key_path: Option<String>,
    /// Request timeout for talking to Vault.
    #[serde(default = "default_vault_request_timeout_ms")]
    pub request_timeout_ms: u64,
}

impl Default for VaultSecretsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            addr: default_vault_addr(),
            kv_path: String::new(),
            ca_cert_path: None,
            client_cert_path: None,
            client_key_path: None,
            request_timeout_ms: default_vault_request_timeout_ms(),
        }
    }
}

fn default_vault_addr() -> String {
    "https://vault:8200".to_string()
}

fn default_vault_request_timeout_ms() -> u64 {
    10_000
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub metrics: MetricsConfig,
    #[serde(default)]
    pub secrets: SecretsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    /// CORS/CSRF Origin allowlist (e.g. ["https://app.example.com"]).
    ///
    /// In development you may keep localhost origins here; in production it should be explicitly
    /// configured for your deployed frontend domains.
    #[serde(default = "default_allowed_origins")]
    pub allowed_origins: Vec<String>,
    /// Max duration for handling a single HTTP request.
    ///
    /// Set to 0 to disable (not recommended for production).
    #[serde(default = "default_request_timeout_ms")]
    pub request_timeout_ms: u64,
    /// Max request body size in bytes.
    ///
    /// Set to 0 to disable (not recommended for production).
    #[serde(default = "default_max_body_bytes")]
    pub max_body_bytes: usize,
}

fn default_allowed_origins() -> Vec<String> {
    vec![
        "https://localhost".to_string(),
        "https://127.0.0.1".to_string(),
        "http://localhost".to_string(),
        "http://127.0.0.1".to_string(),
        "http://localhost:3000".to_string(),
        "http://localhost:8849".to_string(),
        "http://localhost:3002".to_string(),
        "http://localhost:3333".to_string(),
        "http://127.0.0.1:3000".to_string(),
        "http://127.0.0.1:8849".to_string(),
        "http://127.0.0.1:3002".to_string(),
        "http://127.0.0.1:3333".to_string(),
    ]
}

fn default_request_timeout_ms() -> u64 {
    30_000
}

fn default_max_body_bytes() -> usize {
    1024 * 1024
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    /// Optional session role to `SET ROLE` after connecting.
    ///
    /// This is mainly used to ensure Postgres RLS is enforced even if the connection user is a
    /// superuser in local/dev environments (superusers bypass RLS).
    #[serde(default)]
    pub session_role: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
    pub embedding_model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: None,
            model: "gpt-4o-mini".to_string(),
            embedding_model: "text-embedding-3-small".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct MetricsConfig {
    /// Prometheus scrape token (production-only). If unset in production, `/metrics` returns 404.
    pub token: Option<String>,
}

impl AppConfig {
    pub async fn load() -> crate::Result<Self> {
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            .add_source(config::File::with_name("config/default").required(false))
            .add_source(config::Environment::with_prefix("LAW_EYE").separator("__"))
            .build()?;

        let mut config: Self = config.try_deserialize()?;

        if config.secrets.vault.enabled {
            let secrets = load_vault_kv_secrets(&config.secrets.vault).await?;

            if !secrets.database_url.trim().is_empty() {
                config.database.url = secrets.database_url;
            }

            if !secrets.redis_url.trim().is_empty() {
                config.redis.url = secrets.redis_url;
            }

            config.ai.api_key = secrets.openai_api_key;

            if let Some(base_url) = secrets.openai_base_url {
                if !base_url.trim().is_empty() {
                    config.ai.base_url = Some(base_url);
                }
            }
        }

        Ok(config)
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 3001,
                allowed_origins: default_allowed_origins(),
                request_timeout_ms: default_request_timeout_ms(),
                max_body_bytes: default_max_body_bytes(),
            },
            database: DatabaseConfig {
                url: "postgres://law_eye:law_eye@localhost:5435/law_eye".to_string(),
                max_connections: 10,
                session_role: None,
            },
            redis: RedisConfig {
                url: "redis://localhost:6380".to_string(),
            },
            ai: AiConfig::default(),
            metrics: MetricsConfig::default(),
            secrets: SecretsConfig::default(),
        }
    }
}

#[derive(Debug, Clone)]
struct VaultKvSecrets {
    database_url: String,
    redis_url: String,
    openai_api_key: String,
    openai_base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VaultAuthLoginResponse {
    auth: VaultAuthLoginAuth,
}

#[derive(Debug, Deserialize)]
struct VaultAuthLoginAuth {
    client_token: String,
}

#[derive(Debug, Deserialize)]
struct VaultKvV2ReadResponse<T> {
    data: VaultKvV2Data<T>,
}

#[derive(Debug, Deserialize)]
struct VaultKvV2Data<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
struct VaultLawEyeSecretsPayload {
    database_url: String,
    redis_url: String,
    #[serde(default)]
    openai_api_key: String,
    #[serde(default)]
    openai_base_url: Option<String>,
}

fn kv_v2_data_endpoint(kv_path: &str) -> crate::Result<String> {
    let trimmed = kv_path.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Err(crate::Error::Config(
            "LAW_EYE__SECRETS__VAULT__KV_PATH must be set when Vault secrets are enabled".into(),
        ));
    }

    let mut parts = trimmed.split('/');
    let mount = parts
        .next()
        .ok_or_else(|| crate::Error::Config("Invalid Vault KV path".into()))?;
    let rest = parts.collect::<Vec<_>>().join("/");

    if rest.is_empty() {
        return Err(crate::Error::Config(
            "Vault KV path must be in `mount/path` form".into(),
        ));
    }

    Ok(format!("{mount}/data/{rest}"))
}

async fn load_vault_kv_secrets(cfg: &VaultSecretsConfig) -> crate::Result<VaultKvSecrets> {
    let ca_cert_path = cfg.ca_cert_path.as_deref().ok_or_else(|| {
        crate::Error::Config("LAW_EYE__SECRETS__VAULT__CA_CERT_PATH is required".into())
    })?;
    let client_cert_path = cfg.client_cert_path.as_deref().ok_or_else(|| {
        crate::Error::Config("LAW_EYE__SECRETS__VAULT__CLIENT_CERT_PATH is required".into())
    })?;
    let client_key_path = cfg.client_key_path.as_deref().ok_or_else(|| {
        crate::Error::Config("LAW_EYE__SECRETS__VAULT__CLIENT_KEY_PATH is required".into())
    })?;

    let ca_pem = std::fs::read(ca_cert_path)
        .map_err(|err| crate::Error::Config(format!("Read CA cert failed: {err}")))?;
    let cert_pem = std::fs::read(client_cert_path)
        .map_err(|err| crate::Error::Config(format!("Read client cert failed: {err}")))?;
    let key_pem = std::fs::read(client_key_path)
        .map_err(|err| crate::Error::Config(format!("Read client key failed: {err}")))?;

    let mut identity_pem = Vec::with_capacity(cert_pem.len() + key_pem.len() + 1);
    identity_pem.extend_from_slice(&cert_pem);
    identity_pem.push(b'\n');
    identity_pem.extend_from_slice(&key_pem);

    let ca_cert = reqwest::Certificate::from_pem(&ca_pem)
        .map_err(|err| crate::Error::Config(format!("Parse Vault CA cert failed: {err}")))?;
    let identity = reqwest::Identity::from_pem(&identity_pem)
        .map_err(|err| crate::Error::Config(format!("Parse Vault client identity failed: {err}")))?;

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .add_root_certificate(ca_cert)
        .identity(identity)
        .timeout(Duration::from_millis(cfg.request_timeout_ms))
        .build()
        .map_err(|err| crate::Error::Config(format!("Build Vault HTTP client failed: {err:?}")))?;

    let vault_addr = cfg.addr.trim_end_matches('/');

    let login_url = format!("{vault_addr}/v1/auth/cert/login");
    let login = client
        .post(login_url)
        .send()
        .await
        .map_err(|err| crate::Error::Http(format!("{err:?}")))?;

    if !login.status().is_success() {
        let status = login.status();
        let body = login.text().await.unwrap_or_default();
        return Err(crate::Error::Config(format!(
            "Vault cert login failed: {status} {body}"
        )));
    }

    let login: VaultAuthLoginResponse = login
        .json()
        .await
        .map_err(|err| crate::Error::Http(format!("{err:?}")))?;

    let token = login.auth.client_token;

    let data_endpoint = kv_v2_data_endpoint(&cfg.kv_path)?;
    let read_url = format!("{vault_addr}/v1/{data_endpoint}");
    let read = client
        .get(read_url)
        .header("X-Vault-Token", token)
        .send()
        .await
        .map_err(|err| crate::Error::Http(format!("{err:?}")))?;

    if !read.status().is_success() {
        let status = read.status();
        let body = read.text().await.unwrap_or_default();
        return Err(crate::Error::Config(format!(
            "Vault KV read failed: {status} {body}"
        )));
    }

    let payload: VaultKvV2ReadResponse<VaultLawEyeSecretsPayload> = read
        .json()
        .await
        .map_err(|err| crate::Error::Http(format!("{err:?}")))?;

    Ok(VaultKvSecrets {
        database_url: payload.data.data.database_url,
        redis_url: payload.data.data.redis_url,
        openai_api_key: payload.data.data.openai_api_key,
        openai_base_url: payload.data.data.openai_base_url,
    })
}
