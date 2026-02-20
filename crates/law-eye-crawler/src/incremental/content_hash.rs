use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;

/// Tracks content hashes for incremental crawling.
///
/// Before persisting an article, the caller checks whether its content hash
/// already exists.  If so, the article is unchanged and can be skipped.
///
/// This works in concert with `DeduplicationStage` (which computes the hash)
/// and the database `content_hash` column (for cross-session persistence).
pub struct IncrementalChecker {
    /// In-memory set of known content hashes (populated from DB at startup).
    known_hashes: Mutex<HashMap<(Uuid, String), KnownEntry>>,
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
    pub fn seed(&self, entries: Vec<(Uuid, String, String)>) {
        let mut hashes = self.known_hashes.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
            poisoned.into_inner()
        });
        for (tenant_id, hash, url) in entries {
            hashes.insert((tenant_id, hash), KnownEntry { url });
        }
    }

    /// Check whether `content_hash` is already known.
    /// Returns `true` if the content has been seen before (skip it).
    pub fn is_known(&self, tenant_id: Uuid, content_hash: &str) -> bool {
        self.known_hashes
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .contains_key(&(tenant_id, content_hash.to_string()))
    }

    /// Record a new content hash after successfully persisting an article.
    pub fn record(&self, tenant_id: Uuid, content_hash: String, url: String) {
        self.known_hashes
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .insert((tenant_id, content_hash), KnownEntry { url });
    }

    /// Number of known hashes.
    pub fn known_count(&self) -> usize {
        self.known_hashes
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .len()
    }

    /// Remove a hash (e.g. when an article is deleted from DB).
    pub fn remove(&self, tenant_id: Uuid, content_hash: &str) {
        self.known_hashes
            .lock()
            .unwrap_or_else(|poisoned| {
                tracing::warn!("content_hash known_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .remove(&(tenant_id, content_hash.to_string()));
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
        let tenant = Uuid::new_v4();
        assert_eq!(checker.known_count(), 0);
        assert!(!checker.is_known(tenant, "abc123"));
    }

    #[test]
    fn seed_populates_known_hashes() {
        let checker = IncrementalChecker::new();
        let tenant = Uuid::new_v4();
        checker.seed(vec![
            (
                tenant,
                "hash1".to_string(),
                "https://example.com/1".to_string(),
            ),
            (
                tenant,
                "hash2".to_string(),
                "https://example.com/2".to_string(),
            ),
        ]);

        assert_eq!(checker.known_count(), 2);
        assert!(checker.is_known(tenant, "hash1"));
        assert!(checker.is_known(tenant, "hash2"));
        assert!(!checker.is_known(tenant, "hash3"));
    }

    #[test]
    fn record_adds_new_hash() {
        let checker = IncrementalChecker::new();
        let tenant = Uuid::new_v4();
        checker.record(
            tenant,
            "new_hash".to_string(),
            "https://example.com/new".to_string(),
        );

        assert!(checker.is_known(tenant, "new_hash"));
        assert_eq!(checker.known_count(), 1);
    }

    #[test]
    fn remove_clears_hash() {
        let checker = IncrementalChecker::new();
        let tenant = Uuid::new_v4();
        checker.record(tenant, "h1".to_string(), "url1".to_string());
        assert!(checker.is_known(tenant, "h1"));

        checker.remove(tenant, "h1");
        assert!(!checker.is_known(tenant, "h1"));
        assert_eq!(checker.known_count(), 0);
    }

    #[test]
    fn duplicate_seed_entries_are_deduplicated() {
        let checker = IncrementalChecker::new();
        let tenant = Uuid::new_v4();
        checker.seed(vec![
            (tenant, "same".to_string(), "url1".to_string()),
            (tenant, "same".to_string(), "url2".to_string()),
        ]);
        assert_eq!(checker.known_count(), 1);
    }

    #[test]
    fn same_hash_is_isolated_by_tenant() {
        let checker = IncrementalChecker::new();
        let tenant_a = Uuid::new_v4();
        let tenant_b = Uuid::new_v4();

        checker.record(
            tenant_a,
            "shared_hash".to_string(),
            "https://example.com/a".to_string(),
        );

        assert!(checker.is_known(tenant_a, "shared_hash"));
        assert!(!checker.is_known(tenant_b, "shared_hash"));
    }
}
