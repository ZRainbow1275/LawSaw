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
pub struct TenantConfig {
    pub tenant_id: Uuid,
    // Quota settings
    pub max_users: i32,
    pub max_articles: i32,
    pub max_sources: i32,
    pub max_storage_mb: i64,
    pub max_reports_per_month: i32,
    // Feature flags
    pub feature_ai_enabled: bool,
    pub feature_knowledge_graph: bool,
    pub feature_report_generation: bool,
    pub feature_webhook: bool,
    // Branding
    pub logo_url: Option<String>,
    pub primary_color: Option<String>,
    // Audit
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TenantUsage {
    pub tenant_id: Uuid,
    pub current_users: i32,
    pub current_articles: i32,
    pub current_sources: i32,
    pub current_storage_mb: i64,
    pub current_reports_this_month: i32,
    pub last_refreshed_at: DateTime<Utc>,
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
    // Crawler enhancement fields (migration 030)
    pub health_status: String,
    pub consecutive_failures: i32,
    pub total_articles_fetched: i64,
    pub avg_fetch_duration_ms: Option<i32>,
    pub render_mode: String,
    pub encoding: Option<String>,
    pub deleted_at: Option<DateTime<Utc>>,
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
    pub version: i64,
    pub deleted_at: Option<DateTime<Utc>>,
    // Crawler enhancement fields (migration 030)
    pub domain_root: Option<String>,
    pub domain_sub: Option<String>,
    pub authority_level: Option<i32>,
    pub issuer: Option<String>,
    pub doc_number: Option<String>,
    pub effective_date: Option<chrono::NaiveDate>,
    pub region_code: Option<String>,
    pub content_hash: Option<String>,
    pub summary_struct: Option<serde_json::Value>,
    pub source_ref: Option<String>,
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
    // Crawler enhancement: legal domain metadata (migration 030)
    pub issuer: Option<String>,
    pub doc_number: Option<String>,
    pub effective_date: Option<chrono::NaiveDate>,
    pub region_code: Option<String>,
    pub content_hash: Option<String>,
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
    pub email_verified_at: Option<DateTime<Utc>>,
    pub version: i64,
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
    pub tenant_id: Uuid,
    pub name: String,
    pub permissions: serde_json::Value,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserRole {
    pub tenant_id: Uuid,
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
    /// DDL: `INET` -- queried via `requested_ip::text AS requested_ip`.
    pub requested_ip: Option<String>,
    pub requested_user_agent: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EmailVerificationToken {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub token_hash: String,
    pub token_prefix: String,
    /// DDL: `INET` -- queried via `requested_ip::text AS requested_ip`.
    pub requested_ip: Option<String>,
    pub requested_user_agent: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OAuthIdentity {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_user_id: String,
    pub provider_email: String,
    pub linked_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OAuthStateToken {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub provider: String,
    pub state_hash: String,
    pub state_prefix: String,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserMfaTotp {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub issuer: String,
    pub secret_ciphertext: String,
    pub enabled: bool,
    pub verified_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MfaLoginChallenge {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub challenge_hash: String,
    pub challenge_prefix: String,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WebPushSubscription {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub expiration_time: Option<DateTime<Utc>>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWebPushSubscription {
    pub user_id: Uuid,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub expiration_time: Option<DateTime<Utc>>,
    pub user_agent: Option<String>,
}

/// Audit log entry mapped from the `audit_logs` table.
///
/// **Type mapping notes** (DDL vs Rust):
/// - `prev_hash` / `hash`: DDL is `BYTEA`. SQL queries **must** use
///   `encode(prev_hash, 'hex') AS prev_hash` / `encode(hash, 'hex') AS hash`
///   so that `FromRow` can deserialize into `String`.
/// - `ip_address`: DDL is `INET`. SQL queries **must** use
///   `ip_address::text AS ip_address` on SELECT, and `$N::inet` on INSERT/UPDATE.
///
/// **Do NOT use `SELECT *`** against `audit_logs` with this struct; always use
/// the explicit column list with the casts above.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub seq: i64,
    pub event_version: i32,
    /// DDL: `BYTEA` -- queried via `encode(prev_hash, 'hex') AS prev_hash`.
    pub prev_hash: Option<String>,
    /// DDL: `BYTEA` -- queried via `encode(hash, 'hex') AS hash`.
    pub hash: String,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource: String,
    pub resource_id: Option<Uuid>,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
    /// DDL: `INET` -- queried via `ip_address::text AS ip_address`.
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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DomainEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub aggregate_version: i64,
    pub event_type: String,
    pub event_version: i32,
    pub dedupe_key: String,
    pub payload: serde_json::Value,
    pub metadata: serde_json::Value,
    pub occurred_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDomainEvent {
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub aggregate_version: i64,
    pub event_type: String,
    pub event_version: i32,
    pub dedupe_key: String,
    pub payload: serde_json::Value,
    pub metadata: serde_json::Value,
    pub occurred_at: Option<DateTime<Utc>>,
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
    pub deleted_at: Option<DateTime<Utc>>,
    pub purged_at: Option<DateTime<Utc>>,
    pub purge_attempts: i32,
    pub purge_last_error: Option<String>,
    pub purge_locked_at: Option<DateTime<Utc>>,
    pub purge_locked_by: Option<Uuid>,
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
    pub version: i64,
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

// ========== Crawl Log Models ==========

/// A record of a single crawl run against a source.
///
/// Maps to the `crawl_logs` table (migration 030).
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CrawlLog {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    /// One of: "running", "success", "partial", "failed".
    pub status: String,
    pub articles_found: i32,
    pub articles_new: i32,
    pub articles_updated: i32,
    pub articles_skipped: i32,
    pub error_message: Option<String>,
    pub duration_ms: Option<i32>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// Data required to insert a new crawl log (start of a crawl run).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCrawlLog {
    pub tenant_id: Uuid,
    pub source_id: Uuid,
}

/// Data to update a crawl log when a crawl run finishes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinishCrawlLog {
    pub status: String,
    pub articles_found: i32,
    pub articles_new: i32,
    pub articles_updated: i32,
    pub articles_skipped: i32,
    pub error_message: Option<String>,
    pub duration_ms: i32,
    pub metadata: Option<serde_json::Value>,
}

// ========== API Key Models ==========

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub tenant_id: Uuid,
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

// ========== Report Models ==========

/// 报告模板，存储 Tera HTML 模板、CSS 样式和页面配置。
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReportTemplate {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub period_type: String,
    pub template_body: String,
    pub css_styles: Option<String>,
    pub page_config: serde_json::Value,
    pub sections_config: serde_json::Value,
    pub is_builtin: bool,
    pub is_active: bool,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReportTemplate {
    pub name: String,
    pub description: Option<String>,
    pub period_type: String,
    pub template_body: String,
    pub css_styles: Option<String>,
    pub page_config: Option<serde_json::Value>,
    pub sections_config: Option<serde_json::Value>,
}

/// 法律合规报告实例：周报/月报/季报，包含 AI 生成内容和导出文件路径。
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Report {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub report_number: String,
    pub title: String,
    pub template_id: Option<Uuid>,
    pub author_id: Uuid,
    pub period_type: String,
    pub period_start: chrono::NaiveDate,
    pub period_end: chrono::NaiveDate,
    pub status: String,
    pub content: serde_json::Value,
    pub export_pdf_key: Option<String>,
    pub export_docx_key: Option<String>,
    pub export_html_key: Option<String>,
    pub article_count: i32,
    pub ai_model: Option<String>,
    pub ai_generated_at: Option<DateTime<Utc>>,
    pub version: i64,
    pub published_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReport {
    pub title: String,
    pub template_id: Option<Uuid>,
    pub author_id: Uuid,
    pub period_type: String,
    pub period_start: chrono::NaiveDate,
    pub period_end: chrono::NaiveDate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReport {
    pub title: Option<String>,
    pub content: Option<serde_json::Value>,
    pub status: Option<String>,
    pub export_pdf_key: Option<String>,
    pub export_docx_key: Option<String>,
    pub export_html_key: Option<String>,
    pub article_count: Option<i32>,
    pub ai_model: Option<String>,
    pub ai_generated_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
}
