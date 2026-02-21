use futures::future::BoxFuture;
use law_eye_common::{Error, Result};
use law_eye_db::{Tenant, TenantConfig, TenantUsage};
use serde::Deserialize;
use sqlx::{PgPool, Postgres, Transaction};
use tracing::info;
use uuid::Uuid;

/// Input for updating tenant config (all fields optional for partial update).
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTenantConfigInput {
    pub max_users: Option<i32>,
    pub max_articles: Option<i32>,
    pub max_sources: Option<i32>,
    pub max_storage_mb: Option<i64>,
    pub max_reports_per_month: Option<i32>,
    pub feature_ai_enabled: Option<bool>,
    pub feature_knowledge_graph: Option<bool>,
    pub feature_report_generation: Option<bool>,
    pub feature_webhook: Option<bool>,
    pub logo_url: Option<String>,
    pub primary_color: Option<String>,
}

pub struct TenantService {
    pool: PgPool,
}

impl TenantService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_by_slug(&self, slug: &str, name: &str) -> Result<Tenant> {
        sqlx::query_as::<_, Tenant>(
            r#"
            INSERT INTO tenants (slug, name)
            VALUES ($1, $2)
            ON CONFLICT (slug) DO NOTHING
            RETURNING *
            "#,
        )
        .bind(slug)
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::Conflict(format!("Tenant slug '{}' already exists", slug)))
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

    pub async fn bind_session_tenant(
        &self,
        session_id: &str,
        tenant_id: Uuid,
        user_id: Option<Uuid>,
    ) -> Result<()> {
        let session_id = session_id.to_string();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query(
                    r#"
                    INSERT INTO session_tenants (session_id, tenant_id, user_id, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (session_id) DO UPDATE SET
                        tenant_id = EXCLUDED.tenant_id,
                        user_id = EXCLUDED.user_id,
                        updated_at = NOW()
                    "#,
                )
                .bind(&session_id)
                .bind(tenant_id)
                .bind(user_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(())
            })
        })
        .await
    }

    pub async fn unbind_session_tenant(&self, session_id: &str, tenant_id: Uuid) -> Result<()> {
        let session_id = session_id.to_string();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query("DELETE FROM session_tenants WHERE session_id = $1")
                    .bind(&session_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok(())
            })
        })
        .await
    }

    // ── Tenant management ─────────────────────────────────────────────

    /// List all tenants ordered by creation time.
    pub async fn list_tenants(&self) -> Result<Vec<Tenant>> {
        sqlx::query_as::<_, Tenant>("SELECT * FROM tenants ORDER BY created_at ASC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    /// Update the display name of a tenant.
    pub async fn update_tenant(&self, id: Uuid, name: &str) -> Result<Tenant> {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::Validation("Tenant name cannot be empty".to_string()));
        }

        sqlx::query_as::<_, Tenant>(
            r#"
            UPDATE tenants
            SET name = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::NotFound(format!("Tenant {} not found", id)))
    }

    /// Delete a tenant by id. Cascades to configs and usage.
    pub async fn delete_tenant(&self, id: Uuid) -> Result<()> {
        let result = sqlx::query("DELETE FROM tenants WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(Error::NotFound(format!("Tenant {} not found", id)));
        }

        info!(tenant_id = %id, "Tenant deleted");
        Ok(())
    }

    // ── Quota / Config management ─────────────────────────────────────

    /// Get the configuration for a tenant. Creates default config if not exists.
    pub async fn get_config(&self, tenant_id: Uuid) -> Result<TenantConfig> {
        // Ensure the tenant exists first (tenants table has no RLS)
        self.get_by_id(tenant_id).await?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // Ensure config row exists (upsert with defaults)
                sqlx::query(
                    "INSERT INTO tenant_configs (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
                )
                .bind(tenant_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                sqlx::query_as::<_, TenantConfig>(
                    "SELECT * FROM tenant_configs WHERE tenant_id = $1",
                )
                .bind(tenant_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::Internal("Failed to provision tenant config".to_string()))
            })
        })
        .await
    }

    /// Update tenant configuration with partial input.
    pub async fn update_config(
        &self,
        tenant_id: Uuid,
        expected_version: i64,
        input: UpdateTenantConfigInput,
    ) -> Result<TenantConfig> {
        if expected_version < 1 {
            return Err(Error::Validation(
                "expected_version must be >= 1".to_string(),
            ));
        }

        // Ensure tenant exists (tenants table has no RLS)
        self.get_by_id(tenant_id).await?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // Ensure config row exists
                sqlx::query(
                    "INSERT INTO tenant_configs (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
                )
                .bind(tenant_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let updated = sqlx::query_as::<_, TenantConfig>(
                    r#"
                    UPDATE tenant_configs SET
                        version               = version + 1,
                        max_users             = COALESCE($2, max_users),
                        max_articles          = COALESCE($3, max_articles),
                        max_sources           = COALESCE($4, max_sources),
                        max_storage_mb        = COALESCE($5, max_storage_mb),
                        max_reports_per_month = COALESCE($6, max_reports_per_month),
                        feature_ai_enabled         = COALESCE($7, feature_ai_enabled),
                        feature_knowledge_graph    = COALESCE($8, feature_knowledge_graph),
                        feature_report_generation  = COALESCE($9, feature_report_generation),
                        feature_webhook            = COALESCE($10, feature_webhook),
                        logo_url       = COALESCE($11, logo_url),
                        primary_color  = COALESCE($12, primary_color),
                        updated_at     = NOW()
                    WHERE tenant_id = $1
                      AND version = $13
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(input.max_users)
                .bind(input.max_articles)
                .bind(input.max_sources)
                .bind(input.max_storage_mb)
                .bind(input.max_reports_per_month)
                .bind(input.feature_ai_enabled)
                .bind(input.feature_knowledge_graph)
                .bind(input.feature_report_generation)
                .bind(input.feature_webhook)
                .bind(input.logo_url)
                .bind(input.primary_color)
                .bind(expected_version)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if let Some(config) = updated {
                    return Ok(config);
                }

                let current_version = sqlx::query_scalar::<_, i64>(
                    "SELECT version FROM tenant_configs WHERE tenant_id = $1",
                )
                .bind(tenant_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                match current_version {
                    Some(current_version) => Err(Error::Conflict(format!(
                        "Tenant config version conflict: expected {expected_version}, current {current_version}"
                    ))),
                    None => Err(Error::NotFound(format!(
                        "Tenant config for tenant {} not found",
                        tenant_id
                    ))),
                }
            })
        })
        .await
    }

    // ── Usage tracking ────────────────────────────────────────────────

    /// Get the cached usage for a tenant.
    pub async fn get_usage(&self, tenant_id: Uuid) -> Result<TenantUsage> {
        // Ensure tenant exists (tenants table has no RLS)
        self.get_by_id(tenant_id).await?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // Ensure usage row exists
                sqlx::query(
                    "INSERT INTO tenant_usage (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
                )
                .bind(tenant_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                sqlx::query_as::<_, TenantUsage>(
                    "SELECT * FROM tenant_usage WHERE tenant_id = $1",
                )
                .bind(tenant_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// Refresh usage by counting actual rows from the relevant tables.
    pub async fn refresh_usage(&self, tenant_id: Uuid) -> Result<TenantUsage> {
        // Ensure tenant exists (tenants table has no RLS)
        self.get_by_id(tenant_id).await?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // Ensure usage row exists
                sqlx::query(
                    "INSERT INTO tenant_usage (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
                )
                .bind(tenant_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                sqlx::query_as::<_, TenantUsage>(
                    r#"
                    UPDATE tenant_usage SET
                        current_users    = (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND is_active = true),
                        current_articles = (SELECT COUNT(*)::int FROM articles WHERE tenant_id = $1 AND deleted_at IS NULL),
                        current_sources  = (SELECT COUNT(*)::int FROM sources WHERE tenant_id = $1 AND deleted_at IS NULL),
                        current_storage_mb = COALESCE(
                            (SELECT SUM(byte_size)::bigint / (1024 * 1024) FROM objects WHERE tenant_id = $1 AND deleted_at IS NULL),
                            0
                        ),
                        current_reports_this_month = (
                            SELECT COUNT(*)::int FROM reports
                            WHERE tenant_id = $1
                              AND deleted_at IS NULL
                              AND created_at >= date_trunc('month', NOW())
                        ),
                        last_refreshed_at = NOW()
                    WHERE tenant_id = $1
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// Check whether a specific resource quota is within limits.
    ///
    /// Supported resources: "users", "articles", "sources", "storage_mb", "reports".
    /// Returns `true` if usage is under the configured maximum, `false` otherwise.
    pub async fn check_quota(&self, tenant_id: Uuid, resource: &str) -> Result<bool> {
        let config = self.get_config(tenant_id).await?;
        let usage = self.get_usage(tenant_id).await?;

        let within_quota = match resource {
            "users" => usage.current_users < config.max_users,
            "articles" => usage.current_articles < config.max_articles,
            "sources" => usage.current_sources < config.max_sources,
            "storage_mb" => usage.current_storage_mb < config.max_storage_mb,
            "reports" => usage.current_reports_this_month < config.max_reports_per_month,
            _ => {
                return Err(Error::Validation(format!(
                    "Unknown resource type: {}. Supported: users, articles, sources, storage_mb, reports",
                    resource
                )));
            }
        };

        Ok(within_quota)
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
