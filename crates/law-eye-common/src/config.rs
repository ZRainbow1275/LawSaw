use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub metrics: MetricsConfig,
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
}

fn default_allowed_origins() -> Vec<String> {
    vec![
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

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
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
    pub fn load() -> crate::Result<Self> {
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            .add_source(config::File::with_name("config/default").required(false))
            .add_source(config::Environment::with_prefix("LAW_EYE").separator("__"))
            .build()?;

        config.try_deserialize().map_err(Into::into)
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 3001,
                allowed_origins: default_allowed_origins(),
            },
            database: DatabaseConfig {
                url: "postgres://law_eye:law_eye@localhost:5435/law_eye".to_string(),
                max_connections: 10,
            },
            redis: RedisConfig {
                url: "redis://localhost:6380".to_string(),
            },
            ai: AiConfig::default(),
            metrics: MetricsConfig::default(),
        }
    }
}
