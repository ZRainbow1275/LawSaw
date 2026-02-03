use crate::RawArticle;
use feed_rs::parser;
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_common::{Error, Result};
use reqwest::Client;
use tracing::info;

pub struct RssFetcher {
    client: Client,
}

impl RssFetcher {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("LawEye/1.0")
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    pub async fn fetch(&self, url: &str, allow_internal: bool) -> Result<Vec<RawArticle>> {
        let policy = OutboundUrlPolicy::http_and_https(allow_internal);
        let url = validate_outbound_url(url, &policy)
            .await
            .map_err(|e| Error::Validation(format!("{}: {}", e.code(), e)))?;

        info!("Fetching RSS feed: {}", url);

        let response = self
            .client
            .get(url.as_str())
            .send()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

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

                Some(RawArticle {
                    title,
                    link,
                    content,
                    author: entry.authors.first().map(|a| a.name.clone()),
                    published_at,
                })
            })
            .collect();

        info!("Fetched {} articles from RSS", articles.len());
        Ok(articles)
    }
}

impl Default for RssFetcher {
    fn default() -> Self {
        Self::new()
    }
}
