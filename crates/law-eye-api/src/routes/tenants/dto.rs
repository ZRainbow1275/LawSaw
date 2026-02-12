use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

// ── Response DTOs ────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Tenant> for TenantResponse {
    fn from(t: law_eye_db::Tenant) -> Self {
        Self {
            id: t.id,
            slug: t.slug,
            name: t.name,
            created_at: t.created_at,
            updated_at: t.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantConfigResponse {
    pub tenant_id: Uuid,
    // Quotas
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

impl From<law_eye_db::TenantConfig> for TenantConfigResponse {
    fn from(c: law_eye_db::TenantConfig) -> Self {
        Self {
            tenant_id: c.tenant_id,
            max_users: c.max_users,
            max_articles: c.max_articles,
            max_sources: c.max_sources,
            max_storage_mb: c.max_storage_mb,
            max_reports_per_month: c.max_reports_per_month,
            feature_ai_enabled: c.feature_ai_enabled,
            feature_knowledge_graph: c.feature_knowledge_graph,
            feature_report_generation: c.feature_report_generation,
            feature_webhook: c.feature_webhook,
            logo_url: c.logo_url,
            primary_color: c.primary_color,
            created_at: c.created_at,
            updated_at: c.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantUsageResponse {
    pub tenant_id: Uuid,
    pub current_users: i32,
    pub current_articles: i32,
    pub current_sources: i32,
    pub current_storage_mb: i64,
    pub current_reports_this_month: i32,
    pub last_refreshed_at: DateTime<Utc>,
}

impl From<law_eye_db::TenantUsage> for TenantUsageResponse {
    fn from(u: law_eye_db::TenantUsage) -> Self {
        Self {
            tenant_id: u.tenant_id,
            current_users: u.current_users,
            current_articles: u.current_articles,
            current_sources: u.current_sources,
            current_storage_mb: u.current_storage_mb,
            current_reports_this_month: u.current_reports_this_month,
            last_refreshed_at: u.last_refreshed_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TenantDetailResponse {
    #[serde(flatten)]
    pub tenant: TenantResponse,
    pub config: TenantConfigResponse,
    pub usage: TenantUsageResponse,
}

// ── Request DTOs ────────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateTenantRequest {
    pub slug: String,
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTenantRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTenantConfigRequest {
    pub max_users: Option<i32>,
    pub max_articles: Option<i32>,
    pub max_sources: Option<i32>,
    pub max_storage_mb: Option<i64>,
    pub max_reports_per_month: Option<i32>,
    pub feature_ai_enabled: Option<bool>,
    pub feature_knowledge_graph: Option<bool>,
    pub feature_report_generation: Option<bool>,
    pub feature_webhook: Option<bool>,
    pub logo_url: Option<String>,
    pub primary_color: Option<String>,
}

// ── Utility DTOs ────────────────────────────────────────────────────

#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteTenantResponse {
    pub success: bool,
    pub message: String,
}
