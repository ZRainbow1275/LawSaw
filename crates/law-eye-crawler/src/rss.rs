use crate::anti_crawl::RandomizedHeaders;
use crate::RawArticle;
use feed_rs::parser;
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_common::{Error, Result};
use reqwest::Client;
use std::time::Duration;
use tracing::{info, warn};

const DEFAULT_RSS_MAX_RETRIES: u32 = 3;
const DEFAULT_RSS_RETRY_BASE_DELAY_MS: u64 = 500;
const DEFAULT_RSS_RETRY_MAX_DELAY_MS: u64 = 10_000;

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
                let content = entry
                    .summary
                    .map(|s| s.content)
                    .or_else(|| entry.content.and_then(|c| c.body));
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
                        let body = response
                            .bytes()
                            .await
                            .map_err(|e| Error::Http(format!("RSS body read failed: {}", e)))?;
                        return Ok(body.to_vec());
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
