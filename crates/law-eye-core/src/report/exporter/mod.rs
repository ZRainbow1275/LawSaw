// crates/law-eye-core/src/report/exporter/mod.rs
// 导出引擎 trait + 子模块

pub mod chart;
pub mod docx;
pub mod html;
pub mod pdf;

use law_eye_common::Result;

use super::types::ExportResult;

/// 报告导出引擎接口
pub trait ExportEngine: Send + Sync {
    /// 将 HTML 内容导出为目标格式，上传至 MinIO，返回 ExportResult。
    fn export(
        &self,
        tenant_id: uuid::Uuid,
        report_id: uuid::Uuid,
        version: i64,
        html_content: &str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ExportResult>> + Send + '_>>;
}
