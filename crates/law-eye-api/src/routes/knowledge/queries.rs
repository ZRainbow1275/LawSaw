use chrono::{DateTime, Utc};
use law_eye_core::with_tenant_tx;
use sqlx::PgPool;
use uuid::Uuid;

use super::dto::{BackfillResponse, EntityArticleResponse, KnowledgeEntityResponse};
use crate::{ApiResult, AppError};

pub(super) fn clamp_limit(value: Option<i64>, default: i64, max: i64) -> i64 {
    value.unwrap_or(default).clamp(1, max)
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct RelatedEntityRow {
    pub id: Uuid,
    pub name: String,
    pub entity_type: String,
    pub aliases: Vec<String>,
    pub properties: serde_json::Value,
    pub mention_count: i32,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub relation_type: String,
    pub weight: f64,
}

impl From<RelatedEntityRow> for KnowledgeEntityResponse {
    fn from(row: RelatedEntityRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            entity_type: row.entity_type,
            aliases: row.aliases,
            properties: row.properties,
            mention_count: row.mention_count,
            first_seen: row.first_seen,
            last_seen: row.last_seen,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub(super) async fn fetch_related_entities(
    pool: &PgPool,
    tenant_id: Uuid,
    id: Uuid,
    limit: i64,
) -> ApiResult<(Vec<RelatedEntityRow>, Vec<RelatedEntityRow>)> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            let outgoing = sqlx::query_as::<_, RelatedEntityRow>(
                r#"
            SELECT
                e.id,
                e.name,
                e.entity_type,
                e.aliases,
                e.properties,
                e.mention_count,
                e.first_seen,
                e.last_seen,
                e.created_at,
                e.updated_at,
                r.relation_type,
                r.weight
            FROM entity_relations r
            JOIN entities e ON e.id = r.target_entity_id
            WHERE r.source_entity_id = $1
            ORDER BY r.weight DESC
            LIMIT $2
            "#,
            )
            .bind(id)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;

            let incoming = sqlx::query_as::<_, RelatedEntityRow>(
                r#"
            SELECT
                e.id,
                e.name,
                e.entity_type,
                e.aliases,
                e.properties,
                e.mention_count,
                e.first_seen,
                e.last_seen,
                e.created_at,
                e.updated_at,
                r.relation_type,
                r.weight
            FROM entity_relations r
            JOIN entities e ON e.id = r.source_entity_id
            WHERE r.target_entity_id = $1
            ORDER BY r.weight DESC
            LIMIT $2
            "#,
            )
            .bind(id)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;

            Ok((outgoing, incoming))
        })
    })
    .await
    .map_err(AppError::from)
}

pub(super) async fn fetch_entity_articles(
    pool: &PgPool,
    tenant_id: Uuid,
    id: Uuid,
    limit: i64,
) -> ApiResult<Vec<EntityArticleResponse>> {
    with_tenant_tx(pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, EntityArticleResponse>(
                r#"
            SELECT
                a.id AS article_id,
                a.title,
                a.published_at,
                a.status,
                ae.relevance_score
            FROM article_entities ae
            JOIN articles a ON a.id = ae.article_id
            WHERE ae.entity_id = $1
            ORDER BY ae.relevance_score DESC NULLS LAST, ae.mention_count DESC, a.published_at DESC NULLS LAST
            LIMIT $2
            "#,
            )
            .bind(id)
            .bind(limit)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))
        })
    })
    .await
    .map_err(AppError::from)
}

pub(super) async fn run_backfill(
    pool: &PgPool,
    tenant_id: Uuid,
    limit: i64,
) -> ApiResult<BackfillResponse> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| AppError::internal(format!("Database error: {}", e)))?;

    sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
        .bind(tenant_id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::internal(format!("Database error: {}", e)))?;

    let sources_upserted = sqlx::query(
        r#"
        INSERT INTO entities (name, entity_type, aliases, mention_count)
        SELECT DISTINCT TRIM(s.name) AS name, 'organization' AS entity_type, '{}'::text[] AS aliases, 0 AS mention_count
        FROM sources s
        WHERE TRIM(s.name) <> ''
        ON CONFLICT (tenant_id, name, entity_type) DO UPDATE SET
            last_seen = NOW(),
            updated_at = NOW()
        "#,
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let categories_upserted = sqlx::query(
        r#"
        INSERT INTO entities (name, entity_type, aliases, mention_count)
        SELECT DISTINCT TRIM(c.name) AS name, 'concept' AS entity_type, '{}'::text[] AS aliases, 0 AS mention_count
        FROM categories c
        WHERE TRIM(c.name) <> ''
        ON CONFLICT (tenant_id, name, entity_type) DO UPDATE SET
            last_seen = NOW(),
            updated_at = NOW()
        "#,
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let domain_entities_upserted = sqlx::query(
        r#"
        WITH recent_articles AS (
            SELECT TRIM(domain_root) AS domain_root
            FROM articles
            WHERE domain_root IS NOT NULL
              AND TRIM(domain_root) <> ''
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
        )
        INSERT INTO entities (name, entity_type, aliases, mention_count)
        SELECT DISTINCT ra.domain_root AS name, 'concept' AS entity_type, '{}'::text[] AS aliases, 0 AS mention_count
        FROM recent_articles ra
        ON CONFLICT (tenant_id, name, entity_type) DO UPDATE SET
            last_seen = NOW(),
            updated_at = NOW()
        "#,
    )
    .bind(limit)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let source_links = sqlx::query(
        r#"
        WITH recent_articles AS (
            SELECT id, source_id
            FROM articles
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
        ),
        source_entities AS (
            SELECT s.id AS source_id, e.id AS entity_id
            FROM sources s
            JOIN entities e ON e.name = s.name AND e.entity_type = 'organization'
        )
        INSERT INTO article_entities (article_id, entity_id, mention_count, context)
        SELECT a.id, se.entity_id, 1, 'source'
        FROM recent_articles a
        JOIN source_entities se ON se.source_id = a.source_id
        ON CONFLICT (tenant_id, article_id, entity_id) DO NOTHING
        "#,
    )
    .bind(limit)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let category_links = sqlx::query(
        r#"
        WITH recent_articles AS (
            SELECT id, category_id
            FROM articles
            WHERE category_id IS NOT NULL
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
        ),
        category_entities AS (
            SELECT c.id AS category_id, e.id AS entity_id
            FROM categories c
            JOIN entities e ON e.name = c.name AND e.entity_type = 'concept'
        )
        INSERT INTO article_entities (article_id, entity_id, mention_count, context)
        SELECT a.id, ce.entity_id, 1, 'category'
        FROM recent_articles a
        JOIN category_entities ce ON ce.category_id = a.category_id
        ON CONFLICT (tenant_id, article_id, entity_id) DO NOTHING
        "#,
    )
    .bind(limit)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let domain_links = sqlx::query(
        r#"
        WITH recent_articles AS (
            SELECT id, TRIM(domain_root) AS domain_root
            FROM articles
            WHERE domain_root IS NOT NULL
              AND TRIM(domain_root) <> ''
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
        ),
        domain_entities AS (
            SELECT e.id AS entity_id, e.name
            FROM entities e
            WHERE e.entity_type = 'concept'
        )
        INSERT INTO article_entities (article_id, entity_id, mention_count, context)
        SELECT a.id, de.entity_id, 1, 'domain_root'
        FROM recent_articles a
        JOIN domain_entities de ON de.name = a.domain_root
        ON CONFLICT (tenant_id, article_id, entity_id) DO NOTHING
        "#,
    )
    .bind(limit)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let source_category_relations_upserted = sqlx::query(
        r#"
        WITH recent_articles AS (
            SELECT source_id, category_id
            FROM articles
            WHERE category_id IS NOT NULL
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
        ),
        source_entities AS (
            SELECT s.id AS source_id, e.id AS entity_id
            FROM sources s
            JOIN entities e ON e.name = s.name AND e.entity_type = 'organization'
        ),
        category_entities AS (
            SELECT c.id AS category_id, e.id AS entity_id
            FROM categories c
            JOIN entities e ON e.name = c.name AND e.entity_type = 'concept'
        )
        INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type, weight, properties)
        SELECT se.entity_id, ce.entity_id, 'publishes_in' AS relation_type, COUNT(*)::float AS weight, '{}'::jsonb AS properties
        FROM recent_articles a
        JOIN source_entities se ON se.source_id = a.source_id
        JOIN category_entities ce ON ce.category_id = a.category_id
        GROUP BY se.entity_id, ce.entity_id
        ON CONFLICT (tenant_id, source_entity_id, target_entity_id, relation_type) DO UPDATE SET
            weight = EXCLUDED.weight
        "#,
    )
    .bind(limit)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    let source_domain_relations_upserted = sqlx::query(
        r#"
        WITH recent_articles AS (
            SELECT source_id, TRIM(domain_root) AS domain_root
            FROM articles
            WHERE domain_root IS NOT NULL
              AND TRIM(domain_root) <> ''
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT $1
        ),
        source_entities AS (
            SELECT s.id AS source_id, e.id AS entity_id
            FROM sources s
            JOIN entities e ON e.name = s.name AND e.entity_type = 'organization'
        ),
        domain_entities AS (
            SELECT e.id AS entity_id, e.name
            FROM entities e
            WHERE e.entity_type = 'concept'
        )
        INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type, weight, properties)
        SELECT se.entity_id, de.entity_id, 'publishes_in' AS relation_type, COUNT(*)::float AS weight, '{}'::jsonb AS properties
        FROM recent_articles a
        JOIN source_entities se ON se.source_id = a.source_id
        JOIN domain_entities de ON de.name = a.domain_root
        GROUP BY se.entity_id, de.entity_id
        ON CONFLICT (tenant_id, source_entity_id, target_entity_id, relation_type) DO UPDATE SET
            weight = EXCLUDED.weight
        "#,
    )
    .bind(limit)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?
    .rows_affected();

    sqlx::query(
        r#"
        UPDATE entities e
        SET mention_count = sub.cnt,
            updated_at = NOW()
        FROM (
            SELECT entity_id, SUM(mention_count)::int AS cnt
            FROM article_entities
            GROUP BY entity_id
        ) sub
        WHERE e.id = sub.entity_id
        "#,
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::internal(format!("Database error: {}", e)))?;

    tx.commit()
        .await
        .map_err(|e| AppError::internal(format!("Database error: {}", e)))?;

    Ok(BackfillResponse {
        articles_considered: limit,
        entities_upserted: (sources_upserted + categories_upserted + domain_entities_upserted)
            as i64,
        article_entities_inserted: (source_links + category_links + domain_links) as i64,
        relations_upserted: (source_category_relations_upserted + source_domain_relations_upserted)
            as i64,
    })
}
