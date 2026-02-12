use super::{FetchContext, SourceAdapter};
use crate::RawArticle;
use law_eye_common::{Error, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{info, warn};

/// Central registry that maps `sources.kind` values to adapter instances.
///
/// Usage:
/// ```ignore
/// let registry = AdapterRegistry::with_defaults();
/// let articles = registry.fetch("rss", &ctx).await?;
/// ```
pub struct AdapterRegistry {
    adapters: HashMap<String, Arc<dyn SourceAdapter>>,
}

impl AdapterRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self {
            adapters: HashMap::new(),
        }
    }

    /// Create a registry pre-loaded with the built-in adapters
    /// (`rss`, `spider`, and all government site adapters).
    pub fn with_defaults() -> Result<Self> {
        let mut registry = Self::new();
        registry.register(Arc::new(super::RssAdapter::new()?));
        registry.register(Arc::new(super::SpiderAdapter::new()?));

        // Register all government site adapters
        for adapter in super::profiles::all_adapters()? {
            registry.register(Arc::new(adapter));
        }

        Ok(registry)
    }

    /// Register an adapter. If an adapter with the same `kind` already
    /// exists it will be replaced (with a warning).
    pub fn register(&mut self, adapter: Arc<dyn SourceAdapter>) {
        let kind = adapter.kind().to_string();
        if self.adapters.contains_key(&kind) {
            warn!(
                kind = %kind,
                name = %adapter.display_name(),
                "replacing existing adapter for kind"
            );
        }
        info!(
            kind = %kind,
            name = %adapter.display_name(),
            "registered source adapter"
        );
        self.adapters.insert(kind, adapter);
    }

    /// Look up the adapter for `kind` and fetch articles.
    pub async fn fetch(&self, kind: &str, ctx: &FetchContext) -> Result<Vec<RawArticle>> {
        let adapter = self
            .adapters
            .get(kind)
            .ok_or_else(|| Error::Config(format!("no adapter registered for kind: {}", kind)))?;

        adapter.fetch(ctx).await
    }

    /// Get a reference to a registered adapter (for inspection / testing).
    pub fn get(&self, kind: &str) -> Option<&Arc<dyn SourceAdapter>> {
        self.adapters.get(kind)
    }

    /// List all registered adapter kinds.
    pub fn kinds(&self) -> Vec<&str> {
        self.adapters.keys().map(String::as_str).collect()
    }

    /// Number of registered adapters.
    pub fn len(&self) -> usize {
        self.adapters.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.adapters.is_empty()
    }
}

impl Default for AdapterRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    struct DummyAdapter;

    #[async_trait(?Send)]
    impl SourceAdapter for DummyAdapter {
        fn kind(&self) -> &str {
            "dummy"
        }

        fn display_name(&self) -> &str {
            "Dummy Test Adapter"
        }

        async fn fetch(&self, _ctx: &FetchContext) -> Result<Vec<RawArticle>> {
            Ok(vec![RawArticle::new("Dummy Title", "https://example.com/1")])
        }
    }

    #[test]
    fn registry_register_and_lookup() {
        let mut registry = AdapterRegistry::new();
        assert!(registry.is_empty());
        assert_eq!(registry.len(), 0);

        registry.register(Arc::new(DummyAdapter));
        assert_eq!(registry.len(), 1);
        assert!(!registry.is_empty());
        assert!(registry.get("dummy").is_some());
        assert!(registry.get("nonexistent").is_none());
    }

    #[test]
    fn registry_kinds_returns_all_registered() {
        let mut registry = AdapterRegistry::new();
        registry.register(Arc::new(DummyAdapter));

        let kinds = registry.kinds();
        assert!(kinds.contains(&"dummy"));
    }

    #[tokio::test]
    async fn registry_fetch_dispatches_to_adapter() {
        let mut registry = AdapterRegistry::new();
        registry.register(Arc::new(DummyAdapter));

        let ctx = FetchContext {
            config: serde_json::json!({}),
            allow_internal: false,
            url: "https://example.com".to_string(),
            encoding: None,
            render_mode: None,
        };

        let articles = registry.fetch("dummy", &ctx).await.unwrap();
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Dummy Title");
    }

    #[tokio::test]
    async fn registry_fetch_unknown_kind_returns_error() {
        let registry = AdapterRegistry::new();
        let ctx = FetchContext {
            config: serde_json::json!({}),
            allow_internal: false,
            url: "https://example.com".to_string(),
            encoding: None,
            render_mode: None,
        };

        let result = registry.fetch("nonexistent", &ctx).await;
        assert!(result.is_err());
    }

    #[test]
    fn registry_replace_adapter_with_same_kind() {
        let mut registry = AdapterRegistry::new();
        registry.register(Arc::new(DummyAdapter));
        registry.register(Arc::new(DummyAdapter));
        // Should still have only one adapter for "dummy"
        assert_eq!(registry.len(), 1);
    }
}
