use law_eye_common::{Error, Result};
use reqwest::Client;
use std::time::Duration;
use tracing::{debug, warn};
use url::Url;

/// A single URL entry parsed from a sitemap.
#[derive(Debug, Clone)]
pub struct SitemapEntry {
    pub loc: String,
    pub lastmod: Option<String>,
    pub changefreq: Option<String>,
    pub priority: Option<f64>,
}

/// Parses `sitemap.xml` and `sitemapindex.xml` to discover crawlable URLs.
pub struct SitemapParser {
    client: Client,
}

impl SitemapParser {
    pub fn new() -> Result<Self> {
        let mut builder = Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("LawEye/1.0");

        let force_no_proxy = std::env::var("LAW_EYE__SPIDER__NO_PROXY")
            .ok()
            .map(|v| v.trim() == "1" || v.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if force_no_proxy {
            builder = builder.no_proxy();
        }

        let client = builder
            .build()
            .map_err(|e| Error::Config(format!("sitemap client: {}", e)))?;

        Ok(Self { client })
    }

    /// Fetch and parse a sitemap from `url`.
    /// Handles both `<urlset>` (direct URL list) and `<sitemapindex>`
    /// (recursive sitemap references).
    pub async fn parse(&self, url: &str) -> Result<Vec<SitemapEntry>> {
        self.parse_recursive(url, 0).await
    }

    fn parse_recursive<'a>(
        &'a self,
        url: &'a str,
        depth: u32,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<SitemapEntry>>> + 'a>> {
        Box::pin(async move {
            if depth > 3 {
                warn!(url = %url, "sitemap recursion depth exceeded, stopping");
                return Ok(Vec::new());
            }

            debug!(url = %url, depth, "fetching sitemap");

            let body = self
                .client
                .get(url)
                .send()
                .await
                .map_err(|e| Error::Http(format!("sitemap fetch: {}", e)))?
                .text()
                .await
                .map_err(|e| Error::Http(format!("sitemap body: {}", e)))?;

            // Determine if this is a sitemap index or a URL set
            if body.contains("<sitemapindex") {
                self.parse_sitemap_index(&body, depth).await
            } else {
                Ok(Self::parse_urlset(&body))
            }
        })
    }

    async fn parse_sitemap_index(&self, body: &str, depth: u32) -> Result<Vec<SitemapEntry>> {
        let mut all_entries = Vec::new();

        // Simple XML tag extraction (no full XML parser dependency)
        for loc in extract_tag_values(body, "loc") {
            match self.parse_recursive(&loc, depth + 1).await {
                Ok(entries) => all_entries.extend(entries),
                Err(err) => {
                    warn!(
                        sitemap_url = %loc,
                        error = %err,
                        "failed to parse child sitemap, skipping"
                    );
                }
            }
        }

        Ok(all_entries)
    }

    fn parse_urlset(body: &str) -> Vec<SitemapEntry> {
        // Split by <url> tags and extract fields
        let mut entries = Vec::new();

        for url_block in body.split("<url>").skip(1) {
            let end = url_block.find("</url>").unwrap_or(url_block.len());
            let block = &url_block[..end];

            let loc = extract_first_tag_value(block, "loc");
            let Some(loc) = loc else { continue };

            entries.push(SitemapEntry {
                loc,
                lastmod: extract_first_tag_value(block, "lastmod"),
                changefreq: extract_first_tag_value(block, "changefreq"),
                priority: extract_first_tag_value(block, "priority")
                    .and_then(|s| s.parse::<f64>().ok()),
            });
        }

        entries
    }

    /// Build the default sitemap URL for a given site URL.
    pub fn default_sitemap_url(site_url: &str) -> Option<String> {
        let parsed = Url::parse(site_url).ok()?;
        Some(format!(
            "{}://{}/sitemap.xml",
            parsed.scheme(),
            parsed.host_str()?
        ))
    }
}

/// Extract all values between `<tag>...</tag>` in the given text.
fn extract_tag_values(text: &str, tag: &str) -> Vec<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let mut values = Vec::new();

    let mut search_from = 0;
    while let Some(start) = text[search_from..].find(&open) {
        let value_start = search_from + start + open.len();
        if let Some(end) = text[value_start..].find(&close) {
            let value = text[value_start..value_start + end].trim().to_string();
            if !value.is_empty() {
                values.push(value);
            }
            search_from = value_start + end + close.len();
        } else {
            break;
        }
    }

    values
}

/// Extract the first value of `<tag>...</tag>`.
fn extract_first_tag_value(text: &str, tag: &str) -> Option<String> {
    extract_tag_values(text, tag).into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_urlset_extracts_entries() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page1</loc>
    <lastmod>2026-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/page2</loc>
    <lastmod>2026-01-10</lastmod>
  </url>
</urlset>"#;

        let entries = SitemapParser::parse_urlset(xml);
        assert_eq!(entries.len(), 2);

        assert_eq!(entries[0].loc, "https://example.com/page1");
        assert_eq!(entries[0].lastmod.as_deref(), Some("2026-01-15"));
        assert_eq!(entries[0].changefreq.as_deref(), Some("weekly"));
        assert!((entries[0].priority.unwrap() - 0.8).abs() < f64::EPSILON);

        assert_eq!(entries[1].loc, "https://example.com/page2");
        assert!(entries[1].changefreq.is_none());
        assert!(entries[1].priority.is_none());
    }

    #[test]
    fn parse_urlset_handles_empty() {
        let xml = r#"<?xml version="1.0"?><urlset></urlset>"#;
        let entries = SitemapParser::parse_urlset(xml);
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_urlset_skips_entries_without_loc() {
        let xml = r#"<urlset>
  <url><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/valid</loc></url>
</urlset>"#;
        let entries = SitemapParser::parse_urlset(xml);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].loc, "https://example.com/valid");
    }

    #[test]
    fn default_sitemap_url_works() {
        assert_eq!(
            SitemapParser::default_sitemap_url("https://www.court.gov.cn/fabu/sfjs/"),
            Some("https://www.court.gov.cn/sitemap.xml".to_string())
        );
        assert_eq!(
            SitemapParser::default_sitemap_url("http://example.com"),
            Some("http://example.com/sitemap.xml".to_string())
        );
    }

    #[test]
    fn extract_tag_values_multiple() {
        let text = "<items><loc>a</loc><loc>b</loc><loc>c</loc></items>";
        let values = extract_tag_values(text, "loc");
        assert_eq!(values, vec!["a", "b", "c"]);
    }

    #[test]
    fn extract_tag_values_empty_tags() {
        let text = "<loc></loc>";
        let values = extract_tag_values(text, "loc");
        assert!(values.is_empty());
    }
}
