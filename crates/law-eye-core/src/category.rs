use law_eye_common::{Error, Result};
use law_eye_db::{Category, CreateCategory, UpdateCategory};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

pub struct CategoryService {
    pool: PgPool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryImportRow {
    pub slug: String,
    pub name: String,
    pub parent_slug: Option<String>,
    pub visibility_tier: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImportSummary {
    pub created: i32,
    pub updated: i32,
    pub skipped: i32,
}

impl CategoryService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Category>> {
        sqlx::query_as::<_, Category>(
            "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn list_admin(&self, include_deleted: bool) -> Result<Vec<Category>> {
        let sql = if include_deleted {
            "SELECT * FROM categories ORDER BY sort_order, name"
        } else {
            "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name"
        };
        sqlx::query_as::<_, Category>(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_slug(&self, slug: &str) -> Result<Category> {
        sqlx::query_as::<_, Category>(
            "SELECT * FROM categories WHERE slug = $1 AND deleted_at IS NULL",
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::NotFound(format!("Category {} not found", slug)))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Category> {
        sqlx::query_as::<_, Category>(
            "SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::NotFound(format!("Category {} not found", id)))
    }

    pub async fn create(&self, input: CreateCategory) -> Result<Category> {
        let visibility_tier = normalize_visibility(input.visibility_tier.as_deref())?;

        if let Some(parent_id) = input.parent_id {
            self.assert_parent_exists(parent_id).await?;
        }

        // Reject duplicate live slugs early so we can surface a Conflict instead
        // of leaking the underlying unique-violation error.
        let existing = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM categories WHERE slug = $1 AND deleted_at IS NULL",
        )
        .bind(&input.slug)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        if existing > 0 {
            return Err(Error::Conflict(format!(
                "Category slug '{}' already exists",
                input.slug
            )));
        }

        let sort_order = match input.sort_order {
            Some(value) => value,
            None => self.next_sort_order(input.parent_id).await?,
        };

        sqlx::query_as::<_, Category>(
            r#"
            INSERT INTO categories
                (slug, name, description, parent_id, sort_order, icon, color, visibility_tier)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            "#,
        )
        .bind(&input.slug)
        .bind(&input.name)
        .bind(&input.description)
        .bind(input.parent_id)
        .bind(sort_order)
        .bind(&input.icon)
        .bind(&input.color)
        .bind(&visibility_tier)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn update(&self, id: Uuid, input: UpdateCategory) -> Result<Category> {
        let current = self.get_by_id(id).await?;

        // Cycle detection: if parent_id is being changed, ensure it does not
        // make `id` reachable from `new_parent_id` via parent-chain traversal.
        if let Some(new_parent) = input.parent_id {
            if let Some(new_parent_id) = new_parent {
                if new_parent_id == id {
                    return Err(Error::Validation(
                        "Category cannot be its own parent".to_string(),
                    ));
                }
                self.assert_parent_exists(new_parent_id).await?;
                self.assert_no_cycle(id, new_parent_id).await?;
            }
        }

        if let Some(slug) = input.slug.as_ref() {
            if slug != &current.slug {
                let conflict = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM categories WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL",
                )
                .bind(slug)
                .bind(id)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                if conflict > 0 {
                    return Err(Error::Conflict(format!(
                        "Category slug '{}' already exists",
                        slug
                    )));
                }
            }
        }

        let visibility_tier = match input.visibility_tier.as_deref() {
            Some(value) => Some(normalize_visibility(Some(value))?),
            None => None,
        };

        sqlx::query_as::<_, Category>(
            r#"
            UPDATE categories
            SET
                slug            = COALESCE($2, slug),
                name            = COALESCE($3, name),
                description     = CASE WHEN $4::BOOLEAN THEN $5 ELSE description END,
                parent_id       = CASE WHEN $6::BOOLEAN THEN $7 ELSE parent_id END,
                icon            = CASE WHEN $8::BOOLEAN THEN $9 ELSE icon END,
                color           = CASE WHEN $10::BOOLEAN THEN $11 ELSE color END,
                visibility_tier = COALESCE($12, visibility_tier),
                sort_order      = COALESCE($13, sort_order)
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(input.slug.as_deref())
        .bind(input.name.as_deref())
        .bind(input.description.is_some())
        .bind(input.description.as_ref().and_then(|v| v.as_deref()))
        .bind(input.parent_id.is_some())
        .bind(input.parent_id.and_then(|v| v))
        .bind(input.icon.is_some())
        .bind(input.icon.as_ref().and_then(|v| v.as_deref()))
        .bind(input.color.is_some())
        .bind(input.color.as_ref().and_then(|v| v.as_deref()))
        .bind(visibility_tier.as_deref())
        .bind(input.sort_order)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::NotFound(format!("Category {} not found", id)))
    }

    pub async fn soft_delete(&self, id: Uuid) -> Result<()> {
        // Refuse to delete a category that has live children or articles.
        let child_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM categories WHERE parent_id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        if child_count > 0 {
            return Err(Error::Conflict(
                "Cannot delete a category that still has child categories".to_string(),
            ));
        }

        let article_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM articles WHERE category_id = $1",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        if article_count > 0 {
            return Err(Error::Conflict(format!(
                "Cannot delete a category referenced by {} articles",
                article_count
            )));
        }

        let result = sqlx::query(
            "UPDATE categories SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        if result.rows_affected() == 0 {
            return Err(Error::NotFound(format!("Category {} not found", id)));
        }
        Ok(())
    }

    /// Move a category under a new parent (or to root) and place it at the
    /// requested `sort_order`. Cycle detection is enforced before any write.
    pub async fn reorder(
        &self,
        id: Uuid,
        new_parent_id: Option<Uuid>,
        new_sort_order: i32,
    ) -> Result<Category> {
        if let Some(parent_id) = new_parent_id {
            if parent_id == id {
                return Err(Error::Validation(
                    "Category cannot be its own parent".to_string(),
                ));
            }
            self.assert_parent_exists(parent_id).await?;
            self.assert_no_cycle(id, parent_id).await?;
        }

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // Shift siblings >= new_sort_order in the destination bucket so the
        // moved row can claim the slot atomically.
        match new_parent_id {
            Some(parent_id) => {
                sqlx::query(
                    r#"
                    UPDATE categories
                    SET sort_order = sort_order + 1
                    WHERE parent_id = $1
                      AND id <> $2
                      AND sort_order >= $3
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(parent_id)
                .bind(id)
                .bind(new_sort_order)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
            }
            None => {
                sqlx::query(
                    r#"
                    UPDATE categories
                    SET sort_order = sort_order + 1
                    WHERE parent_id IS NULL
                      AND id <> $1
                      AND sort_order >= $2
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(id)
                .bind(new_sort_order)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
            }
        }

        let row = sqlx::query_as::<_, Category>(
            r#"
            UPDATE categories
            SET parent_id = $2, sort_order = $3
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(new_parent_id)
        .bind(new_sort_order)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::NotFound(format!("Category {} not found", id)))?;

        tx.commit()
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(row)
    }

    /// Bulk import via slug-keyed upsert. Each row is matched on slug; existing
    /// rows get an UPDATE, new rows get an INSERT. Wrapped in a single tx so a
    /// validation failure on row N rolls back rows 0..N-1.
    pub async fn bulk_import(&self, rows: Vec<CategoryImportRow>) -> Result<ImportSummary> {
        let mut summary = ImportSummary::default();
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // Resolve parent_slug -> id once up-front so the import does not depend
        // on row order.
        let mut slug_to_id = std::collections::HashMap::<String, Uuid>::new();
        let existing = sqlx::query_as::<_, (Uuid, String)>(
            "SELECT id, slug FROM categories WHERE deleted_at IS NULL",
        )
        .fetch_all(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        for (id, slug) in existing {
            slug_to_id.insert(slug, id);
        }

        for row in rows.iter() {
            if row.slug.trim().is_empty() || row.name.trim().is_empty() {
                summary.skipped += 1;
                continue;
            }
            let visibility_tier = normalize_visibility(row.visibility_tier.as_deref())?;
            let parent_id = match row.parent_slug.as_deref() {
                None => None,
                Some(parent_slug) if parent_slug.is_empty() => None,
                Some(parent_slug) => Some(slug_to_id.get(parent_slug).copied().ok_or_else(|| {
                    Error::Validation(format!(
                        "Parent slug '{}' not found for row '{}'",
                        parent_slug, row.slug
                    ))
                })?),
            };
            let upserted = upsert_one_in_tx(
                &mut tx,
                &row.slug,
                &row.name,
                row.description.as_deref(),
                parent_id,
                row.icon.as_deref(),
                row.color.as_deref(),
                &visibility_tier,
            )
            .await?;
            slug_to_id.insert(row.slug.clone(), upserted.0);
            if upserted.1 {
                summary.created += 1;
            } else {
                summary.updated += 1;
            }
        }

        tx.commit()
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(summary)
    }

    async fn assert_parent_exists(&self, parent_id: Uuid) -> Result<()> {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM categories WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(parent_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        if exists == 0 {
            return Err(Error::NotFound(format!(
                "Parent category {} not found",
                parent_id
            )));
        }
        Ok(())
    }

    /// Walk parent chain from `candidate_parent` upwards. If we encounter
    /// `node_id`, the move would create a cycle.
    async fn assert_no_cycle(&self, node_id: Uuid, candidate_parent: Uuid) -> Result<()> {
        let mut current = Some(candidate_parent);
        let mut depth = 0;
        while let Some(parent_id) = current {
            if depth > 32 {
                return Err(Error::Validation(
                    "Category hierarchy depth exceeds 32".to_string(),
                ));
            }
            if parent_id == node_id {
                return Err(Error::Validation(
                    "Reparenting would create a cycle".to_string(),
                ));
            }
            current = sqlx::query_scalar::<_, Option<Uuid>>(
                "SELECT parent_id FROM categories WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(parent_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .flatten();
            depth += 1;
        }
        Ok(())
    }

    async fn next_sort_order(&self, parent_id: Option<Uuid>) -> Result<i32> {
        let max: Option<i32> = match parent_id {
            Some(pid) => sqlx::query_scalar::<_, Option<i32>>(
                "SELECT MAX(sort_order) FROM categories WHERE parent_id = $1 AND deleted_at IS NULL",
            )
            .bind(pid)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?,
            None => sqlx::query_scalar::<_, Option<i32>>(
                "SELECT MAX(sort_order) FROM categories WHERE parent_id IS NULL AND deleted_at IS NULL",
            )
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?,
        };
        Ok(max.unwrap_or(0) + 1)
    }
}

fn normalize_visibility(value: Option<&str>) -> Result<String> {
    let raw = value.unwrap_or("verified").trim();
    let lower = raw.to_lowercase();
    match lower.as_str() {
        "basic" | "verified" | "premium" => Ok(lower),
        "" => Ok("verified".to_string()),
        other => Err(Error::Validation(format!(
            "visibility_tier must be basic|verified|premium (got '{}')",
            other
        ))),
    }
}

#[allow(clippy::too_many_arguments)]
async fn upsert_one_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    slug: &str,
    name: &str,
    description: Option<&str>,
    parent_id: Option<Uuid>,
    icon: Option<&str>,
    color: Option<&str>,
    visibility_tier: &str,
) -> Result<(Uuid, bool)> {
    // Returning (id, inserted) so the caller can keep created/updated counts.
    let row: (Uuid, bool) = sqlx::query_as(
        r#"
        INSERT INTO categories
            (slug, name, description, parent_id, sort_order, icon, color, visibility_tier)
        VALUES ($1, $2, $3, $4,
                COALESCE((SELECT MAX(sort_order) + 1 FROM categories
                          WHERE (parent_id IS NOT DISTINCT FROM $4) AND deleted_at IS NULL), 1),
                $5, $6, $7)
        ON CONFLICT (slug) DO UPDATE
            SET name            = EXCLUDED.name,
                description     = EXCLUDED.description,
                parent_id       = EXCLUDED.parent_id,
                icon            = EXCLUDED.icon,
                color           = EXCLUDED.color,
                visibility_tier = EXCLUDED.visibility_tier,
                deleted_at      = NULL
        RETURNING id, (xmax = 0) AS inserted
        "#,
    )
    .bind(slug)
    .bind(name)
    .bind(description)
    .bind(parent_id)
    .bind(icon)
    .bind(color)
    .bind(visibility_tier)
    .fetch_one(tx.as_mut())
    .await
    .map_err(|e| Error::Database(e.to_string()))?;
    Ok(row)
}
