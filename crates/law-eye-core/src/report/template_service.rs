// crates/law-eye-core/src/report/template_service.rs
// ReportTemplateService — 模板 CRUD

use law_eye_common::{Error, Result};
use law_eye_db::{CreateReportTemplate, ReportTemplate};
use sqlx::PgPool;
use uuid::Uuid;

use crate::tenant::with_tenant_tx;

pub struct ReportTemplateService {
    pool: PgPool,
}

impl ReportTemplateService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// 获取模板列表（仅活跃模板）
    pub async fn list(
        &self,
        tenant_id: Uuid,
        period_type: Option<&str>,
    ) -> Result<Vec<ReportTemplate>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let period_type = period_type.map(String::from);
            Box::pin(async move {
                let templates = sqlx::query_as::<_, ReportTemplate>(
                    r#"
                    SELECT * FROM report_templates
                    WHERE is_active = true
                      AND ($1::text IS NULL OR period_type = $1)
                    ORDER BY is_builtin DESC, created_at ASC
                    "#,
                )
                .bind(period_type.as_deref())
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(templates)
            })
        })
        .await
    }

    /// 获取模板详情
    pub async fn get_by_id(
        &self,
        tenant_id: Uuid,
        template_id: Uuid,
    ) -> Result<ReportTemplate> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ReportTemplate>(
                    "SELECT * FROM report_templates WHERE id = $1 AND is_active = true",
                )
                .bind(template_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("模板 {} 不存在", template_id)))
            })
        })
        .await
    }

    /// 创建自定义模板
    pub async fn create(
        &self,
        tenant_id: Uuid,
        input: CreateReportTemplate,
    ) -> Result<ReportTemplate> {
        // 校验 period_type
        let valid_types = ["weekly", "monthly", "quarterly", "custom"];
        if !valid_types.contains(&input.period_type.as_str()) {
            return Err(Error::Validation(format!(
                "无效的模板类型: {}",
                input.period_type
            )));
        }

        if input.template_body.trim().is_empty() {
            return Err(Error::Validation("模板内容不能为空".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let page_config = input.page_config.unwrap_or_else(|| {
                    serde_json::json!({
                        "page_size": "A4",
                        "margin_top": "20mm",
                        "margin_bottom": "20mm",
                        "margin_left": "15mm",
                        "margin_right": "15mm",
                        "orientation": "portrait"
                    })
                });
                let sections_config = input.sections_config.unwrap_or_else(|| {
                    serde_json::json!([])
                });

                let template = sqlx::query_as::<_, ReportTemplate>(
                    r#"
                    INSERT INTO report_templates (
                        tenant_id, name, description, period_type,
                        template_body, css_styles, page_config, sections_config,
                        is_builtin
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(&input.name)
                .bind(input.description.as_deref())
                .bind(&input.period_type)
                .bind(&input.template_body)
                .bind(input.css_styles.as_deref())
                .bind(&page_config)
                .bind(&sections_config)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(template)
            })
        })
        .await
    }

    /// 软删除模板（禁止删除内置模板）
    pub async fn deactivate(
        &self,
        tenant_id: Uuid,
        template_id: Uuid,
    ) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                // 检查是否为内置模板
                let template = sqlx::query_as::<_, ReportTemplate>(
                    "SELECT * FROM report_templates WHERE id = $1 AND is_active = true",
                )
                .bind(template_id)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("模板 {} 不存在", template_id)))?;

                if template.is_builtin {
                    return Err(Error::Validation("内置模板不可删除".to_string()));
                }

                sqlx::query(
                    r#"
                    UPDATE report_templates SET
                        is_active = false,
                        updated_at = NOW()
                    WHERE id = $1
                    "#,
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
}
