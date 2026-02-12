use std::collections::HashMap;
use std::sync::Mutex;

/// Tracks content hashes for incremental crawling.
///
/// Before persisting an article, the caller checks whether its content hash
/// already exists.  If so, the article is unchanged and can be skipped.
///
/// This works in concert with `DeduplicationStage` (which computes the hash)
/// and the database `content_hash` column (for cross-session persistence).
pub struct IncrementalChecker {
    /// In-memory set of known content hashes (populated from DB at startup).
    known_hashes: Mutex<HashMap<String, KnownEntry>>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct KnownEntry {
    /// The URL that produced this hash (for diagnostics).
    url: String,
}

impl IncrementalChecker {
    /// Create an empty checker.
    pub fn new() -> Self {
        Self {
            known_hashes: Mutex::new(HashMap::new()),
        }
    }

    /// Seed the checker with hashes already present in the database.
    /// Call this once at startup to avoid re-processing known articles.
    pub fn seed(&self, entries: Vec<(String, String)>) {
        let mut hashes = self.known_hashes.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
            poisoned.into_inner()
        });
        for (hash, url) in entries {
            hashes.insert(hash, KnownEntry { url });
        }
    }

    /// Check whether `content_hash` is already known.
    /// Returns `true` if the content has been seen before (skip it).
    pub fn is_known(&self, content_hash: &str) -> bool {
        self.known_hashes
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .contains_key(content_hash)
    }

    /// Record a new content hash after successfully persisting an article.
    pub fn record(&self, content_hash: String, url: String) {
        self.known_hashes
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .insert(content_hash, KnownEntry { url });
    }

    /// Number of known hashes.
    pub fn known_count(&self) -> usize {
        self.known_hashes.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
            poisoned.into_inner()
        }).len()
    }

    /// Remove a hash (e.g. when an article is deleted from DB).
    pub fn remove(&self, content_hash: &str) {
        self.known_hashes.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
            poisoned.into_inner()
        }).remove(content_hash);
    }
}

impl Default for IncrementalChecker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_checker_has_no_known_hashes() {
        let checker = IncrementalChecker::new();
        assert_eq!(checker.known_count(), 0);
        assert!(!checker.is_known("abc123"));
    }

    #[test]
    fn seed_populates_known_hashes() {
        let checker = IncrementalChecker::new();
        checker.seed(vec![
            ("hash1".to_string(), "https://example.com/1".to_string()),
            ("hash2".to_string(), "https://example.com/2".to_string()),
        ]);

        assert_eq!(checker.known_count(), 2);
        assert!(checker.is_known("hash1"));
        assert!(checker.is_known("hash2"));
        assert!(!checker.is_known("hash3"));
    }

    #[test]
    fn record_adds_new_hash() {
        let checker = IncrementalChecker::new();
        checker.record("new_hash".to_string(), "https://example.com/new".to_string());

        assert!(checker.is_known("new_hash"));
        assert_eq!(checker.known_count(), 1);
    }

    #[test]
    fn remove_clears_hash() {
        let checker = IncrementalChecker::new();
        checker.record("h1".to_string(), "url1".to_string());
        assert!(checker.is_known("h1"));

        checker.remove("h1");
        assert!(!checker.is_known("h1"));
        assert_eq!(checker.known_count(), 0);
    }

    #[test]
    fn duplicate_seed_entries_are_deduplicated() {
        let checker = IncrementalChecker::new();
        checker.seed(vec![
            ("same".to_string(), "url1".to_string()),
            ("same".to_string(), "url2".to_string()),
        ]);
        assert_eq!(checker.known_count(), 1);
    }
}
