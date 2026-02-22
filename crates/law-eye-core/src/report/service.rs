// crates/law-eye-core/src/report/service.rs
// ReportService -- 报告 CRUD + 状态转换 + 数据聚合

use chrono::{NaiveDate, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::Report;
use sqlx::PgPool;
use uuid::Uuid;

use super::exporter::chart::ChartRenderer;
use super::types::{
    CreateReportInput, DomainBreakdown, ExportFormat, ListReportsQuery, RegionBreakdown,
    ReportAggregatedData, ReportArticleSummary, ReportCalendarEvent, ReportOverview,
    ReportRiskItem, ReportStatus, UpdateReportInput,
};
use crate::object::OBJECT_KIND_REPORT_EXPORT;
use crate::statistics::{domain_root_label, region_code_to_name};
use crate::tenant::with_tenant_tx;

const VALID_REPORT_PERIOD_TYPES: [&str; 4] = ["weekly", "monthly", "quarterly", "custom"];

pub struct ReportService {
    pool: PgPool,
}

impl ReportService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // ======================================================================
    // report_number 生成: RPT-YYYYMMDD-XXXX
    // XXXX 为当日在该租户内的自增序号，通过数据库 COUNT 保证唯一性
    // ======================================================================

    async fn next_report_number(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        tenant_id: Uuid,
        date_part: &str,
    ) -> Result<String> {
        let pattern = format!("RPT-{}-", date_part);
        let lock_key = format!("{}:{}", tenant_id, pattern);

        // 获取事务级 advisory lock，防止并发创建时 COUNT/MAX 竞态
        // 使用 date_part 作为 lock key，同一天内的序号生成互斥
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(&lock_key)
            .execute(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // 使用 MAX 提取已有最大序号，比 COUNT 更健壮（删除记录不影响序号连续性）
        let max_seq: (Option<i64>,) = sqlx::query_as(
            r#"
            SELECT MAX(
                CASE
                    WHEN SUBSTRING(report_number FROM LENGTH($1) + 1) ~ '^[0-9]+$'
                    THEN CAST(
                        SUBSTRING(report_number FROM LENGTH($1) + 1)
                        AS bigint
                    )
                    ELSE NULL
                END
            )
            FROM reports
            WHERE report_number LIKE $1 || '%'
              AND tenant_id = $2
            "#,
        )
        .bind(&pattern)
        .bind(tenant_id)
        .fetch_one(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let seq = max_seq.0.unwrap_or(0) + 1;
        Ok(format!("RPT-{}-{:04}", date_part, seq))
    }

    fn validate_create_report_input(input: &CreateReportInput) -> Result<()> {
        if input.title.trim().is_empty() {
            return Err(Error::Validation("title must not be empty".to_string()));
        }

        if input.period_end < input.period_start {
            return Err(Error::Validation(
                "period_end must not be earlier than period_start".to_string(),
            ));
        }

        if !VALID_REPORT_PERIOD_TYPES.contains(&input.period_type.as_str()) {
            return Err(Error::Validation(format!(
                "Invalid period_type: {}. Allowed: weekly, monthly, quarterly, custom",
                input.period_type
            )));
        }

        Ok(())
    }

    async fn ensure_author_exists_in_tenant(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        tenant_id: Uuid,
        author_id: Uuid,
    ) -> Result<()> {
        let exists: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM users
                WHERE id = $1
                  AND tenant_id = $2
            )
            "#,
        )
        .bind(author_id)
        .bind(tenant_id)
        .fetch_one(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if !exists {
            return Err(Error::Validation(format!(
                "Author {} does not belong to tenant {}",
                author_id, tenant_id
            )));
        }

        Ok(())
    }

    async fn ensure_template_is_active_in_tenant(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        tenant_id: Uuid,
        template_id: Option<Uuid>,
    ) -> Result<()> {
        let Some(template_id) = template_id else {
            return Ok(());
        };

        let exists: bool = sqlx::query_scalar(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM report_templates
                WHERE id = $1
                  AND tenant_id = $2
                  AND is_active = true
            )
            "#,
        )
        .bind(template_id)
        .bind(tenant_id)
        .fetch_one(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        if !exists {
            return Err(Error::NotFound(format!(
                "Template {} not found or inactive in current tenant",
                template_id
            )));
        }

        Ok(())
    }

    // ======================================================================
    // 创建报告
    // ======================================================================

    pub async fn create_report(&self, tenant_id: Uuid, input: CreateReportInput) -> Result<Report> {
        Self::validate_create_report_input(&input)?;

        let CreateReportInput {
            title,
            period_type,
            period_start,
            period_end,
            template_id,
            author_id,
        } = input;

        let date_part = Utc::now().format("%Y%m%d").to_string();

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                Self::ensure_author_exists_in_tenant(tx, tenant_id, author_id).await?;
                Self::ensure_template_is_active_in_tenant(tx, tenant_id, template_id).await?;

                let report_number = Self::next_report_number(tx, tenant_id, &date_part).await?;

                let report = sqlx::query_as::<_, Report>(
                    r#"
                    INSERT INTO reports (
                        tenant_id, report_number, title, template_id, author_id,
                        period_type, period_start, period_end, status
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(&report_number)
                .bind(&title)
                .bind(template_id)
                .bind(author_id)
                .bind(&period_type)
                .bind(period_start)
                .bind(period_end)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(report)
            })
        })
        .await
    }

    // ======================================================================
    // 获取报告详情
    // ======================================================================

    pub async fn get_report_by_id(&self, tenant_id: Uuid, report_id: Uuid) -> Result<Report> {
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

    // ======================================================================
    // 列出报告 (带分页总数)
    // ======================================================================

    pub async fn list_reports(
        &self,
        tenant_id: Uuid,
        query: ListReportsQuery,
    ) -> Result<(Vec<Report>, i64)> {
        let limit = query.limit.unwrap_or(20).clamp(1, 100);
        let offset = query.offset.unwrap_or(0).max(0);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let status = query.status.clone();
            let period_type = query.period_type.clone();
            let author_id = query.author_id;
            let date_from = query.date_from;
            let date_to = query.date_to;
            Box::pin(async move {
                // 查询总数
                let total: (i64,) = sqlx::query_as(
                    r#"
                    SELECT COUNT(*)
                    FROM reports
                    WHERE deleted_at IS NULL
                      AND ($1::text IS NULL OR status = $1)
                      AND ($2::text IS NULL OR period_type = $2)
                      AND ($3::uuid IS NULL OR author_id = $3)
                      AND ($4::date IS NULL OR period_start >= $4)
                      AND ($5::date IS NULL OR period_end <= $5)
                    "#,
                )
                .bind(status.as_deref())
                .bind(period_type.as_deref())
                .bind(author_id)
                .bind(date_from)
                .bind(date_to)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // 查询数据
                let reports = sqlx::query_as::<_, Report>(
                    r#"
                    SELECT * FROM reports
                    WHERE deleted_at IS NULL
                      AND ($1::text IS NULL OR status = $1)
                      AND ($2::text IS NULL OR period_type = $2)
                      AND ($3::uuid IS NULL OR author_id = $3)
                      AND ($4::date IS NULL OR period_start >= $4)
                      AND ($5::date IS NULL OR period_end <= $5)
                    ORDER BY created_at DESC
                    LIMIT $6 OFFSET $7
                    "#,
                )
                .bind(status.as_deref())
                .bind(period_type.as_deref())
                .bind(author_id)
                .bind(date_from)
                .bind(date_to)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok((reports, total.0))
            })
        })
        .await
    }

    // ======================================================================
    // 更新报告内容 (乐观锁)
    // ======================================================================

    pub async fn update_report(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        input: UpdateReportInput,
        expected_version: i64,
    ) -> Result<Report> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 锁定行并获取当前状态
                let current = sqlx::query_as::<_, Report>(
                    "SELECT * FROM reports WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                )
                .bind(report_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                // 只有 draft 状态才允许编辑内容
                let status = ReportStatus::from_db_str(&current.status);
                if !matches!(status, Some(ReportStatus::Draft)) {
                    return Err(Error::Validation(format!(
                        "Cannot edit report in status '{}'. Only 'draft' status allows editing.",
                        current.status
                    )));
                }

                // 乐观锁校验
                if current.version != expected_version {
                    return Err(Error::Conflict(format!(
                        "Report {} version mismatch (expected {}, got {})",
                        report_id, expected_version, current.version
                    )));
                }

                let title = input.title.as_deref().unwrap_or(&current.title);
                let content = input.content.as_ref().unwrap_or(&current.content);

                let updated = sqlx::query_as::<_, Report>(
                    r#"
                    UPDATE reports SET
                        title = $2,
                        content = $3,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(report_id)
                .bind(title)
                .bind(content)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    // ======================================================================
    // 状态转换 (乐观锁)
    // ======================================================================

    pub async fn transition_status(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        target_status: ReportStatus,
        expected_version: i64,
    ) -> Result<Report> {
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

                // 乐观锁校验
                if current.version != expected_version {
                    return Err(Error::Conflict(format!(
                        "Report {} version mismatch (expected {}, got {})",
                        report_id, expected_version, current.version
                    )));
                }

                let current_status =
                    ReportStatus::from_db_str(&current.status).ok_or_else(|| {
                        Error::Internal(format!("Unknown report status: {}", current.status))
                    })?;

                if !current_status.can_transition_to(target_status) {
                    return Err(Error::Validation(format!(
                        "Invalid status transition: {} -> {}",
                        current_status, target_status
                    )));
                }

                // 如果目标是 published，设置 published_at
                let published_at = if target_status == ReportStatus::Published {
                    Some(Utc::now())
                } else {
                    current.published_at
                };

                let updated = sqlx::query_as::<_, Report>(
                    r#"
                    UPDATE reports SET
                        status = $2,
                        published_at = $3,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(report_id)
                .bind(target_status.as_str())
                .bind(published_at)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(updated)
            })
        })
        .await
    }

    // ======================================================================
    // 软删除报告
    // ======================================================================

    pub async fn delete_report(&self, tenant_id: Uuid, report_id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows_affected = sqlx::query(
                    r#"
                    UPDATE reports SET
                        deleted_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    "#,
                )
                .bind(report_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .rows_affected();

                if rows_affected == 0 {
                    return Err(Error::NotFound(format!("Report {} not found", report_id)));
                }

                Ok(())
            })
        })
        .await
    }

    // ======================================================================
    // 导出文件路径更新
    // ======================================================================

    pub async fn set_export_key(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        format: ExportFormat,
        object_key: &str,
        expected_report_version: i64,
    ) -> Result<()> {
        let (update_sql, current_sql) = match format {
            ExportFormat::Pdf => (
                r#"
                UPDATE reports SET export_pdf_key = $2, version = version + 1, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL AND version = $3
                "#,
                r#"
                SELECT version, export_pdf_key
                FROM reports
                WHERE id = $1 AND deleted_at IS NULL
                "#,
            ),
            ExportFormat::Docx => (
                r#"
                UPDATE reports SET export_docx_key = $2, version = version + 1, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL AND version = $3
                "#,
                r#"
                SELECT version, export_docx_key
                FROM reports
                WHERE id = $1 AND deleted_at IS NULL
                "#,
            ),
            ExportFormat::Html => (
                r#"
                UPDATE reports SET export_html_key = $2, version = version + 1, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL AND version = $3
                "#,
                r#"
                SELECT version, export_html_key
                FROM reports
                WHERE id = $1 AND deleted_at IS NULL
                "#,
            ),
        };

        let object_key = object_key.to_string();

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                Self::validate_export_object_key_scope(tenant_id, report_id, format, &object_key)?;

                let object_meta = sqlx::query_as::<_, (String, String)>(
                    r#"
                    SELECT kind, content_type
                    FROM objects
                    WHERE object_key = $1
                      AND deleted_at IS NULL
                      AND purged_at IS NULL
                    LIMIT 1
                    "#,
                )
                .bind(&object_key)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| {
                    Error::Conflict(format!(
                        "Export object metadata missing or deleted for key {}",
                        object_key
                    ))
                })?;

                Self::validate_export_object_metadata(&object_meta.0, &object_meta.1, format)?;

                let rows_affected = sqlx::query(update_sql)
                    .bind(report_id)
                    .bind(&object_key)
                    .bind(expected_report_version)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
                    .rows_affected();

                if rows_affected == 1 {
                    return Ok(());
                }

                let current = sqlx::query_as::<_, (i64, Option<String>)>(current_sql)
                    .bind(report_id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
                    .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                let (current_version, current_key) = current;
                if current_key.as_deref() == Some(object_key.as_str()) {
                    return Ok(());
                }

                Err(Error::Conflict(format!(
                    "Report {} export key update conflict: expected version {}, current version {}",
                    report_id, expected_report_version, current_version
                )))
            })
        })
        .await
    }

    fn validate_export_object_key_scope(
        tenant_id: Uuid,
        report_id: Uuid,
        format: ExportFormat,
        object_key: &str,
    ) -> Result<()> {
        let expected_prefix = format!("tenants/{}/reports/{}/", tenant_id, report_id);
        if !object_key.starts_with(&expected_prefix) {
            return Err(Error::Conflict(format!(
                "Export object key scope mismatch for report {}",
                report_id
            )));
        }

        let expected_extension = format!(".{}", format.extension());
        if !object_key.ends_with(&expected_extension) {
            return Err(Error::Conflict(format!(
                "Export object key extension mismatch: expected {}",
                expected_extension
            )));
        }

        Ok(())
    }

    fn validate_export_object_metadata(
        object_kind: &str,
        content_type: &str,
        format: ExportFormat,
    ) -> Result<()> {
        if object_kind != OBJECT_KIND_REPORT_EXPORT {
            return Err(Error::Conflict(format!(
                "Invalid object kind for report export: expected {}, got {}",
                OBJECT_KIND_REPORT_EXPORT, object_kind
            )));
        }

        let expected_content_type = format.content_type();
        let content_type_matches = if matches!(format, ExportFormat::Html) {
            content_type
                .to_ascii_lowercase()
                .starts_with("text/html")
        } else {
            content_type.eq_ignore_ascii_case(expected_content_type)
        };

        if !content_type_matches {
            return Err(Error::Conflict(format!(
                "Export object content_type mismatch: expected {}, got {}",
                expected_content_type, content_type
            )));
        }

        Ok(())
    }

    // ======================================================================
    // AI 内容更新 (由 worker 调用)
    // ======================================================================

    pub async fn update_ai_content(
        &self,
        tenant_id: Uuid,
        report_id: Uuid,
        content: serde_json::Value,
        article_count: i32,
        ai_model: &str,
    ) -> Result<Report> {
        let ai_model = ai_model.to_string();

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let updated = sqlx::query_as::<_, Report>(
                    r#"
                    UPDATE reports SET
                        content = $2,
                        article_count = $3,
                        ai_model = $4,
                        ai_generated_at = NOW(),
                        status = 'generated',
                        version = version + 1,
                        updated_at = NOW()
                    WHERE id = $1 AND deleted_at IS NULL
                    RETURNING *
                    "#,
                )
                .bind(report_id)
                .bind(&content)
                .bind(article_count)
                .bind(&ai_model)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("Report {} not found", report_id)))?;

                Ok(updated)
            })
        })
        .await
    }

    // ======================================================================
    // 数据聚合：汇总指定期间的文章数据，用于报告生成
    // ======================================================================

    pub async fn aggregate_period_data(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<ReportAggregatedData> {
        if period_end < period_start {
            return Err(Error::Validation(
                "period_end must not be earlier than period_start".to_string(),
            ));
        }

        let (overview, highlights, risk_items, calendar_events) = tokio::try_join!(
            self.aggregate_overview(tenant_id, period_start, period_end),
            self.aggregate_highlights(tenant_id, period_start, period_end),
            self.aggregate_risk_items(tenant_id, period_start, period_end),
            self.aggregate_calendar_events(tenant_id, period_start, period_end),
        )?;

        // Charts: 使用 ChartRenderer 渲染 SVG 图表
        let charts = ChartRenderer::render_charts(&overview).unwrap_or_else(|_| Vec::new());

        Ok(ReportAggregatedData {
            overview,
            highlights,
            risk_items,
            charts,
            calendar_events,
        })
    }

    async fn aggregate_overview(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<ReportOverview> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // ---- 1. Overview 统计 ----
                let overview_row: (i64, i64, i64) = sqlx::query_as(
                    r#"
                    SELECT
                        COUNT(*)::bigint AS total_articles,
                        COUNT(*) FILTER (WHERE importance >= 4)::bigint AS high_importance_count,
                        COUNT(*) FILTER (WHERE risk_score >= 70)::bigint AS high_risk_count
                    FROM articles
                    WHERE deleted_at IS NULL
                      AND created_at >= $1::date::timestamptz
                      AND created_at < ($2::date + 1)::timestamptz
                    "#,
                )
                .bind(period_start)
                .bind(period_end)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                // ---- 2. Domain breakdown ----
                let domain_rows: Vec<(String, i64)> = sqlx::query_as(
                    r#"
                    SELECT domain_root, COUNT(*)::bigint AS count
                    FROM articles
                    WHERE deleted_at IS NULL
                      AND domain_root IS NOT NULL
                      AND created_at >= $1::date::timestamptz
                      AND created_at < ($2::date + 1)::timestamptz
                    GROUP BY domain_root
                    ORDER BY count DESC
                    "#,
                )
                .bind(period_start)
                .bind(period_end)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let domain_breakdown: Vec<DomainBreakdown> = domain_rows
                    .into_iter()
                    .map(|(domain, count)| DomainBreakdown {
                        label: domain_root_label(&domain).to_string(),
                        domain,
                        count,
                    })
                    .collect();

                // ---- 3. Region breakdown ----
                let region_rows: Vec<(String, i64)> = sqlx::query_as(
                    r#"
                    SELECT region_code, COUNT(*)::bigint AS count
                    FROM articles
                    WHERE deleted_at IS NULL
                      AND region_code IS NOT NULL
                      AND created_at >= $1::date::timestamptz
                      AND created_at < ($2::date + 1)::timestamptz
                    GROUP BY region_code
                    ORDER BY count DESC
                    "#,
                )
                .bind(period_start)
                .bind(period_end)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let region_breakdown: Vec<RegionBreakdown> = region_rows
                    .into_iter()
                    .map(|(region_code, count)| RegionBreakdown {
                        region_name: region_code_to_name(&region_code).to_string(),
                        region_code,
                        count,
                    })
                    .collect();

                Ok(ReportOverview {
                    total_articles: overview_row.0,
                    high_importance_count: overview_row.1,
                    high_risk_count: overview_row.2,
                    ai_summary: None, // AI 摘要由 worker 后续填充
                    domain_breakdown,
                    region_breakdown,
                })
            })
        })
        .await
    }

    async fn aggregate_highlights(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<Vec<ReportArticleSummary>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // ---- 4. Highlights: 高重要性文章摘要 (top 10) ----
                #[allow(clippy::type_complexity)]
                let highlight_rows: Vec<(
                    Uuid,
                    String,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<i32>,
                    Option<i32>,
                    String,
                )> = sqlx::query_as(
                    r#"
                    SELECT
                        id,
                        title,
                        summary,
                        COALESCE(domain_root, 'unknown') AS domain_label,
                        issuer,
                        CASE WHEN published_at IS NOT NULL
                            THEN TO_CHAR(published_at, 'YYYY-MM-DD')
                            ELSE NULL
                        END AS published_at_str,
                        importance,
                        risk_score,
                        link
                    FROM articles
                    WHERE deleted_at IS NULL
                      AND created_at >= $1::date::timestamptz
                      AND created_at < ($2::date + 1)::timestamptz
                    ORDER BY COALESCE(importance, 0) DESC, created_at DESC
                    LIMIT 10
                    "#,
                )
                .bind(period_start)
                .bind(period_end)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let highlights: Vec<ReportArticleSummary> = highlight_rows
                    .into_iter()
                    .map(
                        |(
                            id,
                            title,
                            summary,
                            domain_label,
                            issuer,
                            published_at,
                            importance,
                            risk_score,
                            link,
                        )| {
                            ReportArticleSummary {
                                id,
                                title,
                                summary,
                                domain_label: domain_root_label(&domain_label.unwrap_or_default())
                                    .to_string(),
                                issuer,
                                published_at,
                                importance,
                                risk_score,
                                link,
                            }
                        },
                    )
                    .collect();

                Ok(highlights)
            })
        })
        .await
    }

    async fn aggregate_risk_items(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<Vec<ReportRiskItem>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // ---- 5. Risk items: 高风险文章 ----
                #[allow(clippy::type_complexity)]
                let risk_rows: Vec<(
                    String,
                    Option<String>,
                    Option<i32>,
                    Option<Uuid>,
                )> = sqlx::query_as(
                    r#"
                        SELECT
                            title,
                            summary,
                            risk_score,
                            id
                        FROM articles
                        WHERE deleted_at IS NULL
                          AND risk_score >= 50
                          AND created_at >= $1::date::timestamptz
                          AND created_at < ($2::date + 1)::timestamptz
                        ORDER BY risk_score DESC
                        LIMIT 20
                        "#,
                )
                .bind(period_start)
                .bind(period_end)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let risk_items: Vec<ReportRiskItem> = risk_rows
                    .into_iter()
                    .map(|(title, summary, risk_score, article_id)| {
                        let score = risk_score.unwrap_or(0);
                        let (level, level_label) = if score >= 80 {
                            ("high".to_string(), "高风险".to_string())
                        } else if score >= 60 {
                            ("medium".to_string(), "中风险".to_string())
                        } else {
                            ("low".to_string(), "低风险".to_string())
                        };
                        ReportRiskItem {
                            title,
                            description: summary.unwrap_or_default(),
                            level,
                            level_label,
                            article_id,
                        }
                    })
                    .collect();

                Ok(risk_items)
            })
        })
        .await
    }

    async fn aggregate_calendar_events(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<Vec<ReportCalendarEvent>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // ---- 6. Calendar events: 生效日期相关事件 ----
                let calendar_rows: Vec<(chrono::NaiveDate, String, Option<String>)> =
                    sqlx::query_as(
                        r#"
                        SELECT
                            effective_date,
                            title,
                            COALESCE(domain_root, 'regulation') AS event_type
                        FROM articles
                        WHERE deleted_at IS NULL
                          AND effective_date IS NOT NULL
                          AND effective_date >= $1
                          AND effective_date <= $2
                        ORDER BY effective_date ASC
                        LIMIT 30
                        "#,
                    )
                    .bind(period_start)
                    .bind(period_end)
                    .fetch_all(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                let calendar_events: Vec<ReportCalendarEvent> = calendar_rows
                    .into_iter()
                    .map(|(date, title, event_type)| ReportCalendarEvent {
                        date: date.to_string(),
                        title,
                        event_type: event_type.unwrap_or_else(|| "regulation".to_string()),
                    })
                    .collect();

                Ok(calendar_events)
            })
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_input(
        title: &str,
        period_type: &str,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> CreateReportInput {
        CreateReportInput {
            title: title.to_string(),
            period_type: period_type.to_string(),
            period_start,
            period_end,
            template_id: Some(Uuid::new_v4()),
            author_id: Uuid::new_v4(),
        }
    }

    #[test]
    fn validate_create_report_input_rejects_empty_title() {
        let input = sample_input(
            "   ",
            "weekly",
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 1, 7).unwrap(),
        );

        let err = ReportService::validate_create_report_input(&input).unwrap_err();
        match err {
            Error::Validation(msg) => {
                assert!(msg.contains("title"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn validate_create_report_input_rejects_invalid_period_range() {
        let input = sample_input(
            "合规周报",
            "weekly",
            NaiveDate::from_ymd_opt(2026, 1, 8).unwrap(),
            NaiveDate::from_ymd_opt(2026, 1, 7).unwrap(),
        );

        let err = ReportService::validate_create_report_input(&input).unwrap_err();
        match err {
            Error::Validation(msg) => {
                assert!(msg.contains("period_end"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn validate_create_report_input_rejects_invalid_period_type() {
        let input = sample_input(
            "合规周报",
            "yearly",
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 1, 7).unwrap(),
        );

        let err = ReportService::validate_create_report_input(&input).unwrap_err();
        match err {
            Error::Validation(msg) => {
                assert!(msg.contains("Invalid period_type"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn validate_create_report_input_accepts_valid_payload() {
        let input = sample_input(
            "合规周报",
            "weekly",
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 1, 7).unwrap(),
        );

        let result = ReportService::validate_create_report_input(&input);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_export_object_metadata_rejects_wrong_kind() {
        let err = ReportService::validate_export_object_metadata(
            "report.snapshot",
            "application/pdf",
            ExportFormat::Pdf,
        )
        .unwrap_err();
        match err {
            Error::Conflict(msg) => assert!(msg.contains("Invalid object kind")),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn validate_export_object_metadata_rejects_wrong_content_type() {
        let err = ReportService::validate_export_object_metadata(
            OBJECT_KIND_REPORT_EXPORT,
            "application/json",
            ExportFormat::Pdf,
        )
        .unwrap_err();
        match err {
            Error::Conflict(msg) => assert!(msg.contains("content_type mismatch")),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn validate_export_object_metadata_accepts_html_charset_variant() {
        let result = ReportService::validate_export_object_metadata(
            OBJECT_KIND_REPORT_EXPORT,
            "text/html; charset=UTF-8",
            ExportFormat::Html,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn validate_export_object_key_scope_accepts_valid_key() {
        let tenant_id = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").unwrap();
        let report_id = Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").unwrap();
        let key = format!(
            "tenants/{}/reports/{}/export_20260222120000.pdf",
            tenant_id, report_id
        );

        let result =
            ReportService::validate_export_object_key_scope(tenant_id, report_id, ExportFormat::Pdf, &key);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_export_object_key_scope_rejects_wrong_scope_or_extension() {
        let tenant_id = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").unwrap();
        let report_id = Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").unwrap();

        let wrong_scope_key = format!(
            "tenants/{}/reports/{}/export_20260222120000.pdf",
            Uuid::parse_str("cccccccc-cccc-cccc-cccc-cccccccccccc").unwrap(),
            report_id
        );
        let wrong_extension_key = format!(
            "tenants/{}/reports/{}/export_20260222120000.docx",
            tenant_id, report_id
        );

        let wrong_scope_result = ReportService::validate_export_object_key_scope(
            tenant_id,
            report_id,
            ExportFormat::Pdf,
            &wrong_scope_key,
        );
        assert!(matches!(wrong_scope_result, Err(Error::Conflict(_))));

        let wrong_extension_result = ReportService::validate_export_object_key_scope(
            tenant_id,
            report_id,
            ExportFormat::Pdf,
            &wrong_extension_key,
        );
        assert!(matches!(wrong_extension_result, Err(Error::Conflict(_))));
    }
}
