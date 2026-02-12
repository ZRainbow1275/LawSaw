# 命题四：周报生成功能 — 后端服务设计文档

> 文档编号: RPT-SVC-003
> 版本: 1.0
> 更新日期: 2026-02-13
> 状态: 设计评审中
> 依赖文档: RPT-ARCH-002 (02-architecture-design.md)

---

## 一、Rust 模块结构

```
crates/law-eye-core/src/
├── report/                          # 新增：报告生成核心模块
│   ├── mod.rs                       # 模块导出 + ReportStatus 枚举
│   ├── service.rs                   # ReportService — 报告 CRUD + 状态机
│   ├── template_service.rs          # ReportTemplateService — 模板管理
│   ├── aggregator.rs                # ReportDataAggregator — 数据聚合 → content JSONB
│   ├── exporter/                    # 导出引擎子模块
│   │   ├── mod.rs                   # ExportEngine trait + ExportResult
│   │   ├── html.rs                  # HtmlExporter — Tera HTML 渲染
│   │   ├── pdf.rs                   # PdfExporter — browserless HTTP API
│   │   ├── docx.rs                  # DocxExporter — docx-rs 生成
│   │   └── chart.rs                 # ChartRenderer — plotters SVG 图表
│   ├── number.rs                    # ReportNumberGenerator — 报告编号生成
│   └── types.rs                     # 数据类型定义 (ExportFormat, SectionType 等)
└── lib.rs                           # 添加 pub mod report; 及 pub use 导出
```

---

## 二、数据类型定义 (`types.rs`)

```rust
// crates/law-eye-core/src/report/types.rs

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ══════════════════════════════════════════════════════════════
// 报告状态枚举
// ══════════════════════════════════════════════════════════════

/// 报告生命周期状态，与数据库 CHECK 约束严格对齐。
///
/// 状态流转规则:
///   draft → generating → draft (AI 填充完成)
///   draft → review → approved → published → archived
///   review → draft (退回修改)
///   approved → draft (撤回修改)
///   draft → deleted (软删除)
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
    pub fn from_str(s: &str) -> Option<Self> {
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

    /// 检查从当前状态到目标状态的转换是否合法。
    ///
    /// 合法转换:
    /// - draft → generating, review
    /// - generating → draft
    /// - review → draft (退回), approved
    /// - approved → draft (撤回), published
    /// - published → archived
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
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

    pub fn from_str(s: &str) -> Option<Self> {
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
// 章节类型
// ══════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SectionType {
    Cover,
    Toc,
    Text,
    Articles,
    Charts,
    Calendar,
    Risk,
    Static,
}

// ══════════════════════════════════════════════════════════════
// 导出结果
// ══════════════════════════════════════════════════════════════

/// 导出操作完成后返回的结果
pub struct ExportResult {
    /// 导出格式
    pub format: ExportFormat,
    /// MinIO 对象存储路径，例如 "reports/{tenant_id}/{id}/v{version}.pdf"
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

/// 模板列表查询参数
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ListTemplatesQuery {
    pub report_type: Option<String>,
    pub audience: Option<String>,
    pub include_system: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// 创建模板的输入参数
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTemplateInput {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub report_type: String,
    pub audience: Option<String>,
    pub sections: serde_json::Value,
    pub style_config: Option<serde_json::Value>,
    pub body_template: Option<String>,
}

/// 更新模板的输入参数
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTemplateInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub sections: Option<serde_json::Value>,
    pub style_config: Option<serde_json::Value>,
    pub body_template: Option<String>,
    pub expected_version: Option<i64>,
}

/// 状态变更请求
#[derive(Debug, Clone, Deserialize)]
pub struct StatusTransitionInput {
    pub target_status: String,
    pub reviewer_id: Option<Uuid>,
    pub comment: Option<String>,
}

/// 自动生成报告的请求
#[derive(Debug, Clone, Deserialize)]
pub struct GenerateReportInput {
    pub template_id: Uuid,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub author_id: Uuid,
    /// 是否在生成完成后自动触发 AI 摘要
    pub auto_ai_summary: Option<bool>,
}

/// 触发导出的请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportReportInput {
    pub format: ExportFormat,
}

/// 报告导出异步任务（入队到 Redis）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportExportTask {
    pub tenant_id: Uuid,
    pub report_id: Uuid,
    pub format: ExportFormat,
    pub triggered_by: Uuid,
}

/// 报告 AI 生成异步任务（入队到 Redis）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportGenerateTask {
    pub tenant_id: Uuid,
    pub report_id: Uuid,
    pub auto_ai_summary: bool,
}
```

---

## 三、ReportService 设计 (`service.rs`)

### 3.1 结构定义

```rust
// crates/law-eye-core/src/report/service.rs

use super::number::ReportNumberGenerator;
use super::types::*;
use crate::tenant::with_tenant_tx;
use chrono::{DateTime, NaiveDate, Utc};
use law_eye_common::{Error, Result};
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use uuid::Uuid;

/// 报告 CRUD 服务。
///
/// 遵循项目约定:
/// - pool 注入 (通过 `new(pool)`)
/// - 所有公开方法均为 `async`
/// - 返回 `law_eye_common::Result<T>`
/// - 使用 `with_tenant_tx` 保证租户隔离
pub struct ReportService {
    pool: PgPool,
}
```

### 3.2 CRUD 方法签名

```rust
impl ReportService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // ──────────────────────────────────────────────────────────
    // CREATE
    // ──────────────────────────────────────────────────────────

    /// 创建一份新报告（草稿状态）。
    ///
    /// 业务逻辑:
    /// 1. 校验 period_end >= period_start
    /// 2. 校验 period_type 合法性
    /// 3. 如果提供了 template_id，从模板加载 sections 初始化 content
    /// 4. 自动生成 report_number（基于 period_type + period_start）
    /// 5. 插入报告记录，状态为 "draft"
    /// 6. 返回完整的报告行（含数据库生成的 id, created_at 等）
    pub async fn create(
        &self,
        tenant_id: Uuid,
        input: CreateReportInput,
    ) -> Result<Report> {
        // 校验日期范围
        if input.period_end < input.period_start {
            return Err(Error::Validation(
                "period_end must be >= period_start".to_string(),
            ));
        }

        // 校验 period_type
        let period_type = PeriodType::from_str(&input.period_type).ok_or_else(|| {
            Error::Validation(format!(
                "Invalid period_type '{}'. Allowed: weekly, monthly, quarterly, custom",
                input.period_type
            ))
        })?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 如果指定了模板，加载模板的 sections 作为初始 content 骨架
                let initial_content = if let Some(template_id) = input.template_id {
                    self.load_template_skeleton(tx, template_id).await?
                } else {
                    serde_json::json!({ "sections": {}, "metadata": {} })
                };

                // 生成报告编号
                let report_number = ReportNumberGenerator::generate(
                    period_type,
                    input.period_start,
                    tx,
                )
                .await?;

                let report = sqlx::query_as::<_, Report>(
                    r#"
                    INSERT INTO reports (
                        title, report_number, period_type, period_start, period_end,
                        template_id, content, status, author_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
                    RETURNING *
                    "#,
                )
                .bind(&input.title)
                .bind(&report_number)
                .bind(period_type.as_str())
                .bind(input.period_start)
                .bind(input.period_end)
                .bind(input.template_id)
                .bind(&initial_content)
                .bind(input.author_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(report)
            })
        })
        .await
    }

    // ──────────────────────────────────────────────────────────
    // READ
    // ──────────────────────────────────────────────────────────

    /// 根据 ID 获取报告详情。
    ///
    /// 业务逻辑:
    /// 1. 在租户事务中查询 reports 表
    /// 2. 仅返回未删除的报告（deleted_at IS NULL）
    /// 3. 若不存在则返回 Error::NotFound
    pub async fn get_by_id(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
    ) -> Result<Report> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Report>(
                    "SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(report_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))
            })
        })
        .await
    }

    /// 分页列表查询（带多条件过滤）。
    ///
    /// 业务逻辑:
    /// 1. 可按 status / period_type / author_id / 日期范围 过滤
    /// 2. 按 period_start DESC 排序
    /// 3. 使用动态 QueryBuilder 拼接过滤条件
    /// 4. 返回 (报告列表, 总数)
    pub async fn list(
        &self,
        tenant_id: Uuid,
        query: &ListReportsQuery,
    ) -> Result<(Vec<ReportSummary>, i64)> {
        let limit = query.limit.unwrap_or(20).clamp(1, 100);
        let offset = query.offset.unwrap_or(0).max(0);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 总数查询
                let mut count_qb: QueryBuilder<'_, Postgres> =
                    QueryBuilder::new("SELECT COUNT(*)::bigint FROM reports WHERE deleted_at IS NULL");
                self.push_list_filters(&mut count_qb, query);

                let (total,): (i64,) = count_qb
                    .build_query_as()
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                // 数据查询（排除 content 大字段以提升列表性能）
                let mut data_qb: QueryBuilder<'_, Postgres> = QueryBuilder::new(
                    r#"SELECT
                        id, tenant_id, title, report_number, period_type,
                        period_start, period_end, template_id, status,
                        author_id, reviewer_id, pdf_object_key, docx_object_key,
                        html_object_key, version, created_at, updated_at
                    FROM reports
                    WHERE deleted_at IS NULL"#,
                );
                self.push_list_filters(&mut data_qb, query);
                data_qb.push(" ORDER BY period_start DESC, created_at DESC");
                data_qb.push(" LIMIT ").push_bind(limit);
                data_qb.push(" OFFSET ").push_bind(offset);

                let rows = data_qb
                    .build_query_as::<ReportSummary>()
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok((rows, total))
            })
        })
        .await
    }

    /// 获取报告的版本快照列表。
    ///
    /// 业务逻辑:
    /// 1. 查询 report_snapshots 表
    /// 2. 按 snapshot_version DESC 排序
    /// 3. 仅返回属于该 report_id 的快照
    pub async fn list_snapshots(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
    ) -> Result<Vec<ReportSnapshot>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportSnapshot>(
                    r#"
                    SELECT * FROM report_snapshots
                    WHERE report_id = $1
                    ORDER BY snapshot_version DESC
                    "#,
                )
                .bind(report_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// 获取指定版本的快照。
    pub async fn get_snapshot(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        version: i64,
    ) -> Result<ReportSnapshot> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportSnapshot>(
                    r#"
                    SELECT * FROM report_snapshots
                    WHERE report_id = $1 AND snapshot_version = $2
                    "#,
                )
                .bind(report_id)
                .bind(version)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| {
                    Error::NotFound(format!(
                        "Snapshot v{} for report {} not found",
                        version, report_id
                    ))
                })
            })
        })
        .await
    }

    // ──────────────────────────────────────────────────────────
    // UPDATE
    // ──────────────────────────────────────────────────────────

    /// 更新报告内容（标题和/或 content JSONB）。
    ///
    /// 业务逻辑:
    /// 1. 仅 draft 状态可编辑
    /// 2. 支持乐观并发控制 (expected_version)
    /// 3. 更新前先创建当前版本的快照（report_snapshots）
    /// 4. 执行 UPDATE
    /// 5. version 由数据库触发器自动 bump
    pub async fn update(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        user_id: Uuid,
        input: UpdateReportInput,
    ) -> Result<Report> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 加载当前报告并锁定行
                let current = sqlx::query_as::<_, Report>(
                    "SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(report_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                // 仅 draft 状态可编辑
                if current.status != "draft" {
                    return Err(Error::Validation(format!(
                        "Report in '{}' status cannot be edited. Must be 'draft'.",
                        current.status
                    )));
                }

                // 乐观并发检查
                if let Some(expected) = input.expected_version {
                    if current.version != expected {
                        return Err(Error::Conflict(format!(
                            "Report {} version mismatch (expected {}, got {})",
                            report_id, expected, current.version
                        )));
                    }
                }

                // 创建快照（保存更新前的 content）
                self.create_snapshot_tx(tx, &current, user_id, None).await?;

                // 执行更新
                let updated = sqlx::query_as::<_, Report>(
                    r#"
                    UPDATE reports SET
                        title = COALESCE($2, title),
                        content = COALESCE($3, content),
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(report_id)
                .bind(input.title.as_deref())
                .bind(&input.content)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    // ──────────────────────────────────────────────────────────
    // DELETE
    // ──────────────────────────────────────────────────────────

    /// 软删除报告。
    ///
    /// 业务逻辑:
    /// 1. 仅 draft 状态可删除（已发布/已审批的报告不可直接删除）
    /// 2. 设置 deleted_at = NOW()
    /// 3. 不删除关联的快照（保留审计追溯）
    pub async fn delete(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let current = sqlx::query_as::<_, Report>(
                    "SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(report_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                // 仅 draft 和 archived 状态可删除
                if current.status != "draft" && current.status != "archived" {
                    return Err(Error::Validation(format!(
                        "Report in '{}' status cannot be deleted. Must be 'draft' or 'archived'.",
                        current.status
                    )));
                }

                let result = sqlx::query(
                    r#"
                    UPDATE reports
                    SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    "#,
                )
                .bind(report_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                if result.rows_affected() == 0 {
                    return Err(Error::NotFound(format!("Report {} not found", report_id)));
                }

                Ok(())
            })
        })
        .await
    }

    // ──────────────────────────────────────────────────────────
    // 状态机
    // ──────────────────────────────────────────────────────────

    /// 执行报告状态转换。
    ///
    /// 业务逻辑:
    /// 1. 解析目标状态字符串为 ReportStatus 枚举
    /// 2. 使用 ReportStatus::can_transition_to() 校验合法性
    /// 3. 若目标状态为 approved，设置 reviewer_id 和 approved_at
    /// 4. 若目标状态为 published，设置 published_at
    /// 5. 创建状态变更快照
    /// 6. 执行 UPDATE
    pub async fn transition_status(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        user_id: Uuid,
        input: StatusTransitionInput,
    ) -> Result<Report> {
        let target = ReportStatus::from_str(&input.target_status).ok_or_else(|| {
            Error::Validation(format!("Invalid target status: {}", input.target_status))
        })?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let current = sqlx::query_as::<_, Report>(
                    "SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(report_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                let current_status =
                    ReportStatus::from_str(&current.status).ok_or_else(|| {
                        Error::Internal(format!(
                            "Report {} has invalid status '{}'",
                            report_id, current.status
                        ))
                    })?;

                // 校验状态转换合法性
                if !current_status.can_transition_to(target) {
                    return Err(Error::Validation(format!(
                        "Cannot transition from '{}' to '{}'",
                        current.status,
                        target.as_str()
                    )));
                }

                // 创建状态变更快照
                let change_summary = format!(
                    "Status: {} -> {}{}",
                    current.status,
                    target.as_str(),
                    input
                        .comment
                        .as_deref()
                        .map(|c| format!(" | Comment: {}", c))
                        .unwrap_or_default()
                );
                self.create_snapshot_tx(tx, &current, user_id, Some(&change_summary))
                    .await?;

                // 根据目标状态设置额外字段
                let updated = sqlx::query_as::<_, Report>(
                    r#"
                    UPDATE reports SET
                        status = $2,
                        reviewer_id = CASE
                            WHEN $2 = 'approved' THEN $3
                            ELSE reviewer_id
                        END,
                        approved_at = CASE
                            WHEN $2 = 'approved' THEN NOW()
                            ELSE approved_at
                        END,
                        published_at = CASE
                            WHEN $2 = 'published' THEN NOW()
                            ELSE published_at
                        END,
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(report_id)
                .bind(target.as_str())
                .bind(input.reviewer_id.or(Some(user_id)))
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    // ──────────────────────────────────────────────────────────
    // 内部辅助方法
    // ──────────────────────────────────────────────────────────

    /// 创建报告快照。
    ///
    /// 每次内容更新或状态变更前调用，用于版本历史追溯。
    async fn create_snapshot_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        report: &Report,
        changed_by: Uuid,
        change_summary: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO report_snapshots (
                report_id, tenant_id, snapshot_version, content, changed_by, change_summary
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (report_id, snapshot_version) DO NOTHING
            "#,
        )
        .bind(report.id)
        .bind(report.tenant_id)
        .bind(report.version)
        .bind(&report.content)
        .bind(changed_by)
        .bind(change_summary)
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    /// 从模板加载初始 content 骨架。
    ///
    /// 读取模板的 sections JSON 数组，为每个章节创建空的 content 条目。
    async fn load_template_skeleton(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        template_id: Uuid,
    ) -> Result<serde_json::Value> {
        let template_sections: Option<serde_json::Value> = sqlx::query_scalar(
            r#"
            SELECT sections FROM report_templates
            WHERE id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(template_id)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let sections = template_sections.ok_or_else(|| {
            Error::NotFound(format!("Template {} not found", template_id))
        })?;

        // 将模板 sections 数组转换为 content 骨架
        // 模板 sections: [{"id": "cover", "type": "cover", ...}, ...]
        // 报告 content: {"sections": {"cover": {}, "executive_summary": {}}, "metadata": {}}
        let mut content_sections = serde_json::Map::new();

        if let serde_json::Value::Array(section_defs) = &sections {
            for def in section_defs {
                if let Some(section_id) = def.get("id").and_then(|v| v.as_str()) {
                    // 静态章节直接填入 content
                    let initial = if def.get("type").and_then(|v| v.as_str()) == Some("static") {
                        serde_json::json!({
                            "markdown": def.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                            "html": ""
                        })
                    } else {
                        serde_json::json!({})
                    };
                    content_sections.insert(section_id.to_string(), initial);
                }
            }
        }

        Ok(serde_json::json!({
            "sections": content_sections,
            "metadata": {
                "template_id": template_id,
                "generated_by": "user"
            }
        }))
    }

    /// 拼接列表过滤条件到 QueryBuilder。
    fn push_list_filters<'a>(
        &self,
        qb: &mut QueryBuilder<'a, Postgres>,
        query: &'a ListReportsQuery,
    ) {
        if let Some(ref status) = query.status {
            qb.push(" AND status = ").push_bind(status.as_str());
        }
        if let Some(ref period_type) = query.period_type {
            qb.push(" AND period_type = ").push_bind(period_type.as_str());
        }
        if let Some(author_id) = query.author_id {
            qb.push(" AND author_id = ").push_bind(author_id);
        }
        if let Some(date_from) = query.date_from {
            qb.push(" AND period_start >= ").push_bind(date_from);
        }
        if let Some(date_to) = query.date_to {
            qb.push(" AND period_end <= ").push_bind(date_to);
        }
    }

    /// 设置报告的导出文件路径。
    ///
    /// 导出完成后由 Worker 调用，将 MinIO object key 写入对应字段。
    pub async fn set_export_key(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        format: ExportFormat,
        object_key: &str,
    ) -> Result<()> {
        let column = match format {
            ExportFormat::Pdf => "pdf_object_key",
            ExportFormat::Docx => "docx_object_key",
            ExportFormat::Html => "html_object_key",
        };

        // 由于列名无法参数化，此处使用格式化字符串拼接（列名已通过 match 白名单保护）
        let sql = format!(
            "UPDATE reports SET {column} = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL"
        );

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query(&sql)
                    .bind(report_id)
                    .bind(object_key)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await
    }
}
```

### 3.3 数据库行映射结构体

```rust
// 在 crates/law-eye-db/src/models.rs 中新增:

/// 报告完整行（含 content 大字段）
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Report {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub title: String,
    pub report_number: Option<String>,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub template_id: Option<Uuid>,
    pub content: serde_json::Value,
    pub status: String,
    pub author_id: Uuid,
    pub reviewer_id: Option<Uuid>,
    pub approved_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
    pub pdf_object_key: Option<String>,
    pub docx_object_key: Option<String>,
    pub html_object_key: Option<String>,
    pub version: i64,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 报告列表摘要行（不含 content 大字段，用于列表查询）
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReportSummary {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub title: String,
    pub report_number: Option<String>,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub template_id: Option<Uuid>,
    pub status: String,
    pub author_id: Uuid,
    pub reviewer_id: Option<Uuid>,
    pub pdf_object_key: Option<String>,
    pub docx_object_key: Option<String>,
    pub html_object_key: Option<String>,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 报告快照行
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReportSnapshot {
    pub id: Uuid,
    pub report_id: Uuid,
    pub tenant_id: Uuid,
    pub snapshot_version: i64,
    pub content: serde_json::Value,
    pub changed_by: Uuid,
    pub change_summary: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// 报告模板行
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ReportTemplate {
    pub id: Uuid,
    pub tenant_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub slug: String,
    pub report_type: String,
    pub audience: String,
    pub sections: serde_json::Value,
    pub style_config: serde_json::Value,
    pub body_template: Option<String>,
    pub is_system: bool,
    pub version: i64,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

---

## 四、ReportTemplateService 设计 (`template_service.rs`)

```rust
// crates/law-eye-core/src/report/template_service.rs

use super::types::*;
use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

/// 报告模板管理服务。
///
/// 系统模板 vs 租户模板:
/// - 系统模板: tenant_id IS NULL, is_system = true，所有租户可见
/// - 租户模板: tenant_id = 当前租户, is_system = false，仅当前租户可见
/// - 系统模板只读（不可由普通用户修改/删除）
pub struct ReportTemplateService {
    pool: PgPool,
}

impl ReportTemplateService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// 列出当前租户可用的所有模板（系统模板 + 租户自有模板）。
    ///
    /// SQL 逻辑:
    ///   WHERE deleted_at IS NULL
    ///     AND (tenant_id IS NULL OR tenant_id = $1)
    ///     AND (可选 report_type / audience 过滤)
    ///   ORDER BY is_system DESC, name ASC
    pub async fn list(
        &self,
        tenant_id: Uuid,
        query: &ListTemplatesQuery,
    ) -> Result<(Vec<ReportTemplate>, i64)> {
        let limit = query.limit.unwrap_or(50).clamp(1, 200);
        let offset = query.offset.unwrap_or(0).max(0);
        let include_system = query.include_system.unwrap_or(true);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 总数
                let mut count_qb: QueryBuilder<'_, Postgres> = QueryBuilder::new(
                    "SELECT COUNT(*)::bigint FROM report_templates WHERE deleted_at IS NULL",
                );
                // 系统模板对所有租户可见，租户模板仅当前租户可见
                // RLS 已处理租户隔离，但我们在应用层也显式控制
                if include_system {
                    count_qb.push(" AND (tenant_id IS NULL OR tenant_id = ");
                    count_qb.push_bind(tenant_id);
                    count_qb.push(")");
                } else {
                    count_qb.push(" AND tenant_id = ");
                    count_qb.push_bind(tenant_id);
                }
                Self::push_template_filters(&mut count_qb, query);

                let (total,): (i64,) = count_qb
                    .build_query_as()
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                // 数据
                let mut data_qb: QueryBuilder<'_, Postgres> = QueryBuilder::new(
                    "SELECT * FROM report_templates WHERE deleted_at IS NULL",
                );
                if include_system {
                    data_qb.push(" AND (tenant_id IS NULL OR tenant_id = ");
                    data_qb.push_bind(tenant_id);
                    data_qb.push(")");
                } else {
                    data_qb.push(" AND tenant_id = ");
                    data_qb.push_bind(tenant_id);
                }
                Self::push_template_filters(&mut data_qb, query);
                data_qb.push(" ORDER BY is_system DESC, name ASC");
                data_qb.push(" LIMIT ").push_bind(limit);
                data_qb.push(" OFFSET ").push_bind(offset);

                let rows = data_qb
                    .build_query_as::<ReportTemplate>()
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                Ok((rows, total))
            })
        })
        .await
    }

    /// 根据 ID 获取模板详情。
    ///
    /// 同时可见系统模板和当前租户的自有模板。
    pub async fn get_by_id(
        &self,
        tenant_id: Uuid,
        template_id: Uuid,
    ) -> Result<ReportTemplate> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportTemplate>(
                    r#"
                    SELECT * FROM report_templates
                    WHERE id = $1
                      AND deleted_at IS NULL
                      AND (tenant_id IS NULL OR tenant_id = $2)
                    "#,
                )
                .bind(template_id)
                .bind(tenant_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Template {} not found", template_id)))
            })
        })
        .await
    }

    /// 创建租户自有模板。
    ///
    /// 业务逻辑:
    /// 1. 校验 slug 在当前租户下唯一
    /// 2. 系统模板不可由此方法创建（is_system = false）
    /// 3. tenant_id 强制设为当前租户
    pub async fn create(
        &self,
        tenant_id: Uuid,
        input: CreateTemplateInput,
    ) -> Result<ReportTemplate> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let template = sqlx::query_as::<_, ReportTemplate>(
                    r#"
                    INSERT INTO report_templates (
                        tenant_id, name, slug, description, report_type, audience,
                        sections, style_config, body_template, is_system
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(&input.name)
                .bind(&input.slug)
                .bind(input.description.as_deref())
                .bind(&input.report_type)
                .bind(input.audience.as_deref().unwrap_or("internal"))
                .bind(&input.sections)
                .bind(&input.style_config.unwrap_or(serde_json::json!({})))
                .bind(input.body_template.as_deref())
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| {
                    if e.to_string().contains("report_templates_tenant_slug_unique") {
                        Error::Conflict(format!(
                            "Template with slug '{}' already exists",
                            input.slug
                        ))
                    } else {
                        Error::Database(e.to_string())
                    }
                })?;

                Ok(template)
            })
        })
        .await
    }

    /// 更新租户自有模板。
    ///
    /// 业务逻辑:
    /// 1. 系统模板不可编辑
    /// 2. 支持乐观并发控制 (expected_version)
    pub async fn update(
        &self,
        tenant_id: Uuid,
        template_id: Uuid,
        input: UpdateTemplateInput,
    ) -> Result<ReportTemplate> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 先加载并校验
                let current = sqlx::query_as::<_, ReportTemplate>(
                    "SELECT * FROM report_templates WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(template_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Template {} not found", template_id)))?;

                // 系统模板不可编辑
                if current.is_system {
                    return Err(Error::Forbidden(
                        "System templates cannot be modified".to_string(),
                    ));
                }

                // 乐观并发检查
                if let Some(expected) = input.expected_version {
                    if current.version != expected {
                        return Err(Error::Conflict(format!(
                            "Template {} version mismatch (expected {}, got {})",
                            template_id, expected, current.version
                        )));
                    }
                }

                let updated = sqlx::query_as::<_, ReportTemplate>(
                    r#"
                    UPDATE report_templates SET
                        name = COALESCE($2, name),
                        description = COALESCE($3, description),
                        sections = COALESCE($4, sections),
                        style_config = COALESCE($5, style_config),
                        body_template = COALESCE($6, body_template),
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(template_id)
                .bind(input.name.as_deref())
                .bind(input.description.as_deref())
                .bind(&input.sections)
                .bind(&input.style_config)
                .bind(input.body_template.as_deref())
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    /// 软删除租户自有模板。
    ///
    /// 业务逻辑:
    /// 1. 系统模板不可删除
    /// 2. 已被报告引用的模板可以删除（reports.template_id 为 SET NULL）
    pub async fn delete(
        &self,
        tenant_id: Uuid,
        template_id: Uuid,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let current = sqlx::query_as::<_, ReportTemplate>(
                    "SELECT * FROM report_templates WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(template_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Template {} not found", template_id)))?;

                if current.is_system {
                    return Err(Error::Forbidden(
                        "System templates cannot be deleted".to_string(),
                    ));
                }

                sqlx::query(
                    "UPDATE report_templates SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
                )
                .bind(template_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(())
            })
        })
        .await
    }

    /// 内部: 拼接模板过滤条件
    fn push_template_filters<'a>(
        qb: &mut QueryBuilder<'a, Postgres>,
        query: &'a ListTemplatesQuery,
    ) {
        if let Some(ref report_type) = query.report_type {
            qb.push(" AND report_type = ").push_bind(report_type.as_str());
        }
        if let Some(ref audience) = query.audience {
            qb.push(" AND audience = ").push_bind(audience.as_str());
        }
    }
}
```

---

## 五、ReportDataAggregator 设计 (`aggregator.rs`)

```rust
// crates/law-eye-core/src/report/aggregator.rs

use crate::statistics::{StatisticsQuery, StatisticsService};
use crate::ArticleService;
use chrono::NaiveDate;
use law_eye_common::{Error, Result};
use law_eye_db::{Article, Report, ReportTemplate};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

/// 报告数据聚合器。
///
/// 职责:
/// 1. 根据模板的 sections 定义，从 StatisticsService / ArticleService 拉取数据
/// 2. 将拉取的数据填入报告的 content JSONB 结构
/// 3. 不涉及 AI 摘要生成（由 AI 集成模块单独处理）
///
/// 数据源映射:
///   - "domain:legislation"         → ArticleService 按 domain_root 过滤
///   - "domain:regulation"          → ArticleService 按 domain_root 过滤
///   - "statistics"                 → StatisticsService 全部 7 维聚合
///   - "statistics_regional"        → StatisticsService.regional_distribution
///   - "statistics_industry"        → StatisticsService.industry_distribution
///   - "statistics_timeline"        → StatisticsService.timeline_by_dimension
///   - "statistics_overview"        → StatisticsService.overview
///   - "high_risk"                  → ArticleService 按 risk_score > 70 过滤
///   - "ai_summary"                → 标记为待 AI 填充，aggregator 不处理
///   - "ai_recommendations"        → 标记为待 AI 填充，aggregator 不处理
///   - "upcoming_regulations"       → ArticleService 按 effective_date 过滤
pub struct ReportDataAggregator {
    pool: PgPool,
}

impl ReportDataAggregator {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// 根据模板定义聚合数据并填充到报告 content 中。
    ///
    /// 参数:
    /// - tenant_id: 租户 ID
    /// - template: 报告使用的模板
    /// - period_start / period_end: 报告覆盖的时间范围
    /// - existing_content: 当前报告的 content（可能已有用户手动编辑的内容）
    ///
    /// 返回:
    /// - 填充后的完整 content JSONB
    ///
    /// 业务逻辑:
    /// 1. 遍历模板的 sections 数组
    /// 2. 对 auto_fill = true 的章节，根据 data_source 拉取数据
    /// 3. 对 auto_fill = false 的章节，保留 existing_content 中的内容
    /// 4. AI 相关数据源 (ai_summary, ai_recommendations) 仅标记为 "pending_ai"
    pub async fn aggregate(
        &self,
        tenant_id: Uuid,
        template: &ReportTemplate,
        period_start: NaiveDate,
        period_end: NaiveDate,
        existing_content: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        let statistics_svc = StatisticsService::new(self.pool.clone());
        let article_svc = ArticleService::new(self.pool.clone());

        let stats_query = StatisticsQuery {
            date_from: Some(period_start),
            date_to: Some(period_end),
        };

        let mut sections = serde_json::Map::new();

        // 保留现有的 metadata
        let metadata = existing_content
            .get("metadata")
            .cloned()
            .unwrap_or(json!({}));

        // 遍历模板章节定义
        let section_defs = template
            .sections
            .as_array()
            .cloned()
            .unwrap_or_default();

        for def in &section_defs {
            let section_id = match def.get("id").and_then(|v| v.as_str()) {
                Some(id) => id,
                None => continue,
            };

            let auto_fill = def
                .get("auto_fill")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if !auto_fill {
                // 保留用户手动编辑的内容
                if let Some(existing) = existing_content
                    .get("sections")
                    .and_then(|s| s.get(section_id))
                {
                    sections.insert(section_id.to_string(), existing.clone());
                }
                continue;
            }

            let data_source = def
                .get("data_source")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let section_content = self
                .fill_section(
                    tenant_id,
                    &statistics_svc,
                    &article_svc,
                    &stats_query,
                    period_start,
                    period_end,
                    section_id,
                    data_source,
                )
                .await?;

            sections.insert(section_id.to_string(), section_content);
        }

        Ok(json!({
            "sections": sections,
            "metadata": {
                "template_id": template.id,
                "generated_by": "system",
                "data_query_params": {
                    "date_from": period_start.to_string(),
                    "date_to": period_end.to_string()
                },
                "generation_timestamp": chrono::Utc::now().to_rfc3339(),
                "original_metadata": metadata
            }
        }))
    }

    /// 填充单个章节的数据。
    ///
    /// 根据 data_source 字符串决定从哪个 Service 拉取数据。
    #[allow(clippy::too_many_arguments)]
    async fn fill_section(
        &self,
        tenant_id: Uuid,
        statistics_svc: &StatisticsService,
        article_svc: &ArticleService,
        stats_query: &StatisticsQuery,
        period_start: NaiveDate,
        period_end: NaiveDate,
        section_id: &str,
        data_source: &str,
    ) -> Result<serde_json::Value> {
        match data_source {
            // 封面数据
            "report_meta" => Ok(json!({
                "auto_generated": true,
                "period_start": period_start.to_string(),
                "period_end": period_end.to_string()
            })),

            // AI 生成的章节 — 标记为待处理，由 AI 集成模块异步填充
            "ai_summary" | "ai_recommendations" => Ok(json!({
                "status": "pending_ai",
                "data_source": data_source,
                "markdown": "",
                "html": ""
            })),

            // 统计概览
            "statistics_overview" | "statistics" => {
                let overview = statistics_svc.overview(tenant_id).await?;
                let regional = statistics_svc
                    .regional_distribution(tenant_id, stats_query)
                    .await?;
                let industry = statistics_svc
                    .industry_distribution(tenant_id, stats_query, false)
                    .await?;
                let importance = statistics_svc
                    .importance_distribution(tenant_id, stats_query)
                    .await?;
                let authority = statistics_svc
                    .authority_distribution(tenant_id, stats_query)
                    .await?;

                Ok(json!({
                    "charts": [
                        {
                            "chart_id": "overview",
                            "type": "summary",
                            "title": "数据概览",
                            "data_snapshot": serde_json::to_value(&overview)
                                .unwrap_or(json!({}))
                        },
                        {
                            "chart_id": "regional_heatmap",
                            "type": "heatmap",
                            "title": "地域分布热力图",
                            "data_snapshot": serde_json::to_value(&regional)
                                .unwrap_or(json!({}))
                        },
                        {
                            "chart_id": "industry_pie",
                            "type": "pie",
                            "title": "行业分布",
                            "data_snapshot": serde_json::to_value(&industry)
                                .unwrap_or(json!({}))
                        },
                        {
                            "chart_id": "importance_bar",
                            "type": "bar",
                            "title": "重要性分布",
                            "data_snapshot": serde_json::to_value(&importance)
                                .unwrap_or(json!({}))
                        },
                        {
                            "chart_id": "authority_bar",
                            "type": "bar",
                            "title": "权威等级分布",
                            "data_snapshot": serde_json::to_value(&authority)
                                .unwrap_or(json!({}))
                        }
                    ],
                    "markdown": ""
                }))
            }

            // 单维度统计
            "statistics_regional" => {
                let data = statistics_svc
                    .regional_distribution(tenant_id, stats_query)
                    .await?;
                Ok(json!({
                    "charts": [{
                        "chart_id": "regional_heatmap",
                        "type": "heatmap",
                        "title": "地域分布",
                        "data_snapshot": serde_json::to_value(&data).unwrap_or(json!({}))
                    }],
                    "markdown": ""
                }))
            }

            "statistics_industry" => {
                let data = statistics_svc
                    .industry_distribution(tenant_id, stats_query, true)
                    .await?;
                Ok(json!({
                    "charts": [{
                        "chart_id": "industry_pie",
                        "type": "pie",
                        "title": "行业分布",
                        "data_snapshot": serde_json::to_value(&data).unwrap_or(json!({}))
                    }],
                    "markdown": ""
                }))
            }

            "statistics_timeline" => {
                let timeline = statistics_svc
                    .timeline_by_dimension(
                        tenant_id,
                        &crate::statistics::TimelineQuery {
                            dimension: "domain".to_string(),
                            granularity: Some("daily".to_string()),
                            days: Some(
                                (period_end - period_start).num_days() as i32,
                            ),
                            top_n: Some(5),
                        },
                    )
                    .await?;
                Ok(json!({
                    "charts": [{
                        "chart_id": "timeline",
                        "type": "line",
                        "title": "趋势分析",
                        "data_snapshot": serde_json::to_value(&timeline).unwrap_or(json!({}))
                    }],
                    "markdown": ""
                }))
            }

            // 按法律领域过滤的资讯列表
            source if source.starts_with("domain:") => {
                let parts: Vec<&str> = source.split(':').collect();
                let domain_root = parts.get(1).unwrap_or(&"");
                let min_importance = parts
                    .get(2)
                    .and_then(|s| {
                        // 解析 "importance>=4" 格式
                        s.strip_prefix("importance>=")
                            .and_then(|v| v.parse::<i32>().ok())
                    });

                let articles = self
                    .fetch_articles_by_domain(
                        tenant_id,
                        domain_root,
                        period_start,
                        period_end,
                        min_importance,
                        50, // 每个章节最多 50 篇
                    )
                    .await?;

                let article_summaries: Vec<serde_json::Value> = articles
                    .iter()
                    .map(|a| {
                        json!({
                            "article_id": a.id,
                            "title": a.title,
                            "summary": a.summary,
                            "risk_score": a.risk_score,
                            "importance": a.importance,
                            "link": a.link,
                            "published_at": a.published_at,
                            "issuer": a.issuer,
                            "region_code": a.region_code
                        })
                    })
                    .collect();

                Ok(json!({
                    "articles": article_summaries,
                    "total_count": articles.len(),
                    "markdown": ""
                }))
            }

            // 高风险资讯
            "high_risk" => {
                let articles = self
                    .fetch_high_risk_articles(tenant_id, period_start, period_end, 20)
                    .await?;

                let article_summaries: Vec<serde_json::Value> = articles
                    .iter()
                    .map(|a| {
                        json!({
                            "article_id": a.id,
                            "title": a.title,
                            "summary": a.summary,
                            "risk_score": a.risk_score,
                            "importance": a.importance,
                            "link": a.link,
                            "issuer": a.issuer
                        })
                    })
                    .collect();

                Ok(json!({
                    "articles": article_summaries,
                    "total_count": articles.len(),
                    "markdown": ""
                }))
            }

            // 合规日历 — 即将生效的法规
            "upcoming_regulations" => {
                let articles = self
                    .fetch_upcoming_regulations(tenant_id, period_end, 30, 20)
                    .await?;

                let entries: Vec<serde_json::Value> = articles
                    .iter()
                    .map(|a| {
                        json!({
                            "article_id": a.id,
                            "title": a.title,
                            "effective_date": a.effective_date,
                            "issuer": a.issuer,
                            "importance": a.importance
                        })
                    })
                    .collect();

                Ok(json!({
                    "entries": entries,
                    "markdown": ""
                }))
            }

            // 未知数据源 — 返回空内容
            _ => Ok(json!({
                "status": "unknown_data_source",
                "data_source": data_source
            })),
        }
    }

    // ──────────────────────────────────────────────────────────
    // 数据查询辅助方法
    // ──────────────────────────────────────────────────────────

    /// 按领域 + 时间范围查询资讯。
    ///
    /// SQL:
    ///   SELECT * FROM articles
    ///   WHERE tenant_id = $1 AND deleted_at IS NULL
    ///     AND domain_root = $2
    ///     AND created_at >= $3 AND created_at < $4 + 1 day
    ///     AND ($5::int IS NULL OR importance >= $5)
    ///   ORDER BY importance DESC NULLS LAST, created_at DESC
    ///   LIMIT $6
    async fn fetch_articles_by_domain(
        &self,
        tenant_id: Uuid,
        domain_root: &str,
        period_start: NaiveDate,
        period_end: NaiveDate,
        min_importance: Option<i32>,
        limit: i64,
    ) -> Result<Vec<Article>> {
        crate::tenant::with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                    SELECT * FROM articles
                    WHERE deleted_at IS NULL
                      AND domain_root = $1
                      AND created_at >= $2::date::timestamptz
                      AND created_at < ($3::date + 1)::timestamptz
                      AND ($4::int IS NULL OR importance >= $4)
                    ORDER BY importance DESC NULLS LAST, created_at DESC
                    LIMIT $5
                    "#,
                )
                .bind(domain_root)
                .bind(period_start)
                .bind(period_end)
                .bind(min_importance)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// 查询高风险资讯 (risk_score > 70)。
    ///
    /// SQL:
    ///   SELECT * FROM articles
    ///   WHERE tenant_id = $1 AND deleted_at IS NULL
    ///     AND risk_score > 70
    ///     AND created_at BETWEEN period_start AND period_end
    ///   ORDER BY risk_score DESC
    ///   LIMIT $4
    async fn fetch_high_risk_articles(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
        limit: i64,
    ) -> Result<Vec<Article>> {
        crate::tenant::with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                    SELECT * FROM articles
                    WHERE deleted_at IS NULL
                      AND risk_score > 70
                      AND created_at >= $1::date::timestamptz
                      AND created_at < ($2::date + 1)::timestamptz
                    ORDER BY risk_score DESC
                    LIMIT $3
                    "#,
                )
                .bind(period_start)
                .bind(period_end)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    /// 查询即将生效的法规（effective_date 在 period_end 之后的 N 天内）。
    ///
    /// SQL:
    ///   SELECT * FROM articles
    ///   WHERE tenant_id = $1 AND deleted_at IS NULL
    ///     AND effective_date IS NOT NULL
    ///     AND effective_date BETWEEN period_end AND period_end + N days
    ///   ORDER BY effective_date ASC
    ///   LIMIT $4
    async fn fetch_upcoming_regulations(
        &self,
        tenant_id: Uuid,
        period_end: NaiveDate,
        lookahead_days: i32,
        limit: i64,
    ) -> Result<Vec<Article>> {
        crate::tenant::with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, Article>(
                    r#"
                    SELECT * FROM articles
                    WHERE deleted_at IS NULL
                      AND effective_date IS NOT NULL
                      AND effective_date >= $1
                      AND effective_date <= ($1::date + ($2::int * INTERVAL '1 day'))::date
                    ORDER BY effective_date ASC
                    LIMIT $3
                    "#,
                )
                .bind(period_end)
                .bind(lookahead_days)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }
}
```

---

## 六、AI 集成设计

### 6.1 AI 摘要生成

AI 集成通过 `law-eye-ai` 的 `LlmGateway` 实现，不直接放在 `aggregator.rs` 中，而是作为独立的异步步骤。

```rust
// crates/law-eye-core/src/report/service.rs 中新增方法

impl ReportService {
    /// 触发 AI 填充报告章节（异步任务）。
    ///
    /// 业务逻辑:
    /// 1. 将报告状态从 draft → generating
    /// 2. 入队 ReportGenerateTask 到 Redis
    /// 3. Worker 消费后调用 fill_ai_sections()
    /// 4. 完成后将状态从 generating → draft
    pub async fn trigger_ai_generation(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        user_id: Uuid,
        task_queue: &law_eye_queue::TaskQueue,
    ) -> Result<()> {
        // 状态转换: draft → generating
        self.transition_status(
            tenant_id,
            report_id,
            user_id,
            StatusTransitionInput {
                target_status: "generating".to_string(),
                reviewer_id: None,
                comment: Some("AI generation triggered".to_string()),
            },
        )
        .await?;

        // 入队异步任务
        let task = ReportGenerateTask {
            tenant_id,
            report_id,
            auto_ai_summary: true,
        };
        task_queue
            .enqueue_retryable("report:generate", task)
            .await?;

        Ok(())
    }

    /// Worker 端: 使用 AI 填充报告的 pending_ai 章节。
    ///
    /// 参数:
    /// - gateway: LlmGateway 实例
    /// - report: 当前报告
    ///
    /// 业务逻辑:
    /// 1. 遍历 content.sections，找到 status = "pending_ai" 的章节
    /// 2. 收集报告中已有的数据（统计摘要、资讯列表）作为 AI 输入上下文
    /// 3. 调用 LlmGateway.chat_json() 生成摘要/建议
    /// 4. 将生成的文本写入对应章节
    /// 5. 将状态从 generating → draft
    pub async fn fill_ai_sections(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        gateway: &law_eye_ai::LlmGateway,
    ) -> Result<Report> {
        use crate::tenant::with_tenant_tx;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let mut report = sqlx::query_as::<_, Report>(
                    "SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(report_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                let mut content = report.content.clone();
                let sections = content
                    .get_mut("sections")
                    .and_then(|v| v.as_object_mut());

                if let Some(sections) = sections {
                    // 收集报告上下文用于 AI 输入
                    let context = self.build_ai_context(sections);

                    // 填充 executive_summary
                    if let Some(section) = sections.get("executive_summary") {
                        if section.get("status").and_then(|v| v.as_str()) == Some("pending_ai") {
                            let prompt = Self::build_summary_prompt(
                                &report.title,
                                &report.period_start.to_string(),
                                &report.period_end.to_string(),
                                &context,
                            );
                            let ai_result: AiSummaryResponse = gateway
                                .chat_json(REPORT_SUMMARY_SYSTEM_PROMPT, &prompt)
                                .await?;

                            sections.insert(
                                "executive_summary".to_string(),
                                json!({
                                    "markdown": ai_result.markdown,
                                    "html": ai_result.html,
                                    "status": "ai_completed",
                                    "ai_model": "gpt-4o"
                                }),
                            );
                        }
                    }

                    // 填充 recommendations
                    if let Some(section) = sections.get("recommendations") {
                        if section.get("status").and_then(|v| v.as_str()) == Some("pending_ai") {
                            let prompt = Self::build_recommendations_prompt(
                                &report.title,
                                &context,
                            );
                            let ai_result: AiSummaryResponse = gateway
                                .chat_json(REPORT_RECOMMENDATIONS_SYSTEM_PROMPT, &prompt)
                                .await?;

                            sections.insert(
                                "recommendations".to_string(),
                                json!({
                                    "markdown": ai_result.markdown,
                                    "html": ai_result.html,
                                    "status": "ai_completed",
                                    "ai_model": "gpt-4o"
                                }),
                            );
                        }
                    }
                }

                // 更新 content 并将状态回退到 draft
                let updated = sqlx::query_as::<_, Report>(
                    r#"
                    UPDATE reports SET
                        content = $2,
                        status = 'draft',
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(report_id)
                .bind(&content)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    /// 从已填充的章节数据中提取 AI 输入上下文。
    fn build_ai_context(sections: &serde_json::Map<String, serde_json::Value>) -> String {
        let mut context_parts = Vec::new();

        for (section_id, section_data) in sections {
            // 跳过 pending_ai 章节和封面/目录
            if section_data.get("status").and_then(|v| v.as_str()) == Some("pending_ai") {
                continue;
            }
            if section_id == "cover" || section_id == "toc" || section_id == "disclaimer" {
                continue;
            }

            // 提取资讯标题列表
            if let Some(articles) = section_data.get("articles").and_then(|v| v.as_array()) {
                let titles: Vec<&str> = articles
                    .iter()
                    .filter_map(|a| a.get("title").and_then(|t| t.as_str()))
                    .take(10) // 限制上下文长度
                    .collect();
                if !titles.is_empty() {
                    context_parts.push(format!(
                        "[{}] {} 篇资讯: {}",
                        section_id,
                        articles.len(),
                        titles.join("; ")
                    ));
                }
            }

            // 提取图表统计概要
            if let Some(charts) = section_data.get("charts").and_then(|v| v.as_array()) {
                for chart in charts {
                    if let Some(title) = chart.get("title").and_then(|t| t.as_str()) {
                        context_parts.push(format!("[{}] 图表: {}", section_id, title));
                    }
                }
            }
        }

        context_parts.join("\n")
    }

    /// 构建执行摘要的 AI 提示词。
    fn build_summary_prompt(
        title: &str,
        period_start: &str,
        period_end: &str,
        context: &str,
    ) -> String {
        format!(
            r#"请为以下法律合规报告生成一份执行摘要。

报告标题: {title}
报告期间: {period_start} 至 {period_end}

报告内容概要:
{context}

要求:
1. 使用中文撰写
2. 300-500字
3. 突出本期最重要的法规动态和风险事项
4. 使用 Markdown 格式
5. 包含数据支撑（如资讯数量、高风险数量等）
6. 返回 JSON 格式: {{"markdown": "...", "html": "..."}}"#
        )
    }

    /// 构建合规建议的 AI 提示词。
    fn build_recommendations_prompt(title: &str, context: &str) -> String {
        format!(
            r#"基于以下法律合规报告的内容，生成合规建议。

报告标题: {title}

报告内容概要:
{context}

要求:
1. 使用中文撰写
2. 3-5 条具体可执行的建议
3. 每条建议包含: 标题、详细说明、优先级(高/中/低)
4. 使用 Markdown 格式
5. 返回 JSON 格式: {{"markdown": "...", "html": "..."}}"#
        )
    }
}
```

### 6.2 AI Prompt 模板常量

```rust
// crates/law-eye-core/src/report/service.rs 中定义

/// 执行摘要系统提示词
const REPORT_SUMMARY_SYSTEM_PROMPT: &str = r#"你是一位资深法律合规分析师。
你的任务是为法律合规定期报告撰写执行摘要（Executive Summary）。

格式要求:
- 使用中文
- 300-500字
- Markdown 格式
- 突出重点法规动态、监管趋势和风险事项
- 包含数据支撑

返回 JSON:
{"markdown": "完整的Markdown文本", "html": "对应的HTML文本"}"#;

/// 合规建议系统提示词
const REPORT_RECOMMENDATIONS_SYSTEM_PROMPT: &str = r#"你是一位资深法律合规顾问。
你的任务是基于法律合规报告的内容，提出具体可执行的合规建议。

格式要求:
- 使用中文
- 3-5条建议
- 每条包含标题、详细说明、优先级
- Markdown 格式

返回 JSON:
{"markdown": "完整的Markdown文本", "html": "对应的HTML文本"}"#;

/// AI 生成结果的反序列化类型
#[derive(Debug, Clone, serde::Deserialize)]
struct AiSummaryResponse {
    markdown: String,
    html: String,
}
```

---

## 七、报告编号生成器 (`number.rs`)

```rust
// crates/law-eye-core/src/report/number.rs

use super::types::PeriodType;
use chrono::{Datelike, IsoWeek, NaiveDate};
use law_eye_common::{Error, Result};
use sqlx::{Postgres, Transaction};

/// 报告编号生成器。
///
/// 编号规则:
/// | 类型      | 格式                    | 示例              |
/// |-----------|-------------------------|-------------------|
/// | weekly    | LAW-WR-{year}-W{week}   | LAW-WR-2026-W07   |
/// | monthly   | LAW-MR-{year}-{month}   | LAW-MR-2026-02    |
/// | quarterly | LAW-QR-{year}-Q{quarter}| LAW-QR-2026-Q1    |
/// | custom    | LAW-CR-{year}-{seq}     | LAW-CR-2026-001   |
pub struct ReportNumberGenerator;

impl ReportNumberGenerator {
    /// 根据报告类型和起始日期生成编号。
    ///
    /// 对于 custom 类型，需要查询数据库获取当年的序列号。
    pub async fn generate(
        period_type: PeriodType,
        period_start: NaiveDate,
        tx: &mut Transaction<'_, Postgres>,
    ) -> Result<String> {
        let year = period_start.year();

        match period_type {
            PeriodType::Weekly => {
                let week = period_start.iso_week().week();
                Ok(format!("LAW-WR-{}-W{:02}", year, week))
            }
            PeriodType::Monthly => {
                let month = period_start.month();
                Ok(format!("LAW-MR-{}-{:02}", year, month))
            }
            PeriodType::Quarterly => {
                let quarter = (period_start.month() - 1) / 3 + 1;
                Ok(format!("LAW-QR-{}-Q{}", year, quarter))
            }
            PeriodType::Custom => {
                // 查询当年已有的 custom 报告数量作为序列号基础
                let (count,): (i64,) = sqlx::query_as(
                    r#"
                    SELECT COUNT(*)::bigint
                    FROM reports
                    WHERE period_type = 'custom'
                      AND report_number LIKE $1
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(format!("LAW-CR-{}-%", year))
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let seq = count + 1;
                Ok(format!("LAW-CR-{}-{:03}", year, seq))
            }
        }
    }
}
```

---

## 八、模块导出 (`mod.rs`)

```rust
// crates/law-eye-core/src/report/mod.rs

pub mod aggregator;
pub mod exporter;
pub mod number;
pub mod service;
pub mod template_service;
pub mod types;

pub use aggregator::ReportDataAggregator;
pub use number::ReportNumberGenerator;
pub use service::ReportService;
pub use template_service::ReportTemplateService;
pub use types::*;
```

在 `lib.rs` 中添加:

```rust
// crates/law-eye-core/src/lib.rs

pub mod report;  // 新增

// 在 pub use 区域添加:
pub use report::{ReportDataAggregator, ReportService, ReportTemplateService};
```

---

## 九、错误处理策略

### 9.1 报告领域错误

报告模块不定义独立的 `ReportError` 枚举，而是复用项目已有的 `law_eye_common::Error`。这与项目中 `StatisticsService`、`ArticleService` 等其他服务保持一致。

各错误场景映射:

| 场景 | Error 变体 | 示例 |
|:-----|:-----------|:-----|
| 报告不存在 | `Error::NotFound` | `Report {id} not found` |
| 模板不存在 | `Error::NotFound` | `Template {id} not found` |
| 快照不存在 | `Error::NotFound` | `Snapshot v{ver} for report {id} not found` |
| 非法状态转换 | `Error::Validation` | `Cannot transition from 'draft' to 'archived'` |
| period_end < period_start | `Error::Validation` | `period_end must be >= period_start` |
| 非 draft 状态编辑 | `Error::Validation` | `Report in 'review' status cannot be edited` |
| 乐观锁冲突 | `Error::Conflict` | `Report {id} version mismatch (expected 3, got 5)` |
| slug 重复 | `Error::Conflict` | `Template with slug 'xxx' already exists` |
| 修改系统模板 | `Error::Forbidden` | `System templates cannot be modified` |
| 删除系统模板 | `Error::Forbidden` | `System templates cannot be deleted` |
| 数据库错误 | `Error::Database` | 透传 sqlx 错误 |
| AI 调用失败 | `Error::Internal` | 透传 LlmGateway 错误 |
| Redis 队列错误 | `Error::Internal` | 透传 TaskQueue 错误 |

### 9.2 错误处理模式

```rust
// 所有 Service 方法遵循统一模式:

// 1. 数据库错误 — 统一使用 .map_err(|e| Error::Database(e.to_string()))
sqlx::query(...)
    .execute(tx.as_mut())
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

// 2. 不存在 — 使用 .ok_or_else(|| Error::NotFound(...))
.fetch_optional(tx.as_mut())
.await
.map_err(|e| Error::Database(e.to_string()))?
.ok_or_else(|| Error::NotFound(format!("Report {} not found", id)))?;

// 3. 业务校验 — 直接返回 Error::Validation
if !current_status.can_transition_to(target) {
    return Err(Error::Validation(format!(
        "Cannot transition from '{}' to '{}'",
        current.status, target.as_str()
    )));
}

// 4. 唯一约束冲突 — 检测 sqlx 错误消息中的约束名
.map_err(|e| {
    if e.to_string().contains("report_templates_tenant_slug_unique") {
        Error::Conflict(...)
    } else {
        Error::Database(e.to_string())
    }
})?;
```

---

## 十、与 law-eye-queue 集成

### 10.1 新增队列名称

```rust
// 在 law-eye-queue 或 worker 中定义队列常量

/// 报告异步导出任务队列
pub const QUEUE_REPORT_EXPORT: &str = "report:export";

/// 报告 AI 生成任务队列
pub const QUEUE_REPORT_GENERATE: &str = "report:generate";
```

### 10.2 Worker 消费流程

```rust
// crates/law-eye-worker/src/main.rs 中新增 handler

/// 处理报告导出任务。
///
/// 流程:
/// 1. 从 Redis 队列 reserve 任务
/// 2. 加载报告和模板
/// 3. 渲染 HTML (Tera)
/// 4. 根据格式调用 browserless (PDF) 或 docx-rs (DOCX) 或直接输出 (HTML)
/// 5. 上传到 MinIO
/// 6. 更新报告的 object_key 字段
/// 7. ack 任务
async fn handle_report_export_task(
    report_service: &ReportService,
    object_service: &ObjectService,
    task: ReportExportTask,
) -> Result<()> {
    // 1. 加载报告
    let report = report_service
        .get_by_id(task.tenant_id, task.report_id)
        .await?;

    // 2. 渲染 HTML
    let html = render_report_html(&report)?;

    // 3. 导出为目标格式
    let (bytes, content_type) = match task.format {
        ExportFormat::Html => (html.into_bytes(), "text/html"),
        ExportFormat::Pdf => {
            let pdf_bytes = browserless_render_pdf(&html).await?;
            (pdf_bytes, "application/pdf")
        }
        ExportFormat::Docx => {
            let docx_bytes = build_docx(&report)?;
            (docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        }
    };

    // 4. 上传到 MinIO
    let object_key = format!(
        "reports/{}/{}/v{}.{}",
        task.tenant_id,
        task.report_id,
        report.version,
        task.format.extension()
    );
    object_service
        .upload(&object_key, &bytes, content_type)
        .await?;

    // 5. 更新报告 object_key
    report_service
        .set_export_key(task.tenant_id, task.report_id, task.format, &object_key)
        .await?;

    Ok(())
}

/// 处理报告 AI 生成任务。
///
/// 流程:
/// 1. 从 Redis 队列 reserve 任务
/// 2. 加载报告和模板
/// 3. 调用 ReportDataAggregator 填充数据
/// 4. 调用 ReportService.fill_ai_sections() 生成 AI 摘要
/// 5. 状态回退到 draft
/// 6. ack 任务
async fn handle_report_generate_task(
    report_service: &ReportService,
    aggregator: &ReportDataAggregator,
    template_service: &ReportTemplateService,
    gateway: &LlmGateway,
    task: ReportGenerateTask,
) -> Result<()> {
    // 1. 加载报告
    let report = report_service
        .get_by_id(task.tenant_id, task.report_id)
        .await?;

    // 2. 数据聚合（如果有模板）
    if let Some(template_id) = report.template_id {
        let template = template_service
            .get_by_id(task.tenant_id, template_id)
            .await?;

        let content = aggregator
            .aggregate(
                task.tenant_id,
                &template,
                report.period_start,
                report.period_end,
                &report.content,
            )
            .await?;

        // 更新报告内容（数据聚合结果）
        report_service
            .update(
                task.tenant_id,
                task.report_id,
                task.tenant_id, // system user
                UpdateReportInput {
                    title: None,
                    content: Some(content),
                    expected_version: None,
                },
            )
            .await?;
    }

    // 3. AI 填充
    if task.auto_ai_summary {
        report_service
            .fill_ai_sections(task.tenant_id, task.report_id, gateway)
            .await?;
    } else {
        // 仅回退状态
        report_service
            .transition_status(
                task.tenant_id,
                task.report_id,
                task.tenant_id,
                StatusTransitionInput {
                    target_status: "draft".to_string(),
                    reviewer_id: None,
                    comment: Some("Data aggregation completed".to_string()),
                },
            )
            .await?;
    }

    Ok(())
}
```

---

## 十一、SQL 查询清单

### 11.1 ReportService

| 方法 | SQL 操作 | 说明 |
|:-----|:---------|:-----|
| `create` | `INSERT INTO reports (...) VALUES (...) RETURNING *` | 创建草稿报告 |
| `get_by_id` | `SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL` | 按 ID 查询 |
| `list` (count) | `SELECT COUNT(*)::bigint FROM reports WHERE deleted_at IS NULL AND ...` | 列表总数 |
| `list` (data) | `SELECT id,title,... FROM reports WHERE deleted_at IS NULL AND ... ORDER BY period_start DESC LIMIT $N OFFSET $M` | 列表数据（不含 content） |
| `update` (lock) | `SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL FOR UPDATE` | 行级锁 |
| `update` (snapshot) | `INSERT INTO report_snapshots (...) VALUES (...) ON CONFLICT DO NOTHING` | 创建快照 |
| `update` (update) | `UPDATE reports SET title=COALESCE($2,title), content=COALESCE($3,content), ... WHERE id=$1 RETURNING *` | 更新内容 |
| `delete` | `UPDATE reports SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL` | 软删除 |
| `transition_status` | `UPDATE reports SET status=$2, reviewer_id=CASE..., approved_at=CASE..., published_at=CASE... WHERE id=$1 RETURNING *` | 状态变更 |
| `set_export_key` | `UPDATE reports SET {column}=$2 WHERE id=$1 AND deleted_at IS NULL` | 设置导出路径 |
| `list_snapshots` | `SELECT * FROM report_snapshots WHERE report_id=$1 ORDER BY snapshot_version DESC` | 快照列表 |
| `get_snapshot` | `SELECT * FROM report_snapshots WHERE report_id=$1 AND snapshot_version=$2` | 指定快照 |
| `fill_ai_sections` | `UPDATE reports SET content=$2, status='draft' WHERE id=$1 RETURNING *` | AI 填充后回退 |

### 11.2 ReportTemplateService

| 方法 | SQL 操作 | 说明 |
|:-----|:---------|:-----|
| `list` (count) | `SELECT COUNT(*)::bigint FROM report_templates WHERE deleted_at IS NULL AND (tenant_id IS NULL OR tenant_id=$1) AND ...` | 模板总数 |
| `list` (data) | `SELECT * FROM report_templates WHERE deleted_at IS NULL AND ... ORDER BY is_system DESC, name ASC LIMIT $N` | 模板列表 |
| `get_by_id` | `SELECT * FROM report_templates WHERE id=$1 AND deleted_at IS NULL AND (tenant_id IS NULL OR tenant_id=$2)` | 模板详情 |
| `create` | `INSERT INTO report_templates (...) VALUES (...) RETURNING *` | 创建租户模板 |
| `update` (lock) | `SELECT * FROM report_templates WHERE id=$1 AND deleted_at IS NULL FOR UPDATE` | 行级锁 |
| `update` (update) | `UPDATE report_templates SET name=COALESCE($2,name), ... WHERE id=$1 RETURNING *` | 更新模板 |
| `delete` | `UPDATE report_templates SET deleted_at=NOW() WHERE id=$1` | 软删除模板 |

### 11.3 ReportDataAggregator

| 方法 | SQL 操作 | 说明 |
|:-----|:---------|:-----|
| `fetch_articles_by_domain` | `SELECT * FROM articles WHERE deleted_at IS NULL AND domain_root=$1 AND created_at BETWEEN... ORDER BY importance DESC LIMIT $5` | 按领域查资讯 |
| `fetch_high_risk_articles` | `SELECT * FROM articles WHERE deleted_at IS NULL AND risk_score>70 AND created_at BETWEEN... ORDER BY risk_score DESC LIMIT $3` | 高风险资讯 |
| `fetch_upcoming_regulations` | `SELECT * FROM articles WHERE deleted_at IS NULL AND effective_date BETWEEN... ORDER BY effective_date ASC LIMIT $3` | 即将生效法规 |

### 11.4 ReportNumberGenerator

| 方法 | SQL 操作 | 说明 |
|:-----|:---------|:-----|
| `generate` (custom) | `SELECT COUNT(*)::bigint FROM reports WHERE period_type='custom' AND report_number LIKE 'LAW-CR-{year}-%' AND deleted_at IS NULL` | 自定义报告序列号 |

---

## 十二、AppState 集成

在 `crates/law-eye-api/src/state.rs` 的 `AppState` 中新增:

```rust
// AppState 新增字段
pub struct AppState {
    // ... 现有字段 ...
    pub report_service: Arc<ReportService>,
    pub report_template_service: Arc<ReportTemplateService>,
    pub report_aggregator: Arc<ReportDataAggregator>,
}

// AppState::from_deps() 中新增初始化
report_service: Arc::new(ReportService::new(pool.clone())),
report_template_service: Arc::new(ReportTemplateService::new(pool.clone())),
report_aggregator: Arc::new(ReportDataAggregator::new(pool.clone())),
```

---

## 十三、导出引擎 Trait 设计

```rust
// crates/law-eye-core/src/report/exporter/mod.rs

pub mod chart;
pub mod docx;
pub mod html;
pub mod pdf;

use super::types::{ExportFormat, ExportResult};
use law_eye_common::Result;
use law_eye_db::Report;

/// 报告导出引擎统一 Trait。
///
/// 每种导出格式实现此 Trait，由 Worker 根据 ExportFormat 分发。
#[async_trait::async_trait]
pub trait ReportExporter: Send + Sync {
    /// 导出报告为目标格式的字节流。
    ///
    /// 参数:
    /// - report: 报告完整数据（含 content JSONB）
    /// - style_config: 模板样式配置
    ///
    /// 返回:
    /// - (字节流, MIME content_type)
    async fn export(
        &self,
        report: &Report,
        style_config: &serde_json::Value,
    ) -> Result<(Vec<u8>, String)>;

    /// 当前导出器支持的格式。
    fn format(&self) -> ExportFormat;
}
```

```rust
// crates/law-eye-core/src/report/exporter/html.rs

use super::ReportExporter;
use crate::report::types::ExportFormat;
use law_eye_common::{Error, Result};
use law_eye_db::Report;

/// HTML 导出器 — 使用 Tera 模板引擎渲染。
///
/// 渲染流程:
/// 1. 加载模板的 body_template (Tera 语法)
/// 2. 如果没有自定义模板，使用默认模板
/// 3. 将 report.content 中的各章节数据注入 Tera 上下文
/// 4. Markdown → HTML 转换 (pulldown-cmark)
/// 5. 拼接 style_config 中的样式参数
/// 6. 输出完整 HTML 文档
pub struct HtmlExporter {
    tera: tera::Tera,
}

impl HtmlExporter {
    pub fn new() -> Result<Self> {
        let mut tera = tera::Tera::default();
        // 注册默认模板
        tera.add_raw_template("default_report", DEFAULT_REPORT_TEMPLATE)
            .map_err(|e| Error::Internal(format!("Failed to load default template: {}", e)))?;
        Ok(Self { tera })
    }
}

#[async_trait::async_trait]
impl ReportExporter for HtmlExporter {
    async fn export(
        &self,
        report: &Report,
        style_config: &serde_json::Value,
    ) -> Result<(Vec<u8>, String)> {
        let mut context = tera::Context::new();
        context.insert("report", &report);
        context.insert("style", style_config);

        // 将各章节的 Markdown 转为 HTML
        if let Some(sections) = report.content.get("sections").and_then(|v| v.as_object()) {
            let mut html_sections = serde_json::Map::new();
            for (id, section) in sections {
                let mut section_clone = section.clone();
                if let Some(md) = section.get("markdown").and_then(|v| v.as_str()) {
                    let html = markdown_to_html(md);
                    if let serde_json::Value::Object(ref mut obj) = section_clone {
                        obj.insert("rendered_html".to_string(), serde_json::Value::String(html));
                    }
                }
                html_sections.insert(id.clone(), section_clone);
            }
            context.insert("sections", &html_sections);
        }

        let rendered = self
            .tera
            .render("default_report", &context)
            .map_err(|e| Error::Internal(format!("Template render failed: {}", e)))?;

        Ok((rendered.into_bytes(), "text/html; charset=utf-8".to_string()))
    }

    fn format(&self) -> ExportFormat {
        ExportFormat::Html
    }
}

/// Markdown → HTML 转换 (使用 pulldown-cmark)
fn markdown_to_html(md: &str) -> String {
    use pulldown_cmark::{html, Parser};
    let parser = Parser::new(md);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

/// 默认报告 HTML 模板 (Tera 语法)
const DEFAULT_REPORT_TEMPLATE: &str = r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>{{ report.title }}</title>
    <style>
        body {
            font-family: {{ style.font_family | default(value="SimSun") }}, serif;
            font-size: {{ style.body_font_size_pt | default(value=12) }}pt;
            line-height: {{ style.line_spacing | default(value=1.5) }};
            margin: 0;
            padding: 0;
        }
        .cover { page-break-after: always; text-align: center; padding-top: 40%; }
        .section { page-break-before: auto; margin-bottom: 2em; }
        h1 { font-size: {{ style.h1_font_size_pt | default(value=18) }}pt; }
        h2 { font-size: {{ style.h2_font_size_pt | default(value=16) }}pt; }
        h3 { font-size: {{ style.h3_font_size_pt | default(value=14) }}pt; }
    </style>
</head>
<body>
{% for section_id, section in sections %}
<div class="section" id="{{ section_id }}">
    {% if section.rendered_html %}
        {{ section.rendered_html | safe }}
    {% endif %}
</div>
{% endfor %}
</body>
</html>"#;
```

```rust
// crates/law-eye-core/src/report/exporter/pdf.rs

use super::ReportExporter;
use crate::report::types::ExportFormat;
use law_eye_common::{Error, Result};
use law_eye_db::Report;

/// PDF 导出器 — 通过 browserless HTTP API 渲染。
///
/// 依赖:
/// - browserless 容器 (环境变量: LAW_EYE__BROWSERLESS__URL)
/// - 先由 HtmlExporter 渲染 HTML，再调用 browserless /pdf 端点
pub struct PdfExporter {
    html_exporter: super::html::HtmlExporter,
    browserless_url: String,
    http_client: reqwest::Client,
}

impl PdfExporter {
    pub fn new(browserless_url: &str) -> Result<Self> {
        Ok(Self {
            html_exporter: super::html::HtmlExporter::new()?,
            browserless_url: browserless_url.to_string(),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .map_err(|e| Error::Internal(e.to_string()))?,
        })
    }
}

#[async_trait::async_trait]
impl ReportExporter for PdfExporter {
    async fn export(
        &self,
        report: &Report,
        style_config: &serde_json::Value,
    ) -> Result<(Vec<u8>, String)> {
        // 1. 先渲染 HTML
        let (html_bytes, _) = self.html_exporter.export(report, style_config).await?;
        let html = String::from_utf8(html_bytes)
            .map_err(|e| Error::Internal(format!("Invalid UTF-8 in HTML: {}", e)))?;

        // 2. 调用 browserless /pdf API
        let margin = style_config
            .get("margin")
            .cloned()
            .unwrap_or(serde_json::json!({
                "top_mm": 25, "bottom_mm": 25, "left_mm": 30, "right_mm": 25
            }));

        let request_body = serde_json::json!({
            "html": html,
            "options": {
                "format": style_config.get("paper_size").and_then(|v| v.as_str()).unwrap_or("A4"),
                "margin": {
                    "top": format!("{}mm", margin.get("top_mm").and_then(|v| v.as_u64()).unwrap_or(25)),
                    "bottom": format!("{}mm", margin.get("bottom_mm").and_then(|v| v.as_u64()).unwrap_or(25)),
                    "left": format!("{}mm", margin.get("left_mm").and_then(|v| v.as_u64()).unwrap_or(30)),
                    "right": format!("{}mm", margin.get("right_mm").and_then(|v| v.as_u64()).unwrap_or(25))
                },
                "displayHeaderFooter": true,
                "printBackground": true,
                "preferCSSPageSize": false
            }
        });

        let response = self
            .http_client
            .post(format!("{}/pdf", self.browserless_url))
            .json(&request_body)
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Browserless request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "unknown".to_string());
            return Err(Error::Internal(format!(
                "Browserless PDF render failed ({}): {}",
                status, body
            )));
        }

        let pdf_bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Internal(format!("Failed to read PDF bytes: {}", e)))?;

        Ok((pdf_bytes.to_vec(), "application/pdf".to_string()))
    }

    fn format(&self) -> ExportFormat {
        ExportFormat::Pdf
    }
}
```

```rust
// crates/law-eye-core/src/report/exporter/docx.rs

use super::ReportExporter;
use crate::report::types::ExportFormat;
use law_eye_common::{Error, Result};
use law_eye_db::Report;

/// Word (DOCX) 导出器 — 使用 docx-rs 纯 Rust 生成。
///
/// 纯 CPU 操作，无外部依赖。
pub struct DocxExporter;

#[async_trait::async_trait]
impl ReportExporter for DocxExporter {
    async fn export(
        &self,
        report: &Report,
        style_config: &serde_json::Value,
    ) -> Result<(Vec<u8>, String)> {
        // docx-rs 生成逻辑 (实施阶段填充)
        // 1. 创建 Docx 实例
        // 2. 设置页面大小、页边距
        // 3. 遍历 report.content.sections，按顺序添加段落
        // 4. Markdown 段落转为 docx 段落（标题、正文、列表）
        // 5. 导出为字节流

        // 占位: 返回空 DOCX (实施阶段填充完整逻辑)
        Err(Error::Internal(
            "DOCX export not yet implemented".to_string(),
        ))
    }

    fn format(&self) -> ExportFormat {
        ExportFormat::Docx
    }
}
```

```rust
// crates/law-eye-core/src/report/exporter/chart.rs

use law_eye_common::{Error, Result};

/// SVG 图表渲染器 — 使用 plotters 生成。
///
/// 用于在 PDF/DOCX 导出时将统计数据渲染为内嵌 SVG 图表。
/// 前端使用 echarts/recharts 渲染，后端导出时使用 plotters 保证一致性。
pub struct ChartRenderer;

impl ChartRenderer {
    /// 渲染饼图 SVG。
    ///
    /// 参数:
    /// - title: 图表标题
    /// - data: Vec<(标签, 值)>
    /// - width/height: SVG 尺寸
    ///
    /// 返回: SVG 字符串
    pub fn render_pie_chart(
        title: &str,
        data: &[(String, f64)],
        width: u32,
        height: u32,
    ) -> Result<String> {
        // plotters 实现 (实施阶段填充)
        Err(Error::Internal(
            "Pie chart rendering not yet implemented".to_string(),
        ))
    }

    /// 渲染条形图 SVG。
    pub fn render_bar_chart(
        title: &str,
        data: &[(String, f64)],
        width: u32,
        height: u32,
    ) -> Result<String> {
        // plotters 实现 (实施阶段填充)
        Err(Error::Internal(
            "Bar chart rendering not yet implemented".to_string(),
        ))
    }

    /// 渲染折线图 SVG。
    pub fn render_line_chart(
        title: &str,
        series: &[(String, Vec<(String, f64)>)],
        width: u32,
        height: u32,
    ) -> Result<String> {
        // plotters 实现 (实施阶段填充)
        Err(Error::Internal(
            "Line chart rendering not yet implemented".to_string(),
        ))
    }
}
```

---

## 十四、性能与安全注意事项

### 14.1 查询性能

| 关注点 | 策略 |
|:-------|:-----|
| **列表查询不含 content** | `ReportSummary` 结构排除 JSONB 大字段，列表查询仅返回必要列 |
| **利用已有索引** | `idx_reports_tenant_status`, `idx_reports_tenant_period` 覆盖常见过滤 |
| **统计数据缓存** | Aggregator 调用 StatisticsService 的结果可考虑 Redis 缓存 (TTL 5min) |
| **快照表膨胀** | 建议定期归档老版本快照（如仅保留最近 50 个版本） |

### 14.2 并发安全

| 关注点 | 策略 |
|:-------|:-----|
| **乐观锁** | `expected_version` 参数 + 数据库 `version` 触发器 |
| **行级锁** | 状态变更和更新操作使用 `SELECT ... FOR UPDATE` 防止竞态 |
| **异步任务幂等性** | 导出任务使用 `report_id + version` 作为 object_key，重复导出不会覆盖不同版本 |

### 14.3 安全性

| 关注点 | 策略 |
|:-------|:-----|
| **租户隔离** | `with_tenant_tx` + RLS 双重保护 |
| **系统模板保护** | 应用层检查 `is_system` 禁止修改/删除 |
| **HTML 内容安全** | Tera 沙箱模式，禁用 include/import 防止 SSTI |
| **导出文件大小限制** | Worker 端检查渲染后文件大小 <= 50MB |
