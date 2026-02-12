mod government;
pub mod profiles;
mod registry;
mod rss_adapter;
mod spider_adapter;

pub use government::{GovernmentSiteAdapter, SiteProfile};
pub use registry::AdapterRegistry;
pub use rss_adapter::RssAdapter;
pub use spider_adapter::SpiderAdapter;

use crate::RawArticle;
use async_trait::async_trait;
use law_eye_common::Result;
use serde_json::Value as JsonValue;

/// Configuration passed to a source adapter at fetch time.
#[derive(Debug, Clone)]
pub struct FetchContext {
    /// Raw JSON config blob from the `sources.config` column.
    pub config: JsonValue,
    /// Whether internal/localhost URLs are allowed (non-production).
    pub allow_internal: bool,
    /// Source URL from the `sources.url` column.
    pub url: String,
    /// Optional explicit encoding override (e.g. "gbk").
    pub encoding: Option<String>,
    /// Rendering mode: "static" or "dynamic".
    pub render_mode: Option<String>,
}

/// Trait that every data-source adapter must implement.
///
/// An adapter knows how to fetch articles from a specific kind of source.
/// The `kind()` string matches the `sources.kind` column in the database
/// (e.g. `"rss"`, `"spider"`, `"npc_gov"`, `"flk_npc"`).
#[async_trait(?Send)]
pub trait SourceAdapter: Send + Sync {
    /// Unique identifier for this adapter kind.
    /// Must match the value stored in `sources.kind`.
    fn kind(&self) -> &str;

    /// Human-readable name for logging / diagnostics.
    fn display_name(&self) -> &str {
        self.kind()
    }

    /// Fetch articles from the source described by `ctx`.
    async fn fetch(&self, ctx: &FetchContext) -> Result<Vec<RawArticle>>;
}
