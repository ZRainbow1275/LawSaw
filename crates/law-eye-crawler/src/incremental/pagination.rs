use serde::Deserialize;

/// Pagination strategy for multi-page list crawling.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PaginationStrategy {
    /// URL query parameter pagination (e.g. `?page=2`).
    UrlParam {
        param_name: String,
        start_page: u32,
        max_pages: u32,
    },
    /// Path-based pagination (e.g. `/list/page/2`).
    UrlPath {
        pattern: String,
        start_page: u32,
        max_pages: u32,
    },
    /// Offset-based pagination (e.g. `?offset=20&limit=20`).
    Offset {
        offset_param: String,
        limit_param: String,
        limit: u32,
        max_offset: u32,
    },
}

/// Configuration for pagination, stored in `sources.config.pagination`.
#[derive(Debug, Clone, Deserialize)]
pub struct PaginationConfig {
    #[serde(flatten)]
    pub strategy: PaginationStrategy,
    /// Stop early if a page returns fewer items than expected.
    #[serde(default = "default_true")]
    pub stop_on_empty: bool,
}

fn default_true() -> bool {
    true
}

/// Iterator that yields page URLs based on a pagination strategy.
pub struct PageIterator {
    base_url: String,
    strategy: PaginationStrategy,
    current: u32,
    exhausted: bool,
}

impl PageIterator {
    /// Create a new page iterator.
    pub fn new(base_url: impl Into<String>, config: &PaginationConfig) -> Self {
        let base = base_url.into();
        let current = match &config.strategy {
            PaginationStrategy::UrlParam { start_page, .. } => *start_page,
            PaginationStrategy::UrlPath { start_page, .. } => *start_page,
            PaginationStrategy::Offset { .. } => 0,
        };

        Self {
            base_url: base,
            strategy: config.strategy.clone(),
            current,
            exhausted: false,
        }
    }

    /// Mark the iterator as exhausted (e.g. when a page returns no results).
    pub fn mark_exhausted(&mut self) {
        self.exhausted = true;
    }

    /// Current page number / offset.
    pub fn current_page(&self) -> u32 {
        self.current
    }
}

impl Iterator for PageIterator {
    type Item = String;

    fn next(&mut self) -> Option<String> {
        if self.exhausted {
            return None;
        }

        let url = match &self.strategy {
            PaginationStrategy::UrlParam {
                param_name,
                max_pages,
                start_page,
            } => {
                if self.current >= start_page + max_pages {
                    return None;
                }
                let url = if self.base_url.contains('?') {
                    format!("{}&{}={}", self.base_url, param_name, self.current)
                } else {
                    format!("{}?{}={}", self.base_url, param_name, self.current)
                };
                self.current += 1;
                url
            }
            PaginationStrategy::UrlPath {
                pattern,
                max_pages,
                start_page,
            } => {
                if self.current >= start_page + max_pages {
                    return None;
                }
                let url = pattern.replace("{page}", &self.current.to_string());
                self.current += 1;
                url
            }
            PaginationStrategy::Offset {
                offset_param,
                limit_param,
                limit,
                max_offset,
            } => {
                if self.current > *max_offset {
                    return None;
                }
                let url = if self.base_url.contains('?') {
                    format!(
                        "{}&{}={}&{}={}",
                        self.base_url, offset_param, self.current, limit_param, limit
                    )
                } else {
                    format!(
                        "{}?{}={}&{}={}",
                        self.base_url, offset_param, self.current, limit_param, limit
                    )
                };
                self.current += limit;
                url
            }
        };

        Some(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_param_pagination() {
        let config = PaginationConfig {
            strategy: PaginationStrategy::UrlParam {
                param_name: "page".to_string(),
                start_page: 1,
                max_pages: 3,
            },
            stop_on_empty: true,
        };

        let pages: Vec<String> = PageIterator::new("https://example.com/list", &config).collect();

        assert_eq!(pages.len(), 3);
        assert_eq!(pages[0], "https://example.com/list?page=1");
        assert_eq!(pages[1], "https://example.com/list?page=2");
        assert_eq!(pages[2], "https://example.com/list?page=3");
    }

    #[test]
    fn url_param_with_existing_query() {
        let config = PaginationConfig {
            strategy: PaginationStrategy::UrlParam {
                param_name: "p".to_string(),
                start_page: 0,
                max_pages: 2,
            },
            stop_on_empty: true,
        };

        let pages: Vec<String> =
            PageIterator::new("https://example.com/list?cat=law", &config).collect();

        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0], "https://example.com/list?cat=law&p=0");
        assert_eq!(pages[1], "https://example.com/list?cat=law&p=1");
    }

    #[test]
    fn url_path_pagination() {
        let config = PaginationConfig {
            strategy: PaginationStrategy::UrlPath {
                pattern: "https://example.com/list/page/{page}".to_string(),
                start_page: 1,
                max_pages: 2,
            },
            stop_on_empty: true,
        };

        let pages: Vec<String> = PageIterator::new("", &config).collect();

        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0], "https://example.com/list/page/1");
        assert_eq!(pages[1], "https://example.com/list/page/2");
    }

    #[test]
    fn offset_pagination() {
        let config = PaginationConfig {
            strategy: PaginationStrategy::Offset {
                offset_param: "offset".to_string(),
                limit_param: "limit".to_string(),
                limit: 20,
                max_offset: 40,
            },
            stop_on_empty: true,
        };

        let pages: Vec<String> = PageIterator::new("https://example.com/api", &config).collect();

        assert_eq!(pages.len(), 3);
        assert_eq!(pages[0], "https://example.com/api?offset=0&limit=20");
        assert_eq!(pages[1], "https://example.com/api?offset=20&limit=20");
        assert_eq!(pages[2], "https://example.com/api?offset=40&limit=20");
    }

    #[test]
    fn mark_exhausted_stops_iteration() {
        let config = PaginationConfig {
            strategy: PaginationStrategy::UrlParam {
                param_name: "page".to_string(),
                start_page: 1,
                max_pages: 100,
            },
            stop_on_empty: true,
        };

        let mut iter = PageIterator::new("https://example.com", &config);
        assert!(iter.next().is_some()); // page 1
        assert!(iter.next().is_some()); // page 2
        iter.mark_exhausted();
        assert!(iter.next().is_none()); // stopped
    }

    #[test]
    fn pagination_config_deserializes_from_json() {
        let json = r#"{
            "type": "url_param",
            "param_name": "page",
            "start_page": 1,
            "max_pages": 10,
            "stop_on_empty": false
        }"#;

        let config: PaginationConfig = serde_json::from_str(json).unwrap();
        assert!(!config.stop_on_empty);
        match &config.strategy {
            PaginationStrategy::UrlParam {
                param_name,
                start_page,
                max_pages,
            } => {
                assert_eq!(param_name, "page");
                assert_eq!(*start_page, 1);
                assert_eq!(*max_pages, 10);
            }
            _ => panic!("expected UrlParam"),
        }
    }
}
