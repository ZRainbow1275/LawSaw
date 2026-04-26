use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{Channel, ChannelAccessPolicy, CreateChannel};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateChannelInput {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub linked_category_id: Option<Option<Uuid>>,
    pub visibility: Option<String>,
    pub is_active: Option<bool>,
    pub metadata: Option<serde_json::Value>,
}

pub struct ChannelService {
    pool: PgPool,
}

impl ChannelService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_active(&self, tenant_id: Uuid) -> Result<Vec<Channel>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Channel>(
                    r#"
                    SELECT *
                    FROM channels
                    WHERE deleted_at IS NULL AND is_active = true
                    ORDER BY
                        CASE visibility
                            WHEN 'public' THEN 0
                            WHEN 'restricted' THEN 1
                            WHEN 'verified' THEN 2
                            WHEN 'premium' THEN 3
                            ELSE 9
                        END ASC,
                        name ASC,
                        created_at ASC
                    "#,
                )
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn list_admin(
        &self,
        tenant_id: Uuid,
        include_inactive: bool,
    ) -> Result<Vec<Channel>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let query = if include_inactive {
                    "SELECT * FROM channels WHERE deleted_at IS NULL ORDER BY is_active DESC, name ASC, created_at ASC"
                } else {
                    "SELECT * FROM channels WHERE deleted_at IS NULL AND is_active = true ORDER BY name ASC, created_at ASC"
                };
                sqlx::query_as::<_, Channel>(query)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn create(&self, tenant_id: Uuid, input: CreateChannel) -> Result<Channel> {
        let slug = input.slug.trim().to_string();
        let name = input.name.trim().to_string();
        if slug.is_empty() || name.is_empty() {
            return Err(Error::Validation(
                "channel slug and name cannot be empty".to_string(),
            ));
        }
        if !slug
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
        {
            return Err(Error::Validation(
                "channel slug must contain lowercase letters, digits, and hyphens only".to_string(),
            ));
        }
        let visibility = normalize_visibility(input.visibility.as_deref())?.to_string();

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Channel>(
                    r#"
                    INSERT INTO channels (
                        tenant_id, slug, name, description, linked_category_id,
                        visibility, is_active, metadata, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, '{}'::jsonb), NOW())
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(slug)
                .bind(name)
                .bind(
                    input
                        .description
                        .as_deref()
                        .map(str::trim)
                        .filter(|v| !v.is_empty()),
                )
                .bind(input.linked_category_id)
                .bind(visibility)
                .bind(input.is_active.unwrap_or(true))
                .bind(input.metadata)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        input: UpdateChannelInput,
    ) -> Result<Channel> {
        if let Some(slug) = &input.slug {
            let trimmed = slug.trim();
            if trimmed.is_empty() {
                return Err(Error::Validation(
                    "channel slug cannot be empty".to_string(),
                ));
            }
            if !trimmed
                .chars()
                .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
            {
                return Err(Error::Validation(
                    "channel slug must contain lowercase letters, digits, and hyphens only"
                        .to_string(),
                ));
            }
        }
        if let Some(name) = &input.name {
            if name.trim().is_empty() {
                return Err(Error::Validation(
                    "channel name cannot be empty".to_string(),
                ));
            }
        }
        if let Some(visibility) = &input.visibility {
            normalize_visibility(Some(visibility.as_str()))?;
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let current = sqlx::query_as::<_, Channel>(
                    "SELECT * FROM channels WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Channel {} not found", id)))?;

                sqlx::query_as::<_, Channel>(
                    r#"
                    UPDATE channels
                    SET slug = $2,
                        name = $3,
                        description = $4,
                        linked_category_id = $5,
                        visibility = $6,
                        is_active = $7,
                        metadata = $8,
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                    "#,
                )
                .bind(id)
                .bind(
                    input
                        .slug
                        .as_deref()
                        .map(str::trim)
                        .filter(|v| !v.is_empty())
                        .unwrap_or(current.slug.as_str()),
                )
                .bind(
                    input
                        .name
                        .as_deref()
                        .map(str::trim)
                        .filter(|v| !v.is_empty())
                        .unwrap_or(current.name.as_str()),
                )
                .bind(input.description.or(current.description))
                .bind(
                    input
                        .linked_category_id
                        .unwrap_or(current.linked_category_id),
                )
                .bind(
                    input
                        .visibility
                        .as_deref()
                        .map(str::trim)
                        .filter(|v| !v.is_empty())
                        .unwrap_or(current.visibility.as_str()),
                )
                .bind(input.is_active.unwrap_or(current.is_active))
                .bind(input.metadata.unwrap_or(current.metadata))
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn list_policies(
        &self,
        tenant_id: Uuid,
        channel_id: Uuid,
    ) -> Result<Vec<ChannelAccessPolicy>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ChannelAccessPolicy>(
                    "SELECT * FROM channel_access_policies WHERE channel_id = $1 ORDER BY priority DESC, created_at ASC",
                )
                .bind(channel_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }
}

fn normalize_visibility(value: Option<&str>) -> Result<&str> {
    match value.unwrap_or("restricted").trim() {
        "public" | "restricted" | "verified" | "premium" => {
            Ok(value.unwrap_or("restricted").trim())
        }
        other => Err(Error::Validation(format!(
            "unsupported visibility: {}",
            other
        ))),
    }
}
