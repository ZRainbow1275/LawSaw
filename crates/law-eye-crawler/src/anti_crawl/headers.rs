use super::user_agent::UserAgentPool;
use rand::Rng;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_ENCODING, ACCEPT_LANGUAGE};

/// Generates randomized but realistic HTTP headers for each request.
///
/// Mimics real browser behaviour by varying Accept-Language preferences,
/// connection headers, and other fingerprint-relevant fields.
pub struct RandomizedHeaders {
    ua_pool: &'static UserAgentPool,
    accept_languages: Vec<&'static str>,
}

impl RandomizedHeaders {
    /// Create with the default shared UA pool.
    pub fn new() -> Self {
        Self {
            ua_pool: UserAgentPool::shared(),
            accept_languages: vec![
                "zh-CN,zh;q=0.9,en;q=0.8",
                "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "zh-CN,zh;q=0.9",
                "zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6",
                "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                "en-US,en;q=0.9",
                "zh-Hans-CN;q=1,en-US;q=0.9",
                "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
            ],
        }
    }

    /// Build a randomized `HeaderMap` suitable for a single HTTP request.
    pub fn generate(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let mut rng = rand::thread_rng();

        // Accept
        headers.insert(
            ACCEPT,
            HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            ),
        );

        // Accept-Encoding
        let encodings: &[&str] = &[
            "gzip, deflate, br",
            "gzip, deflate, br, zstd",
            "gzip, deflate",
        ];
        let enc_idx = rng.gen_range(0..encodings.len());
        if let Ok(val) = HeaderValue::from_str(encodings[enc_idx]) {
            headers.insert(ACCEPT_ENCODING, val);
        }

        // Accept-Language (randomized)
        let lang_idx = rng.gen_range(0..self.accept_languages.len());
        if let Ok(val) = HeaderValue::from_str(self.accept_languages[lang_idx]) {
            headers.insert(ACCEPT_LANGUAGE, val);
        }

        // Sec-Fetch headers (modern browsers)
        if rng.gen_bool(0.7) {
            headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("document"));
            headers.insert("Sec-Fetch-Mode", HeaderValue::from_static("navigate"));
            headers.insert("Sec-Fetch-Site", HeaderValue::from_static("none"));
            headers.insert("Sec-Fetch-User", HeaderValue::from_static("?1"));
        }

        // Upgrade-Insecure-Requests
        headers.insert(
            "Upgrade-Insecure-Requests",
            HeaderValue::from_static("1"),
        );

        // Cache-Control variation
        let cache_controls: &[&str] = &[
            "max-age=0",
            "no-cache",
            "max-age=0, no-cache",
        ];
        let cc_idx = rng.gen_range(0..cache_controls.len());
        if let Ok(val) = HeaderValue::from_str(cache_controls[cc_idx]) {
            headers.insert("Cache-Control", val);
        }

        headers
    }

    /// Get a random User-Agent string.
    pub fn random_user_agent(&self) -> &str {
        self.ua_pool.random()
    }
}

impl Default for RandomizedHeaders {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn generate_produces_required_headers() {
        let rh = RandomizedHeaders::new();
        let headers = rh.generate();

        assert!(headers.contains_key(ACCEPT));
        assert!(headers.contains_key(ACCEPT_ENCODING));
        assert!(headers.contains_key(ACCEPT_LANGUAGE));
        assert!(headers.contains_key("Upgrade-Insecure-Requests"));
        assert!(headers.contains_key("Cache-Control"));
    }

    #[test]
    fn generate_varies_accept_language() {
        let rh = RandomizedHeaders::new();
        let mut languages: HashSet<String> = HashSet::new();

        for _ in 0..50 {
            let headers = rh.generate();
            if let Some(val) = headers.get(ACCEPT_LANGUAGE) {
                languages.insert(val.to_str().unwrap_or("").to_string());
            }
        }

        assert!(
            languages.len() >= 2,
            "expected language variation, got {} distinct values",
            languages.len()
        );
    }

    #[test]
    fn random_user_agent_is_valid() {
        let rh = RandomizedHeaders::new();
        let ua = rh.random_user_agent();
        assert!(ua.starts_with("Mozilla/5.0"));
    }

    #[test]
    fn generate_sometimes_includes_sec_fetch() {
        let rh = RandomizedHeaders::new();
        let mut has_sec_fetch = false;
        let mut missing_sec_fetch = false;

        for _ in 0..100 {
            let headers = rh.generate();
            if headers.contains_key("Sec-Fetch-Dest") {
                has_sec_fetch = true;
            } else {
                missing_sec_fetch = true;
            }
            if has_sec_fetch && missing_sec_fetch {
                break;
            }
        }

        // With 70% probability, we should see both cases in 100 iterations
        assert!(has_sec_fetch, "Sec-Fetch headers should appear sometimes");
    }
}
