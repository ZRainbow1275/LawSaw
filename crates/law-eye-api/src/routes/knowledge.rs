use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_core::with_tenant_tx;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/entities/top", get(list_top_entities))
        .route("/entities/search", get(search_entities))
        .route("/entities/{id}", get(get_entity))
        .route("/entities/{id}/related", get(get_related_entities))
        .route("/entities/{id}/articles", get(get_entity_articles))
        .route("/backfill", post(backfill))
}

fn clamp_limit(value: Option<i64>, default: i64, max: i64) -> i64 {
    value.unwrap_or(default).clamp(1, max)
}

async fn require_articles_read(state: &AppState, user_id: Uuid) -> ApiResult<()> {
    let can_read = state
        .user_service
        .has_permission(user_id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }
    Ok(())
}

#[derive(Debug, Serialize, ToSchema)]
pub struct KnowledgeEntityResponse {
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
}

impl From<law_eye_db::Entity> for KnowledgeEntityResponse {
    fn from(entity: law_eye_db::Entity) -> Self {
        Self {
            id: entity.id,
            name: entity.name,
            entity_type: entity.entity_type,
            aliases: entity.aliases,
            properties: entity.properties,
            mention_count: entity.mention_count,
            first_seen: entity.first_seen,
            last_seen: entity.last_seen,
            created_at: entity.created_at,
            updated_at: entity.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TopEntitiesQuery {
    pub limit: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/top",
    params(
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-200)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Top entities", body = Vec<KnowledgeEntityResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn list_top_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<TopEntitiesQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.id).await?;

    let limit = clamp_limit(query.limit, 50, 200);
    let entities = state
        .knowledge_service
        .get_top_entities(user.tenant_id, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        entities
            .into_iter()
            .map(KnowledgeEntityResponse::from)
            .collect(),
    ))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SearchEntitiesQuery {
    pub q: String,
    pub limit: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/search",
    params(
        ("q" = String, Query, description = "Search query"),
        ("limit" = Option<i64>, Query, description = "Maximum number of entities (1-100)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Matched entities", body = Vec<KnowledgeEntityResponse>),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn search_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<SearchEntitiesQuery>,
) -> ApiResult<Json<Vec<KnowledgeEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.id).await?;

    let term = query.q.trim();
    if term.is_empty() {
        return Err(AppError::validation("Query must not be empty"));
    }

    let limit = clamp_limit(query.limit, 20, 100);
    let entities = state
        .knowledge_service
        .search_entities(user.tenant_id, term, limit)
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        entities
            .into_iter()
            .map(KnowledgeEntityResponse::from)
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/{id}",
    params(
        ("id" = Uuid, Path, description = "Entity id")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Entity", body = KnowledgeEntityResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_entity(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<KnowledgeEntityResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.id).await?;

    let entity = state
        .knowledge_service
        .get_entity(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(entity.into()))
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RelationDirection {
    Outgoing,
    Incoming,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RelatedEntityResponse {
    pub entity: KnowledgeEntityResponse,
    pub relation_type: String,
    pub weight: f64,
    pub direction: RelationDirection,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RelatedEntitiesQuery {
    pub limit: Option<i64>,
}

#[derive(Debug, sqlx::FromRow)]
struct RelatedEntityRow {
    id: Uuid,
    name: String,
    entity_type: String,
    aliases: Vec<String>,
    properties: serde_json::Value,
    mention_count: i32,
    first_seen: DateTime<Utc>,
    last_seen: DateTime<Utc>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    relation_type: String,
    weight: f64,
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

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/{id}/related",
    params(
        ("id" = Uuid, Path, description = "Entity id"),
        ("limit" = Option<i64>, Query, description = "Maximum number of neighbors per direction (1-50)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Related entities", body = Vec<RelatedEntityResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_related_entities(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<RelatedEntitiesQuery>,
) -> ApiResult<Json<Vec<RelatedEntityResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.id).await?;

    let limit = clamp_limit(query.limit, 20, 50);

    let (outgoing, incoming) = with_tenant_tx(&state.pool, user.tenant_id, |tx| {
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
    .map_err(AppError::from)?;

    let mut result = Vec::with_capacity(outgoing.len() + incoming.len());

    for row in outgoing {
        let relation_type = row.relation_type.clone();
        let weight = row.weight;
        result.push(RelatedEntityResponse {
            entity: KnowledgeEntityResponse::from(row),
            relation_type,
            weight,
            direction: RelationDirection::Outgoing,
        });
    }

    for row in incoming {
        let relation_type = row.relation_type.clone();
        let weight = row.weight;
        result.push(RelatedEntityResponse {
            entity: KnowledgeEntityResponse::from(row),
            relation_type,
            weight,
            direction: RelationDirection::Incoming,
        });
    }

    result.sort_by(|a, b| b.weight.total_cmp(&a.weight));
    Ok(Json(result))
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct EntityArticleResponse {
    pub article_id: Uuid,
    pub title: String,
    pub published_at: Option<DateTime<Utc>>,
    pub status: String,
    pub relevance_score: Option<f64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EntityArticlesQuery {
    pub limit: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/api/v1/knowledge/entities/{id}/articles",
    params(
        ("id" = Uuid, Path, description = "Entity id"),
        ("limit" = Option<i64>, Query, description = "Maximum number of articles (1-50)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Articles linked to entity", body = Vec<EntityArticleResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn get_entity_articles(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiQuery(query): ApiQuery<EntityArticlesQuery>,
) -> ApiResult<Json<Vec<EntityArticleResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.id).await?;

    let limit = clamp_limit(query.limit, 10, 50);

    let items = with_tenant_tx(&state.pool, user.tenant_id, |tx| Box::pin(async move {
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
    }))
    .await
    .map_err(AppError::from)?;

    Ok(Json(items))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct BackfillRequest {
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct BackfillResponse {
    pub articles_considered: i64,
    pub entities_upserted: i64,
    pub article_entities_inserted: i64,
    pub relations_upserted: i64,
}

#[utoipa::path(
    post,
    path = "/api/v1/knowledge/backfill",
    request_body = BackfillRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Backfill completed", body = BackfillResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError),
    ),
    tag = "knowledge"
)]
pub(crate) async fn backfill(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<BackfillRequest>,
) -> ApiResult<Json<BackfillResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    require_articles_read(&state, user.id).await?;

    let limit = clamp_limit(req.limit, 500, 5_000);
    let stats = run_backfill(&state.pool, user.tenant_id, limit).await?;

    Ok(Json(stats))
}

async fn run_backfill(pool: &PgPool, tenant_id: Uuid, limit: i64) -> ApiResult<BackfillResponse> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| AppError::internal(format!("Database error: {}", e)))?;

    sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
        .bind(tenant_id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::internal(format!("Database error: {}", e)))?;

    // Upsert entities for sources + categories (names can drift from ids, so we use names as stable labels)
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

    // Insert article-entity links for the latest N articles (idempotent due to unique constraint).
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

    let relations_upserted = sqlx::query(
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

    // Recompute entity mention counts from article_entities to keep it idempotent and avoid double counting.
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
        entities_upserted: (sources_upserted + categories_upserted) as i64,
        article_entities_inserted: (source_links + category_links) as i64,
        relations_upserted: relations_upserted as i64,
    })
}
