use crate::{audit::AuditService, tenant::with_tenant_tx};
use law_eye_common::{Error, Result};
use law_eye_db::{Banner, BannerTarget, CreateAuditLog};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannerTargetInput {
    pub target_type: String,
    pub target_channel_id: Option<Uuid>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBannerInput {
    pub title: String,
    pub body: Option<String>,
    pub image_url: Option<String>,
    pub cta_label: Option<String>,
    pub cta_url: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub starts_at: Option<chrono::DateTime<chrono::Utc>>,
    pub ends_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
    pub created_by: Option<Uuid>,
    pub targets: Vec<BannerTargetInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBannerInput {
    pub title: Option<String>,
    pub body: Option<String>,
    pub image_url: Option<String>,
    pub cta_label: Option<String>,
    pub cta_url: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub starts_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub ends_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub metadata: Option<serde_json::Value>,
    pub archived_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub targets: Option<Vec<BannerTargetInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannerWithTargets {
    pub banner: Banner,
    pub targets: Vec<BannerTarget>,
}

pub struct BannerService {
    pool: PgPool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannerLifecycleTransition {
    pub banner_id: Uuid,
    pub title: String,
    pub from_status: String,
    pub to_status: String,
}

#[derive(Debug, Clone, FromRow)]
struct BannerLifecycleTransitionRow {
    banner_id: Uuid,
    title: String,
    from_status: String,
    to_status: String,
}

const BANNER_ARCHIVE_RETENTION_DAYS: i32 = 7;
const BANNER_LIFECYCLE_USER_AGENT: &str = "system:banner-lifecycle";

impl BannerService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_admin(
        &self,
        tenant_id: Uuid,
        include_archived: bool,
    ) -> Result<Vec<BannerWithTargets>> {
        let banners = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let query = if include_archived {
                    "SELECT * FROM banners WHERE deleted_at IS NULL ORDER BY archived_at IS NULL DESC, priority DESC, created_at DESC"
                } else {
                    "SELECT * FROM banners WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY priority DESC, created_at DESC"
                };
                sqlx::query_as::<_, Banner>(query)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))
            })
        }).await?;
        self.attach_targets(tenant_id, banners).await
    }

    pub async fn list_active(
        &self,
        tenant_id: Uuid,
        channel_ids: &[Uuid],
    ) -> Result<Vec<BannerWithTargets>> {
        let banners = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Banner>(
                    r#"
                    SELECT *
                    FROM banners
                    WHERE deleted_at IS NULL
                      AND archived_at IS NULL
                      AND status IN ('active', 'scheduled')
                      AND (starts_at IS NULL OR starts_at <= NOW())
                      AND (ends_at IS NULL OR ends_at >= NOW())
                    ORDER BY priority DESC, created_at DESC
                    "#,
                )
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;
        let with_targets = self.attach_targets(tenant_id, banners).await?;
        Ok(with_targets
            .into_iter()
            .filter(|item| {
                item.targets.iter().any(|target| {
                    target.target_type == "global"
                        || target
                            .target_channel_id
                            .is_some_and(|id| channel_ids.contains(&id))
                })
            })
            .collect())
    }

    pub async fn advance_lifecycle(
        &self,
        tenant_id: Uuid,
        audit_service: &AuditService,
    ) -> Result<Vec<BannerLifecycleTransition>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut transitions = Vec::new();
                transitions.extend(activate_scheduled_banners(tx).await?);
                transitions.extend(expire_finished_banners(tx).await?);
                transitions
                    .extend(archive_expired_banners(tx, BANNER_ARCHIVE_RETENTION_DAYS).await?);

                for transition in &transitions {
                    audit_service
                        .log_tx(
                            tenant_id,
                            tx,
                            CreateAuditLog {
                                user_id: None,
                                action: format!("banners.lifecycle.{}", transition.to_status),
                                resource: "banners".to_string(),
                                resource_id: Some(transition.banner_id),
                                old_value: Some(serde_json::json!({
                                    "status": transition.from_status,
                                    "title": transition.title,
                                })),
                                new_value: Some(serde_json::json!({
                                    "status": transition.to_status,
                                    "title": transition.title,
                                })),
                                ip_address: None,
                                user_agent: Some(BANNER_LIFECYCLE_USER_AGENT.to_string()),
                            },
                        )
                        .await?;
                }

                Ok(transitions)
            })
        })
        .await
    }

    pub async fn create(
        &self,
        tenant_id: Uuid,
        input: CreateBannerInput,
    ) -> Result<BannerWithTargets> {
        validate_title(&input.title)?;
        let status = normalize_status(input.status.as_deref())?.to_string();
        validate_targets(&input.targets)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let banner = sqlx::query_as::<_, Banner>(
                    r#"
                    INSERT INTO banners (
                        tenant_id, title, body, image_url, cta_label, cta_url, status, priority,
                        starts_at, ends_at, created_by, metadata, updated_at
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,100),$9,$10,$11,COALESCE($12,'{}'::jsonb),NOW())
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(input.title.trim())
                .bind(input.body)
                .bind(input.image_url)
                .bind(input.cta_label)
                .bind(input.cta_url)
                .bind(status)
                .bind(input.priority)
                .bind(input.starts_at)
                .bind(input.ends_at)
                .bind(input.created_by)
                .bind(input.metadata)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let mut targets = Vec::new();
                for (index, target) in input.targets.iter().enumerate() {
                    let inserted = sqlx::query_as::<_, BannerTarget>(
                        r#"
                        INSERT INTO banner_targets (tenant_id, banner_id, target_type, target_channel_id, sort_order, updated_at)
                        VALUES ($1, $2, $3, $4, $5, NOW())
                        RETURNING *
                        "#,
                    )
                    .bind(tenant_id)
                    .bind(banner.id)
                    .bind(&target.target_type)
                    .bind(target.target_channel_id)
                    .bind(target.sort_order.unwrap_or(index as i32))
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                    targets.push(inserted);
                }

                Ok(BannerWithTargets { banner, targets })
            })
        }).await
    }

    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        input: UpdateBannerInput,
    ) -> Result<BannerWithTargets> {
        if let Some(title) = &input.title {
            validate_title(title)?;
        }
        if let Some(status) = &input.status {
            normalize_status(Some(status.as_str()))?;
        }
        if let Some(targets) = &input.targets {
            validate_targets(targets)?;
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let current = sqlx::query_as::<_, Banner>(
                    "SELECT * FROM banners WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Banner {} not found", id)))?;

                let banner = sqlx::query_as::<_, Banner>(
                    r#"
                    UPDATE banners
                    SET title = $2,
                        body = $3,
                        image_url = $4,
                        cta_label = $5,
                        cta_url = $6,
                        status = $7,
                        priority = $8,
                        starts_at = $9,
                        ends_at = $10,
                        metadata = $11,
                        archived_at = $12,
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                    "#,
                )
                .bind(id)
                .bind(input.title.unwrap_or(current.title))
                .bind(input.body.or(current.body))
                .bind(input.image_url.or(current.image_url))
                .bind(input.cta_label.or(current.cta_label))
                .bind(input.cta_url.or(current.cta_url))
                .bind(input.status.unwrap_or(current.status))
                .bind(input.priority.unwrap_or(current.priority))
                .bind(input.starts_at.unwrap_or(current.starts_at))
                .bind(input.ends_at.unwrap_or(current.ends_at))
                .bind(input.metadata.unwrap_or(current.metadata))
                .bind(input.archived_at.unwrap_or(current.archived_at))
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if let Some(targets) = input.targets {
                    sqlx::query("DELETE FROM banner_targets WHERE banner_id = $1")
                        .bind(id)
                        .execute(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;

                    for (index, target) in targets.iter().enumerate() {
                        sqlx::query_as::<_, BannerTarget>(
                            r#"
                            INSERT INTO banner_targets (tenant_id, banner_id, target_type, target_channel_id, sort_order, updated_at)
                            VALUES ($1, $2, $3, $4, $5, NOW())
                            RETURNING *
                            "#,
                        )
                        .bind(tenant_id)
                        .bind(id)
                        .bind(&target.target_type)
                        .bind(target.target_channel_id)
                        .bind(target.sort_order.unwrap_or(index as i32))
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;
                    }
                }

                let targets = sqlx::query_as::<_, BannerTarget>(
                    "SELECT * FROM banner_targets WHERE banner_id = $1 ORDER BY sort_order ASC, created_at ASC",
                )
                .bind(id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(BannerWithTargets { banner, targets })
            })
        }).await
    }

    async fn attach_targets(
        &self,
        tenant_id: Uuid,
        banners: Vec<Banner>,
    ) -> Result<Vec<BannerWithTargets>> {
        let ids: Vec<Uuid> = banners.iter().map(|banner| banner.id).collect();
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let targets = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, BannerTarget>(
                    "SELECT * FROM banner_targets WHERE banner_id = ANY($1) ORDER BY sort_order ASC, created_at ASC",
                )
                .bind(&ids)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        }).await?;

        Ok(banners
            .into_iter()
            .map(|banner| BannerWithTargets {
                banner: banner.clone(),
                targets: targets
                    .iter()
                    .filter(|target| target.banner_id == banner.id)
                    .cloned()
                    .collect(),
            })
            .collect())
    }
}

async fn activate_scheduled_banners(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<Vec<BannerLifecycleTransition>> {
    sqlx::query_as::<_, BannerLifecycleTransitionRow>(
        r#"
        WITH transitioned AS (
            UPDATE banners
            SET status = 'active', updated_at = NOW()
            WHERE deleted_at IS NULL
              AND archived_at IS NULL
              AND status = 'scheduled'
              AND starts_at IS NOT NULL
              AND starts_at <= NOW()
              AND (ends_at IS NULL OR ends_at >= NOW())
            RETURNING id AS banner_id, title, 'scheduled'::text AS from_status, 'active'::text AS to_status
        )
        SELECT * FROM transitioned
        "#,
    )
    .fetch_all(tx.as_mut())
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
    .map_err(|e| Error::Database(e.to_string()))
}

async fn expire_finished_banners(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<Vec<BannerLifecycleTransition>> {
    sqlx::query_as::<_, BannerLifecycleTransitionRow>(
        r#"
        WITH candidates AS (
            SELECT id, title, status AS from_status
            FROM banners
            WHERE deleted_at IS NULL
              AND archived_at IS NULL
              AND status IN ('scheduled', 'active')
              AND ends_at IS NOT NULL
              AND ends_at < NOW()
            FOR UPDATE
        ), transitioned AS (
            UPDATE banners AS banner
            SET status = 'expired', updated_at = NOW()
            FROM candidates
            WHERE banner.id = candidates.id
            RETURNING candidates.id AS banner_id, candidates.title, candidates.from_status::text AS from_status, 'expired'::text AS to_status
        )
        SELECT * FROM transitioned
        "#,
    )
    .fetch_all(tx.as_mut())
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
    .map_err(|e| Error::Database(e.to_string()))
}

async fn archive_expired_banners(
    tx: &mut Transaction<'_, Postgres>,
    retention_days: i32,
) -> Result<Vec<BannerLifecycleTransition>> {
    sqlx::query_as::<_, BannerLifecycleTransitionRow>(
        r#"
        WITH transitioned AS (
            UPDATE banners
            SET status = 'archived',
                archived_at = COALESCE(archived_at, NOW()),
                updated_at = NOW()
            WHERE deleted_at IS NULL
              AND archived_at IS NULL
              AND status = 'expired'
              AND ends_at IS NOT NULL
              AND ends_at < NOW() - ($1::int * interval '1 day')
            RETURNING id AS banner_id, title, 'expired'::text AS from_status, 'archived'::text AS to_status
        )
        SELECT * FROM transitioned
        "#,
    )
    .bind(retention_days)
    .fetch_all(tx.as_mut())
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
    .map_err(|e| Error::Database(e.to_string()))
}

impl From<BannerLifecycleTransitionRow> for BannerLifecycleTransition {
    fn from(value: BannerLifecycleTransitionRow) -> Self {
        Self {
            banner_id: value.banner_id,
            title: value.title,
            from_status: value.from_status,
            to_status: value.to_status,
        }
    }
}

fn validate_title(value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(Error::Validation(
            "banner title cannot be empty".to_string(),
        ));
    }
    Ok(())
}

fn normalize_status(value: Option<&str>) -> Result<&str> {
    match value.unwrap_or("draft").trim() {
        "draft" | "scheduled" | "active" | "expired" | "archived" => {
            Ok(value.unwrap_or("draft").trim())
        }
        other => Err(Error::Validation(format!(
            "unsupported banner status: {}",
            other
        ))),
    }
}

fn validate_targets(targets: &[BannerTargetInput]) -> Result<()> {
    if targets.is_empty() {
        return Err(Error::Validation(
            "banner must define at least one target".to_string(),
        ));
    }
    for target in targets {
        match (target.target_type.as_str(), target.target_channel_id) {
            ("global", None) => {}
            ("channel", Some(_)) => {}
            ("global", Some(_)) => {
                return Err(Error::Validation(
                    "global target must not include target_channel_id".to_string(),
                ))
            }
            ("channel", None) => {
                return Err(Error::Validation(
                    "channel target requires target_channel_id".to_string(),
                ))
            }
            (other, _) => {
                return Err(Error::Validation(format!(
                    "unsupported banner target_type: {}",
                    other
                )))
            }
        }
    }
    Ok(())
}
