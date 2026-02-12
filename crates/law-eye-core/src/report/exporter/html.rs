// crates/law-eye-core/src/report/exporter/html.rs
// HtmlExporter — 使用 Tera 模板引擎渲染 HTML 报告

use law_eye_common::{Error, Result};
use law_eye_db::ReportTemplate;

use crate::report::types::ReportAggregatedData;

/// HTML 报告渲染器，使用 Tera 模板引擎
pub struct HtmlExporter;

impl HtmlExporter {
    /// 使用 Tera 模板和数据渲染完整 HTML
    pub fn render(
        template: &ReportTemplate,
        title: &str,
        report_number: &str,
        period_start: &str,
        period_end: &str,
        data: &ReportAggregatedData,
    ) -> Result<String> {
        let mut tera = tera::Tera::default();
        tera.add_raw_template("report", &template.template_body)
            .map_err(|e| Error::Internal(format!("模板解析失败: {}", e)))?;

        let mut context = tera::Context::new();
        context.insert("title", title);
        context.insert("report_number", report_number);
        context.insert("period_start", period_start);
        context.insert("period_end", period_end);
        context.insert("generated_at", &chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string());
        context.insert("css", &template.css_styles.as_deref().unwrap_or(""));

        // 概览数据
        context.insert("overview", &data.overview);
        // 重点文章
        context.insert("highlights", &data.highlights);
        // 风险项
        context.insert("risk_items", &data.risk_items);
        // 图表
        context.insert("charts", &data.charts);
        // 日历事件
        context.insert("calendar_events", &data.calendar_events);

        let rendered = tera
            .render("report", &context)
            .map_err(|e| Error::Internal(format!("模板渲染失败: {}", e)))?;

        Ok(rendered)
    }
}
