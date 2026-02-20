use std::collections::HashMap;
use std::sync::Mutex;

/// Cached ETag / Last-Modified values per URL, used to send conditional
/// requests (`If-None-Match` / `If-Modified-Since`) and skip re-downloading
/// unchanged pages.
#[derive(Debug, Clone, Default)]
pub struct ConditionalState {
    /// HTTP `ETag` header value.
    pub etag: Option<String>,
    /// HTTP `Last-Modified` header value (raw string, forwarded as-is).
    pub last_modified: Option<String>,
}

/// Manages conditional-request state for multiple URLs.
///
/// Before each request, call [`headers_for`] to get the conditional headers.
/// After each response, call [`update`] to store the response headers.
///
/// When the server responds with `304 Not Modified`, the caller should skip
/// parsing and re-use the previously cached content.
pub struct ConditionalRequest {
    state: Mutex<HashMap<String, ConditionalState>>,
}

impl ConditionalRequest {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Build conditional-request headers for `url`.
    /// Returns a list of `(header_name, header_value)` pairs to add to the
    /// outgoing request.
    pub fn headers_for(&self, url: &str) -> Vec<(&'static str, String)> {
        let state = self.state.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("conditional state mutex was poisoned, recovering");
            poisoned.into_inner()
        });
        let Some(entry) = state.get(url) else {
            return Vec::new();
        };

        let mut headers = Vec::new();
        if let Some(etag) = &entry.etag {
            headers.push(("If-None-Match", etag.clone()));
        }
        if let Some(lm) = &entry.last_modified {
            headers.push(("If-Modified-Since", lm.clone()));
        }
        headers
    }

    /// Update stored state after receiving a response for `url`.
    pub fn update(&self, url: &str, etag: Option<String>, last_modified: Option<String>) {
        if etag.is_none() && last_modified.is_none() {
            return;
        }
        let mut state = self.state.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("conditional state mutex was poisoned, recovering");
            poisoned.into_inner()
        });
        let entry = state.entry(url.to_string()).or_default();
        if let Some(e) = etag {
            entry.etag = Some(e);
        }
        if let Some(lm) = last_modified {
            entry.last_modified = Some(lm);
        }
    }

    /// Check whether we have any conditional state for `url`.
    pub fn has_state(&self, url: &str) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("conditional state mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .contains_key(url)
    }

    /// Number of tracked URLs.
    pub fn tracked_urls(&self) -> usize {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("conditional state mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .len()
    }

    /// Remove state for a specific URL.
    pub fn remove(&self, url: &str) {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("conditional state mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .remove(url);
    }
}

impl Default for ConditionalRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_for_unknown_url_returns_empty() {
        let cr = ConditionalRequest::new();
        assert!(cr.headers_for("https://example.com").is_empty());
    }

    #[test]
    fn update_and_retrieve_etag() {
        let cr = ConditionalRequest::new();
        cr.update(
            "https://example.com/page",
            Some("\"abc123\"".to_string()),
            None,
        );

        assert!(cr.has_state("https://example.com/page"));

        let headers = cr.headers_for("https://example.com/page");
        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].0, "If-None-Match");
        assert_eq!(headers[0].1, "\"abc123\"");
    }

    #[test]
    fn update_and_retrieve_last_modified() {
        let cr = ConditionalRequest::new();
        cr.update(
            "https://example.com/page",
            None,
            Some("Wed, 21 Oct 2025 07:28:00 GMT".to_string()),
        );

        let headers = cr.headers_for("https://example.com/page");
        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].0, "If-Modified-Since");
    }

    #[test]
    fn update_both_etag_and_last_modified() {
        let cr = ConditionalRequest::new();
        cr.update(
            "https://example.com/page",
            Some("\"xyz\"".to_string()),
            Some("Thu, 01 Jan 2026 00:00:00 GMT".to_string()),
        );

        let headers = cr.headers_for("https://example.com/page");
        assert_eq!(headers.len(), 2);
    }

    #[test]
    fn update_with_none_does_not_create_entry() {
        let cr = ConditionalRequest::new();
        cr.update("https://example.com/page", None, None);
        assert!(!cr.has_state("https://example.com/page"));
        assert_eq!(cr.tracked_urls(), 0);
    }

    #[test]
    fn remove_clears_state() {
        let cr = ConditionalRequest::new();
        cr.update("https://example.com", Some("\"e1\"".to_string()), None);
        assert!(cr.has_state("https://example.com"));

        cr.remove("https://example.com");
        assert!(!cr.has_state("https://example.com"));
    }
}
