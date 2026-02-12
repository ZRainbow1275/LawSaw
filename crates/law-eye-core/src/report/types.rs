// crates/law-eye-core/src/report/types.rs
// 报告模块的类型定义

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ══════════════════════════════════════════════════════════════
// 报告状态枚举
// ══════════════════════════════════════════════════════════════

/// 报告生命周期状态，与数据库 CHECK 约束严格对齐。
///
/// 状态流转规则:
///   draft -> generating -> draft (AI 填充完成)
///   draft -> review -> approved -> published -> archived
///   review -> draft (退回修改)
///   approved -> draft (撤回修改)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
    Draft,
    Generating,
    Review,
    Approved,
    Published,
    Archived,
}

impl ReportStatus {
    /// 从数据库字符串解析状态
    pub fn from_db_str(s: &str) -> Option<Self> {
        match s {
            "draft" => Some(Self::Draft),
            "generating" => Some(Self::Generating),
            "review" => Some(Self::Review),
            "approved" => Some(Self::Approved),
            "published" => Some(Self::Published),
            "archived" => Some(Self::Archived),
            _ => None,
        }
    }

    /// 转换为数据库存储的字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Generating => "generating",
            Self::Review => "review",
            Self::Approved => "approved",
            Self::Published => "published",
            Self::Archived => "archived",
        }
    }

    /// 检查从当前状态到目标状态的转换是否合法
    pub fn can_transition_to(&self, target: Self) -> bool {
        matches!(
            (self, target),
            (Self::Draft, Self::Generating)
                | (Self::Draft, Self::Review)
                | (Self::Generating, Self::Draft)
                | (Self::Review, Self::Draft)
                | (Self::Review, Self::Approved)
                | (Self::Approved, Self::Draft)
                | (Self::Approved, Self::Published)
                | (Self::Published, Self::Archived)
        )
    }
}

impl std::fmt::Display for ReportStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ══════════════════════════════════════════════════════════════
// 报告导出格式
// ══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Pdf,
    Docx,
    Html,
}

impl ExportFormat {
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::Pdf => "application/pdf",
            Self::Docx => {
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            }
            Self::Html => "text/html; charset=utf-8",
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Html => "html",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "pdf" => Some(Self::Pdf),
            "docx" => Some(Self::Docx),
            "html" => Some(Self::Html),
            _ => None,
        }
    }
}

// ══════════════════════════════════════════════════════════════
// 报告期间类型
// ══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PeriodType {
    Weekly,
    Monthly,
    Quarterly,
    Custom,
}

impl PeriodType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Quarterly => "quarterly",
            Self::Custom => "custom",
        }
    }

    pub fn from_db_str(s: &str) -> Option<Self> {
        match s {
            "weekly" => Some(Self::Weekly),
            "monthly" => Some(Self::Monthly),
            "quarterly" => Some(Self::Quarterly),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }
}

// ══════════════════════════════════════════════════════════════
// 导出结果
// ══════════════════════════════════════════════════════════════

/// 导出操作完成后返回的结果
pub struct ExportResult {
    /// 导出格式
    pub format: ExportFormat,
    /// MinIO 对象存储路径
    pub object_key: String,
    /// 文件字节大小
    pub byte_size: u64,
    /// MIME Content-Type
    pub content_type: String,
}

// ══════════════════════════════════════════════════════════════
// Service 层输入/输出 DTO
// ══════════════════════════════════════════════════════════════

/// 创建报告的输入参数
#[derive(Debug, Clone, Deserialize)]
pub struct CreateReportInput {
    pub title: String,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub template_id: Option<Uuid>,
    pub author_id: Uuid,
}

/// 更新报告内容的输入参数
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReportInput {
    pub title: Option<String>,
    pub content: Option<serde_json::Value>,
    pub expected_version: Option<i64>,
}

/// 报告列表查询参数
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ListReportsQuery {
    pub status: Option<String>,
    pub period_type: Option<String>,
    pub author_id: Option<Uuid>,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// 报告聚合数据（用于模板渲染）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportAggregatedData {
    pub overview: ReportOverview,
    pub highlights: Vec<ReportArticleSummary>,
    pub risk_items: Vec<ReportRiskItem>,
    pub charts: Vec<ReportChart>,
    pub calendar_events: Vec<ReportCalendarEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportOverview {
    pub total_articles: i64,
    pub high_importance_count: i64,
    pub high_risk_count: i64,
    pub ai_summary: Option<String>,
    pub domain_breakdown: Vec<DomainBreakdown>,
    pub region_breakdown: Vec<RegionBreakdown>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainBreakdown {
    pub domain: String,
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionBreakdown {
    pub region_code: String,
    pub region_name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportArticleSummary {
    pub id: Uuid,
    pub title: String,
    pub summary: Option<String>,
    pub domain_label: String,
    pub issuer: Option<String>,
    pub published_at: Option<String>,
    pub importance: Option<i32>,
    pub risk_score: Option<i32>,
    pub link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportRiskItem {
    pub title: String,
    pub description: String,
    pub level: String,
    pub level_label: String,
    pub article_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportChart {
    pub title: String,
    pub chart_type: String,
    pub svg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportCalendarEvent {
    pub date: String,
    pub title: String,
    pub event_type: String,
}

/// 导出任务（入队 Redis）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportExportTask {
    pub tenant_id: Uuid,
    pub report_id: Uuid,
    pub format: String,
    pub requested_by: Uuid,
    pub requested_at: DateTime<Utc>,
}
