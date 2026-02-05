use crate::tenant::with_tenant_tx;
use chrono::{DateTime, NaiveDate, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::{Article, CreateArticle};
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use uuid::Uuid;

pub const MAX_ARTICLE_TITLE_BYTES: usize = 8 * 1024;
pub const MAX_ARTICLE_SUMMARY_BYTES: usize = 256 * 1024;
pub const MAX_ARTICLE_CONTENT_BYTES: usize = 4 * 1024 * 1024;

fn validate_max_bytes(field: &str, value: &str, max_bytes: usize) -> Result<()> {
    if value.len() > max_bytes {
        return Err(Error::Validation(format!(
            "{field} too large (max {max_bytes} bytes)"
        )));
    }
    Ok(())
}

pub fn truncate_string_to_max_bytes(mut value: String, max_bytes: usize) -> String {
    if max_bytes == 0 {
        value.clear();
        return value;
    }

    if value.len() <= max_bytes {
        return value;
    }

    let mut end = max_bytes.min(value.len());
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }

    value.truncate(end);
    value
}

pub struct ArticleService {
    pool: PgPool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct UpdateArticlePatch<'a> {
    pub title: Option<&'a str>,
    pub content: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub category_id: Option<Uuid>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleStats {
    pub total: i64,
    pub published: i64,
    pub pending: i64,
    pub high_risk: i64,
    pub today: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleDailyTrendPoint {
    pub date: NaiveDate,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleCategoryCount {
    pub category_id: Option<Uuid>,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleSearchHit {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    /// Normalized relevance score in [0, 1].
    pub score: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleStatusCounts {
    pub pending: i64,
    pub processing: i64,
    pub published: i64,
    pub archived: i64,
    pub rejected: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleRiskCounts {
    pub unknown: i64,
    pub low: i64,
    pub medium: i64,
    pub high: i64,
    pub critical: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleSentimentCounts {
    pub unknown: i64,
    pub positive: i64,
    pub neutral: i64,
    pub negative: i64,
    pub mixed: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleAnalyticsSummary {
    pub total: i64,
    pub status: ArticleStatusCounts,
    pub risk: ArticleRiskCounts,
    pub sentiment: ArticleSentimentCounts,
}

#[derive(Debug, sqlx::FromRow)]
struct ArticleAnalyticsSummaryRow {
    total: i64,
    pending: i64,
    processing: i64,
    published: i64,
    archived: i64,
    rejected: i64,
    risk_unknown: i64,
    risk_low: i64,
    risk_medium: i64,
    risk_high: i64,
    risk_critical: i64,
    sentiment_unknown: i64,
    sentiment_positive: i64,
    sentiment_neutral: i64,
    sentiment_negative: i64,
    sentiment_mixed: i64,
}

impl ArticleService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Get total count of articles (for pagination)
    pub async fn count(&self, tenant_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result: (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL")
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;
                Ok(result.0)
            })
        })
        .await
    }

    pub async fn list(&self, tenant_id: Uuid, limit: i64, offset: i64) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                SELECT * FROM articles
                WHERE deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
                "#,
                )
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn count_filtered<'a>(
        &self,
        tenant_id: Uuid,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut qb: QueryBuilder<'a, Postgres> =
                    QueryBuilder::new("SELECT COUNT(*) FROM articles");
                push_article_filters(&mut qb, category_id, status);

                let result: (i64,) = qb
                    .build_query_as()
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok(result.0)
            })
        })
        .await
    }

    pub async fn list_filtered<'a>(
        &self,
        tenant_id: Uuid,
        limit: i64,
        offset: i64,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut qb: QueryBuilder<'a, Postgres> =
                    QueryBuilder::new("SELECT * FROM articles");
                push_article_filters(&mut qb, category_id, status);

                qb.push(" ORDER BY created_at DESC, id DESC");
                qb.push(" LIMIT ").push_bind(limit);
                qb.push(" OFFSET ").push_bind(offset);

                qb.build_query_as::<Article>()
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn list_filtered_cursor<'a>(
        &self,
        tenant_id: Uuid,
        limit: i64,
        cursor_created_at: DateTime<Utc>,
        cursor_id: Uuid,
        category_id: Option<Uuid>,
        status: Option<&'a str>,
    ) -> Result<Vec<Article>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut qb: QueryBuilder<'a, Postgres> =
                    QueryBuilder::new("SELECT * FROM articles");
                push_article_filters(&mut qb, category_id, status);

                qb.push(" AND (created_at, id) < (");
                qb.push_bind(cursor_created_at);
                qb.push(", ");
                qb.push_bind(cursor_id);
                qb.push(")");

                qb.push(" ORDER BY created_at DESC, id DESC");
                qb.push(" LIMIT ").push_bind(limit);

                qb.build_query_as::<Article>()
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn get_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { self.get_by_id_tx(tenant_id, tx, id).await })
        })
        .await
    }

    pub async fn get_by_id_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
    ) -> Result<Article> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = $1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
    }

    pub async fn get_by_id_any_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
    ) -> Result<Article> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = $1")
            .bind(id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
    }

    pub async fn create(&self, tenant_id: Uuid, input: CreateArticle) -> Result<Article> {
        validate_max_bytes("title", &input.title, MAX_ARTICLE_TITLE_BYTES)?;
        if let Some(content) = input.content.as_deref() {
            validate_max_bytes("content", content, MAX_ARTICLE_CONTENT_BYTES)?;
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                INSERT INTO articles (source_id, title, link, content, author, published_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                "#,
                )
                .bind(input.source_id)
                .bind(&input.title)
                .bind(&input.link)
                .bind(&input.content)
                .bind(&input.author)
                .bind(input.published_at)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn upsert_many(
        &self,
        tenant_id: Uuid,
        inputs: &[CreateArticle],
    ) -> Result<Vec<Uuid>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { self.upsert_many_tx(tx, inputs).await })
        })
        .await
    }

    pub async fn upsert_many_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        inputs: &[CreateArticle],
    ) -> Result<Vec<Uuid>> {
        if inputs.is_empty() {
            return Ok(Vec::new());
        }

        for input in inputs {
            validate_max_bytes("title", &input.title, MAX_ARTICLE_TITLE_BYTES)?;
            if let Some(content) = input.content.as_deref() {
                validate_max_bytes("content", content, MAX_ARTICLE_CONTENT_BYTES)?;
            }
        }

        let mut qb: QueryBuilder<'_, Postgres> = QueryBuilder::new(
            r#"
                    INSERT INTO articles (source_id, title, link, content, author, published_at)
                    "#,
        );

        qb.push_values(inputs, |mut row, input| {
            row.push_bind(input.source_id)
                .push_bind(&input.title)
                .push_bind(&input.link)
                .push_bind(&input.content)
                .push_bind(&input.author)
                .push_bind(input.published_at);
        });

        qb.push(
            r#"
                    ON CONFLICT (tenant_id, link) DO UPDATE SET
                        source_id = EXCLUDED.source_id,
                        title = EXCLUDED.title,
                        content = COALESCE(EXCLUDED.content, articles.content),
                        author = COALESCE(EXCLUDED.author, articles.author),
                        published_at = COALESCE(EXCLUDED.published_at, articles.published_at),
                        updated_at = NOW()
                    WHERE
                        articles.deleted_at IS NULL
                        AND (
                            articles.source_id IS DISTINCT FROM EXCLUDED.source_id
                            OR articles.title IS DISTINCT FROM EXCLUDED.title
                            OR articles.content IS DISTINCT FROM COALESCE(EXCLUDED.content, articles.content)
                            OR articles.author IS DISTINCT FROM COALESCE(EXCLUDED.author, articles.author)
                            OR articles.published_at IS DISTINCT FROM COALESCE(EXCLUDED.published_at, articles.published_at)
                        )
                    RETURNING id
                    "#,
        );

        let ids = qb
            .build_query_as::<(Uuid,)>()
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .into_iter()
            .map(|row| row.0)
            .collect::<Vec<_>>();

        Ok(ids)
    }

    /// Update article
    pub async fn update(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        title: Option<&str>,
        content: Option<&str>,
        summary: Option<&str>,
        category_id: Option<Uuid>,
    ) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                self.update_tx(
                    tenant_id,
                    tx,
                    id,
                    UpdateArticlePatch {
                        title,
                        content,
                        summary,
                        category_id,
                    },
                    None,
                )
                .await
            })
        })
        .await
    }

    pub async fn update_tx<'a>(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        patch: UpdateArticlePatch<'a>,
        expected_version: Option<i64>,
    ) -> Result<Article> {
        if let Some(title) = patch.title {
            validate_max_bytes("title", title, MAX_ARTICLE_TITLE_BYTES)?;
        }
        if let Some(content) = patch.content {
            validate_max_bytes("content", content, MAX_ARTICLE_CONTENT_BYTES)?;
        }
        if let Some(summary) = patch.summary {
            validate_max_bytes("summary", summary, MAX_ARTICLE_SUMMARY_BYTES)?;
        }

        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let updated = sqlx::query_as::<_, Article>(
            r#"
            UPDATE articles SET
                title = COALESCE($2, title),
                content = COALESCE($3, content),
                summary = COALESCE($4, summary),
                category_id = COALESCE($5, category_id),
                updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
              AND ($6::bigint IS NULL OR version = $6)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(patch.title)
        .bind(patch.content)
        .bind(patch.summary)
        .bind(patch.category_id)
        .bind(expected_version)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if let Some(article) = updated {
            return Ok(article);
        }

        if let Some(expected_version) = expected_version {
            let current_version = sqlx::query_scalar::<_, i64>(
                "SELECT version FROM articles WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            if let Some(current_version) = current_version {
                return Err(Error::Conflict(format!(
                    "Article {id} version mismatch (expected {expected_version}, got {current_version})"
                )));
            }
        }

        Err(Error::NotFound(format!("Article {} not found", id)))
    }

    /// Delete article
    pub async fn delete(&self, tenant_id: Uuid, id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { self.delete_tx(tenant_id, tx, id, None).await })
        })
        .await
    }

    pub async fn delete_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        expected_version: Option<i64>,
    ) -> Result<()> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let result = sqlx::query(
            r#"
            UPDATE articles
            SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
              AND ($2::bigint IS NULL OR version = $2)
            "#,
        )
        .bind(id)
        .bind(expected_version)
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if result.rows_affected() == 0 {
            if let Some(expected_version) = expected_version {
                let current_version = sqlx::query_scalar::<_, i64>(
                    "SELECT version FROM articles WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if let Some(current_version) = current_version {
                    return Err(Error::Conflict(format!(
                        "Article {id} version mismatch (expected {expected_version}, got {current_version})"
                    )));
                }
            }

            return Err(Error::NotFound(format!("Article {} not found", id)));
        }
        Ok(())
    }

    pub async fn restore_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
    ) -> Result<Article> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let restored = sqlx::query_as::<_, Article>(
            r#"
            UPDATE articles
            SET deleted_at = NULL, updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NOT NULL
            RETURNING *
            "#,
        )
        .bind(id)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if let Some(article) = restored {
            return Ok(article);
        }

        let deleted_at: Option<Option<DateTime<Utc>>> =
            sqlx::query_scalar("SELECT deleted_at FROM articles WHERE id = $1")
                .bind(id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

        match deleted_at {
            None => Err(Error::NotFound(format!("Article {} not found", id))),
            Some(None) => Err(Error::Validation("Article is not deleted".into())),
            Some(Some(_)) => Err(Error::Internal(
                "Restore failed (record still deleted)".to_string(),
            )),
        }
    }

    pub async fn exists_by_link(&self, tenant_id: Uuid, link: &str) -> Result<bool> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result: (bool,) = sqlx::query_as(
                    "SELECT EXISTS(SELECT 1 FROM articles WHERE link = $1 AND deleted_at IS NULL)",
                )
                .bind(link)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(result.0)
            })
        })
        .await
    }

    pub async fn update_status(&self, tenant_id: Uuid, id: Uuid, status: &str) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { self.update_status_tx(tenant_id, tx, id, status, None).await })
        })
        .await
    }

    pub async fn update_status_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        status: &str,
        expected_version: Option<i64>,
    ) -> Result<Article> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let updated = sqlx::query_as::<_, Article>(
            r#"
            UPDATE articles
            SET status = $2, updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
              AND ($3::bigint IS NULL OR version = $3)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(status)
        .bind(expected_version)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if let Some(article) = updated {
            return Ok(article);
        }

        if let Some(expected_version) = expected_version {
            let current_version = sqlx::query_scalar::<_, i64>(
                "SELECT version FROM articles WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            if let Some(current_version) = current_version {
                return Err(Error::Conflict(format!(
                    "Article {id} version mismatch (expected {expected_version}, got {current_version})"
                )));
            }
        }

        Err(Error::NotFound(format!("Article {} not found", id)))
    }

    /// Batch update status
    pub async fn batch_update_status(
        &self,
        tenant_id: Uuid,
        ids: &[Uuid],
        status: &str,
    ) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                self.batch_update_status_tx(tenant_id, tx, ids, status)
                    .await
            })
        })
        .await
    }

    pub async fn batch_update_status_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        ids: &[Uuid],
        status: &str,
    ) -> Result<i64> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let result = sqlx::query(
            r#"
            UPDATE articles
            SET status = $2,
                updated_at = NOW(),
                version = version + 1
            WHERE id = ANY($1)
              AND deleted_at IS NULL
            "#,
        )
        .bind(ids)
        .bind(status)
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.rows_affected() as i64)
    }

    /// Batch update status with optimistic concurrency control (expected versions).
    ///
    /// If any item is missing or has a version mismatch, no rows are updated and the conflicts
    /// are returned for the caller to resolve.
    pub async fn batch_update_status_with_versions_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        items: &[BatchStatusVersionItem],
        status: &str,
    ) -> Result<BatchStatusWithVersionsResult> {
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let ids: Vec<Uuid> = items.iter().map(|item| item.id).collect();
        if ids.is_empty() {
            return Ok(BatchStatusWithVersionsResult {
                updated: 0,
                conflicts: Vec::new(),
                missing_ids: Vec::new(),
            });
        }

        // Lock existing rows to prevent TOCTOU on version checks.
        let rows = sqlx::query_as::<_, (Uuid, i64)>(
            r#"
            SELECT id, version
            FROM articles
            WHERE id = ANY($1)
              AND deleted_at IS NULL
            FOR UPDATE
            "#,
        )
        .bind(&ids)
        .fetch_all(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut current_versions = std::collections::HashMap::<Uuid, i64>::new();
        for (id, version) in rows {
            current_versions.insert(id, version);
        }

        let mut conflicts = Vec::new();
        let mut missing_ids = Vec::new();

        for item in items {
            match current_versions.get(&item.id) {
                None => missing_ids.push(item.id),
                Some(current) if *current != item.version => conflicts.push(BatchStatusConflict {
                    id: item.id,
                    expected_version: item.version,
                    current_version: *current,
                }),
                _ => {}
            }
        }

        if !conflicts.is_empty() || !missing_ids.is_empty() {
            return Ok(BatchStatusWithVersionsResult {
                updated: 0,
                conflicts,
                missing_ids,
            });
        }

        let result = sqlx::query(
            r#"
            UPDATE articles
            SET status = $2,
                updated_at = NOW(),
                version = version + 1
            WHERE id = ANY($1)
              AND deleted_at IS NULL
            "#,
        )
        .bind(&ids)
        .bind(status)
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(BatchStatusWithVersionsResult {
            updated: result.rows_affected() as i64,
            conflicts: Vec::new(),
            missing_ids: Vec::new(),
        })
    }

    pub async fn list_by_category(
        &self,
        tenant_id: Uuid,
        category_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                SELECT * FROM articles
                WHERE category_id = $1
                  AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT $2
                "#,
                )
                .bind(category_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn search(&self, tenant_id: Uuid, query: &str, limit: i64) -> Result<Vec<Article>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(vec![]);
        }

        // Legacy API: return articles only (no ranking/total). Keep for backward compatibility.
        with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
            sqlx::query_as::<_, Article>(
                r#"
                SELECT * FROM articles
                WHERE deleted_at IS NULL
                  AND to_tsvector('simple', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('simple', $1)
                ORDER BY created_at DESC
                LIMIT $2
                "#,
            )
            .bind(query)
            .bind(limit.clamp(1, 100))
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        }))
        .await
    }

    /// Keyword search with normalized relevance score and total count.
    pub async fn search_ranked(
        &self,
        tenant_id: Uuid,
        query: &str,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<ArticleSearchHit>, i64)> {
        let query = query.trim();
        if query.is_empty() {
            return Ok((vec![], 0));
        }

        let limit = limit.clamp(1, 50);
        let offset = offset.max(0);

        let rows: Vec<(Uuid, String, String, DateTime<Utc>, f64, i64)> =
            with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
                sqlx::query_as(
                    r#"
                    WITH q AS (
                        SELECT plainto_tsquery('simple', $1) AS query
                    ),
                    ranked AS (
                        SELECT
                            a.id,
                            a.title,
                            COALESCE(a.summary, LEFT(a.content, 200), '') AS excerpt,
                            ts_rank(
                                to_tsvector('simple', a.title || ' ' || COALESCE(a.content, '')),
                                q.query
                            ) AS rank,
                            a.created_at AS created_at,
                            COUNT(*) OVER() AS total
                        FROM articles a, q
                        WHERE a.deleted_at IS NULL
                          AND to_tsvector('simple', a.title || ' ' || COALESCE(a.content, '')) @@ q.query
                    ),
                    scored AS (
                        SELECT
                            id,
                            title,
                            excerpt,
                            created_at,
                            total,
                            CASE
                                WHEN MAX(rank) OVER() > 0 THEN rank / MAX(rank) OVER()
                                ELSE 0
                            END AS score
                        FROM ranked
                    )
                    SELECT
                        id,
                        title,
                        excerpt,
                        created_at,
                        GREATEST(LEAST(score, 1.0), 0.0)::float8 AS score,
                        total
                    FROM scored
                    ORDER BY score DESC, created_at DESC, id DESC
                    LIMIT $2 OFFSET $3
                    "#,
                )
                .bind(query)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            }))
            .await?;

        let total = rows
            .first()
            .map(|(_, _, _, _, _, total)| *total)
            .unwrap_or(0);
        let hits = rows
            .into_iter()
            .map(
                |(article_id, title, excerpt, created_at, score, _total)| ArticleSearchHit {
                    article_id,
                    title,
                    excerpt,
                    score,
                    created_at,
                },
            )
            .collect();

        Ok((hits, total))
    }

    pub async fn search_ranked_cursor(
        &self,
        tenant_id: Uuid,
        query: &str,
        limit: i64,
        cursor_score: f64,
        cursor_created_at: DateTime<Utc>,
        cursor_id: Uuid,
    ) -> Result<(Vec<ArticleSearchHit>, i64)> {
        let query = query.trim();
        if query.is_empty() {
            return Ok((vec![], 0));
        }

        let limit = limit.clamp(1, 51);

        let rows: Vec<(Uuid, String, String, DateTime<Utc>, f64, i64)> =
            with_tenant_tx(&self.pool, tenant_id, |tx| Box::pin(async move {
                sqlx::query_as(
                    r#"
                    WITH q AS (
                        SELECT plainto_tsquery('simple', $1) AS query
                    ),
                    ranked AS (
                        SELECT
                            a.id,
                            a.title,
                            COALESCE(a.summary, LEFT(a.content, 200), '') AS excerpt,
                            ts_rank(
                                to_tsvector('simple', a.title || ' ' || COALESCE(a.content, '')),
                                q.query
                            ) AS rank,
                            a.created_at AS created_at,
                            COUNT(*) OVER() AS total
                        FROM articles a, q
                        WHERE a.deleted_at IS NULL
                          AND to_tsvector('simple', a.title || ' ' || COALESCE(a.content, '')) @@ q.query
                    ),
                    scored AS (
                        SELECT
                            id,
                            title,
                            excerpt,
                            created_at,
                            total,
                            CASE
                                WHEN MAX(rank) OVER() > 0 THEN rank / MAX(rank) OVER()
                                ELSE 0
                            END AS score
                        FROM ranked
                    )
                    SELECT
                        id,
                        title,
                        excerpt,
                        created_at,
                        GREATEST(LEAST(score, 1.0), 0.0)::float8 AS score,
                        total
                    FROM scored
                    WHERE
                        score < $3
                        OR (score = $3 AND created_at < $4)
                        OR (score = $3 AND created_at = $4 AND id < $5)
                    ORDER BY score DESC, created_at DESC, id DESC
                    LIMIT $2
                    "#,
                )
                .bind(query)
                .bind(limit)
                .bind(cursor_score)
                .bind(cursor_created_at)
                .bind(cursor_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            }))
            .await?;

        let total = rows
            .first()
            .map(|(_, _, _, _, _, total)| *total)
            .unwrap_or(0);
        let hits = rows
            .into_iter()
            .map(
                |(article_id, title, excerpt, created_at, score, _total)| ArticleSearchHit {
                    article_id,
                    title,
                    excerpt,
                    score,
                    created_at,
                },
            )
            .collect();

        Ok((hits, total))
    }

    /// Get statistics for dashboard
    pub async fn get_stats(&self, tenant_id: Uuid) -> Result<ArticleStats> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let total: (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL")
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                let published: (i64,) =
                    sqlx::query_as(
                        "SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND status = 'published'",
                    )
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;

                let pending: (i64,) =
                    sqlx::query_as(
                        "SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND status = 'pending'",
                    )
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;

                // Count high risk articles (risk_score > 70). `NULL` risk_score will be excluded naturally.
                let high_risk: (i64,) =
                    sqlx::query_as(
                        "SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND risk_score > 70",
                    )
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;

                let today: (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND created_at >= CURRENT_DATE",
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(ArticleStats {
                    total: total.0,
                    published: published.0,
                    pending: pending.0,
                    high_risk: high_risk.0,
                    today: today.0,
                })
            })
        })
        .await
    }

    /// Get recent articles for dashboard
    pub async fn list_recent(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<Article>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                SELECT * FROM articles
                WHERE deleted_at IS NULL
                  AND status = 'published'
                ORDER BY published_at DESC NULLS LAST, created_at DESC
                LIMIT $1
                "#,
                )
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn get_daily_trend(
        &self,
        tenant_id: Uuid,
        days: i64,
    ) -> Result<Vec<ArticleDailyTrendPoint>> {
        let days = days.clamp(1, 90);

        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, (NaiveDate, i64)>(
                    r#"
                WITH days AS (
                    SELECT generate_series(
                        CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'),
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    )::date AS day
                )
                SELECT
                    days.day AS date,
                    COALESCE(COUNT(a.id), 0)::bigint AS count
                FROM days
                LEFT JOIN articles a
                    ON a.created_at >= days.day::timestamptz
                   AND a.created_at < (days.day::timestamptz + INTERVAL '1 day')
                   AND a.deleted_at IS NULL
                GROUP BY days.day
                ORDER BY days.day ASC
                "#,
                )
                .bind(days)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        Ok(rows
            .into_iter()
            .map(|(date, count)| ArticleDailyTrendPoint { date, count })
            .collect())
    }

    pub async fn get_category_counts(&self, tenant_id: Uuid) -> Result<Vec<ArticleCategoryCount>> {
        let rows = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, (Option<Uuid>, i64)>(
                    r#"
                SELECT category_id, COUNT(*)::bigint AS count
                FROM articles
                WHERE deleted_at IS NULL
                GROUP BY category_id
                "#,
                )
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        Ok(rows
            .into_iter()
            .map(|(category_id, count)| ArticleCategoryCount { category_id, count })
            .collect())
    }

    pub async fn get_analytics_summary(&self, tenant_id: Uuid) -> Result<ArticleAnalyticsSummary> {
        let row: ArticleAnalyticsSummaryRow = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as(
                    r#"
                SELECT
                    COUNT(*)::bigint AS total,

                    COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
                    COUNT(*) FILTER (WHERE status = 'processing')::bigint AS processing,
                    COUNT(*) FILTER (WHERE status = 'published')::bigint AS published,
                    COUNT(*) FILTER (WHERE status = 'archived')::bigint AS archived,
                    COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected,

                    COUNT(*) FILTER (WHERE risk_score IS NULL)::bigint AS risk_unknown,
                    COUNT(*) FILTER (WHERE risk_score BETWEEN 0 AND 25)::bigint AS risk_low,
                    COUNT(*) FILTER (WHERE risk_score BETWEEN 26 AND 50)::bigint AS risk_medium,
                    COUNT(*) FILTER (WHERE risk_score BETWEEN 51 AND 75)::bigint AS risk_high,
                    COUNT(*) FILTER (WHERE risk_score >= 76)::bigint AS risk_critical,

                    COUNT(*) FILTER (WHERE sentiment IS NULL)::bigint AS sentiment_unknown,
                    COUNT(*) FILTER (WHERE sentiment = 'positive')::bigint AS sentiment_positive,
                    COUNT(*) FILTER (WHERE sentiment = 'neutral')::bigint AS sentiment_neutral,
                    COUNT(*) FILTER (WHERE sentiment = 'negative')::bigint AS sentiment_negative,
                    COUNT(*) FILTER (WHERE sentiment = 'mixed')::bigint AS sentiment_mixed
                FROM articles
                WHERE deleted_at IS NULL
                "#,
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        Ok(ArticleAnalyticsSummary {
            total: row.total,
            status: ArticleStatusCounts {
                pending: row.pending,
                processing: row.processing,
                published: row.published,
                archived: row.archived,
                rejected: row.rejected,
            },
            risk: ArticleRiskCounts {
                unknown: row.risk_unknown,
                low: row.risk_low,
                medium: row.risk_medium,
                high: row.risk_high,
                critical: row.risk_critical,
            },
            sentiment: ArticleSentimentCounts {
                unknown: row.sentiment_unknown,
                positive: row.sentiment_positive,
                neutral: row.sentiment_neutral,
                negative: row.sentiment_negative,
                mixed: row.sentiment_mixed,
            },
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BatchStatusVersionItem {
    pub id: Uuid,
    pub version: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct BatchStatusConflict {
    pub id: Uuid,
    pub expected_version: i64,
    pub current_version: i64,
}

#[derive(Debug, Clone)]
pub struct BatchStatusWithVersionsResult {
    pub updated: i64,
    pub conflicts: Vec<BatchStatusConflict>,
    pub missing_ids: Vec<Uuid>,
}

fn push_article_filters<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    category_id: Option<Uuid>,
    status: Option<&'a str>,
) {
    qb.push(" WHERE deleted_at IS NULL");

    if let Some(category_id) = category_id {
        qb.push(" AND category_id = ");
        qb.push_bind(category_id);
    }

    if let Some(status) = status {
        qb.push(" AND status = ");
        qb.push_bind(status);
    }
}
