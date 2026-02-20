// crates/law-eye-core/src/report/exporter/chart.rs
// ChartRenderer — 使用 plotters 生成 SVG 图表

use law_eye_common::{Error, Result};

use crate::report::types::{DomainBreakdown, RegionBreakdown, ReportChart, ReportOverview};

/// SVG 图表渲染器，使用 plotters 库生成嵌入式 SVG。
pub struct ChartRenderer;

impl ChartRenderer {
    /// 从概览数据生成一组图表
    pub fn render_charts(overview: &ReportOverview) -> Result<Vec<ReportChart>> {
        let mut charts = Vec::new();

        // 域分布柱状图
        if !overview.domain_breakdown.is_empty() {
            let svg = Self::render_domain_bar_chart(&overview.domain_breakdown)?;
            charts.push(ReportChart {
                title: "法规领域分布".to_string(),
                chart_type: "bar".to_string(),
                svg,
            });
        }

        // 地区分布柱状图
        if !overview.region_breakdown.is_empty() {
            let svg = Self::render_region_bar_chart(&overview.region_breakdown)?;
            charts.push(ReportChart {
                title: "地区分布".to_string(),
                chart_type: "bar".to_string(),
                svg,
            });
        }

        Ok(charts)
    }

    /// 渲染域分布水平柱状图为 SVG
    fn render_domain_bar_chart(data: &[DomainBreakdown]) -> Result<String> {
        use plotters::prelude::*;
        use plotters_svg::SVGBackend;

        let max_count = data.iter().map(|d| d.count).max().unwrap_or(1) as f64;
        let bar_count = data.len();
        let height = (bar_count * 40 + 60).max(200) as u32;

        let mut svg_buf = String::new();
        {
            let root = SVGBackend::with_string(&mut svg_buf, (500, height)).into_drawing_area();
            root.fill(&WHITE)
                .map_err(|e| Error::Internal(format!("图表渲染失败: {}", e)))?;

            let mut chart = ChartBuilder::on(&root)
                .margin(10)
                .x_label_area_size(30)
                .y_label_area_size(120)
                .build_cartesian_2d(0f64..max_count * 1.1, 0..bar_count)
                .map_err(|e| Error::Internal(format!("图表构建失败: {}", e)))?;

            chart
                .configure_mesh()
                .disable_mesh()
                .y_labels(bar_count)
                .y_label_formatter(&|idx| {
                    data.get(*idx).map(|d| d.label.clone()).unwrap_or_default()
                })
                .draw()
                .map_err(|e| Error::Internal(format!("图表绘制失败: {}", e)))?;

            chart
                .draw_series(data.iter().enumerate().map(|(idx, d)| {
                    let color = Palette99::pick(idx);
                    Rectangle::new([(0.0, idx), (d.count as f64, idx + 1)], color.filled())
                }))
                .map_err(|e| Error::Internal(format!("图表序列绘制失败: {}", e)))?;

            root.present()
                .map_err(|e| Error::Internal(format!("图表输出失败: {}", e)))?;
        }

        Ok(svg_buf)
    }

    /// 渲染地区分布水平柱状图为 SVG
    fn render_region_bar_chart(data: &[RegionBreakdown]) -> Result<String> {
        use plotters::prelude::*;
        use plotters_svg::SVGBackend;

        let max_count = data.iter().map(|d| d.count).max().unwrap_or(1) as f64;
        let bar_count = data.len();
        let height = (bar_count * 40 + 60).max(200) as u32;

        let mut svg_buf = String::new();
        {
            let root = SVGBackend::with_string(&mut svg_buf, (500, height)).into_drawing_area();
            root.fill(&WHITE)
                .map_err(|e| Error::Internal(format!("图表渲染失败: {}", e)))?;

            let mut chart = ChartBuilder::on(&root)
                .margin(10)
                .x_label_area_size(30)
                .y_label_area_size(80)
                .build_cartesian_2d(0f64..max_count * 1.1, 0..bar_count)
                .map_err(|e| Error::Internal(format!("图表构建失败: {}", e)))?;

            chart
                .configure_mesh()
                .disable_mesh()
                .y_labels(bar_count)
                .y_label_formatter(&|idx| {
                    data.get(*idx)
                        .map(|d| d.region_name.clone())
                        .unwrap_or_default()
                })
                .draw()
                .map_err(|e| Error::Internal(format!("图表绘制失败: {}", e)))?;

            chart
                .draw_series(data.iter().enumerate().map(|(idx, d)| {
                    let color = Palette99::pick(idx);
                    Rectangle::new([(0.0, idx), (d.count as f64, idx + 1)], color.filled())
                }))
                .map_err(|e| Error::Internal(format!("图表序列绘制失败: {}", e)))?;

            root.present()
                .map_err(|e| Error::Internal(format!("图表输出失败: {}", e)))?;
        }

        Ok(svg_buf)
    }
}
