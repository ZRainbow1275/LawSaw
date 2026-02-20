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
    pub async fn get_by_id(&self, tenant_id: Uuid, template_id: Uuid) -> Result<ReportTemplate> {
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
        validate_template_renderability(&input.template_body)?;

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
                let sections_config = input
                    .sections_config
                    .unwrap_or_else(|| serde_json::json!([]));

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
    pub async fn deactivate(&self, tenant_id: Uuid, template_id: Uuid) -> Result<()> {
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

fn validate_template_renderability(template_body: &str) -> Result<()> {
    let mut tera = tera::Tera::default();
    tera.add_raw_template("report", template_body)
        .map_err(|e| Error::Validation(format!("模板语法错误: {}", e)))?;

    let mut context = tera::Context::new();
    context.insert("title", "Template Validation");
    context.insert("report_number", "RPT-TEST-0001");
    context.insert("period_start", "2026-01-01");
    context.insert("period_end", "2026-01-07");
    context.insert("generated_at", "2026-01-08 12:00");
    context.insert("css", "body { font-family: sans-serif; }");
    context.insert(
        "overview",
        &serde_json::json!({
            "total_articles": 0,
            "high_importance_count": 0,
            "high_risk_count": 0,
            "ai_summary": null,
            "domain_breakdown": [],
            "region_breakdown": [],
        }),
    );
    context.insert("highlights", &Vec::<serde_json::Value>::new());
    context.insert("risk_items", &Vec::<serde_json::Value>::new());
    context.insert("charts", &Vec::<serde_json::Value>::new());
    context.insert("calendar_events", &Vec::<serde_json::Value>::new());

    tera.render("report", &context)
        .map_err(|e| Error::Validation(format!("模板渲染上下文不兼容: {}", e)))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_template_renderability;

    #[test]
    fn template_validation_accepts_supported_context_keys() {
        let template = r#"
            <html>
            <head><style>{{ css }}</style></head>
            <body>
              <h1>{{ title }}</h1>
              <div>{{ report_number }}</div>
              <div>{{ period_start }} ~ {{ period_end }}</div>
              <div>{{ generated_at }}</div>
              <div>{{ overview.total_articles }}</div>
              {% for article in highlights %}
                <p>{{ article.title }}</p>
              {% endfor %}
            </body>
            </html>
        "#;

        assert!(validate_template_renderability(template).is_ok());
    }

    #[test]
    fn template_validation_rejects_unknown_context_keys() {
        let template = "<h1>{{ report.title }}</h1>";
        let err = validate_template_renderability(template).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("模板渲染上下文不兼容"));
    }
}
