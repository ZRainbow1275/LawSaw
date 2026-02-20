use crate::tenant::with_tenant_tx;
use chrono::{DateTime, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::{CreateWebPushSubscription, WebPushSubscription};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

pub struct WebPushSubscriptionService {
    pool: PgPool,
}

impl WebPushSubscriptionService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn upsert(
        &self,
        tenant_id: Uuid,
        input: CreateWebPushSubscription,
    ) -> Result<WebPushSubscription> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let input = input.clone();
            Box::pin(async move { Self::upsert_tx_inner(tenant_id, tx, input).await })
        })
        .await
    }

    pub async fn upsert_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        input: CreateWebPushSubscription,
    ) -> Result<WebPushSubscription> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Self::upsert_tx_inner(tenant_id, tx, input).await
    }

    async fn upsert_tx_inner(
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        input: CreateWebPushSubscription,
    ) -> Result<WebPushSubscription> {
        let _ = tenant_id;
        validate_subscription_input(&input)?;

        sqlx::query_as::<_, WebPushSubscription>(
            r#"
            INSERT INTO web_push_subscriptions (
                user_id,
                endpoint,
                p256dh,
                auth,
                expiration_time,
                user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tenant_id, user_id, endpoint) WHERE deleted_at IS NULL
            DO UPDATE SET
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                expiration_time = EXCLUDED.expiration_time,
                user_agent = EXCLUDED.user_agent,
                deleted_at = NULL
            RETURNING
                id,
                tenant_id,
                user_id,
                endpoint,
                p256dh,
                auth,
                expiration_time,
                user_agent,
                created_at,
                updated_at,
                deleted_at
            "#,
        )
        .bind(input.user_id)
        .bind(&input.endpoint)
        .bind(&input.p256dh)
        .bind(&input.auth)
        .bind(input.expiration_time)
        .bind(&input.user_agent)
        .fetch_one(tx.as_mut())
        .await
        .map_err(|err| Error::Database(err.to_string()))
    }

    /// 返回当前用户有效订阅总数。
    pub async fn count_by_user(&self, tenant_id: Uuid, user_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let total = sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COUNT(*)::BIGINT
                    FROM web_push_subscriptions
                    WHERE user_id = $1
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(user_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                Ok(total)
            })
        })
        .await
    }

    /// 分页读取当前用户的有效 Push 订阅。
    pub async fn list_by_user_paginated(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WebPushSubscription>> {
        let limit = limit.clamp(1, 500);
        let offset = offset.max(0);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows = sqlx::query_as::<_, WebPushSubscription>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        user_id,
                        endpoint,
                        p256dh,
                        auth,
                        expiration_time,
                        user_agent,
                        created_at,
                        updated_at,
                        deleted_at
                    FROM web_push_subscriptions
                    WHERE user_id = $1
                      AND deleted_at IS NULL
                    ORDER BY updated_at DESC
                    LIMIT $2
                    OFFSET $3
                    "#,
                )
                .bind(user_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                Ok(rows)
            })
        })
        .await
    }

    pub async fn list_by_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<WebPushSubscription>> {
        self.list_by_user_paginated(tenant_id, user_id, 50, 0).await
    }

    pub async fn soft_delete_by_endpoint(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let endpoint = endpoint.to_string();
            Box::pin(async move {
                Self::soft_delete_by_endpoint_tx_inner(tenant_id, tx, user_id, &endpoint).await
            })
        })
        .await
    }

    pub async fn soft_delete_by_endpoint_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        endpoint: &str,
    ) -> Result<()> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Self::soft_delete_by_endpoint_tx_inner(tenant_id, tx, user_id, endpoint).await
    }

    async fn soft_delete_by_endpoint_tx_inner(
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        endpoint: &str,
    ) -> Result<()> {
        let _ = tenant_id;
        let endpoint = endpoint.trim();
        if endpoint.is_empty() {
            return Err(Error::Validation("endpoint is required".to_string()));
        }
        if endpoint.len() > 4096 {
            return Err(Error::Validation("endpoint too long".to_string()));
        }

        sqlx::query(
            r#"
            UPDATE web_push_subscriptions
            SET deleted_at = NOW()
            WHERE user_id = $1
              AND endpoint = $2
              AND deleted_at IS NULL
            "#,
        )
        .bind(user_id)
        .bind(endpoint)
        .execute(tx.as_mut())
        .await
        .map_err(|err| Error::Database(err.to_string()))?;

        Ok(())
    }

    pub async fn soft_delete_by_endpoints(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoints: &[String],
    ) -> Result<()> {
        if endpoints.is_empty() {
            return Ok(());
        }

        let cleaned: Vec<String> = endpoints
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .take(200)
            .map(|s| s.to_string())
            .collect();

        if cleaned.is_empty() {
            return Ok(());
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let cleaned = cleaned.clone();
            Box::pin(async move {
                sqlx::query(
                    r#"
                    UPDATE web_push_subscriptions
                    SET deleted_at = NOW()
                    WHERE user_id = $1
                      AND endpoint = ANY($2)
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(user_id)
                .bind(&cleaned)
                .execute(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                Ok(())
            })
        })
        .await
    }

    pub async fn delete_stale_endpoint(&self, tenant_id: Uuid, endpoint: &str) -> Result<()> {
        let endpoint = endpoint.trim().to_string();
        if endpoint.is_empty() {
            return Ok(());
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let endpoint = endpoint.clone();
            Box::pin(async move {
                sqlx::query(
                    r#"
                    UPDATE web_push_subscriptions
                    SET deleted_at = NOW()
                    WHERE endpoint = $1
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(endpoint)
                .execute(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                Ok(())
            })
        })
        .await
    }
}

fn validate_subscription_input(input: &CreateWebPushSubscription) -> Result<()> {
    if input.endpoint.trim().is_empty() {
        return Err(Error::Validation("endpoint is required".to_string()));
    }
    if input.endpoint.len() > 4096 {
        return Err(Error::Validation("endpoint too long".to_string()));
    }
    if input.p256dh.trim().is_empty() {
        return Err(Error::Validation("p256dh is required".to_string()));
    }
    if input.p256dh.len() > 1024 {
        return Err(Error::Validation("p256dh too long".to_string()));
    }
    if input.auth.trim().is_empty() {
        return Err(Error::Validation("auth is required".to_string()));
    }
    if input.auth.len() > 512 {
        return Err(Error::Validation("auth too long".to_string()));
    }
    if let Some(ua) = input.user_agent.as_deref() {
        if ua.len() > 512 {
            return Err(Error::Validation("user_agent too long".to_string()));
        }
    }
    Ok(())
}

pub fn parse_expiration_time_millis(value: Option<i64>) -> Option<DateTime<Utc>> {
    let millis = value?;
    if millis <= 0 {
        return None;
    }
    let secs = millis / 1000;
    let nanos = ((millis % 1000) * 1_000_000) as u32;
    DateTime::<Utc>::from_timestamp(secs, nanos)
}
