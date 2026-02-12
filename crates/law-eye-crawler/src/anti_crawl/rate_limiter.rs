use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use tracing::debug;

/// Configuration for per-domain rate limiting.
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum number of tokens (requests) in the bucket.
    pub burst_size: u32,
    /// Tokens added per second (sustained request rate).
    pub tokens_per_second: f64,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            burst_size: 3,
            tokens_per_second: 0.5, // 1 request per 2 seconds
        }
    }
}

/// Per-domain token state.
struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
    config: RateLimiterConfig,
}

impl TokenBucket {
    fn new(config: RateLimiterConfig) -> Self {
        Self {
            tokens: config.burst_size as f64,
            last_refill: Instant::now(),
            config,
        }
    }

    /// Refill tokens based on elapsed time, then try to consume one.
    /// Returns `Some(wait_duration)` if the caller must wait, `None` if
    /// a token was consumed immediately.
    fn try_acquire(&mut self) -> Option<std::time::Duration> {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.config.tokens_per_second)
            .min(self.config.burst_size as f64);
        self.last_refill = now;

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            None
        } else {
            let deficit = 1.0 - self.tokens;
            let wait_secs = deficit / self.config.tokens_per_second;
            Some(std::time::Duration::from_secs_f64(wait_secs))
        }
    }
}

/// Domain-level token-bucket rate limiter.
///
/// Each domain gets its own independent bucket so that slow domains
/// don't starve fast ones.
///
/// Usage:
/// ```ignore
/// let limiter = DomainRateLimiter::new(RateLimiterConfig::default());
/// limiter.wait("www.court.gov.cn").await;
/// // ... make request ...
/// ```
pub struct DomainRateLimiter {
    default_config: RateLimiterConfig,
    /// Per-domain override configs (e.g. slower rate for anti-crawl sites).
    overrides: HashMap<String, RateLimiterConfig>,
    buckets: Mutex<HashMap<String, TokenBucket>>,
}

impl DomainRateLimiter {
    /// Create a limiter with the given default config.
    pub fn new(config: RateLimiterConfig) -> Self {
        Self {
            default_config: config,
            overrides: HashMap::new(),
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// Set a per-domain override (e.g. stricter rate for anti-crawl sites).
    pub fn with_override(mut self, domain: impl Into<String>, config: RateLimiterConfig) -> Self {
        self.overrides.insert(domain.into(), config);
        self
    }

    /// Wait until a token is available for `domain`, then consume it.
    pub async fn wait(&self, domain: &str) {
        let wait_duration = {
            let mut buckets = self.buckets.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("rate limiter buckets mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            let bucket = buckets
                .entry(domain.to_string())
                .or_insert_with(|| {
                    let config = self
                        .overrides
                        .get(domain)
                        .cloned()
                        .unwrap_or_else(|| self.default_config.clone());
                    TokenBucket::new(config)
                });
            bucket.try_acquire()
        };

        if let Some(duration) = wait_duration {
            debug!(
                domain = %domain,
                wait_ms = %duration.as_millis(),
                "rate limiter: waiting before request"
            );
            tokio::time::sleep(duration).await;
        }
    }

    /// Extract the domain from a URL string.
    pub fn domain_from_url(url: &str) -> Option<String> {
        url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_string()))
    }

    /// Number of tracked domains.
    pub fn tracked_domains(&self) -> usize {
        self.buckets.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("rate limiter buckets mutex was poisoned, recovering");
            poisoned.into_inner()
        }).len()
    }
}

impl Default for DomainRateLimiter {
    fn default() -> Self {
        Self::new(RateLimiterConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_values() {
        let config = RateLimiterConfig::default();
        assert_eq!(config.burst_size, 3);
        assert!((config.tokens_per_second - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn token_bucket_first_requests_are_immediate() {
        let mut bucket = TokenBucket::new(RateLimiterConfig {
            burst_size: 3,
            tokens_per_second: 1.0,
        });

        // First 3 requests should be immediate (burst)
        assert!(bucket.try_acquire().is_none());
        assert!(bucket.try_acquire().is_none());
        assert!(bucket.try_acquire().is_none());

        // 4th request should require waiting
        let wait = bucket.try_acquire();
        assert!(wait.is_some());
    }

    #[test]
    fn domain_from_url_extracts_host() {
        assert_eq!(
            DomainRateLimiter::domain_from_url("https://www.court.gov.cn/fabu/sfjs/"),
            Some("www.court.gov.cn".to_string())
        );
        assert_eq!(
            DomainRateLimiter::domain_from_url("http://localhost:3000/api"),
            Some("localhost".to_string())
        );
        assert_eq!(
            DomainRateLimiter::domain_from_url("not a url"),
            None
        );
    }

    #[tokio::test]
    async fn wait_respects_burst_then_throttles() {
        let limiter = DomainRateLimiter::new(RateLimiterConfig {
            burst_size: 2,
            tokens_per_second: 100.0, // Very fast refill for test speed
        });

        let start = Instant::now();

        // Burst: should be near-instant
        limiter.wait("test.example.com").await;
        limiter.wait("test.example.com").await;

        let burst_elapsed = start.elapsed();
        assert!(
            burst_elapsed.as_millis() < 50,
            "burst requests should be instant, took {:?}",
            burst_elapsed
        );

        assert_eq!(limiter.tracked_domains(), 1);
    }

    #[tokio::test]
    async fn different_domains_have_independent_buckets() {
        let limiter = DomainRateLimiter::new(RateLimiterConfig {
            burst_size: 1,
            tokens_per_second: 0.01, // Very slow refill
        });

        // Domain A exhausts its bucket
        limiter.wait("domain-a.com").await;

        // Domain B should still have its burst available
        let start = Instant::now();
        limiter.wait("domain-b.com").await;
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_millis() < 50,
            "domain B should not be affected by domain A's exhaustion, took {:?}",
            elapsed
        );

        assert_eq!(limiter.tracked_domains(), 2);
    }

    #[test]
    fn with_override_sets_domain_specific_config() {
        let limiter = DomainRateLimiter::new(RateLimiterConfig::default())
            .with_override("slow.gov.cn", RateLimiterConfig {
                burst_size: 1,
                tokens_per_second: 0.1,
            });

        assert!(limiter.overrides.contains_key("slow.gov.cn"));
    }
}
