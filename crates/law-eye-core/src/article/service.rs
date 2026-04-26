use super::*;
use crate::tenant::with_tenant_tx;
use law_eye_db::CreateArticle;
use sqlx::Transaction;

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
                INSERT INTO articles (
                    source_id, title, link, content, author, published_at,
                    domain_root, domain_sub, authority_level, importance,
                    issuer, doc_number, effective_date, region_code, content_hash
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *
                "#,
                )
                .bind(input.source_id)
                .bind(&input.title)
                .bind(&input.link)
                .bind(&input.content)
                .bind(&input.author)
                .bind(input.published_at)
                .bind(&input.domain_root)
                .bind(&input.domain_sub)
                .bind(input.authority_level)
                .bind(input.importance)
                .bind(&input.issuer)
                .bind(&input.doc_number)
                .bind(input.effective_date)
                .bind(&input.region_code)
                .bind(&input.content_hash)
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

        // PG max bind params = 65535; each row uses 15 params → safe batch = 500
        const UPSERT_BATCH_SIZE: usize = 500;

        if inputs.len() > UPSERT_BATCH_SIZE {
            let mut all_ids = Vec::with_capacity(inputs.len());
            for chunk in inputs.chunks(UPSERT_BATCH_SIZE) {
                let mut chunk_ids = self.upsert_many_batch(tx, chunk).await?;
                all_ids.append(&mut chunk_ids);
            }
            return Ok(all_ids);
        }

        let mut qb: QueryBuilder<'_, Postgres> = QueryBuilder::new(
            r#"
                    INSERT INTO articles (
                        source_id, title, link, content, author, published_at,
                        domain_root, domain_sub, authority_level, importance,
                        issuer, doc_number, effective_date, region_code, content_hash
                    )
                    "#,
        );

        qb.push_values(inputs, |mut row, input| {
            row.push_bind(input.source_id)
                .push_bind(&input.title)
                .push_bind(&input.link)
                .push_bind(&input.content)
                .push_bind(&input.author)
                .push_bind(input.published_at)
                .push_bind(&input.domain_root)
                .push_bind(&input.domain_sub)
                .push_bind(input.authority_level)
                .push_bind(input.importance)
                .push_bind(&input.issuer)
                .push_bind(&input.doc_number)
                .push_bind(input.effective_date)
                .push_bind(&input.region_code)
                .push_bind(&input.content_hash);
        });

        qb.push(
            r#"
                    ON CONFLICT (tenant_id, link) DO UPDATE SET
                        source_id = EXCLUDED.source_id,
                        title = EXCLUDED.title,
                        content = COALESCE(EXCLUDED.content, articles.content),
                        author = COALESCE(EXCLUDED.author, articles.author),
                        published_at = COALESCE(EXCLUDED.published_at, articles.published_at),
                        domain_root = COALESCE(EXCLUDED.domain_root, articles.domain_root),
                        domain_sub = COALESCE(EXCLUDED.domain_sub, articles.domain_sub),
                        authority_level = COALESCE(EXCLUDED.authority_level, articles.authority_level),
                        importance = COALESCE(EXCLUDED.importance, articles.importance),
                        issuer = COALESCE(EXCLUDED.issuer, articles.issuer),
                        doc_number = COALESCE(EXCLUDED.doc_number, articles.doc_number),
                        effective_date = COALESCE(EXCLUDED.effective_date, articles.effective_date),
                        region_code = COALESCE(EXCLUDED.region_code, articles.region_code),
                        content_hash = COALESCE(EXCLUDED.content_hash, articles.content_hash),
                        updated_at = NOW()
                    WHERE
                        articles.deleted_at IS NULL
                        AND (
                            articles.source_id IS DISTINCT FROM EXCLUDED.source_id
                            OR articles.title IS DISTINCT FROM EXCLUDED.title
                            OR articles.content IS DISTINCT FROM COALESCE(EXCLUDED.content, articles.content)
                            OR articles.author IS DISTINCT FROM COALESCE(EXCLUDED.author, articles.author)
                            OR articles.published_at IS DISTINCT FROM COALESCE(EXCLUDED.published_at, articles.published_at)
                            OR articles.domain_root IS DISTINCT FROM COALESCE(EXCLUDED.domain_root, articles.domain_root)
                            OR articles.domain_sub IS DISTINCT FROM COALESCE(EXCLUDED.domain_sub, articles.domain_sub)
                            OR articles.authority_level IS DISTINCT FROM COALESCE(EXCLUDED.authority_level, articles.authority_level)
                            OR articles.importance IS DISTINCT FROM COALESCE(EXCLUDED.importance, articles.importance)
                            OR articles.content_hash IS DISTINCT FROM COALESCE(EXCLUDED.content_hash, articles.content_hash)
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

    /// Internal helper for batched upsert (no validation, caller must validate first).
    async fn upsert_many_batch(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        inputs: &[CreateArticle],
    ) -> Result<Vec<Uuid>> {
        if inputs.is_empty() {
            return Ok(Vec::new());
        }

        let mut qb: QueryBuilder<'_, Postgres> = QueryBuilder::new(
            r#"
                    INSERT INTO articles (
                        source_id, title, link, content, author, published_at,
                        domain_root, domain_sub, authority_level, importance,
                        issuer, doc_number, effective_date, region_code, content_hash
                    )
                    "#,
        );

        qb.push_values(inputs, |mut row, input| {
            row.push_bind(input.source_id)
                .push_bind(&input.title)
                .push_bind(&input.link)
                .push_bind(&input.content)
                .push_bind(&input.author)
                .push_bind(input.published_at)
                .push_bind(&input.domain_root)
                .push_bind(&input.domain_sub)
                .push_bind(input.authority_level)
                .push_bind(input.importance)
                .push_bind(&input.issuer)
                .push_bind(&input.doc_number)
                .push_bind(input.effective_date)
                .push_bind(&input.region_code)
                .push_bind(&input.content_hash);
        });

        qb.push(
            r#"
                    ON CONFLICT (tenant_id, link) DO UPDATE SET
                        source_id = EXCLUDED.source_id,
                        title = EXCLUDED.title,
                        content = COALESCE(EXCLUDED.content, articles.content),
                        author = COALESCE(EXCLUDED.author, articles.author),
                        published_at = COALESCE(EXCLUDED.published_at, articles.published_at),
                        domain_root = COALESCE(EXCLUDED.domain_root, articles.domain_root),
                        domain_sub = COALESCE(EXCLUDED.domain_sub, articles.domain_sub),
                        authority_level = COALESCE(EXCLUDED.authority_level, articles.authority_level),
                        importance = COALESCE(EXCLUDED.importance, articles.importance),
                        issuer = COALESCE(EXCLUDED.issuer, articles.issuer),
                        doc_number = COALESCE(EXCLUDED.doc_number, articles.doc_number),
                        effective_date = COALESCE(EXCLUDED.effective_date, articles.effective_date),
                        region_code = COALESCE(EXCLUDED.region_code, articles.region_code),
                        content_hash = COALESCE(EXCLUDED.content_hash, articles.content_hash),
                        updated_at = NOW()
                    WHERE
                        articles.deleted_at IS NULL
                        AND (
                            articles.source_id IS DISTINCT FROM EXCLUDED.source_id
                            OR articles.title IS DISTINCT FROM EXCLUDED.title
                            OR articles.content IS DISTINCT FROM COALESCE(EXCLUDED.content, articles.content)
                            OR articles.author IS DISTINCT FROM COALESCE(EXCLUDED.author, articles.author)
                            OR articles.published_at IS DISTINCT FROM COALESCE(EXCLUDED.published_at, articles.published_at)
                            OR articles.domain_root IS DISTINCT FROM COALESCE(EXCLUDED.domain_root, articles.domain_root)
                            OR articles.domain_sub IS DISTINCT FROM COALESCE(EXCLUDED.domain_sub, articles.domain_sub)
                            OR articles.authority_level IS DISTINCT FROM COALESCE(EXCLUDED.authority_level, articles.authority_level)
                            OR articles.importance IS DISTINCT FROM COALESCE(EXCLUDED.importance, articles.importance)
                            OR articles.content_hash IS DISTINCT FROM COALESCE(EXCLUDED.content_hash, articles.content_hash)
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

    /// Persist sentiment-analysis output for a single article.
    ///
    /// Writes the four sentiment-related columns (`sentiment`, `sentiment_score`,
    /// `sentiment_rationale`, `sentiment_aspect`) added by migration 065. All
    /// non-label fields are optional — pass `None` to leave the column NULL.
    ///
    /// Validates inputs against the DB CHECK constraints **before** issuing the UPDATE
    /// so callers receive a clear validation error instead of an opaque database error:
    /// * `sentiment` must be one of `positive` / `neutral` / `negative` / `mixed`.
    /// * `sentiment_score`, when supplied, must be in `[0.0, 1.0]`.
    /// * `sentiment_aspect`, when supplied, must be one of the values whitelisted in
    ///   migration 065 (`compliance`, `penalty`, `litigation`, `policy_change`,
    ///   `industry_trend`, `regulatory_impact`, `company_reputation`,
    ///   `policy_direction`, `other`).
    pub async fn update_article_sentiment(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        sentiment: &str,
        sentiment_score: Option<f64>,
        sentiment_rationale: Option<&str>,
        sentiment_aspect: Option<&str>,
    ) -> Result<Article> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                self.update_article_sentiment_tx(
                    tenant_id,
                    tx,
                    id,
                    sentiment,
                    sentiment_score,
                    sentiment_rationale,
                    sentiment_aspect,
                )
                .await
            })
        })
        .await
    }

    pub async fn update_article_sentiment_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        sentiment: &str,
        sentiment_score: Option<f64>,
        sentiment_rationale: Option<&str>,
        sentiment_aspect: Option<&str>,
    ) -> Result<Article> {
        validate_sentiment_label(sentiment)?;
        if let Some(score) = sentiment_score {
            validate_sentiment_score(score)?;
        }
        if let Some(aspect) = sentiment_aspect {
            validate_sentiment_aspect(aspect)?;
        }

        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let updated = sqlx::query_as::<_, Article>(
            r#"
            UPDATE articles SET
                sentiment = $2,
                sentiment_score = $3,
                sentiment_rationale = COALESCE($4, sentiment_rationale),
                sentiment_aspect = COALESCE($5, sentiment_aspect),
                updated_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(sentiment)
        .bind(sentiment_score)
        .bind(sentiment_rationale)
        .bind(sentiment_aspect)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        updated.ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
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

    /// Get statistics for dashboard (single query instead of 5 separate COUNTs)
    pub async fn get_stats(&self, tenant_id: Uuid) -> Result<ArticleStats> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let row: (i64, i64, i64, i64, i64) = sqlx::query_as(
                    r#"
                    SELECT
                        COUNT(*)::bigint AS total,
                        COUNT(*) FILTER (WHERE status = 'published')::bigint AS published,
                        COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
                        COUNT(*) FILTER (WHERE risk_score > 70)::bigint AS high_risk,
                        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::bigint AS today
                    FROM articles
                    WHERE deleted_at IS NULL
                    "#,
                )
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(ArticleStats {
                    total: row.0,
                    published: row.1,
                    pending: row.2,
                    high_risk: row.3,
                    today: row.4,
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

    /// Personalized recommendation via app-tier embedding centroid + pgvector
    /// cosine search.
    ///
    /// 1. Caller supplies `seed_article_ids` (the user's recent finished reads)
    ///    and `excluded_article_ids` (everything they've already opened).
    /// 2. We pull `chunk_index = 0` embeddings for the seeds, average them in
    ///    Rust to a centroid, then run a cosine ANN search against the same
    ///    column (`embedding`) for the most similar published articles.
    /// 3. Visible categories are passed in by the route layer (already
    ///    tier-filtered); `None` means "no category restriction" (premium /
    ///    admin tiers).
    /// 4. Returns up to `limit` `Article` rows ordered by similarity desc.
    ///    Caller falls back to the MVP path when this returns an empty vec.
    pub async fn recommend_personalized(
        &self,
        tenant_id: Uuid,
        seed_article_ids: &[Uuid],
        excluded_article_ids: &[Uuid],
        visible_category_ids: Option<&[Uuid]>,
        limit: i64,
    ) -> Result<Vec<Article>> {
        if seed_article_ids.is_empty() {
            return Ok(Vec::new());
        }
        let limit = limit.clamp(1, 50);

        let seed_ids = seed_article_ids.to_vec();
        let excluded = excluded_article_ids.to_vec();
        let category_filter: Option<Vec<Uuid>> =
            visible_category_ids.map(|slice| slice.to_vec());

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // Step 1: pull chunk_index=0 embeddings for the seeds. Use
                // float4 array projection so we can average client-side
                // without depending on a pgvector Rust adapter.
                let seed_embeddings: Vec<Vec<f32>> = sqlx::query_scalar::<_, Vec<f32>>(
                    r#"
                    SELECT embedding::real[]
                    FROM article_chunks
                    WHERE article_id = ANY($1)
                      AND chunk_index = 0
                      AND embedding IS NOT NULL
                    "#,
                )
                .bind(&seed_ids)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if seed_embeddings.is_empty() {
                    return Ok(Vec::new());
                }

                // Step 2: average to a centroid. Vectors share a fixed
                // dimension (1536) since they come from the same column.
                let dim = seed_embeddings[0].len();
                let mut centroid = vec![0f32; dim];
                let mut counted = 0usize;
                for vec in &seed_embeddings {
                    if vec.len() != dim {
                        continue;
                    }
                    for (i, v) in vec.iter().enumerate() {
                        centroid[i] += *v;
                    }
                    counted += 1;
                }
                if counted == 0 {
                    return Ok(Vec::new());
                }
                let denom = counted as f32;
                for v in &mut centroid {
                    *v /= denom;
                }

                // Step 3: cosine ANN. Filter by tenant + visible categories +
                // exclude already-read. We fetch chunk-level matches first,
                // then dedupe to the article level.
                let category_filter_active = category_filter.is_some();
                let category_arg = category_filter.unwrap_or_default();

                // Fetch ~3x candidate chunks so we can dedupe per article.
                let candidate_chunk_limit = (limit * 4).clamp(limit, 200);

                let rows: Vec<Article> = sqlx::query_as::<_, Article>(
                    r#"
                    WITH ranked AS (
                        SELECT
                            c.article_id,
                            MIN(c.embedding <=> $1::vector) AS dist
                        FROM article_chunks c
                        WHERE c.embedding IS NOT NULL
                          AND c.tenant_id = $2
                          AND ($3::BOOLEAN = false OR NOT (c.article_id = ANY($4)))
                        GROUP BY c.article_id
                        ORDER BY dist ASC
                        LIMIT $5
                    )
                    SELECT a.*
                    FROM ranked r
                    JOIN articles a
                      ON a.id = r.article_id
                     AND a.tenant_id = $2
                    WHERE a.deleted_at IS NULL
                      AND a.status = 'published'
                      AND ($6::BOOLEAN = false OR a.category_id = ANY($7))
                    ORDER BY r.dist ASC
                    LIMIT $8
                    "#,
                )
                .bind(&centroid)
                .bind(tenant_id)
                .bind(!excluded.is_empty())
                .bind(&excluded)
                .bind(candidate_chunk_limit)
                .bind(category_filter_active)
                .bind(&category_arg)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(rows)
            })
        })
        .await
    }
}
