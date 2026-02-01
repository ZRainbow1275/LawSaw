pub mod models;

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use tokio::time::sleep;
use tracing::warn;

pub use models::*;

const CONNECT_RETRY_BASE_DELAY_MS: u64 = 500;
const CONNECT_RETRY_MAX_DELAY_MS: u64 = 10_000;

pub async fn create_pool(database_url: &str, max_connections: u32) -> Result<PgPool, sqlx::Error> {
    create_pool_with_session_role(database_url, max_connections, None).await
}

pub async fn create_pool_retry(
    database_url: &str,
    max_connections: u32,
    max_attempts: u32,
) -> Result<PgPool, sqlx::Error> {
    create_pool_with_session_role_retry(database_url, max_connections, None, max_attempts).await
}

pub async fn create_pool_with_session_role(
    database_url: &str,
    max_connections: u32,
    session_role: Option<&str>,
) -> Result<PgPool, sqlx::Error> {
    let session_role = session_role
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    if let Some(role) = &session_role {
        if !is_valid_role_name(role) {
            return Err(sqlx::Error::Configuration(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("invalid database session_role: {}", role),
            ))));
        }
    }

    let mut options = PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(30));

    if let Some(role) = session_role {
        options = options.after_connect(move |conn, _meta| {
            let role = role.clone();
            Box::pin(async move {
                let sql = format!("SET ROLE {}", role);
                sqlx::query(&sql).execute(conn).await?;
                Ok(())
            })
        });
    }

    options.connect(database_url).await
}

pub async fn create_pool_with_session_role_retry(
    database_url: &str,
    max_connections: u32,
    session_role: Option<&str>,
    max_attempts: u32,
) -> Result<PgPool, sqlx::Error> {
    if max_attempts == 0 {
        return create_pool_with_session_role(database_url, max_connections, session_role).await;
    }

    let mut attempt: u32 = 0;
    loop {
        attempt = attempt.saturating_add(1);
        match create_pool_with_session_role(database_url, max_connections, session_role).await {
            Ok(pool) => return Ok(pool),
            Err(err) => {
                // Configuration errors are not retryable.
                if matches!(err, sqlx::Error::Configuration(_)) {
                    return Err(err);
                }

                if attempt >= max_attempts {
                    return Err(err);
                }

                let delay = connect_retry_delay(attempt);
                warn!(
                    attempt,
                    delay_ms = delay.as_millis() as u64,
                    error = %err,
                    "database connection failed; retrying"
                );
                sleep(delay).await;
            }
        }
    }
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

fn connect_retry_delay(attempt: u32) -> Duration {
    let shift = attempt.saturating_sub(1).min(16);
    let delay_ms = CONNECT_RETRY_BASE_DELAY_MS
        .saturating_mul(1u64 << shift)
        .min(CONNECT_RETRY_MAX_DELAY_MS);
    Duration::from_millis(delay_ms)
}

fn is_valid_role_name(role: &str) -> bool {
    if role.is_empty() || role.len() > 63 {
        return false;
    }

    let mut chars = role.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }

    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}
