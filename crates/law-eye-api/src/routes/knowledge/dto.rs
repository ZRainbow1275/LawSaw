use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SearchEntitiesQuery {
    pub q: String,
    pub limit: Option<i64>,
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
