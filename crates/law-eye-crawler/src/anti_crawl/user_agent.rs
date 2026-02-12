use once_cell::sync::Lazy;
use rand::Rng;

/// Pool of real-world browser User-Agent strings for rotation.
///
/// Each request picks a random UA to reduce fingerprinting risk.
/// The pool covers Chrome, Firefox, Edge, and Safari across
/// Windows, macOS, and Linux platforms.
pub struct UserAgentPool {
    agents: Vec<&'static str>,
}

/// Default pool with 24 real-world User-Agent strings.
static DEFAULT_POOL: Lazy<UserAgentPool> = Lazy::new(UserAgentPool::default_pool);

impl UserAgentPool {
    /// Create a pool with a custom list of User-Agent strings.
    pub fn new(agents: Vec<&'static str>) -> Self {
        assert!(!agents.is_empty(), "UserAgentPool must have at least one agent");
        Self { agents }
    }

    /// Get a reference to the default shared pool.
    pub fn shared() -> &'static Self {
        &DEFAULT_POOL
    }

    /// Pick a random User-Agent from the pool.
    pub fn random(&self) -> &str {
        let idx = rand::thread_rng().gen_range(0..self.agents.len());
        self.agents[idx]
    }

    /// Number of User-Agent strings in the pool.
    pub fn len(&self) -> usize {
        self.agents.len()
    }

    /// Whether the pool is empty.
    pub fn is_empty(&self) -> bool {
        self.agents.is_empty()
    }

    fn default_pool() -> Self {
        Self {
            agents: vec![
                // Chrome on Windows
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                // Chrome on macOS
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                // Chrome on Linux
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                // Firefox on Windows
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
                // Firefox on macOS
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0",
                // Firefox on Linux
                "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
                "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
                // Edge on Windows
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
                // Edge on macOS
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
                // Safari on macOS
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
                // Safari on iPhone (mobile UA for diversity)
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
                // Chrome on Android (mobile UA for diversity)
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn default_pool_has_24_agents() {
        let pool = UserAgentPool::shared();
        assert_eq!(pool.len(), 24);
        assert!(!pool.is_empty());
    }

    #[test]
    fn random_returns_valid_ua() {
        let pool = UserAgentPool::shared();
        let ua = pool.random();
        assert!(ua.starts_with("Mozilla/5.0"));
        assert!(!ua.is_empty());
    }

    #[test]
    fn random_produces_variety() {
        let pool = UserAgentPool::shared();
        let mut seen: HashSet<&str> = HashSet::new();
        // 100 random picks should produce at least 3 distinct UAs
        for _ in 0..100 {
            seen.insert(pool.random());
        }
        assert!(
            seen.len() >= 3,
            "expected at least 3 distinct UAs, got {}",
            seen.len()
        );
    }

    #[test]
    fn custom_pool_works() {
        let pool = UserAgentPool::new(vec!["CustomBot/1.0", "CustomBot/2.0"]);
        assert_eq!(pool.len(), 2);
        let ua = pool.random();
        assert!(ua == "CustomBot/1.0" || ua == "CustomBot/2.0");
    }

    #[test]
    fn all_agents_are_unique() {
        let pool = UserAgentPool::shared();
        let mut seen: HashSet<&str> = HashSet::new();
        for agent in &pool.agents {
            assert!(seen.insert(agent), "duplicate UA found: {}", agent);
        }
    }
}
