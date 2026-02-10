use crate::RawArticle;
use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_common::{Error, Result};
use reqwest::Client;
use scraper::{ElementRef, Html, Selector};
use serde::Deserialize;
use std::time::Duration;
use tracing::{info, warn};

const DEFAULT_HTTP_MAX_RETRIES: u32 = 3;
const DEFAULT_HTTP_RETRY_BASE_DELAY_MS: u64 = 300;
const DEFAULT_HTTP_RETRY_MAX_DELAY_MS: u64 = 5_000;

fn spider_http_max_retries() -> u32 {
    std::env::var("LAW_EYE__SPIDER__HTTP_MAX_RETRIES")
        .ok()
        .and_then(|raw| raw.trim().parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_HTTP_MAX_RETRIES)
}

fn spider_http_retry_base_delay_ms() -> u64 {
    std::env::var("LAW_EYE__SPIDER__HTTP_RETRY_BASE_DELAY_MS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_HTTP_RETRY_BASE_DELAY_MS)
}

fn spider_http_retry_max_delay_ms() -> u64 {
    std::env::var("LAW_EYE__SPIDER__HTTP_RETRY_MAX_DELAY_MS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_HTTP_RETRY_MAX_DELAY_MS)
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpiderConfig {
    pub list_selector: String,
    pub title_selector: String,
    pub link_selector: String,
    pub content_selector: Option<String>,
    pub date_selector: Option<String>,
    pub delay_ms: Option<u64>,
}

pub struct WebSpider {
    client: Client,
}

impl WebSpider {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("LawEye/1.0")
            .build()
            .map_err(|e| Error::Config(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client })
    }

    pub async fn fetch(
        &self,
        url: &str,
        config: &SpiderConfig,
        allow_internal: bool,
    ) -> Result<Vec<RawArticle>> {
        let policy = OutboundUrlPolicy::http_and_https(allow_internal);
        let page_url = validate_outbound_url(url, &policy)
            .await
            .map_err(|e| Error::Validation(format!("{}: {}", e.code(), e)))?;

        info!("Spidering page: {}", page_url);

        let html = self
            .fetch_html_with_retry(page_url.as_str(), "list")
            .await?;

        let document = Html::parse_document(&html);

        let list_selector = parse_required_selector(&config.list_selector)?;
        let title_selector = parse_required_selector(&config.title_selector)?;
        let link_selector = parse_required_selector(&config.link_selector)?;

        let content_selector =
            parse_optional_selector(config.content_selector.as_deref(), "content_selector");
        let date_selector =
            parse_optional_selector(config.date_selector.as_deref(), "date_selector");

        let mut articles = Vec::new();

        for (idx, element) in document.select(&list_selector).enumerate() {
            let title = element
                .select(&title_selector)
                .next()
                .map(|e| e.text().collect::<String>().trim().to_string());

            let link = element
                .select(&link_selector)
                .next()
                .and_then(|e| e.value().attr("href").map(|s| s.to_string()));

            if let (Some(title), Some(link)) = (title, link) {
                let full_link = if link.starts_with("http") {
                    link
                } else {
                    match page_url.join(&link) {
                        Ok(url) => url.to_string(),
                        Err(err) => {
                            warn!(
                                error = %err,
                                title = %title,
                                link = %link,
                                "spider list link parse failed, skipping article"
                            );
                            continue;
                        }
                    }
                };

                if let Some(delay) = delay_duration(config.delay_ms, idx) {
                    tokio::time::sleep(delay).await;
                }

                let (content, published_at) =
                    if content_selector.is_some() || date_selector.is_some() {
                        match self
                            .fetch_detail_fields(
                                &full_link,
                                content_selector.as_ref(),
                                date_selector.as_ref(),
                                allow_internal,
                            )
                            .await
                        {
                            Ok(detail) => detail,
                            Err(err) => {
                                warn!(
                                    error = %err,
                                    link = %full_link,
                                    "spider detail fetch failed, falling back to list-only article"
                                );
                                (None, None)
                            }
                        }
                    } else {
                        (None, None)
                    };

                articles.push(RawArticle {
                    title,
                    link: full_link,
                    content,
                    author: None,
                    published_at,
                });
            }
        }

        info!("Spidered {} articles", articles.len());
        Ok(articles)
    }

    async fn fetch_html_with_retry(&self, url: &str, context: &str) -> Result<String> {
        let max_retries = spider_http_max_retries();
        let base_delay_ms = spider_http_retry_base_delay_ms();
        let max_delay_ms = spider_http_retry_max_delay_ms();

        let mut attempt = 0u32;
        loop {
            attempt = attempt.saturating_add(1);

            match self.client.get(url).send().await {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        return response
                            .text()
                            .await
                            .map_err(|e| Error::Http(e.to_string()));
                    }

                    let can_retry = status == reqwest::StatusCode::TOO_MANY_REQUESTS
                        || status.is_server_error();
                    if can_retry && attempt <= max_retries {
                        let delay_ms = retry_delay_ms(attempt, base_delay_ms, max_delay_ms);
                        warn!(
                            url,
                            context,
                            attempt,
                            max_retries,
                            status = %status,
                            delay_ms,
                            "spider request failed, retrying"
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                        continue;
                    }

                    return Err(Error::Http(format!(
                        "spider {} request failed: status={} url={} attempt={}/{}",
                        context,
                        status,
                        url,
                        attempt,
                        max_retries + 1,
                    )));
                }
                Err(err) => {
                    let can_retry = err.is_timeout()
                        || err.is_connect()
                        || err.is_request()
                        || err.is_body()
                        || err.is_decode();

                    if can_retry && attempt <= max_retries {
                        let delay_ms = retry_delay_ms(attempt, base_delay_ms, max_delay_ms);
                        warn!(
                            url,
                            context,
                            attempt,
                            max_retries,
                            error = %err,
                            delay_ms,
                            "spider request errored, retrying"
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                        continue;
                    }

                    return Err(Error::Http(err.to_string()));
                }
            }
        }
    }

    async fn fetch_detail_fields(
        &self,
        url: &str,
        content_selector: Option<&Selector>,
        date_selector: Option<&Selector>,
        allow_internal: bool,
    ) -> Result<(Option<String>, Option<DateTime<Utc>>)> {
        let policy = OutboundUrlPolicy::http_and_https(allow_internal);
        let detail_url = validate_outbound_url(url, &policy)
            .await
            .map_err(|e| Error::Validation(format!("{}: {}", e.code(), e)))?;

        let html = self
            .fetch_html_with_retry(detail_url.as_str(), "detail")
            .await?;

        let document = Html::parse_document(&html);

        let content = content_selector.and_then(|selector| extract_content(&document, selector));

        let published_at = date_selector.and_then(|selector| extract_datetime(&document, selector));

        Ok((content, published_at))
    }
}

fn retry_delay_ms(attempt: u32, base_delay_ms: u64, max_delay_ms: u64) -> u64 {
    let shift = attempt.saturating_sub(1).min(16);
    base_delay_ms
        .saturating_mul(1u64 << shift)
        .min(max_delay_ms)
}

fn parse_required_selector(raw: &str) -> Result<Selector> {
    let normalized = raw.trim();
    if normalized.is_empty() {
        return Err(Error::Parse("Selector cannot be empty".to_string()));
    }

    Selector::parse(normalized).map_err(|e| Error::Parse(format!("{:?}", e)))
}

fn parse_optional_selector(raw: Option<&str>, selector_name: &str) -> Option<Selector> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return None;
    };

    match Selector::parse(raw) {
        Ok(selector) => Some(selector),
        Err(err) => {
            warn!(
                selector = raw,
                selector_name,
                error = ?err,
                "invalid optional selector, skipping detail field extraction"
            );
            None
        }
    }
}

fn delay_duration(delay_ms: Option<u64>, item_index: usize) -> Option<Duration> {
    if item_index == 0 {
        return None;
    }

    delay_ms
        .filter(|configured_delay| *configured_delay > 0)
        .map(Duration::from_millis)
}

fn extract_content(document: &Html, selector: &Selector) -> Option<String> {
    let parts: Vec<String> = document
        .select(selector)
        .map(extract_text)
        .filter(|text| !text.is_empty())
        .collect();

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

fn extract_datetime(document: &Html, selector: &Selector) -> Option<DateTime<Utc>> {
    let element = document.select(selector).next()?;

    let attr_candidate = element
        .value()
        .attr("datetime")
        .or_else(|| element.value().attr("content"))
        .or_else(|| element.value().attr("title"));

    if let Some(raw) = attr_candidate {
        if let Some(parsed) = parse_datetime(raw) {
            return Some(parsed);
        }
    }

    parse_datetime(&extract_text(element))
}

fn extract_text(element: ElementRef<'_>) -> String {
    element
        .text()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_datetime(raw: &str) -> Option<DateTime<Utc>> {
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }

    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return Some(dt.with_timezone(&Utc));
    }

    if let Ok(dt) = DateTime::parse_from_rfc2822(value) {
        return Some(dt.with_timezone(&Utc));
    }

    for pattern in [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
    ] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(value, pattern) {
            return Some(DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));
        }
    }

    for pattern in ["%Y-%m-%d", "%Y/%m/%d"] {
        if let Ok(date) = NaiveDate::parse_from_str(value, pattern) {
            let dt = date.and_hms_opt(0, 0, 0)?;
            return Some(DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::io::{BufRead, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::mpsc::{self, Sender};
    use std::thread::{self, JoinHandle};
    use std::time::Instant;

    struct TestServer {
        base_url: String,
        shutdown_sender: Option<Sender<()>>,
        handle: Option<JoinHandle<()>>,
    }

    impl TestServer {
        fn spawn(routes: &[(&str, &str)]) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
            listener
                .set_nonblocking(true)
                .expect("set nonblocking listener");

            let address = listener.local_addr().expect("read local address");
            let route_map: HashMap<String, String> = routes
                .iter()
                .map(|(path, body)| ((*path).to_string(), (*body).to_string()))
                .collect();

            let (shutdown_sender, shutdown_receiver) = mpsc::channel::<()>();

            let handle = thread::spawn(move || loop {
                if shutdown_receiver.try_recv().is_ok() {
                    break;
                }

                match listener.accept() {
                    Ok((mut stream, _)) => handle_connection(&mut stream, &route_map),
                    Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(_) => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                }
            });

            wait_for_server_ready(address);

            Self {
                base_url: format!("http://{}", address),
                shutdown_sender: Some(shutdown_sender),
                handle: Some(handle),
            }
        }
    }

    impl Drop for TestServer {
        fn drop(&mut self) {
            if let Some(sender) = self.shutdown_sender.take() {
                let _ = sender.send(());
            }

            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    fn handle_connection(stream: &mut TcpStream, routes: &HashMap<String, String>) {
        let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
        let mut reader = std::io::BufReader::new(stream);
        let mut request_line = String::new();
        let read_size = match reader.read_line(&mut request_line) {
            Ok(size) => size,
            Err(_) => return,
        };

        if read_size == 0 {
            return;
        }

        let path = request_line
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");

        let (status, body) = routes
            .get(path)
            .map(|body| ("200 OK", body.as_str()))
            .unwrap_or(("404 Not Found", "not found"));

        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        let stream = reader.get_mut();
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
    }

    fn wait_for_server_ready(address: std::net::SocketAddr) {
        for _ in 0..40 {
            if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(25))
            {
                let _ = stream.write_all(
                    b"GET /__ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
                );
                let mut probe = [0_u8; 64];
                let _ = stream.read(&mut probe);
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn build_config(
        content_selector: Option<&str>,
        date_selector: Option<&str>,
        delay_ms: Option<u64>,
    ) -> SpiderConfig {
        SpiderConfig {
            list_selector: ".item".to_string(),
            title_selector: ".entry".to_string(),
            link_selector: ".entry".to_string(),
            content_selector: content_selector.map(str::to_string),
            date_selector: date_selector.map(str::to_string),
            delay_ms,
        }
    }

    #[tokio::test]
    async fn fetch_falls_back_when_detail_request_fails() {
        let list_html = r#"
            <ul>
                <li class="item"><a class="entry" href="mailto:broken@example.com">Broken Article</a></li>
            </ul>
        "#;

        let server = TestServer::spawn(&[("/list", list_html)]);
        let spider = WebSpider::new().expect("create web spider");

        let articles = spider
            .fetch(
                &format!("{}/list", server.base_url),
                &build_config(Some(".detail-content"), Some(".detail-date"), None),
                true,
            )
            .await
            .expect("fetch list page");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Broken Article");
        assert_eq!(articles[0].content, None);
        assert_eq!(articles[0].published_at, None);
    }

    #[tokio::test]
    async fn fetch_extracts_detail_content_and_published_at_when_detail_request_succeeds() {
        let list_html = r#"
            <ul>
                <li class="item"><a class="entry" href="/detail-ok">Healthy Article</a></li>
            </ul>
        "#;
        let detail_html = r#"
            <article>
                <div class="detail-content">Full detail body</div>
                <time class="detail-date" datetime="2026-01-01T12:00:00Z"></time>
            </article>
        "#;

        let server = TestServer::spawn(&[("/list", list_html), ("/detail-ok", detail_html)]);
        let spider = WebSpider::new().expect("create web spider");

        let articles = spider
            .fetch(
                &format!("{}/list", server.base_url),
                &build_config(Some(".detail-content"), Some(".detail-date"), None),
                true,
            )
            .await
            .expect("fetch list page");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Healthy Article");

        let expected_time = DateTime::parse_from_rfc3339("2026-01-01T12:00:00Z")
            .expect("parse expected datetime")
            .with_timezone(&Utc);

        assert_eq!(articles[0].content.as_deref(), Some("Full detail body"));
        assert_eq!(articles[0].published_at, Some(expected_time));
    }

    #[tokio::test]
    async fn fetch_skips_invalid_optional_detail_selector() {
        let list_html = r#"
            <ul>
                <li class="item"><a class="entry" href="/detail">Only Article</a></li>
            </ul>
        "#;
        let detail_html = r#"
            <article>
                <div class="detail-content">Detail should be skipped by invalid selector</div>
            </article>
        "#;

        let server = TestServer::spawn(&[("/list", list_html), ("/detail", detail_html)]);
        let spider = WebSpider::new().expect("create web spider");

        let articles = spider
            .fetch(
                &format!("{}/list", server.base_url),
                &build_config(Some(".detail-content["), None, None),
                true,
            )
            .await
            .expect("fetch list with invalid optional selector");

        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Only Article");
        assert_eq!(articles[0].content, None);
        assert_eq!(articles[0].published_at, None);
    }

    #[test]
    fn delay_duration_only_applies_after_first_item() {
        assert_eq!(delay_duration(Some(200), 0), None);
        assert_eq!(delay_duration(Some(0), 2), None);
        assert_eq!(delay_duration(None, 2), None);
        assert_eq!(
            delay_duration(Some(200), 2),
            Some(Duration::from_millis(200))
        );
    }

    #[test]
    fn retry_delay_is_exponential_and_capped() {
        assert_eq!(retry_delay_ms(1, 300, 5_000), 300);
        assert_eq!(retry_delay_ms(2, 300, 5_000), 600);
        assert_eq!(retry_delay_ms(3, 300, 5_000), 1_200);
        assert_eq!(retry_delay_ms(4, 300, 5_000), 2_400);
        assert_eq!(retry_delay_ms(5, 300, 5_000), 4_800);
        assert_eq!(retry_delay_ms(6, 300, 5_000), 5_000);
        assert_eq!(retry_delay_ms(20, 300, 5_000), 5_000);
    }

    #[tokio::test]
    async fn fetch_applies_delay_between_items() {
        let list_html = r#"
            <ul>
                <li class="item"><a class="entry" href="/detail-1">Article 1</a></li>
                <li class="item"><a class="entry" href="/detail-2">Article 2</a></li>
                <li class="item"><a class="entry" href="/detail-3">Article 3</a></li>
            </ul>
        "#;

        let server = TestServer::spawn(&[("/list", list_html)]);
        let spider = WebSpider::new().expect("create web spider");

        let configured_delay_ms = 75_u64;
        let started_at = Instant::now();

        let articles = spider
            .fetch(
                &format!("{}/list", server.base_url),
                &build_config(None, None, Some(configured_delay_ms)),
                true,
            )
            .await
            .expect("fetch list with delay");

        let elapsed = started_at.elapsed();
        let expected_delay =
            Duration::from_millis(configured_delay_ms * (articles.len() as u64 - 1));
        let allowed_jitter = Duration::from_millis(20);

        assert_eq!(articles.len(), 3);
        assert!(
            elapsed >= expected_delay.saturating_sub(allowed_jitter),
            "elapsed {:?} should be >= {:?}",
            elapsed,
            expected_delay.saturating_sub(allowed_jitter)
        );
    }
}
