use law_eye_common::{Error, Result};
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;
use tracing::{info, warn};

/// Default Browserless endpoint (local Docker service).
const DEFAULT_BROWSERLESS_URL: &str = "http://localhost:3003";
const DEFAULT_BROWSERLESS_TIMEOUT_MS: u64 = 30_000;

/// Client for interacting with Browserless Chrome service.
///
/// Browserless provides headless browser automation via HTTP APIs.
/// This client uses the `/content` endpoint to fetch fully-rendered HTML
/// (including JavaScript-generated content) from dynamic web pages.
pub struct BrowserlessClient {
    client: Client,
    base_url: String,
    timeout_ms: u64,
}

/// Request body for the Browserless `/content` API.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentRequest {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    goto_options: Option<GotoOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wait_for_selector: Option<WaitForSelector>,
    #[serde(skip_serializing_if = "Option::is_none")]
    best_attempt: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reject_resource_types: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GotoOptions {
    wait_until: String,
    timeout: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WaitForSelector {
    selector: String,
    timeout: u64,
}

impl BrowserlessClient {
    /// Create a new BrowserlessClient with configuration from environment variables.
    ///
    /// Environment variables:
    /// - `LAW_EYE__BROWSERLESS__URL`: Base URL (default: `http://localhost:3002`)
    /// - `LAW_EYE__BROWSERLESS__TOKEN`: API token (optional, for hosted Browserless)
    /// - `LAW_EYE__BROWSERLESS__TIMEOUT_MS`: Request timeout (default: 30000)
    pub fn new() -> Result<Self> {
        let base_url = std::env::var("LAW_EYE__BROWSERLESS__URL")
            .unwrap_or_else(|_| DEFAULT_BROWSERLESS_URL.to_string());

        let timeout_ms: u64 = std::env::var("LAW_EYE__BROWSERLESS__TIMEOUT_MS")
            .ok()
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or(DEFAULT_BROWSERLESS_TIMEOUT_MS);

        let token = std::env::var("LAW_EYE__BROWSERLESS__TOKEN").ok();

        let mut builder = Client::builder()
            .timeout(Duration::from_millis(timeout_ms + 5_000)) // HTTP timeout slightly larger
            .user_agent("LawEye/1.0");

        // Bypass system proxy for internal service calls
        let force_no_proxy = std::env::var("LAW_EYE__SPIDER__NO_PROXY")
            .ok()
            .map(|v| v.trim() == "1" || v.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if force_no_proxy {
            builder = builder.no_proxy();
        }

        // Add bearer token if configured
        if let Some(ref token) = token {
            let mut headers = reqwest::header::HeaderMap::new();
            if let Ok(val) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)) {
                headers.insert(reqwest::header::AUTHORIZATION, val);
            }
            builder = builder.default_headers(headers);
        }

        let client = builder
            .build()
            .map_err(|e| Error::Config(format!("Failed to create Browserless HTTP client: {}", e)))?;

        info!(
            base_url = %base_url,
            timeout_ms,
            has_token = token.is_some(),
            "BrowserlessClient initialized"
        );

        Ok(Self {
            client,
            base_url,
            timeout_ms,
        })
    }

    /// Create a BrowserlessClient with explicit configuration (for testing).
    ///
    /// Always bypasses system proxy since this connects to a local service.
    pub fn with_config(base_url: String, timeout_ms: u64) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_millis(timeout_ms + 5_000))
            .user_agent("LawEye/1.0")
            .no_proxy()
            .build()
            .map_err(|e| Error::Config(format!("Failed to create Browserless HTTP client: {}", e)))?;

        Ok(Self {
            client,
            base_url,
            timeout_ms,
        })
    }

    /// Fetch fully-rendered HTML content from a URL using headless Chrome.
    ///
    /// # Arguments
    /// * `url` - The page URL to render
    /// * `wait_for` - Optional CSS selector to wait for before returning content
    /// * `wait_timeout_ms` - Optional timeout for the wait_for selector (default: timeout_ms)
    ///
    /// # Returns
    /// The fully-rendered HTML string, or an error if rendering fails.
    pub async fn fetch_rendered_html(
        &self,
        url: &str,
        wait_for: Option<&str>,
        wait_timeout_ms: Option<u64>,
    ) -> Result<String> {
        let endpoint = format!("{}/content", self.base_url.trim_end_matches('/'));

        let wait_timeout = wait_timeout_ms.unwrap_or(self.timeout_ms);

        let request = ContentRequest {
            url: url.to_string(),
            goto_options: Some(GotoOptions {
                wait_until: "networkidle2".to_string(),
                timeout: self.timeout_ms,
            }),
            wait_for_selector: wait_for.map(|selector| WaitForSelector {
                selector: selector.to_string(),
                timeout: wait_timeout,
            }),
            best_attempt: Some(true),
            reject_resource_types: Some(vec![
                "image".to_string(),
                "media".to_string(),
                "font".to_string(),
                "stylesheet".to_string(),
            ]),
        };

        info!(
            url = %url,
            wait_for = ?wait_for,
            "BrowserlessClient: fetching rendered content"
        );

        let response = self
            .client
            .post(&endpoint)
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    Error::Http(format!(
                        "Browserless request timed out after {}ms: {}",
                        self.timeout_ms, e
                    ))
                } else if e.is_connect() {
                    Error::Http(format!(
                        "Cannot connect to Browserless at {}: {}. Is the service running?",
                        self.base_url, e
                    ))
                } else {
                    Error::Http(format!("Browserless request failed: {}", e))
                }
            })?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "(failed to read body)".to_string());
            // Truncate error body to avoid log spam
            let truncated = if body.len() > 500 {
                format!("{}...(truncated)", &body[..500])
            } else {
                body
            };
            return Err(Error::Http(format!(
                "Browserless returned status {}: {}",
                status, truncated
            )));
        }

        let html = response
            .text()
            .await
            .map_err(|e| Error::Http(format!("Failed to read Browserless response body: {}", e)))?;

        info!(
            url = %url,
            html_len = html.len(),
            "BrowserlessClient: rendered content received"
        );

        Ok(html)
    }

    /// Check if the Browserless service is healthy and reachable.
    pub async fn health_check(&self) -> Result<bool> {
        let endpoint = format!(
            "{}/json/version",
            self.base_url.trim_end_matches('/')
        );

        match self
            .client
            .get(&endpoint)
            .timeout(Duration::from_secs(5))
            .send()
            .await
        {
            Ok(response) => Ok(response.status().is_success()),
            Err(e) => {
                warn!(
                    error = %e,
                    base_url = %self.base_url,
                    "BrowserlessClient health check failed"
                );
                Ok(false)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::io::{Read as _, Write as _};
    use std::net::{TcpListener, TcpStream};
    use std::sync::Arc;
    use std::thread;

    /// Minimal HTTP server that simulates Browserless /content API.
    struct MockBrowserless {
        base_url: String,
        _handle: thread::JoinHandle<()>,
    }

    impl MockBrowserless {
        fn spawn(responses: HashMap<String, (u16, String)>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
            let addr = listener.local_addr().expect("addr");
            let responses = Arc::new(responses);

            let handle = thread::spawn(move || {
                for stream in listener.incoming() {
                    match stream {
                        Ok(stream) => {
                            let responses = Arc::clone(&responses);
                            thread::spawn(move || {
                                handle_mock_request(stream, &responses);
                            });
                        }
                        Err(_) => break,
                    }
                }
            });

            // Wait for server to be ready
            for _ in 0..50 {
                if TcpStream::connect_timeout(&addr, Duration::from_millis(50)).is_ok() {
                    break;
                }
                thread::sleep(Duration::from_millis(10));
            }

            Self {
                base_url: format!("http://{}", addr),
                _handle: handle,
            }
        }
    }

    fn handle_mock_request(
        mut stream: TcpStream,
        responses: &HashMap<String, (u16, String)>,
    ) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

        let mut buf = [0u8; 8192];
        let mut filled = 0;
        loop {
            if filled >= buf.len() {
                break;
            }
            match stream.read(&mut buf[filled..]) {
                Ok(0) => break,
                Ok(n) => {
                    filled += n;
                    if buf[..filled].windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }

        if filled == 0 {
            return;
        }

        let request_str = String::from_utf8_lossy(&buf[..filled]);
        let path = request_str
            .lines()
            .next()
            .and_then(|line| {
                let parts: Vec<&str> = line.split_whitespace().collect();
                parts.get(1).copied()
            })
            .unwrap_or("/");

        let (status_code, body) = responses
            .get(path)
            .cloned()
            .unwrap_or((404, "not found".to_string()));

        let status_text = match status_code {
            200 => "OK",
            400 => "Bad Request",
            500 => "Internal Server Error",
            _ => "Unknown",
        };

        let response = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status_code,
            status_text,
            body.len(),
            body
        );

        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
        let _ = stream.shutdown(std::net::Shutdown::Write);
    }

    #[tokio::test]
    async fn fetch_rendered_html_returns_content() {
        let mut responses = HashMap::new();
        responses.insert(
            "/content".to_string(),
            (200, "<html><body><h1>Rendered</h1></body></html>".to_string()),
        );

        let mock = MockBrowserless::spawn(responses);
        let client =
            BrowserlessClient::with_config(mock.base_url.clone(), 5000).unwrap();

        let result = client
            .fetch_rendered_html("https://example.com", None, None)
            .await;

        assert!(result.is_ok());
        let html = result.unwrap();
        assert!(html.contains("Rendered"));
    }

    #[tokio::test]
    async fn fetch_rendered_html_handles_server_error() {
        let mut responses = HashMap::new();
        responses.insert(
            "/content".to_string(),
            (500, "internal error".to_string()),
        );

        let mock = MockBrowserless::spawn(responses);
        let client =
            BrowserlessClient::with_config(mock.base_url.clone(), 5000).unwrap();

        let result = client
            .fetch_rendered_html("https://example.com", None, None)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("500"));
    }

    #[tokio::test]
    async fn health_check_returns_true_when_available() {
        let mut responses = HashMap::new();
        responses.insert(
            "/json/version".to_string(),
            (200, r#"{"Browser":"Chrome/120"}"#.to_string()),
        );

        let mock = MockBrowserless::spawn(responses);
        let client =
            BrowserlessClient::with_config(mock.base_url.clone(), 5000).unwrap();

        assert!(client.health_check().await.unwrap());
    }

    #[tokio::test]
    async fn health_check_returns_false_when_unavailable() {
        // Point to a port that's not listening
        let client =
            BrowserlessClient::with_config("http://127.0.0.1:1".to_string(), 1000)
                .unwrap();

        assert!(!client.health_check().await.unwrap());
    }

    #[tokio::test]
    async fn fetch_rendered_html_connection_refused() {
        let client =
            BrowserlessClient::with_config("http://127.0.0.1:1".to_string(), 1000)
                .unwrap();

        let result = client
            .fetch_rendered_html("https://example.com", None, None)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("connect") || err.contains("Connect") || err.contains("Connection"),
            "Error should mention connection: {}",
            err
        );
    }
}
