use law_eye_common::{Error, Result};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{debug, warn};

/// Crawl-delay and path allow/disallow parsed from robots.txt.
#[derive(Debug, Clone)]
struct RobotsRules {
    /// Disallowed path prefixes for our user-agent.
    disallowed: Vec<String>,
    /// Allowed path prefixes (overrides disallow).
    allowed: Vec<String>,
    /// Crawl-delay in seconds (if specified).
    crawl_delay_secs: Option<f64>,
    /// When the rules were fetched.
    fetched_at: Instant,
}

impl RobotsRules {
    /// Check whether `path` is allowed by these rules.
    fn is_path_allowed(&self, path: &str) -> bool {
        // Longest-match wins: check allowed first (more specific overrides disallow)
        let best_allow = self
            .allowed
            .iter()
            .filter(|prefix| path.starts_with(prefix.as_str()))
            .map(|p| p.len())
            .max()
            .unwrap_or(0);

        let best_disallow = self
            .disallowed
            .iter()
            .filter(|prefix| path.starts_with(prefix.as_str()))
            .map(|p| p.len())
            .max()
            .unwrap_or(0);

        // If both match, longer prefix wins; tie goes to allow
        best_allow >= best_disallow
    }

    fn is_expired(&self, ttl: Duration) -> bool {
        self.fetched_at.elapsed() > ttl
    }
}

/// robots.txt compliance checker with caching.
///
/// Fetches and caches robots.txt per domain, checks whether a given
/// URL is allowed, and exposes any `Crawl-delay` directive.
///
/// We identify ourselves as `LawEye` user-agent and also honour `*`
/// rules as a fallback.
pub struct RobotsChecker {
    client: Client,
    cache: Mutex<HashMap<String, RobotsRules>>,
    /// How long cached rules are considered fresh.
    cache_ttl: Duration,
    /// Our bot name for matching User-agent directives.
    bot_name: String,
}

impl RobotsChecker {
    pub fn new() -> Result<Self> {
        let mut builder = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("LawEye/1.0");

        let force_no_proxy = std::env::var("LAW_EYE__SPIDER__NO_PROXY")
            .ok()
            .map(|v| v.trim() == "1" || v.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if force_no_proxy {
            builder = builder.no_proxy();
        }

        let client = builder
            .build()
            .map_err(|e| Error::Config(format!("robots checker client: {}", e)))?;

        Ok(Self {
            client,
            cache: Mutex::new(HashMap::new()),
            cache_ttl: Duration::from_secs(3600), // 1 hour
            bot_name: "LawEye".to_string(),
        })
    }

    /// Set a custom cache TTL.
    pub fn with_cache_ttl(mut self, ttl: Duration) -> Self {
        self.cache_ttl = ttl;
        self
    }

    /// Check whether `url` is allowed by the site's robots.txt.
    ///
    /// Returns `true` if allowed or if robots.txt cannot be fetched
    /// (fail-open policy: if we can't read rules, we assume allowed).
    pub async fn is_allowed(&self, url: &str) -> bool {
        let parsed = match url::Url::parse(url) {
            Ok(u) => u,
            Err(_) => return true, // can't parse URL, allow
        };

        let origin = format!(
            "{}://{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or("localhost")
        );
        let path = parsed.path();

        // Check cache first
        {
            let cache = self.cache.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("robots cache mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            if let Some(rules) = cache.get(&origin) {
                if !rules.is_expired(self.cache_ttl) {
                    return rules.is_path_allowed(path);
                }
            }
        }

        // Fetch and parse robots.txt
        let rules = match self.fetch_and_parse(&origin).await {
            Ok(rules) => rules,
            Err(err) => {
                warn!(
                    origin = %origin,
                    error = %err,
                    "failed to fetch robots.txt, allowing request (fail-open)"
                );
                return true;
            }
        };

        let allowed = rules.is_path_allowed(path);

        // Update cache
        {
            let mut cache = self.cache.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("robots cache mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            cache.insert(origin, rules);
        }

        allowed
    }

    /// Get the `Crawl-delay` for a domain (if specified in robots.txt).
    pub async fn crawl_delay(&self, url: &str) -> Option<Duration> {
        let parsed = url::Url::parse(url).ok()?;
        let origin = format!(
            "{}://{}",
            parsed.scheme(),
            parsed.host_str()?
        );

        // Check cache
        {
            let cache = self.cache.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("robots cache mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            if let Some(rules) = cache.get(&origin) {
                if !rules.is_expired(self.cache_ttl) {
                    return rules.crawl_delay_secs.map(Duration::from_secs_f64);
                }
            }
        }

        // Fetch
        if let Ok(rules) = self.fetch_and_parse(&origin).await {
            let delay = rules.crawl_delay_secs.map(Duration::from_secs_f64);
            let mut cache = self.cache.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("robots cache mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            cache.insert(origin, rules);
            delay
        } else {
            None
        }
    }

    /// Number of cached domains.
    pub fn cached_domains(&self) -> usize {
        self.cache.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("robots cache mutex was poisoned, recovering");
            poisoned.into_inner()
        }).len()
    }

    async fn fetch_and_parse(&self, origin: &str) -> Result<RobotsRules> {
        let robots_url = format!("{}/robots.txt", origin);
        debug!(url = %robots_url, "fetching robots.txt");

        let response = self
            .client
            .get(&robots_url)
            .send()
            .await
            .map_err(|e| Error::Http(format!("robots.txt fetch: {}", e)))?;

        if !response.status().is_success() {
            // No robots.txt or error → allow everything
            return Ok(RobotsRules {
                disallowed: Vec::new(),
                allowed: Vec::new(),
                crawl_delay_secs: None,
                fetched_at: Instant::now(),
            });
        }

        let body = response
            .text()
            .await
            .map_err(|e| Error::Http(format!("robots.txt body: {}", e)))?;

        Ok(self.parse_robots_txt(&body))
    }

    fn parse_robots_txt(&self, body: &str) -> RobotsRules {
        let mut disallowed = Vec::new();
        let mut allowed = Vec::new();
        let mut crawl_delay_secs: Option<f64> = None;
        let mut in_matching_section = false;
        let mut in_wildcard_section = false;
        let bot_lower = self.bot_name.to_lowercase();

        // Wildcard fallback accumulators
        let mut wildcard_disallowed = Vec::new();
        let mut wildcard_allowed = Vec::new();
        let mut wildcard_crawl_delay: Option<f64> = None;

        for line in body.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let (key, value) = match line.split_once(':') {
                Some((k, v)) => (k.trim().to_lowercase(), v.trim().to_string()),
                None => continue,
            };

            match key.as_str() {
                "user-agent" => {
                    let ua = value.to_lowercase();
                    in_matching_section = ua == bot_lower || ua.contains(&bot_lower);
                    in_wildcard_section = ua == "*";
                }
                "disallow" if in_matching_section && !value.is_empty() => {
                    disallowed.push(value);
                }
                "disallow" if in_wildcard_section && !value.is_empty() => {
                    wildcard_disallowed.push(value);
                }
                "allow" if in_matching_section && !value.is_empty() => {
                    allowed.push(value);
                }
                "allow" if in_wildcard_section && !value.is_empty() => {
                    wildcard_allowed.push(value);
                }
                "crawl-delay" if in_matching_section => {
                    crawl_delay_secs = value.parse::<f64>().ok();
                }
                "crawl-delay" if in_wildcard_section && crawl_delay_secs.is_none() => {
                    wildcard_crawl_delay = value.parse::<f64>().ok();
                }
                _ => {}
            }
        }

        // If no bot-specific rules found, use wildcard rules
        if disallowed.is_empty() && allowed.is_empty() {
            disallowed = wildcard_disallowed;
            allowed = wildcard_allowed;
        }
        if crawl_delay_secs.is_none() {
            crawl_delay_secs = wildcard_crawl_delay;
        }

        RobotsRules {
            disallowed,
            allowed,
            crawl_delay_secs,
            fetched_at: Instant::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checker() -> RobotsChecker {
        std::env::set_var("LAW_EYE__SPIDER__NO_PROXY", "1");
        RobotsChecker::new().unwrap()
    }

    #[test]
    fn parse_basic_robots_txt() {
        let c = checker();
        let rules = c.parse_robots_txt(
            "User-agent: *\nDisallow: /admin/\nDisallow: /private/\nAllow: /admin/public/\n",
        );

        assert!(rules.is_path_allowed("/"));
        assert!(rules.is_path_allowed("/articles/123"));
        assert!(!rules.is_path_allowed("/admin/settings"));
        assert!(rules.is_path_allowed("/admin/public/page"));
        assert!(!rules.is_path_allowed("/private/data"));
    }

    #[test]
    fn parse_bot_specific_rules() {
        let c = checker();
        let body = "\
User-agent: LawEye
Disallow: /secret/
Crawl-delay: 5

User-agent: *
Disallow: /
";
        let rules = c.parse_robots_txt(body);

        // LawEye-specific rules should be used (not wildcard "Disallow: /")
        assert!(rules.is_path_allowed("/public/page"));
        assert!(!rules.is_path_allowed("/secret/data"));
        assert_eq!(rules.crawl_delay_secs, Some(5.0));
    }

    #[test]
    fn parse_empty_robots_txt() {
        let c = checker();
        let rules = c.parse_robots_txt("");
        assert!(rules.is_path_allowed("/anything"));
        assert!(rules.crawl_delay_secs.is_none());
    }

    #[test]
    fn parse_crawl_delay_from_wildcard() {
        let c = checker();
        let rules = c.parse_robots_txt("User-agent: *\nCrawl-delay: 2\n");
        assert_eq!(rules.crawl_delay_secs, Some(2.0));
    }

    #[test]
    fn longest_match_wins() {
        let c = checker();
        let rules = c.parse_robots_txt(
            "User-agent: *\nDisallow: /a\nAllow: /a/b\nDisallow: /a/b/c\n",
        );

        assert!(!rules.is_path_allowed("/a/something"));
        assert!(rules.is_path_allowed("/a/b/something"));
        assert!(!rules.is_path_allowed("/a/b/c/something"));
    }

    #[test]
    fn cache_ttl_expiration() {
        // A freshly created rule should NOT be expired with a 1-hour TTL
        let fresh = RobotsRules {
            disallowed: vec![],
            allowed: vec![],
            crawl_delay_secs: None,
            fetched_at: Instant::now(),
        };
        assert!(!fresh.is_expired(Duration::from_secs(3600)));

        // A rule with a zero TTL should be expired immediately
        // (elapsed > 0 for any non-zero execution time)
        assert!(fresh.is_expired(Duration::ZERO));

        // Simulate an old rule by sleeping briefly and using a tiny TTL
        std::thread::sleep(Duration::from_millis(10));
        assert!(fresh.is_expired(Duration::from_millis(5)));
        assert!(!fresh.is_expired(Duration::from_secs(60)));
    }

    #[tokio::test]
    async fn is_allowed_returns_true_for_unparseable_url() {
        let c = checker();
        assert!(c.is_allowed("not a valid url").await);
    }
}
