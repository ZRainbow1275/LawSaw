use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{Article, ArticlePin, CreateArticlePin};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct UpdateArticlePinInput {
    pub priority: Option<i32>,
    pub starts_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub ends_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct PinnedArticle {
    pub pin: ArticlePin,
    pub article: Article,
}

pub struct ArticlePinService {
    pool: PgPool,
}

impl ArticlePinService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_active(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<PinnedArticle>> {
        let pins = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ArticlePin>(
                    r#"
                    SELECT * FROM article_pins
                    WHERE deleted_at IS NULL
                      AND (starts_at IS NULL OR starts_at <= NOW())
                      AND (ends_at IS NULL OR ends_at >= NOW())
                    ORDER BY priority DESC, created_at DESC
                    LIMIT $1
                    "#,
                )
                .bind(limit.clamp(1, 50))
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;
        self.attach_articles(tenant_id, pins).await
    }

    pub async fn list_admin(&self, tenant_id: Uuid) -> Result<Vec<PinnedArticle>> {
        let pins = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ArticlePin>(
                    "SELECT * FROM article_pins WHERE deleted_at IS NULL ORDER BY priority DESC, created_at DESC",
                )
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        }).await?;
        self.attach_articles(tenant_id, pins).await
    }

    pub async fn create(&self, tenant_id: Uuid, input: CreateArticlePin) -> Result<ArticlePin> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let starts_at = input.starts_at.unwrap_or_else(chrono::Utc::now);
                let exists: Option<Uuid> = sqlx::query_scalar("SELECT id FROM articles WHERE id = $1 AND deleted_at IS NULL")
                    .bind(input.article_id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                if exists.is_none() {
                    return Err(Error::NotFound(format!("Article {} not found", input.article_id)));
                }
                sqlx::query_as::<_, ArticlePin>(
                    r#"
                    INSERT INTO article_pins (
                        tenant_id, article_id, priority, starts_at, ends_at, pinned_by, metadata, updated_at, deleted_at
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'{}'::jsonb),NOW(),NULL)
                    ON CONFLICT (tenant_id, article_id)
                    DO UPDATE SET
                        priority = EXCLUDED.priority,
                        starts_at = EXCLUDED.starts_at,
                        ends_at = EXCLUDED.ends_at,
                        pinned_by = EXCLUDED.pinned_by,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW(),
                        deleted_at = NULL
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(input.article_id)
                .bind(input.priority.unwrap_or(100))
                .bind(starts_at)
                .bind(input.ends_at)
                .bind(input.pinned_by)
                .bind(input.metadata)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        }).await
    }

    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        input: UpdateArticlePinInput,
    ) -> Result<ArticlePin> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let current = sqlx::query_as::<_, ArticlePin>(
                    "SELECT * FROM article_pins WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Article pin {} not found", id)))?;

                sqlx::query_as::<_, ArticlePin>(
                    r#"
                    UPDATE article_pins
                    SET priority = $2,
                        starts_at = $3,
                        ends_at = $4,
                        metadata = $5,
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                    "#,
                )
                .bind(id)
                .bind(input.priority.unwrap_or(current.priority))
                .bind(input.starts_at.unwrap_or(current.starts_at))
                .bind(input.ends_at.unwrap_or(current.ends_at))
                .bind(input.metadata.unwrap_or(current.metadata))
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn delete(&self, tenant_id: Uuid, id: Uuid) -> Result<ArticlePin> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ArticlePin>(
                    "UPDATE article_pins SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Article pin {} not found", id)))
            })
        }).await
    }

    async fn attach_articles(
        &self,
        tenant_id: Uuid,
        pins: Vec<ArticlePin>,
    ) -> Result<Vec<PinnedArticle>> {
        let ids: Vec<Uuid> = pins.iter().map(|pin| pin.article_id).collect();
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let articles = with_tenant_tx(&self.pool, tenant_id, |tx| {
            let ids = ids.clone();
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                    SELECT * FROM articles
                    WHERE id = ANY($1)
                      AND deleted_at IS NULL
                      AND status = 'published'
                    "#,
                )
                .bind(&ids)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        Ok(pins
            .into_iter()
            .filter_map(|pin| {
                articles
                    .iter()
                    .find(|article| article.id == pin.article_id)
                    .cloned()
                    .map(|article| PinnedArticle { pin, article })
            })
            .collect())
    }
}
