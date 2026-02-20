// crates/law-eye-core/src/report/exporter/docx.rs
// DocxExporter — 使用 docx-rs 生成 Word 文档

use law_eye_common::{Error, Result};

use crate::report::types::ReportAggregatedData;

/// DOCX 导出器，使用 docx-rs 库生成 Word 文档。
pub struct DocxExporter;

impl DocxExporter {
    /// 将报告数据生成为 DOCX 字节
    pub fn generate(
        title: &str,
        report_number: &str,
        period_start: &str,
        period_end: &str,
        data: &ReportAggregatedData,
    ) -> Result<Vec<u8>> {
        use docx_rs::*;

        let mut docx = Docx::new();

        // 标题
        docx = docx.add_paragraph(
            Paragraph::new()
                .add_run(Run::new().add_text(title).size(56).bold())
                .align(AlignmentType::Center),
        );

        // 副标题：报告期间
        docx = docx.add_paragraph(
            Paragraph::new()
                .add_run(
                    Run::new()
                        .add_text(format!("报告期间：{} ~ {}", period_start, period_end))
                        .size(24)
                        .color("666666"),
                )
                .align(AlignmentType::Center),
        );

        // 报告编号
        docx = docx.add_paragraph(
            Paragraph::new()
                .add_run(
                    Run::new()
                        .add_text(format!("报告编号：{}", report_number))
                        .size(20)
                        .color("999999"),
                )
                .align(AlignmentType::Center),
        );

        // 空行
        docx = docx.add_paragraph(Paragraph::new());

        // 一、本周概览
        docx = docx.add_paragraph(
            Paragraph::new().add_run(Run::new().add_text("一、本周概览").size(32).bold()),
        );

        docx = docx.add_paragraph(
            Paragraph::new().add_run(
                Run::new()
                    .add_text(format!(
                        "收录文章：{} 篇 | 重要法规：{} 篇 | 高风险预警：{} 篇",
                        data.overview.total_articles,
                        data.overview.high_importance_count,
                        data.overview.high_risk_count
                    ))
                    .size(22),
            ),
        );

        if let Some(ref ai_summary) = data.overview.ai_summary {
            docx = docx.add_paragraph(Paragraph::new());
            docx = docx.add_paragraph(
                Paragraph::new().add_run(Run::new().add_text("AI 摘要：").size(22).bold()),
            );
            docx = docx
                .add_paragraph(Paragraph::new().add_run(Run::new().add_text(ai_summary).size(22)));
        }

        docx = docx.add_paragraph(Paragraph::new());

        // 二、重点法规动态
        docx = docx.add_paragraph(
            Paragraph::new().add_run(Run::new().add_text("二、重点法规动态").size(32).bold()),
        );

        for article in &data.highlights {
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(Run::new().add_text(&article.title).size(24).bold())
                    .add_run(
                        Run::new()
                            .add_text(format!("  [{}]", article.domain_label))
                            .size(20)
                            .color("3730a3"),
                    ),
            );
            if let Some(ref summary) = article.summary {
                docx = docx.add_paragraph(
                    Paragraph::new().add_run(Run::new().add_text(summary).size(20).color("555555")),
                );
            }
            docx = docx.add_paragraph(Paragraph::new());
        }

        // 三、风险提示
        docx = docx.add_paragraph(
            Paragraph::new().add_run(Run::new().add_text("三、风险提示").size(32).bold()),
        );

        for item in &data.risk_items {
            let color = match item.level.as_str() {
                "high" => "ef4444",
                "medium" => "f59e0b",
                _ => "22c55e",
            };
            docx = docx.add_paragraph(
                Paragraph::new()
                    .add_run(Run::new().add_text(&item.title).size(24).bold())
                    .add_run(
                        Run::new()
                            .add_text(format!("  [{}]", item.level_label))
                            .size(20)
                            .color(color),
                    ),
            );
            if !item.description.is_empty() {
                docx = docx.add_paragraph(
                    Paragraph::new().add_run(
                        Run::new()
                            .add_text(&item.description)
                            .size(20)
                            .color("555555"),
                    ),
                );
            }
            docx = docx.add_paragraph(Paragraph::new());
        }

        // 五、合规日历
        if !data.calendar_events.is_empty() {
            docx = docx.add_paragraph(
                Paragraph::new().add_run(Run::new().add_text("四、合规日历").size(32).bold()),
            );

            for event in &data.calendar_events {
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .add_run(Run::new().add_text(format!("{} - ", event.date)).size(22))
                        .add_run(Run::new().add_text(&event.title).size(22))
                        .add_run(
                            Run::new()
                                .add_text(format!("  ({})", event.event_type))
                                .size(20)
                                .color("888888"),
                        ),
                );
            }
        }

        // 页脚
        docx = docx.add_paragraph(Paragraph::new());
        docx = docx.add_paragraph(
            Paragraph::new()
                .add_run(
                    Run::new()
                        .add_text("本报告由 LawSaw 法律资讯平台自动生成")
                        .size(18)
                        .color("999999"),
                )
                .align(AlignmentType::Center),
        );

        // 序列化为字节
        let mut buf = Vec::new();
        docx.build()
            .pack(&mut std::io::Cursor::new(&mut buf))
            .map_err(|e| Error::Internal(format!("DOCX 生成失败: {}", e)))?;

        Ok(buf)
    }
}
