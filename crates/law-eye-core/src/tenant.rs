use futures::future::BoxFuture;
use law_eye_common::{Error, Result};
use law_eye_db::Tenant;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

pub struct TenantService {
    pool: PgPool,
}

impl TenantService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert_by_slug(&self, slug: &str, name: &str) -> Result<Tenant> {
        sqlx::query_as::<_, Tenant>(
            r#"
            INSERT INTO tenants (slug, name)
            VALUES ($1, $2)
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(slug)
        .bind(name)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_slug(&self, slug: &str) -> Result<Tenant> {
        sqlx::query_as::<_, Tenant>("SELECT * FROM tenants WHERE slug = $1")
            .bind(slug)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Tenant {} not found", slug)))
    }

    pub async fn get_by_id(&self, tenant_id: Uuid) -> Result<Tenant> {
        sqlx::query_as::<_, Tenant>("SELECT * FROM tenants WHERE id = $1")
            .bind(tenant_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Tenant {} not found", tenant_id)))
    }
}

pub async fn with_tenant_tx<'a, T, F>(pool: &'a PgPool, tenant_id: Uuid, f: F) -> Result<T>
where
    F: for<'t> FnOnce(&'t mut Transaction<'a, Postgres>) -> BoxFuture<'t, Result<T>>,
{
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    let tenant_id = if tenant_id.is_nil() {
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM tenants WHERE slug = 'default'")
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound("Default tenant not found".to_string()))?
    } else {
        tenant_id
    };

    sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
        .bind(tenant_id.to_string())
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    let result = f(&mut tx).await?;

    tx.commit()
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(result)
}
