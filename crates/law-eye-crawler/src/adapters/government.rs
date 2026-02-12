use super::{FetchContext, SourceAdapter};
use crate::spider::{SpiderConfig, WebSpider};
use crate::RawArticle;
use async_trait::async_trait;
use law_eye_common::Result;
use serde_json::Value as JsonValue;
use tracing::info;

/// Predefined selector configuration for a specific government website.
///
/// Each government source adapter creates a `SiteProfile` that encodes
/// the known page structure.  At fetch-time the profile is merged with
/// any per-source overrides stored in the database `sources.config` column.
#[derive(Debug, Clone)]
pub struct SiteProfile {
    pub kind: &'static str,
    pub display_name: &'static str,
    pub default_url: &'static str,
    pub list_selector: &'static str,
    pub title_selector: &'static str,
    pub link_selector: &'static str,
    pub content_selector: Option<&'static str>,
    pub date_selector: Option<&'static str>,
    pub delay_ms: u64,
    pub render_mode: &'static str,
    pub encoding: Option<&'static str>,
    pub wait_for_selector: Option<&'static str>,
    pub wait_timeout_ms: Option<u64>,
}

impl SiteProfile {
    /// Build a `SpiderConfig` by merging this profile with optional
    /// JSON overrides from the database.
    fn to_spider_config(&self, overrides: &JsonValue) -> SpiderConfig {
        let str_or = |key: &str, default: &str| -> String {
            overrides
                .get(key)
                .and_then(|v| v.as_str())
                .unwrap_or(default)
                .to_string()
        };

        let opt_str_or = |key: &str, default: Option<&str>| -> Option<String> {
            overrides
                .get(key)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| default.map(|s| s.to_string()))
        };

        let u64_or = |key: &str, default: u64| -> u64 {
            overrides
                .get(key)
                .and_then(|v| v.as_u64())
                .unwrap_or(default)
        };

        SpiderConfig {
            list_selector: str_or("list_selector", self.list_selector),
            title_selector: str_or("title_selector", self.title_selector),
            link_selector: str_or("link_selector", self.link_selector),
            content_selector: opt_str_or("content_selector", self.content_selector),
            date_selector: opt_str_or("date_selector", self.date_selector),
            delay_ms: Some(u64_or("delay_ms", self.delay_ms)),
            render_mode: Some(
                overrides
                    .get("render_mode")
                    .and_then(|v| v.as_str())
                    .unwrap_or(self.render_mode)
                    .to_string(),
            ),
            encoding: opt_str_or("encoding", self.encoding),
            wait_for_selector: opt_str_or("wait_for_selector", self.wait_for_selector),
            wait_timeout_ms: overrides
                .get("wait_timeout_ms")
                .and_then(|v| v.as_u64())
                .or(self.wait_timeout_ms),
        }
    }
}

/// Generic adapter backed by a `SiteProfile`.
///
/// All government-site adapters share this implementation; only the
/// profile constants differ.
pub struct GovernmentSiteAdapter {
    profile: SiteProfile,
    spider: WebSpider,
}

impl GovernmentSiteAdapter {
    pub fn new(profile: SiteProfile) -> Result<Self> {
        Ok(Self {
            profile,
            spider: WebSpider::new()?,
        })
    }
}

#[async_trait(?Send)]
impl SourceAdapter for GovernmentSiteAdapter {
    fn kind(&self) -> &str {
        self.profile.kind
    }

    fn display_name(&self) -> &str {
        self.profile.display_name
    }

    async fn fetch(&self, ctx: &FetchContext) -> Result<Vec<RawArticle>> {
        let url = if ctx.url.is_empty() {
            self.profile.default_url
        } else {
            &ctx.url
        };

        let config = self.profile.to_spider_config(&ctx.config);

        info!(
            kind = %self.profile.kind,
            url = %url,
            render_mode = %config.render_mode.as_deref().unwrap_or("static"),
            "fetching via government site adapter"
        );

        self.spider.fetch(url, &config, ctx.allow_internal).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_profile() -> SiteProfile {
        SiteProfile {
            kind: "test_gov",
            display_name: "Test Government Site",
            default_url: "https://example.gov.cn/list",
            list_selector: "ul.list > li",
            title_selector: "a",
            link_selector: "a[href]",
            content_selector: Some(".content"),
            date_selector: Some(".date"),
            delay_ms: 2000,
            render_mode: "static",
            encoding: None,
            wait_for_selector: None,
            wait_timeout_ms: None,
        }
    }

    #[test]
    fn site_profile_to_spider_config_defaults() {
        let profile = test_profile();
        let config = profile.to_spider_config(&serde_json::json!({}));

        assert_eq!(config.list_selector, "ul.list > li");
        assert_eq!(config.title_selector, "a");
        assert_eq!(config.link_selector, "a[href]");
        assert_eq!(config.content_selector.as_deref(), Some(".content"));
        assert_eq!(config.date_selector.as_deref(), Some(".date"));
        assert_eq!(config.delay_ms, Some(2000));
        assert_eq!(config.render_mode.as_deref(), Some("static"));
        assert!(config.encoding.is_none());
    }

    #[test]
    fn site_profile_to_spider_config_with_overrides() {
        let profile = test_profile();
        let overrides = serde_json::json!({
            "list_selector": "div.items > div",
            "delay_ms": 5000,
            "encoding": "gbk"
        });
        let config = profile.to_spider_config(&overrides);

        assert_eq!(config.list_selector, "div.items > div");
        assert_eq!(config.title_selector, "a"); // not overridden
        assert_eq!(config.delay_ms, Some(5000));
        assert_eq!(config.encoding.as_deref(), Some("gbk"));
    }

    #[test]
    fn government_site_adapter_kind_and_name() {
        std::env::set_var("LAW_EYE__SPIDER__NO_PROXY", "1");
        let adapter = GovernmentSiteAdapter::new(test_profile()).unwrap();
        assert_eq!(adapter.kind(), "test_gov");
        assert_eq!(adapter.display_name(), "Test Government Site");
    }
}
