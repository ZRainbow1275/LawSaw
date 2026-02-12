// crates/law-eye-core/src/report/mod.rs
// 报告生成核心模块

pub mod aggregator;
pub mod exporter;
pub mod service;
pub mod template_service;
pub mod types;

pub use aggregator::ReportDataAggregator;
pub use exporter::chart::ChartRenderer;
pub use exporter::docx::DocxExporter;
pub use exporter::html::HtmlExporter;
pub use exporter::pdf::PdfExporter;
pub use service::ReportService;
pub use template_service::ReportTemplateService;
pub use types::{
    CreateReportInput, ExportFormat, ExportResult, ListReportsQuery, PeriodType,
    ReportAggregatedData, ReportStatus, UpdateReportInput,
};
