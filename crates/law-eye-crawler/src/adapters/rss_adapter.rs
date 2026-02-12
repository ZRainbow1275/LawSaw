use super::{FetchContext, SourceAdapter};
use crate::rss::RssFetcher;
use crate::RawArticle;
use async_trait::async_trait;
use law_eye_common::Result;

/// Adapter that wraps the existing `RssFetcher` for RSS/Atom feeds.
pub struct RssAdapter {
    fetcher: RssFetcher,
}

impl RssAdapter {
    pub fn new() -> Result<Self> {
        Ok(Self {
            fetcher: RssFetcher::new()?,
        })
    }
}

#[async_trait(?Send)]
impl SourceAdapter for RssAdapter {
    fn kind(&self) -> &str {
        "rss"
    }

    fn display_name(&self) -> &str {
        "RSS/Atom Feed"
    }

    async fn fetch(&self, ctx: &FetchContext) -> Result<Vec<RawArticle>> {
        self.fetcher.fetch(&ctx.url, ctx.allow_internal).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rss_adapter_kind_and_name() {
        let adapter = RssAdapter::new().unwrap();
        assert_eq!(adapter.kind(), "rss");
        assert_eq!(adapter.display_name(), "RSS/Atom Feed");
    }
}
