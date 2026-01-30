pub mod models;

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub use models::*;

pub async fn create_pool(database_url: &str, max_connections: u32) -> Result<PgPool, sqlx::Error> {
    create_pool_with_session_role(database_url, max_connections, None).await
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

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
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
