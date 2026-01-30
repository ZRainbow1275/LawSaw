use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{AuditLog, CreateAuditLog};
use sqlx::{Executor, PgPool, Postgres, Transaction};
use uuid::Uuid;

pub struct AuditService {
    pool: PgPool,
}

async fn log_audit_inner<'e, E>(executor: E, input: CreateAuditLog) -> Result<AuditLog>
where
    E: Executor<'e, Database = Postgres>,
{
    let audit = sqlx::query_as::<_, AuditLog>(
        r#"
        INSERT INTO audit_logs (user_id, action, resource, resource_id, old_value, new_value, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)
        RETURNING
            id,
            tenant_id,
            seq,
            encode(prev_hash, 'hex') AS prev_hash,
            encode(hash, 'hex') AS hash,
            user_id,
            action,
            resource,
            resource_id,
            old_value,
            new_value,
            ip_address::text AS ip_address,
            user_agent,
            created_at
        "#,
    )
    .bind(input.user_id)
    .bind(&input.action)
    .bind(&input.resource)
    .bind(input.resource_id)
    .bind(&input.old_value)
    .bind(&input.new_value)
    .bind(&input.ip_address)
    .bind(&input.user_agent)
    .fetch_one(executor)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(audit)
}

#[derive(Debug, Clone, Default)]
pub struct AuditFilters {
    pub user_id: Option<Uuid>,
    pub resource: Option<String>,
    pub resource_id: Option<Uuid>,
    pub action: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

impl AuditService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn log(&self, tenant_id: Uuid, input: CreateAuditLog) -> Result<AuditLog> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { log_audit_inner(tx.as_mut(), input).await })
        })
        .await
    }

    pub async fn log_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        input: CreateAuditLog,
    ) -> Result<AuditLog> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        log_audit_inner(tx.as_mut(), input).await
    }

    pub async fn list(&self, tenant_id: Uuid, filters: AuditFilters) -> Result<Vec<AuditLog>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut query = String::from(
                    "SELECT id, tenant_id, seq, encode(prev_hash, 'hex') AS prev_hash, encode(hash, 'hex') AS hash, user_id, action, resource, resource_id, old_value, new_value, ip_address::text AS ip_address, user_agent, created_at FROM audit_logs WHERE 1=1"
                );
                let mut param_count = 0;

                if filters.user_id.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND user_id = ${}", param_count));
                }
                if filters.resource.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND resource = ${}", param_count));
                }
                if filters.resource_id.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND resource_id = ${}", param_count));
                }
                if filters.action.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND action = ${}", param_count));
                }

                query.push_str(&format!(
                    " ORDER BY seq DESC LIMIT ${} OFFSET ${}",
                    param_count + 1,
                    param_count + 2
                ));

                let mut query_builder = sqlx::query_as::<_, AuditLog>(&query);

                if let Some(user_id) = filters.user_id {
                    query_builder = query_builder.bind(user_id);
                }
                if let Some(resource) = &filters.resource {
                    query_builder = query_builder.bind(resource);
                }
                if let Some(resource_id) = filters.resource_id {
                    query_builder = query_builder.bind(resource_id);
                }
                if let Some(action) = &filters.action {
                    query_builder = query_builder.bind(action);
                }

                query_builder = query_builder.bind(filters.limit).bind(filters.offset);

                let audits = query_builder
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok(audits)
            })
        })
        .await
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<AuditLog> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AuditLog>(
                    "SELECT id, tenant_id, seq, encode(prev_hash, 'hex') AS prev_hash, encode(hash, 'hex') AS hash, user_id, action, resource, resource_id, old_value, new_value, ip_address::text AS ip_address, user_agent, created_at FROM audit_logs WHERE id = $1",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Audit log {} not found", id)))
            })
        })
        .await
    }

    pub async fn count(&self, tenant_id: Uuid, filters: AuditFilters) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut query = String::from("SELECT COUNT(*) FROM audit_logs WHERE 1=1");
                let mut param_count = 0;

                if filters.user_id.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND user_id = ${}", param_count));
                }
                if filters.resource.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND resource = ${}", param_count));
                }
                if filters.resource_id.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND resource_id = ${}", param_count));
                }
                if filters.action.is_some() {
                    param_count += 1;
                    query.push_str(&format!(" AND action = ${}", param_count));
                }

                let mut query_builder = sqlx::query_as::<_, (i64,)>(&query);

                if let Some(user_id) = filters.user_id {
                    query_builder = query_builder.bind(user_id);
                }
                if let Some(resource) = &filters.resource {
                    query_builder = query_builder.bind(resource);
                }
                if let Some(resource_id) = filters.resource_id {
                    query_builder = query_builder.bind(resource_id);
                }
                if let Some(action) = &filters.action {
                    query_builder = query_builder.bind(action);
                }

                let result = query_builder
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok(result.0)
            })
        })
        .await
    }

    /// Helper to log a simple action
    pub async fn log_action(
        &self,
        tenant_id: Uuid,
        user_id: Option<Uuid>,
        action: &str,
        resource: &str,
        resource_id: Option<Uuid>,
    ) -> Result<()> {
        self.log(
            tenant_id,
            CreateAuditLog {
                user_id,
                action: action.to_string(),
                resource: resource.to_string(),
                resource_id,
                old_value: None,
                new_value: None,
                ip_address: None,
                user_agent: None,
            },
        )
        .await?;
        Ok(())
    }
}
