use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// 输入验证常量
pub const REPORT_TITLE_MAX_LEN: usize = 200;
#[allow(dead_code)] // Reserved for future content-size validation
pub const REPORT_CONTENT_MAX_BYTES: usize = 5 * 1024 * 1024; // 5 MB
pub const TEMPLATE_NAME_MAX_LEN: usize = 100;
pub const TEMPLATE_BODY_MAX_LEN: usize = 100_000; // 100 KB
pub const TEMPLATE_CSS_MAX_LEN: usize = 50_000; // 50 KB

// ══════════════════════════════════════════════════════════════
// Request DTOs
// ══════════════════════════════════════════════════════════════

/// 报告列表查询参数
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ListReportsParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub status: Option<String>,
    pub period_type: Option<String>,
    pub author_id: Option<Uuid>,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
}

/// 创建报告请求
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateReportRequest {
    pub title: String,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub template_id: Option<Uuid>,
}

/// 更新报告请求
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateReportRequest {
    pub title: Option<String>,
    pub content: Option<serde_json::Value>,
}

/// 状态转换请求
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TransitionStatusRequest {
    pub target_status: String,
}

/// 触发导出请求
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ExportReportRequest {
    pub format: String,
}

/// 模板列表查询参数
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ListTemplatesParams {
    pub period_type: Option<String>,
}

/// 创建模板请求
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub period_type: String,
    pub template_body: String,
    pub css_styles: Option<String>,
    pub page_config: Option<serde_json::Value>,
    pub sections_config: Option<serde_json::Value>,
}

/// 更新模板请求
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub template_body: Option<String>,
    pub css_styles: Option<String>,
    pub page_config: Option<serde_json::Value>,
    pub sections_config: Option<serde_json::Value>,
}

// ══════════════════════════════════════════════════════════════
// Response DTOs
// ══════════════════════════════════════════════════════════════

/// 报告响应
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReportResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub report_number: String,
    pub title: String,
    pub template_id: Option<Uuid>,
    pub author_id: Uuid,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Report> for ReportResponse {
    fn from(r: law_eye_db::Report) -> Self {
        Self {
            id: r.id,
            tenant_id: r.tenant_id,
            report_number: r.report_number,
            title: r.title,
            template_id: r.template_id,
            author_id: r.author_id,
            period_type: r.period_type,
            period_start: r.period_start,
            period_end: r.period_end,
            status: r.status,
            content: r.content,
            export_pdf_key: r.export_pdf_key,
            export_docx_key: r.export_docx_key,
            export_html_key: r.export_html_key,
            article_count: r.article_count,
            ai_model: r.ai_model,
            ai_generated_at: r.ai_generated_at,
            version: r.version,
            published_at: r.published_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

/// 报告列表响应
#[derive(Debug, Serialize, ToSchema)]
pub struct ReportListResponse {
    pub data: Vec<ReportResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

/// 报告模板响应
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReportTemplateResponse {
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

impl From<law_eye_db::ReportTemplate> for ReportTemplateResponse {
    fn from(t: law_eye_db::ReportTemplate) -> Self {
        Self {
            id: t.id,
            tenant_id: t.tenant_id,
            name: t.name,
            description: t.description,
            period_type: t.period_type,
            template_body: t.template_body,
            css_styles: t.css_styles,
            page_config: t.page_config,
            sections_config: t.sections_config,
            is_builtin: t.is_builtin,
            is_active: t.is_active,
            version: t.version,
            created_at: t.created_at,
            updated_at: t.updated_at,
        }
    }
}

/// 删除响应
#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteResponse {
    pub success: bool,
    pub message: String,
}

/// 异步任务入队响应
#[derive(Debug, Serialize, ToSchema)]
pub struct TaskEnqueuedResponse {
    pub message: String,
    pub report_id: Uuid,
}
