use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Tenant {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Source {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub url: String,
    #[sqlx(rename = "type")]
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: i32,
    pub is_active: bool,
    pub last_fetch: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Category {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub sort_order: i32,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Article {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source_id: Uuid,
    pub category_id: Option<Uuid>,
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub risk_score: Option<i32>,
    pub importance: Option<i32>,
    pub sentiment: Option<String>,
    pub ai_metadata: serde_json::Value,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub ai_processed_at: Option<DateTime<Utc>>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateArticle {
    pub source_id: Uuid,
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSource {
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, FromRow)]
pub struct ArticleChunk {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub article_id: Uuid,
    pub chunk_index: i32,
    pub content: String,
    #[sqlx(skip)]
    pub embedding: Option<Vec<f32>>,
    pub token_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CreateArticleChunk {
    pub article_id: Uuid,
    pub chunk_index: i32,
    pub content: String,
    pub embedding: Vec<f32>,
    pub token_count: i32,
}

// ========== User & Auth Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub preferences: serde_json::Value,
    pub is_active: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUser {
    pub tenant_id: Uuid,
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUser {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub preferences: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Role {
    pub id: Uuid,
    pub name: String,
    pub permissions: serde_json::Value,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserRole {
    pub user_id: Uuid,
    pub role_id: Uuid,
    pub granted_at: DateTime<Utc>,
    pub granted_by: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PasswordResetToken {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub token_prefix: String,
    pub requested_ip: Option<String>,
    pub requested_user_agent: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub seq: i64,
    pub prev_hash: Option<String>,
    pub hash: String,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource: String,
    pub resource_id: Option<Uuid>,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAuditLog {
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource: String,
    pub resource_id: Option<Uuid>,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

// ========== Object Storage Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Object {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub owner_user_id: Option<Uuid>,
    pub kind: String,
    pub bucket: String,
    pub object_key: String,
    pub content_type: String,
    pub byte_size: i64,
    pub sha256: Option<Vec<u8>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateObject {
    pub owner_user_id: Option<Uuid>,
    pub kind: String,
    pub bucket: String,
    pub object_key: String,
    pub content_type: String,
    pub byte_size: i64,
    pub sha256: Option<Vec<u8>>,
}

// ========== Feedback Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Feedback {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Option<Uuid>,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub feedback_type: String,
    pub title: String,
    pub content: String,
    pub contact_email: Option<String>,
    pub encryption_version: i16,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
    pub status: String,
    pub admin_response: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFeedback {
    pub user_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub feedback_type: String,
    pub title: String,
    pub content: String,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFeedback {
    pub status: Option<String>,
    pub admin_response: Option<String>,
}

// ========== Knowledge Graph Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Entity {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub entity_type: String,
    pub aliases: Vec<String>,
    pub properties: serde_json::Value,
    #[sqlx(skip)]
    pub embedding: Option<Vec<f32>>,
    pub mention_count: i32,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntity {
    pub name: String,
    pub entity_type: String,
    pub aliases: Option<Vec<String>>,
    pub properties: Option<serde_json::Value>,
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EntityRelation {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source_entity_id: Uuid,
    pub target_entity_id: Uuid,
    pub relation_type: String,
    pub weight: f64,
    pub properties: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntityRelation {
    pub source_entity_id: Uuid,
    pub target_entity_id: Uuid,
    pub relation_type: String,
    pub weight: Option<f64>,
    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArticleEntity {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub article_id: Uuid,
    pub entity_id: Uuid,
    pub mention_count: i32,
    pub relevance_score: Option<f64>,
    pub context: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ========== API Key Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub key_hash: String,
    pub key_prefix: String,
    pub permissions: serde_json::Value,
    pub rate_limit: i32,
    pub is_active: bool,
    pub last_used: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateApiKey {
    pub user_id: Option<Uuid>,
    pub name: String,
    pub permissions: Option<Vec<String>>,
    pub rate_limit: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
}
