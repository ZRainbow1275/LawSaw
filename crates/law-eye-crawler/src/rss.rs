use crate::anti_crawl::RandomizedHeaders;
use crate::RawArticle;
use feed_rs::parser;
use futures::StreamExt;
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_common::{Error, Result};
use reqwest::Client;
use std::time::Duration;
use tracing::{info, warn};

const DEFAULT_RSS_MAX_RETRIES: u32 = 3;
const DEFAULT_RSS_RETRY_BASE_DELAY_MS: u64 = 500;
const DEFAULT_RSS_RETRY_MAX_DELAY_MS: u64 = 10_000;
const MIN_RSS_CONTENT_CHARS: usize = 20;
const MAX_RSS_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

pub struct RssFetcher {
    client: Client,
    /// Generates randomized headers for each request to reduce fingerprinting.
    randomized_headers: RandomizedHeaders,
}

impl RssFetcher {
    pub fn new() -> Result<Self> {
        // Do NOT set a fixed user_agent on the client — we inject a random one per request.
        let mut builder = Client::builder().timeout(Duration::from_secs(30));

        // Honour LAW_EYE__SPIDER__NO_PROXY=1 to bypass system proxy.
        let force_no_proxy = std::env::var("LAW_EYE__SPIDER__NO_PROXY")
            .ok()
            .map(|v| v.trim() == "1" || v.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if force_no_proxy {
            builder = builder.no_proxy();
        }

        let client = builder
            .build()
            .map_err(|e| Error::Config(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            randomized_headers: RandomizedHeaders::new(),
        })
    }

    pub async fn fetch(&self, url: &str, allow_internal: bool) -> Result<Vec<RawArticle>> {
        let policy = OutboundUrlPolicy::http_and_https(allow_internal);
        let url = validate_outbound_url(url, &policy)
            .await
            .map_err(|e| Error::Validation(format!("{}: {}", e.code(), e)))?;

        info!("Fetching RSS feed: {}", url);

        let bytes = self.fetch_with_retry(url.as_str()).await?;

        let feed = parser::parse(&bytes[..]).map_err(|e| Error::Parse(e.to_string()))?;

        let articles: Vec<RawArticle> = feed
            .entries
            .into_iter()
            .filter_map(|entry| {
                let link = entry.links.first()?.href.clone();
                let title = entry.title.map(|t| t.content)?;
                let content = normalize_rss_content(
                    entry
                        .summary
                        .map(|s| s.content)
                        .or_else(|| entry.content.and_then(|c| c.body)),
                );
                let published_at = entry.published.or(entry.updated);

                let mut article = RawArticle::new(title, link);
                article.content = content;
                article.author = entry.authors.first().map(|a| a.name.clone());
                article.published_at = published_at;
                Some(article)
            })
            .collect();

        info!("Fetched {} articles from RSS", articles.len());
        Ok(articles)
    }

    /// Fetch RSS feed bytes with retry and exponential backoff.
    ///
    /// Retries on transient network errors (timeout, connection, server errors)
    /// and 429 Too Many Requests. Returns the raw response bytes on success.
    async fn fetch_with_retry(&self, url: &str) -> Result<Vec<u8>> {
        let max_retries = DEFAULT_RSS_MAX_RETRIES;
        let base_delay_ms = DEFAULT_RSS_RETRY_BASE_DELAY_MS;
        let max_delay_ms = DEFAULT_RSS_RETRY_MAX_DELAY_MS;

        let mut attempt = 0u32;
        loop {
            attempt = attempt.saturating_add(1);

            // Inject randomized headers and UA per request to reduce fingerprinting
            let headers = self.randomized_headers.generate();
            let ua = self.randomized_headers.random_user_agent();

            match self
                .client
                .get(url)
                .header(reqwest::header::USER_AGENT, ua)
                .headers(headers)
                .send()
                .await
            {
                Ok(response) => {
                    let status = response.status();
                    if status.is_success() {
                        return read_rss_body_with_limit(response, url, MAX_RSS_RESPONSE_BYTES)
                            .await;
                    }

                    let can_retry = status == reqwest::StatusCode::TOO_MANY_REQUESTS
                        || status.is_server_error();
                    if can_retry && attempt <= max_retries {
                        let delay_ms = retry_delay_ms(attempt, base_delay_ms, max_delay_ms);
                        warn!(
                            url,
                            attempt,
                            max_retries,
                            status = %status,
                            delay_ms,
                            "RSS request failed, retrying"
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                        continue;
                    }

                    return Err(Error::Http(format!(
                        "RSS feed request failed: status={} url={} attempt={}/{}",
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
                            attempt,
                            max_retries,
                            error = %err,
                            delay_ms,
                            "RSS request errored, retrying"
                        );
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                        continue;
                    }

                    return Err(Error::Http(err.to_string()));
                }
            }
        }
    }
}

/// Compute exponential backoff delay capped at `max_delay_ms`.
fn retry_delay_ms(attempt: u32, base_delay_ms: u64, max_delay_ms: u64) -> u64 {
    let shift = attempt.saturating_sub(1).min(16);
    base_delay_ms
        .saturating_mul(1u64 << shift)
        .min(max_delay_ms)
}

fn normalize_rss_content(content: Option<String>) -> Option<String> {
    let value = content?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    // RSS feeds often include short placeholders (e.g. "Link", "Read more")
    // that would be dropped by quality stage; treat them as missing content.
    if trimmed.chars().count() < MIN_RSS_CONTENT_CHARS {
        return None;
    }

    Some(trimmed.to_string())
}

async fn read_rss_body_with_limit(
    response: reqwest::Response,
    url: &str,
    max_bytes: usize,
) -> Result<Vec<u8>> {
    if is_content_length_over_limit(response.content_length(), max_bytes) {
        return Err(Error::Http(format!(
            "RSS feed response too large: content_length={:?} limit={} url={}",
            response.content_length(),
            max_bytes,
            url
        )));
    }

    let initial_capacity = response
        .content_length()
        .map(|len| len.min(max_bytes as u64) as usize)
        .unwrap_or(8 * 1024);
    let mut body = Vec::with_capacity(initial_capacity);
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        let chunk =
            chunk_result.map_err(|e| Error::Http(format!("RSS body read failed: {}", e)))?;
        if is_chunk_append_over_limit(body.len(), chunk.len(), max_bytes) {
            return Err(Error::Http(format!(
                "RSS feed response exceeded streaming limit: limit={} url={}",
                max_bytes, url
            )));
        }
        body.extend_from_slice(&chunk);
    }

    Ok(body)
}

fn is_content_length_over_limit(content_length: Option<u64>, max_bytes: usize) -> bool {
    content_length
        .map(|len| len > max_bytes as u64)
        .unwrap_or(false)
}

fn is_chunk_append_over_limit(current_len: usize, append_len: usize, max_bytes: usize) -> bool {
    current_len.saturating_add(append_len) > max_bytes
}

#[cfg(test)]
mod tests {
    use super::{
        is_chunk_append_over_limit, is_content_length_over_limit, normalize_rss_content,
        MAX_RSS_RESPONSE_BYTES,
    };

    #[test]
    fn normalize_rss_content_drops_short_or_blank_values() {
        assert_eq!(normalize_rss_content(None), None);
        assert_eq!(normalize_rss_content(Some("".to_string())), None);
        assert_eq!(normalize_rss_content(Some("  \n\t ".to_string())), None);
        assert_eq!(normalize_rss_content(Some("Read more".to_string())), None);
    }

    #[test]
    fn normalize_rss_content_keeps_meaningful_summary() {
        let value = "This summary is definitely longer than twenty characters.";
        assert_eq!(
            normalize_rss_content(Some(value.to_string())),
            Some(value.to_string())
        );
    }

    #[test]
    fn content_length_limit_check_works() {
        assert!(!is_content_length_over_limit(None, MAX_RSS_RESPONSE_BYTES));
        assert!(!is_content_length_over_limit(
            Some(MAX_RSS_RESPONSE_BYTES as u64),
            MAX_RSS_RESPONSE_BYTES
        ));
        assert!(is_content_length_over_limit(
            Some((MAX_RSS_RESPONSE_BYTES + 1) as u64),
            MAX_RSS_RESPONSE_BYTES
        ));
    }

    #[test]
    fn chunk_append_limit_check_works() {
        assert!(!is_chunk_append_over_limit(1024, 2048, 4096));
        assert!(!is_chunk_append_over_limit(2048, 2048, 4096));
        assert!(is_chunk_append_over_limit(2048, 2049, 4096));
        assert!(is_chunk_append_over_limit(
            usize::MAX,
            1,
            MAX_RSS_RESPONSE_BYTES
        ));
    }
}
