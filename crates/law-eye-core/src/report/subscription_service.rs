use law_eye_common::{Error, Result};
use law_eye_db::{CreateReportSubscription, ReportSubscription, UpdateReportSubscription};
use serde_json::Value;
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

const VALID_PERIOD_TYPES: [&str; 3] = ["weekly", "monthly", "quarterly"];
const VALID_DELIVERY_CHANNELS: [&str; 2] = ["in_app", "web_push"];
const VALID_EXPORT_FORMATS: [&str; 3] = ["pdf", "docx", "html"];
const REPORT_SUBSCRIPTION_NAME_MAX_LEN: usize = 100;

pub struct ReportSubscriptionService {
    pool: PgPool,
}

impl ReportSubscriptionService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_by_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<ReportSubscription>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportSubscription>(
                    r#"
                    SELECT *
                    FROM report_subscriptions
                    WHERE user_id = $1
                      AND deleted_at IS NULL
                    ORDER BY is_active DESC, updated_at DESC, created_at DESC
                    "#,
                )
                .bind(user_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))
            })
        })
        .await
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<ReportSubscription> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportSubscription>(
                    r#"
                    SELECT *
                    FROM report_subscriptions
                    WHERE id = $1
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report subscription {} not found", id)))
            })
        })
        .await
    }

    pub async fn create(
        &self,
        tenant_id: Uuid,
        input: CreateReportSubscription,
    ) -> Result<ReportSubscription> {
        Self::validate_create_input(&input)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let input = input.clone();
            Box::pin(async move {
                Self::ensure_user_exists_in_tenant(tx.as_mut(), tenant_id, input.user_id).await?;
                Self::ensure_template_is_active_in_tenant(tx.as_mut(), tenant_id, input.template_id)
                    .await?;

                sqlx::query_as::<_, ReportSubscription>(
                    r#"
                    INSERT INTO report_subscriptions (
                        tenant_id,
                        user_id,
                        name,
                        template_id,
                        period_type,
                        delivery_channel,
                        export_format,
                        filters,
                        is_active
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(input.user_id)
                .bind(input.name.trim())
                .bind(input.template_id)
                .bind(input.period_type)
                .bind(input.delivery_channel)
                .bind(input.export_format)
                .bind(input.filters.unwrap_or_else(|| serde_json::json!({})))
                .bind(input.is_active.unwrap_or(true))
                .fetch_one(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))
            })
        })
        .await
    }

    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        input: UpdateReportSubscription,
    ) -> Result<ReportSubscription> {
        Self::validate_update_input(&input)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let input = input.clone();
            Box::pin(async move {
                let current = sqlx::query_as::<_, ReportSubscription>(
                    r#"
                    SELECT *
                    FROM report_subscriptions
                    WHERE id = $1
                      AND deleted_at IS NULL
                    FOR UPDATE
                    "#,
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report subscription {} not found", id)))?;

                let name = input.name.unwrap_or(current.name);
                let template_id = input.template_id.unwrap_or(current.template_id);
                let period_type = input.period_type.unwrap_or(current.period_type);
                let delivery_channel = input.delivery_channel.unwrap_or(current.delivery_channel);
                let export_format = input.export_format.unwrap_or(current.export_format);
                let filters = input.filters.unwrap_or(current.filters);
                let is_active = input.is_active.unwrap_or(current.is_active);

                Self::validate_name(&name)?;
                Self::validate_period_type(&period_type)?;
                Self::validate_delivery_channel(&delivery_channel)?;
                Self::validate_export_format(&export_format)?;
                Self::validate_filters(&filters)?;
                Self::ensure_template_is_active_in_tenant(tx.as_mut(), tenant_id, template_id)
                    .await?;

                sqlx::query_as::<_, ReportSubscription>(
                    r#"
                    UPDATE report_subscriptions
                    SET name = $2,
                        template_id = $3,
                        period_type = $4,
                        delivery_channel = $5,
                        export_format = $6,
                        filters = $7,
                        is_active = $8,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE id = $1
                      AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(id)
                .bind(name.trim())
                .bind(template_id)
                .bind(period_type)
                .bind(delivery_channel)
                .bind(export_format)
                .bind(filters)
                .bind(is_active)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))
            })
        })
        .await
    }

    pub async fn soft_delete(&self, tenant_id: Uuid, id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result = sqlx::query(
                    r#"
                    UPDATE report_subscriptions
                    SET deleted_at = NOW(),
                        updated_at = NOW(),
                        version = version + 1
                    WHERE id = $1
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(id)
                .execute(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?;

                if result.rows_affected() == 0 {
                    return Err(Error::NotFound(format!(
                        "Report subscription {} not found",
                        id
                    )));
                }

                Ok(())
            })
        })
        .await
    }

    pub async fn mark_triggered(&self, tenant_id: Uuid, id: Uuid) -> Result<ReportSubscription> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportSubscription>(
                    r#"
                    UPDATE report_subscriptions
                    SET last_triggered_at = NOW(),
                        version = version + 1,
                        updated_at = NOW()
                    WHERE id = $1
                      AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|err| Error::Database(err.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report subscription {} not found", id)))
            })
        })
        .await
    }

    fn validate_create_input(input: &CreateReportSubscription) -> Result<()> {
        Self::validate_name(&input.name)?;
        Self::validate_period_type(&input.period_type)?;
        Self::validate_delivery_channel(&input.delivery_channel)?;
        Self::validate_export_format(&input.export_format)?;
        match input.filters.as_ref() {
            Some(filters) => Self::validate_filters(filters)?,
            None => Self::validate_filters(&serde_json::json!({}))?,
        }
        Ok(())
    }

    fn validate_update_input(input: &UpdateReportSubscription) -> Result<()> {
        let has_changes = input.name.is_some()
            || input.template_id.is_some()
            || input.period_type.is_some()
            || input.delivery_channel.is_some()
            || input.export_format.is_some()
            || input.filters.is_some()
            || input.is_active.is_some();

        if !has_changes {
            return Err(Error::Validation(
                "No fields provided for subscription update".to_string(),
            ));
        }

        if let Some(name) = &input.name {
            Self::validate_name(name)?;
        }
        if let Some(period_type) = &input.period_type {
            Self::validate_period_type(period_type)?;
        }
        if let Some(delivery_channel) = &input.delivery_channel {
            Self::validate_delivery_channel(delivery_channel)?;
        }
        if let Some(export_format) = &input.export_format {
            Self::validate_export_format(export_format)?;
        }
        if let Some(filters) = &input.filters {
            Self::validate_filters(filters)?;
        }

        Ok(())
    }

    fn validate_name(name: &str) -> Result<()> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(Error::Validation(
                "subscription name must not be empty".to_string(),
            ));
        }
        if trimmed.len() > REPORT_SUBSCRIPTION_NAME_MAX_LEN {
            return Err(Error::Validation(format!(
                "subscription name too long (max {REPORT_SUBSCRIPTION_NAME_MAX_LEN})"
            )));
        }
        Ok(())
    }

    fn validate_period_type(value: &str) -> Result<()> {
        if !VALID_PERIOD_TYPES.contains(&value) {
            return Err(Error::Validation(format!(
                "Invalid period_type: {}. Allowed: weekly, monthly, quarterly",
                value
            )));
        }
        Ok(())
    }

    fn validate_delivery_channel(value: &str) -> Result<()> {
        if !VALID_DELIVERY_CHANNELS.contains(&value) {
            return Err(Error::Validation(format!(
                "Invalid delivery_channel: {}. Allowed: in_app, web_push",
                value
            )));
        }
        Ok(())
    }

    fn validate_export_format(value: &str) -> Result<()> {
        if !VALID_EXPORT_FORMATS.contains(&value) {
            return Err(Error::Validation(format!(
                "Invalid export_format: {}. Allowed: pdf, docx, html",
                value
            )));
        }
        Ok(())
    }

    fn validate_filters(filters: &Value) -> Result<()> {
        if !filters.is_object() {
            return Err(Error::Validation(
                "filters must be a JSON object".to_string(),
            ));
        }
        Ok(())
    }

    async fn ensure_user_exists_in_tenant(
        conn: &mut PgConnection,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<()> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM users
                WHERE tenant_id = $1
                  AND id = $2
            )
            "#,
        )
        .bind(tenant_id)
        .bind(user_id)
        .fetch_one(conn)
        .await
        .map_err(|err| Error::Database(err.to_string()))?;

        if !exists {
            return Err(Error::Validation(format!(
                "User {} does not belong to tenant {}",
                user_id, tenant_id
            )));
        }

        Ok(())
    }

    async fn ensure_template_is_active_in_tenant(
        conn: &mut PgConnection,
        tenant_id: Uuid,
        template_id: Uuid,
    ) -> Result<()> {
        let exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM report_templates
                WHERE tenant_id = $1
                  AND id = $2
                  AND is_active = true
            )
            "#,
        )
        .bind(tenant_id)
        .bind(template_id)
        .fetch_one(conn)
        .await
        .map_err(|err| Error::Database(err.to_string()))?;

        if !exists {
            return Err(Error::Validation(format!(
                "Report template {} not found or inactive in current tenant",
                template_id
            )));
        }

        Ok(())
    }
}
