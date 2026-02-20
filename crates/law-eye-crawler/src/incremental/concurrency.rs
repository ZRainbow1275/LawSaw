use law_eye_common::{Error, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Per-domain concurrency configuration.
#[derive(Debug, Clone)]
pub struct ConcurrencyConfig {
    /// Default maximum concurrent requests per domain.
    pub default_max_concurrent: u32,
    /// Per-domain overrides (e.g. lower concurrency for anti-crawl sites).
    pub overrides: HashMap<String, u32>,
}

impl Default for ConcurrencyConfig {
    fn default() -> Self {
        Self {
            default_max_concurrent: 3,
            overrides: HashMap::new(),
        }
    }
}

/// Domain-level concurrency controller using `tokio::Semaphore`.
///
/// Each domain gets its own semaphore so that one slow domain doesn't
/// starve requests to other domains.
///
/// Usage:
/// ```ignore
/// let controller = ConcurrencyController::new(ConcurrencyConfig::default());
/// let permit = controller.acquire("www.court.gov.cn").await?;
/// // ... make request while holding permit ...
/// drop(permit); // releases the slot
/// ```
pub struct ConcurrencyController {
    config: ConcurrencyConfig,
    semaphores: tokio::sync::Mutex<HashMap<String, Arc<Semaphore>>>,
}

impl ConcurrencyController {
    pub fn new(config: ConcurrencyConfig) -> Self {
        Self {
            config,
            semaphores: tokio::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Acquire a permit for `domain`. Blocks until a slot is available.
    pub async fn acquire(&self, domain: &str) -> Result<tokio::sync::OwnedSemaphorePermit> {
        let semaphore = {
            let mut sems = self.semaphores.lock().await;
            sems.entry(domain.to_string())
                .or_insert_with(|| {
                    let max = self
                        .config
                        .overrides
                        .get(domain)
                        .copied()
                        .unwrap_or(self.config.default_max_concurrent);
                    Arc::new(Semaphore::new(max as usize))
                })
                .clone()
        };

        semaphore.acquire_owned().await.map_err(|e| {
            Error::Internal(format!(
                "failed to acquire concurrency permit for domain {}: {}",
                domain, e
            ))
        })
    }

    /// Number of tracked domains.
    pub async fn tracked_domains(&self) -> usize {
        self.semaphores.lock().await.len()
    }

    /// Get the max concurrency configured for a domain.
    pub fn max_for_domain(&self, domain: &str) -> u32 {
        self.config
            .overrides
            .get(domain)
            .copied()
            .unwrap_or(self.config.default_max_concurrent)
    }
}

impl Default for ConcurrencyController {
    fn default() -> Self {
        Self::new(ConcurrencyConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn default_config() {
        let config = ConcurrencyConfig::default();
        assert_eq!(config.default_max_concurrent, 3);
        assert!(config.overrides.is_empty());
    }

    #[tokio::test]
    async fn acquire_creates_semaphore_on_first_use() {
        let controller = ConcurrencyController::default();
        assert_eq!(controller.tracked_domains().await, 0);

        let _permit = controller
            .acquire("example.com")
            .await
            .expect("acquire permit");
        assert_eq!(controller.tracked_domains().await, 1);
    }

    #[tokio::test]
    async fn different_domains_have_independent_semaphores() {
        let controller = ConcurrencyController::default();

        let _p1 = controller
            .acquire("domain-a.com")
            .await
            .expect("acquire permit for domain-a");
        let _p2 = controller
            .acquire("domain-b.com")
            .await
            .expect("acquire permit for domain-b");

        assert_eq!(controller.tracked_domains().await, 2);
    }

    #[tokio::test]
    async fn concurrent_limit_is_enforced() {
        let mut overrides = HashMap::new();
        overrides.insert("limited.com".to_string(), 1u32);

        let controller = Arc::new(ConcurrencyController::new(ConcurrencyConfig {
            default_max_concurrent: 3,
            overrides,
        }));

        // Acquire the single permit for "limited.com"
        let permit = controller
            .acquire("limited.com")
            .await
            .expect("acquire first permit");

        // Try to acquire another — should block
        let controller_clone = controller.clone();
        let start = Instant::now();

        let handle = tokio::spawn(async move {
            let _p = controller_clone
                .acquire("limited.com")
                .await
                .expect("acquire second permit");
        });

        // Release the first permit after a short delay
        tokio::time::sleep(Duration::from_millis(50)).await;
        drop(permit);

        handle.await.unwrap();
        let elapsed = start.elapsed();

        // The second acquire should have waited at least ~50ms
        assert!(
            elapsed >= Duration::from_millis(30),
            "expected blocking wait, got {:?}",
            elapsed
        );
    }

    #[test]
    fn max_for_domain_returns_override_or_default() {
        let mut overrides = HashMap::new();
        overrides.insert("slow.gov.cn".to_string(), 1);

        let controller = ConcurrencyController::new(ConcurrencyConfig {
            default_max_concurrent: 5,
            overrides,
        });

        assert_eq!(controller.max_for_domain("slow.gov.cn"), 1);
        assert_eq!(controller.max_for_domain("fast.com"), 5);
    }

    #[tokio::test]
    async fn permit_is_released_on_drop() {
        let controller = ConcurrencyController::new(ConcurrencyConfig {
            default_max_concurrent: 1,
            overrides: HashMap::new(),
        });

        {
            let _permit = controller
                .acquire("test.com")
                .await
                .expect("acquire permit");
            // permit held here
        }
        // permit dropped

        // Should be able to acquire immediately
        let start = Instant::now();
        let _permit = controller
            .acquire("test.com")
            .await
            .expect("acquire permit after drop");
        assert!(start.elapsed() < Duration::from_millis(50));
    }
}
