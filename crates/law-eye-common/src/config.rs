use serde::Deserialize;
use std::time::Duration;

#[path = "config_runtime.rs"]
mod config_runtime;
pub use config_runtime::ConfigRuntime;

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

fn default_vault_transit_mount() -> String {
    "transit".to_string()
}

fn default_feedback_vault_transit_key() -> String {
    "law-eye-feedback".to_string()
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct EncryptionConfig {
    #[serde(default)]
    pub feedbacks: FeedbackEncryptionConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FeedbackEncryptionConfig {
    #[serde(default)]
    pub enabled: bool,
    /// Vault Transit mount path (usually `transit`).
    #[serde(default = "default_vault_transit_mount")]
    pub vault_transit_mount: String,
    /// Vault Transit key name used for encrypting feedback sensitive fields.
    #[serde(default = "default_feedback_vault_transit_key")]
    pub vault_transit_key: String,
}

impl Default for FeedbackEncryptionConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            vault_transit_mount: default_vault_transit_mount(),
            vault_transit_key: default_feedback_vault_transit_key(),
        }
    }
}

fn default_vault_addr() -> String {
    "https://vault:8200".to_string()
}

fn default_vault_request_timeout_ms() -> u64 {
    10_000
}

fn default_object_storage_region() -> String {
    "us-east-1".to_string()
}

fn default_object_storage_force_path_style() -> bool {
    true
}

fn default_object_storage_sse_enabled() -> bool {
    true
}

fn default_object_storage_purge_interval_seconds() -> u64 {
    60
}

fn default_object_storage_purge_batch_size() -> i64 {
    50
}

fn default_object_storage_purge_grace_period_seconds() -> u64 {
    0
}

fn default_object_storage_purge_max_attempts() -> i32 {
    20
}

fn default_rate_limit_redis_prefix() -> String {
    "law-eye:rate-limit".to_string()
}

fn default_rate_limit_redis_fail_open() -> bool {
    true
}

fn default_auth_oauth_state_ttl_seconds() -> u64 {
    300
}

fn default_auth_oauth_enabled_providers() -> Vec<String> {
    vec!["google".to_string(), "github".to_string(), "microsoft".to_string()]
}

fn default_auth_mfa_totp_issuer() -> String {
    "LawSaw".to_string()
}

fn default_auth_mfa_login_challenge_ttl_seconds() -> u64 {
    300
}

fn default_config_reload_enabled() -> bool {
    false
}

fn default_config_reload_interval_seconds() -> u64 {
    30
}

#[derive(Debug, Clone, Deserialize)]
pub struct ObjectStorageConfig {
    #[serde(default)]
    pub enabled: bool,
    /// S3-compatible endpoint (e.g. `http://minio:9000`).
    #[serde(default)]
    pub endpoint: String,
    #[serde(default = "default_object_storage_region")]
    pub region: String,
    #[serde(default)]
    pub bucket: String,
    #[serde(default)]
    pub access_key_id: String,
    #[serde(default)]
    pub secret_access_key: String,
    #[serde(default = "default_object_storage_force_path_style")]
    pub force_path_style: bool,
    /// Enforce server-side encryption for all object writes.
    #[serde(default = "default_object_storage_sse_enabled")]
    pub sse_enabled: bool,
    /// Purge loop interval in seconds (0 disables background purge).
    #[serde(default = "default_object_storage_purge_interval_seconds")]
    pub purge_interval_seconds: u64,
    /// Max objects to purge per loop iteration (per tenant).
    #[serde(default = "default_object_storage_purge_batch_size")]
    pub purge_batch_size: i64,
    /// Grace period in seconds between soft delete and purge.
    #[serde(default = "default_object_storage_purge_grace_period_seconds")]
    pub purge_grace_period_seconds: u64,
    /// Max purge attempts before giving up (still keeps records for manual intervention).
    #[serde(default = "default_object_storage_purge_max_attempts")]
    pub purge_max_attempts: i32,
}

impl Default for ObjectStorageConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: String::new(),
            region: default_object_storage_region(),
            bucket: String::new(),
            access_key_id: String::new(),
            secret_access_key: String::new(),
            force_path_style: default_object_storage_force_path_style(),
            sse_enabled: default_object_storage_sse_enabled(),
            purge_interval_seconds: default_object_storage_purge_interval_seconds(),
            purge_batch_size: default_object_storage_purge_batch_size(),
            purge_grace_period_seconds: default_object_storage_purge_grace_period_seconds(),
            purge_max_attempts: default_object_storage_purge_max_attempts(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RateLimitConfig {
    /// Redis key prefix used by fixed-window rate limiting.
    #[serde(default = "default_rate_limit_redis_prefix")]
    pub redis_prefix: String,
    /// Redis runtime failure policy.
    ///
    /// - `true`: fail-open, requests continue if Redis is temporarily unavailable.
    /// - `false`: fail-closed, requests are rejected with 429 when Redis errors occur.
    #[serde(default = "default_rate_limit_redis_fail_open")]
    pub redis_fail_open: bool,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            redis_prefix: default_rate_limit_redis_prefix(),
            redis_fail_open: default_rate_limit_redis_fail_open(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthOAuthConfig {
    /// One-time OAuth state token TTL.
    #[serde(default = "default_auth_oauth_state_ttl_seconds")]
    pub state_ttl_seconds: u64,
    /// Allowed OAuth providers.
    #[serde(default = "default_auth_oauth_enabled_providers")]
    pub enabled_providers: Vec<String>,
}

impl Default for AuthOAuthConfig {
    fn default() -> Self {
        Self {
            state_ttl_seconds: default_auth_oauth_state_ttl_seconds(),
            enabled_providers: default_auth_oauth_enabled_providers(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthMfaConfig {
    /// Issuer used in TOTP provisioning URI.
    #[serde(default = "default_auth_mfa_totp_issuer")]
    pub totp_issuer: String,
    /// One-time MFA login challenge TTL.
    #[serde(default = "default_auth_mfa_login_challenge_ttl_seconds")]
    pub login_challenge_ttl_seconds: u64,
}

impl Default for AuthMfaConfig {
    fn default() -> Self {
        Self {
            totp_issuer: default_auth_mfa_totp_issuer(),
            login_challenge_ttl_seconds: default_auth_mfa_login_challenge_ttl_seconds(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AuthConfig {
    #[serde(default)]
    pub oauth: AuthOAuthConfig,
    #[serde(default)]
    pub mfa: AuthMfaConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConfigReloadConfig {
    #[serde(default = "default_config_reload_enabled")]
    pub enabled: bool,
    #[serde(default = "default_config_reload_interval_seconds")]
    pub interval_seconds: u64,
}

impl Default for ConfigReloadConfig {
    fn default() -> Self {
        Self {
            enabled: default_config_reload_enabled(),
            interval_seconds: default_config_reload_interval_seconds(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    #[serde(default)]
    pub worker: WorkerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub metrics: MetricsConfig,
    #[serde(default)]
    pub security: SecurityConfig,
    #[serde(default)]
    pub secrets: SecretsConfig,
    #[serde(default)]
    pub encryption: EncryptionConfig,
    #[serde(default)]
    pub object_storage: ObjectStorageConfig,
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub config_reload: ConfigReloadConfig,
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

fn default_worker_health_enabled() -> bool {
    true
}

fn default_worker_health_host() -> String {
    "0.0.0.0".to_string()
}

fn default_worker_health_port() -> u16 {
    3002
}

fn default_worker_health_check_timeout_ms() -> u64 {
    2_000
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkerConfig {
    /// Enable worker HTTP health endpoints (`/health/live`, `/health/ready`).
    #[serde(default = "default_worker_health_enabled")]
    pub health_enabled: bool,
    #[serde(default = "default_worker_health_host")]
    pub health_host: String,
    #[serde(default = "default_worker_health_port")]
    pub health_port: u16,
    /// Timeout for readiness checks (Postgres + Redis ping) in milliseconds.
    #[serde(default = "default_worker_health_check_timeout_ms")]
    pub health_check_timeout_ms: u64,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            health_enabled: default_worker_health_enabled(),
            health_host: default_worker_health_host(),
            health_port: default_worker_health_port(),
            health_check_timeout_ms: default_worker_health_check_timeout_ms(),
        }
    }
}

fn default_allowed_origins() -> Vec<String> {
    vec![
        "http://localhost:8849".to_string(),
        "http://127.0.0.1:8849".to_string(),
    ]
}

fn default_request_timeout_ms() -> u64 {
    30_000
}

fn default_redis_pool_wait_timeout_ms() -> u64 {
    2_000
}

fn default_redis_pool_create_timeout_ms() -> u64 {
    2_000
}

fn default_redis_pool_recycle_timeout_ms() -> u64 {
    2_000
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
    #[serde(default = "default_redis_pool_wait_timeout_ms")]
    pub pool_wait_timeout_ms: u64,
    #[serde(default = "default_redis_pool_create_timeout_ms")]
    pub pool_create_timeout_ms: u64,
    #[serde(default = "default_redis_pool_recycle_timeout_ms")]
    pub pool_recycle_timeout_ms: u64,
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

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SecurityConfig {
    /// Allow internal/loopback/private URLs for user-provided sources (development/testing only).
    #[serde(default)]
    pub allow_internal_source_urls: bool,
    /// Allow internal/loopback/private URLs for outbound webhooks (development/testing only).
    ///
    /// This is a high-risk toggle. Prefer explicit allowlists at the boundary instead of broadly
    /// enabling internal destinations.
    #[serde(default)]
    pub allow_internal_webhook_urls: bool,
}

impl AppConfig {
    pub async fn load() -> crate::Result<Self> {
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            .add_source(config::File::with_name("config/default").required(false))
            .add_source(
                config::Environment::with_prefix("LAW_EYE")
                    .separator("__")
                    .try_parsing(true)
                    .list_separator(",")
                    .with_list_parse_key("server.allowed_origins")
                    .with_list_parse_key("auth.oauth.enabled_providers"),
            )
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

            if let Some(endpoint) = secrets.s3_endpoint {
                if !endpoint.trim().is_empty() {
                    config.object_storage.endpoint = endpoint;
                }
            }

            if let Some(region) = secrets.s3_region {
                if !region.trim().is_empty() {
                    config.object_storage.region = region;
                }
            }

            if let Some(bucket) = secrets.s3_bucket {
                if !bucket.trim().is_empty() {
                    config.object_storage.bucket = bucket;
                }
            }

            if let Some(access_key_id) = secrets.s3_access_key_id {
                if !access_key_id.trim().is_empty() {
                    config.object_storage.access_key_id = access_key_id;
                }
            }

            if let Some(secret_access_key) = secrets.s3_secret_access_key {
                if !secret_access_key.trim().is_empty() {
                    config.object_storage.secret_access_key = secret_access_key;
                }
            }

            if let Some(enabled) = secrets.s3_enabled {
                config.object_storage.enabled = enabled;
            }

            if let Some(force_path_style) = secrets.s3_force_path_style {
                config.object_storage.force_path_style = force_path_style;
            }

            if let Some(sse_enabled) = secrets.s3_sse_enabled {
                config.object_storage.sse_enabled = sse_enabled;
            }
        }

        if config.database.url.trim().is_empty() {
            return Err(crate::Error::Config(
                "LAW_EYE__DATABASE__URL must be set (or provided via Vault secrets)".into(),
            ));
        }

        if config.redis.url.trim().is_empty() {
            return Err(crate::Error::Config(
                "LAW_EYE__REDIS__URL must be set (or provided via Vault secrets)".into(),
            ));
        }

        if config.object_storage.enabled
            && (config.object_storage.endpoint.trim().is_empty()
                || config.object_storage.region.trim().is_empty()
                || config.object_storage.bucket.trim().is_empty()
                || config.object_storage.access_key_id.trim().is_empty()
                || config.object_storage.secret_access_key.trim().is_empty())
        {
            return Err(crate::Error::Config(
                "Object storage is enabled, but required fields are missing. Ensure LAW_EYE__OBJECT_STORAGE__ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY are set (or provided via Vault secrets).".into(),
            ));
        }

        if config.rate_limit.redis_prefix.trim().is_empty() {
            return Err(crate::Error::Config(
                "LAW_EYE__RATE_LIMIT__REDIS_PREFIX must not be empty".into(),
            ));
        }

        if config.auth.oauth.state_ttl_seconds == 0 {
            return Err(crate::Error::Config(
                "LAW_EYE__AUTH__OAUTH__STATE_TTL_SECONDS must be > 0".into(),
            ));
        }

        if config.auth.mfa.login_challenge_ttl_seconds == 0 {
            return Err(crate::Error::Config(
                "LAW_EYE__AUTH__MFA__LOGIN_CHALLENGE_TTL_SECONDS must be > 0".into(),
            ));
        }

        if config.config_reload.enabled && config.config_reload.interval_seconds == 0 {
            return Err(crate::Error::Config(
                "LAW_EYE__CONFIG_RELOAD__INTERVAL_SECONDS must be > 0 when config reload is enabled".into(),
            ));
        }

        config.auth.oauth.enabled_providers = config
            .auth
            .oauth
            .enabled_providers
            .into_iter()
            .map(|provider| provider.trim().to_ascii_lowercase())
            .filter(|provider| {
                !provider.is_empty()
                    && provider
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
            })
            .collect();

        if config.auth.oauth.enabled_providers.is_empty() {
            return Err(crate::Error::Config(
                "LAW_EYE__AUTH__OAUTH__ENABLED_PROVIDERS must include at least one provider".into(),
            ));
        }

        config.auth.mfa.totp_issuer = config.auth.mfa.totp_issuer.trim().to_string();
        if config.auth.mfa.totp_issuer.is_empty() {
            return Err(crate::Error::Config(
                "LAW_EYE__AUTH__MFA__TOTP_ISSUER must not be empty".into(),
            ));
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
            worker: WorkerConfig::default(),
            database: DatabaseConfig {
                url: String::new(),
                max_connections: 10,
                session_role: None,
            },
            redis: RedisConfig {
                url: String::new(),
                pool_wait_timeout_ms: default_redis_pool_wait_timeout_ms(),
                pool_create_timeout_ms: default_redis_pool_create_timeout_ms(),
                pool_recycle_timeout_ms: default_redis_pool_recycle_timeout_ms(),
            },
            ai: AiConfig::default(),
            metrics: MetricsConfig::default(),
            security: SecurityConfig::default(),
            secrets: SecretsConfig::default(),
            encryption: EncryptionConfig::default(),
            object_storage: ObjectStorageConfig::default(),
            rate_limit: RateLimitConfig::default(),
            auth: AuthConfig::default(),
            config_reload: ConfigReloadConfig::default(),
        }
    }
}

#[derive(Debug, Clone)]
struct VaultKvSecrets {
    database_url: String,
    redis_url: String,
    openai_api_key: String,
    openai_base_url: Option<String>,
    s3_enabled: Option<bool>,
    s3_endpoint: Option<String>,
    s3_region: Option<String>,
    s3_bucket: Option<String>,
    s3_access_key_id: Option<String>,
    s3_secret_access_key: Option<String>,
    s3_force_path_style: Option<bool>,
    s3_sse_enabled: Option<bool>,
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
    #[serde(default)]
    s3_enabled: Option<bool>,
    #[serde(default)]
    s3_endpoint: Option<String>,
    #[serde(default)]
    s3_region: Option<String>,
    #[serde(default)]
    s3_bucket: Option<String>,
    #[serde(default)]
    s3_access_key_id: Option<String>,
    #[serde(default)]
    s3_secret_access_key: Option<String>,
    #[serde(default)]
    s3_force_path_style: Option<bool>,
    #[serde(default)]
    s3_sse_enabled: Option<bool>,
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

    let ca_pem = tokio::fs::read(ca_cert_path)
        .await
        .map_err(|err| crate::Error::Config(format!("Read CA cert failed: {err}")))?;
    let cert_pem = tokio::fs::read(client_cert_path)
        .await
        .map_err(|err| crate::Error::Config(format!("Read client cert failed: {err}")))?;
    let key_pem = tokio::fs::read(client_key_path)
        .await
        .map_err(|err| crate::Error::Config(format!("Read client key failed: {err}")))?;

    let mut identity_pem = Vec::with_capacity(cert_pem.len() + key_pem.len() + 1);
    identity_pem.extend_from_slice(&cert_pem);
    identity_pem.push(b'\n');
    identity_pem.extend_from_slice(&key_pem);

    let ca_cert = reqwest::Certificate::from_pem(&ca_pem)
        .map_err(|err| crate::Error::Config(format!("Parse Vault CA cert failed: {err}")))?;
    let identity = reqwest::Identity::from_pem(&identity_pem).map_err(|err| {
        crate::Error::Config(format!("Parse Vault client identity failed: {err}"))
    })?;

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
        s3_enabled: payload.data.data.s3_enabled,
        s3_endpoint: payload.data.data.s3_endpoint,
        s3_region: payload.data.data.s3_region,
        s3_bucket: payload.data.data.s3_bucket,
        s3_access_key_id: payload.data.data.s3_access_key_id,
        s3_secret_access_key: payload.data.data.s3_secret_access_key,
        s3_force_path_style: payload.data.data.s3_force_path_style,
        s3_sse_enabled: payload.data.data.s3_sse_enabled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_allowed_origins_uses_minimal_local_dev_allowlist() {
        assert_eq!(
            default_allowed_origins(),
            vec![
                "http://localhost:8849".to_string(),
                "http://127.0.0.1:8849".to_string(),
            ]
        );
    }

    #[test]
    fn app_config_default_reuses_allowed_origin_default() {
        assert_eq!(
            AppConfig::default().server.allowed_origins,
            default_allowed_origins()
        );
    }
}
