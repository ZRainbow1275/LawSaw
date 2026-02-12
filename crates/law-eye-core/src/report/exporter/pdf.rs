// crates/law-eye-core/src/report/exporter/pdf.rs
// PdfExporter — 调用 browserless HTTP API 将 HTML 转换为 PDF

use law_eye_common::{Error, Result};

/// PDF 导出器，通过 browserless HTTP API 将 HTML 渲染为 PDF。
///
/// browserless 服务配置在 docker-compose.yml 中，默认端口 3000。
pub struct PdfExporter {
    browserless_url: String,
    http_client: reqwest::Client,
}

impl PdfExporter {
    pub fn new(browserless_url: &str) -> Self {
        Self {
            browserless_url: browserless_url.trim_end_matches('/').to_string(),
            http_client: reqwest::Client::new(),
        }
    }

    /// 从环境变量构造。
    /// 优先读取 `LAW_EYE__BROWSERLESS__URL`（与 docker-compose 对齐），
    /// 回退读取 `BROWSERLESS_URL`，最终默认 `http://localhost:3000`。
    pub fn from_env() -> Result<Self> {
        let url = std::env::var("LAW_EYE__BROWSERLESS__URL")
            .or_else(|_| std::env::var("BROWSERLESS_URL"))
            .unwrap_or_else(|_| "http://localhost:3000".to_string());
        Ok(Self::new(&url))
    }

    /// 将 HTML 转换为 PDF 字节
    pub async fn html_to_pdf(
        &self,
        html_content: &str,
        page_config: &serde_json::Value,
    ) -> Result<Vec<u8>> {
        let margin_top = page_config
            .get("margin_top")
            .and_then(|v| v.as_str())
            .unwrap_or("20mm");
        let margin_bottom = page_config
            .get("margin_bottom")
            .and_then(|v| v.as_str())
            .unwrap_or("20mm");
        let margin_left = page_config
            .get("margin_left")
            .and_then(|v| v.as_str())
            .unwrap_or("15mm");
        let margin_right = page_config
            .get("margin_right")
            .and_then(|v| v.as_str())
            .unwrap_or("15mm");
        let landscape = page_config
            .get("orientation")
            .and_then(|v| v.as_str())
            .map(|o| o == "landscape")
            .unwrap_or(false);
        let format = page_config
            .get("page_size")
            .and_then(|v| v.as_str())
            .unwrap_or("A4");

        let payload = serde_json::json!({
            "html": html_content,
            "options": {
                "format": format,
                "landscape": landscape,
                "margin": {
                    "top": margin_top,
                    "bottom": margin_bottom,
                    "left": margin_left,
                    "right": margin_right
                },
                "printBackground": true,
                "displayHeaderFooter": false
            }
        });

        let url = format!("{}/chromium/pdf", self.browserless_url);
        let response = self
            .http_client
            .post(&url)
            .json(&payload)
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| Error::Http(format!("browserless PDF 请求失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "unknown".to_string());
            return Err(Error::Http(format!(
                "browserless PDF 生成失败 ({}): {}",
                status, body
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Http(format!("读取 PDF 响应失败: {}", e)))?;

        Ok(bytes.to_vec())
    }
}
