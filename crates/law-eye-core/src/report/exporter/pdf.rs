// crates/law-eye-core/src/report/exporter/pdf.rs
// PdfExporter — 调用 browserless HTTP API 将 HTML 转换为 PDF

use law_eye_common::{Error, Result};
use reqwest::multipart::{Form, Part};
use reqwest::StatusCode;
use tracing::{info, warn};

const BROWSERLESS_TIMEOUT_SECS: u64 = 120;
const BROWSERLESS_MAX_ATTEMPTS: u32 = 3;
const GOTENBERG_MAX_ATTEMPTS: u32 = 2;
const RETRY_BACKOFF_BASE_MS: u64 = 500;
const RETRY_BACKOFF_MAX_MS: u64 = 2_000;

/// PDF 导出器，通过 browserless HTTP API 将 HTML 渲染为 PDF。
///
/// browserless 服务配置在 docker-compose.yml 中，默认端口 3000。
pub struct PdfExporter {
    browserless_url: String,
    gotenberg_url: Option<String>,
    http_client: reqwest::Client,
}

struct PdfPageOptions<'a> {
    margin_top: &'a str,
    margin_bottom: &'a str,
    margin_left: &'a str,
    margin_right: &'a str,
    landscape: bool,
    format: &'a str,
}

struct GotenbergFallbackRequest<'a> {
    html_content: &'a str,
    page: PdfPageOptions<'a>,
    browserless_error: String,
    request_id: &'a str,
}

impl PdfExporter {
    pub fn new(browserless_url: &str) -> Self {
        let gotenberg_url = std::env::var("LAW_EYE__GOTENBERG__URL")
            .or_else(|_| std::env::var("GOTENBERG_URL"))
            .ok()
            .map(|url| url.trim_end_matches('/').to_string())
            .filter(|url| !url.is_empty());

        Self {
            browserless_url: browserless_url.trim_end_matches('/').to_string(),
            gotenberg_url,
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

    fn export_retry_delay(attempt: u32) -> std::time::Duration {
        let shift = attempt.saturating_sub(1).min(8);
        let delay_ms = RETRY_BACKOFF_BASE_MS
            .saturating_mul(1u64 << shift)
            .min(RETRY_BACKOFF_MAX_MS);
        std::time::Duration::from_millis(delay_ms)
    }

    fn should_retry_status(status: StatusCode) -> bool {
        status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
    }

    fn normalize_request_id(raw: &str) -> String {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            "unknown".to_string()
        } else {
            trimmed.to_string()
        }
    }

    /// 将 HTML 转换为 PDF 字节
    pub async fn html_to_pdf(
        &self,
        html_content: &str,
        page_config: &serde_json::Value,
        request_id: &str,
    ) -> Result<Vec<u8>> {
        let request_id = Self::normalize_request_id(request_id);
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

        let page_options = PdfPageOptions {
            margin_top,
            margin_bottom,
            margin_left,
            margin_right,
            landscape,
            format,
        };

        let browserless_payload = serde_json::json!({
            "html": html_content,
            "options": {
                "format": page_options.format,
                "landscape": page_options.landscape,
                "margin": {
                    "top": page_options.margin_top,
                    "bottom": page_options.margin_bottom,
                    "left": page_options.margin_left,
                    "right": page_options.margin_right
                },
                "printBackground": true,
                "displayHeaderFooter": false
            }
        });

        let browserless_url = format!("{}/chromium/pdf", self.browserless_url);
        info!(request_id = %request_id, %browserless_url, "pdf_export browserless start");

        let mut browserless_error = String::new();
        for attempt in 1..=BROWSERLESS_MAX_ATTEMPTS {
            let browserless_response = self
                .http_client
                .post(&browserless_url)
                .json(&browserless_payload)
                .timeout(std::time::Duration::from_secs(BROWSERLESS_TIMEOUT_SECS))
                .send()
                .await;

            match browserless_response {
                Ok(response) if response.status().is_success() => {
                    let bytes = response.bytes().await.map_err(|e| {
                        Error::Http(format!(
                            "request_id={} 读取 browserless PDF 响应失败: {}",
                            request_id, e
                        ))
                    })?;
                    info!(
                        request_id = %request_id,
                        attempt,
                        bytes = bytes.len(),
                        "pdf_export browserless success"
                    );
                    return Ok(bytes.to_vec());
                }
                Ok(response) => {
                    let status = response.status();
                    let body = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "unknown".to_string());
                    browserless_error = format!(
                        "request_id={} browserless PDF 生成失败 ({}): {}",
                        request_id, status, body
                    );

                    if attempt < BROWSERLESS_MAX_ATTEMPTS && Self::should_retry_status(status) {
                        warn!(
                            request_id = %request_id,
                            attempt,
                            status = %status,
                            "pdf_export browserless retry"
                        );
                        tokio::time::sleep(Self::export_retry_delay(attempt)).await;
                        continue;
                    }
                    break;
                }
                Err(err) => {
                    browserless_error = format!(
                        "request_id={} browserless PDF 请求失败: {}",
                        request_id, err
                    );

                    if attempt < BROWSERLESS_MAX_ATTEMPTS {
                        warn!(
                            request_id = %request_id,
                            attempt,
                            error = %err,
                            "pdf_export browserless retry after request error"
                        );
                        tokio::time::sleep(Self::export_retry_delay(attempt)).await;
                        continue;
                    }
                    break;
                }
            }
        }

        self.try_gotenberg_fallback(GotenbergFallbackRequest {
            html_content,
            page: page_options,
            browserless_error,
            request_id: &request_id,
        })
        .await
    }

    async fn try_gotenberg_fallback(
        &self,
        request: GotenbergFallbackRequest<'_>,
    ) -> Result<Vec<u8>> {
        let Some(gotenberg_url) = &self.gotenberg_url else {
            return Err(Error::Http(request.browserless_error));
        };

        let endpoint = format!("{}/forms/chromium/convert/html", gotenberg_url);

        for attempt in 1..=GOTENBERG_MAX_ATTEMPTS {
            let html_part = Part::bytes(request.html_content.as_bytes().to_vec())
                // Gotenberg chromium html conversion expects an input file named index.html.
                .file_name("index.html")
                .mime_str("text/html; charset=utf-8")
                .map_err(|e| Error::Http(format!("构造 gotenberg HTML 文件失败: {}", e)))?;

            let form = Form::new()
                .part("files", html_part)
                .text("paperSize", request.page.format.to_string())
                .text("landscape", request.page.landscape.to_string())
                .text("marginTop", request.page.margin_top.to_string())
                .text("marginBottom", request.page.margin_bottom.to_string())
                .text("marginLeft", request.page.margin_left.to_string())
                .text("marginRight", request.page.margin_right.to_string())
                .text("printBackground", "true".to_string());

            let response = self
                .http_client
                .post(&endpoint)
                .multipart(form)
                .timeout(std::time::Duration::from_secs(BROWSERLESS_TIMEOUT_SECS))
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    let bytes = resp.bytes().await.map_err(|e| {
                        Error::Http(format!(
                            "request_id={} 读取 gotenberg PDF 响应失败: {}",
                            request.request_id, e
                        ))
                    })?;
                    info!(
                        request_id = %request.request_id,
                        attempt,
                        bytes = bytes.len(),
                        "pdf_export gotenberg success"
                    );
                    return Ok(bytes.to_vec());
                }
                Ok(resp) => {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_else(|_| "unknown".to_string());
                    if attempt < GOTENBERG_MAX_ATTEMPTS && Self::should_retry_status(status) {
                        warn!(
                            request_id = %request.request_id,
                            attempt,
                            status = %status,
                            "pdf_export gotenberg retry"
                        );
                        tokio::time::sleep(Self::export_retry_delay(attempt)).await;
                        continue;
                    }
                    return Err(Error::Http(format!(
                        "{}; request_id={} gotenberg PDF 生成失败 ({}): {}",
                        request.browserless_error, request.request_id, status, body
                    )));
                }
                Err(e) => {
                    if attempt < GOTENBERG_MAX_ATTEMPTS {
                        warn!(
                            request_id = %request.request_id,
                            attempt,
                            error = %e,
                            "pdf_export gotenberg retry after request error"
                        );
                        tokio::time::sleep(Self::export_retry_delay(attempt)).await;
                        continue;
                    }
                    return Err(Error::Http(format!(
                        "{}; request_id={} gotenberg PDF 请求失败: {}",
                        request.browserless_error, request.request_id, e
                    )));
                }
            }
        }

        Err(Error::Http(format!(
            "{}; request_id={} gotenberg retry exhausted",
            request.browserless_error, request.request_id
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::PdfExporter;
    use reqwest::StatusCode;

    #[test]
    fn should_retry_status_matches_retryable_http_codes() {
        assert!(PdfExporter::should_retry_status(
            StatusCode::TOO_MANY_REQUESTS
        ));
        assert!(PdfExporter::should_retry_status(StatusCode::BAD_GATEWAY));
        assert!(!PdfExporter::should_retry_status(StatusCode::BAD_REQUEST));
    }

    #[test]
    fn export_retry_delay_is_bounded() {
        assert_eq!(PdfExporter::export_retry_delay(1).as_millis(), 500);
        assert_eq!(PdfExporter::export_retry_delay(2).as_millis(), 1000);
        assert_eq!(PdfExporter::export_retry_delay(10).as_millis(), 2000);
    }

    #[test]
    fn normalize_request_id_uses_unknown_for_empty() {
        assert_eq!(PdfExporter::normalize_request_id(""), "unknown");
        assert_eq!(PdfExporter::normalize_request_id("  req-123  "), "req-123");
    }
}
