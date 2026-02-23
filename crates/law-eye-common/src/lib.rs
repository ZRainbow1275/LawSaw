pub mod cache;
pub mod circuit_breaker;
pub mod config;
pub mod egress;
pub mod embedding;
pub mod error;
pub mod vault;

pub use cache::{CachePoolStatus, CacheService, CacheTtl};
pub use circuit_breaker::{CircuitBreaker, CircuitBreakerCheck, CircuitBreakerConfig};
pub use config::{
    AppConfig, AuthConfig, AuthMfaConfig, AuthOAuthConfig, ConfigReloadConfig, ConfigRuntime,
};
pub use embedding::{
    normalize_vector_for_storage, pgvector_storage_dim, VectorNormalization,
    DEFAULT_PGVECTOR_STORAGE_DIM,
};
pub use error::{Error, Result};
