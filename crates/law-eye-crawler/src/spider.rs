use crate::RawArticle;
use law_eye_common::{Error, Result};
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Deserialize;
use tracing::info;

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
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("LawEye/1.0")
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    pub async fn fetch(&self, url: &str, config: &SpiderConfig) -> Result<Vec<RawArticle>> {
        info!("Spidering page: {}", url);

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let html = response
            .text()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let document = Html::parse_document(&html);

        let list_selector =
            Selector::parse(&config.list_selector).map_err(|e| Error::Parse(format!("{:?}", e)))?;

        let title_selector = Selector::parse(&config.title_selector)
            .map_err(|e| Error::Parse(format!("{:?}", e)))?;

        let link_selector =
            Selector::parse(&config.link_selector).map_err(|e| Error::Parse(format!("{:?}", e)))?;

        let mut articles = Vec::new();

        for element in document.select(&list_selector) {
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
                    let base = url::Url::parse(url).map_err(|e| Error::Parse(e.to_string()))?;
                    base.join(&link)
                        .map_err(|e| Error::Parse(e.to_string()))?
                        .to_string()
                };

                articles.push(RawArticle {
                    title,
                    link: full_link,
                    content: None,
                    author: None,
                    published_at: None,
                });
            }
        }

        info!("Spidered {} articles", articles.len());
        Ok(articles)
    }
}

impl Default for WebSpider {
    fn default() -> Self {
        Self::new()
    }
}
