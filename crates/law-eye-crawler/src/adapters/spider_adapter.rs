use super::{FetchContext, SourceAdapter};
use crate::spider::{SpiderConfig, WebSpider};
use crate::RawArticle;
use async_trait::async_trait;
use law_eye_common::Result;
use tracing::warn;

/// Adapter that wraps the existing `WebSpider` for CSS-selector based scraping.
pub struct SpiderAdapter {
    spider: WebSpider,
}

impl SpiderAdapter {
    pub fn new() -> Result<Self> {
        Ok(Self {
            spider: WebSpider::new()?,
        })
    }
}

#[async_trait(?Send)]
impl SourceAdapter for SpiderAdapter {
    fn kind(&self) -> &str {
        "spider"
    }

    fn display_name(&self) -> &str {
        "Web Spider (CSS Selectors)"
    }

    async fn fetch(&self, ctx: &FetchContext) -> Result<Vec<RawArticle>> {
        let config: SpiderConfig = match serde_json::from_value::<SpiderConfig>(ctx.config.clone()) {
            Ok(mut cfg) => {
                // Merge top-level fields into SpiderConfig when present
                if cfg.encoding.is_none() {
                    cfg.encoding = ctx.encoding.clone();
                }
                if cfg.render_mode.is_none() {
                    cfg.render_mode = ctx.render_mode.clone();
                }
                cfg
            }
            Err(err) => {
                warn!(
                    error = %err,
                    url = %ctx.url,
                    "failed to parse spider config from source JSON, using minimal defaults"
                );
                return Err(law_eye_common::Error::Config(format!(
                    "invalid spider config for {}: {}",
                    ctx.url, err
                )));
            }
        };

        self.spider.fetch(&ctx.url, &config, ctx.allow_internal).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spider_adapter_kind_and_name() {
        std::env::set_var("LAW_EYE__SPIDER__NO_PROXY", "1");
        let adapter = SpiderAdapter::new().unwrap();
        assert_eq!(adapter.kind(), "spider");
        assert_eq!(adapter.display_name(), "Web Spider (CSS Selectors)");
    }
}
