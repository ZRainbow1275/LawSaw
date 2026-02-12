pub mod adapters;
pub mod anti_crawl;
pub mod browser;
pub mod encoding;
pub mod incremental;
pub mod observability;
pub mod orchestrator;
pub mod pipeline;
pub mod rss;
pub mod spider;
pub mod stages;

pub use adapters::{
    AdapterRegistry, FetchContext, GovernmentSiteAdapter, RssAdapter, SiteProfile, SourceAdapter,
    SpiderAdapter,
};
pub use anti_crawl::{DomainRateLimiter, RandomizedHeaders, RateLimiterConfig, RobotsChecker, UserAgentPool};
pub use browser::BrowserlessClient;
pub use encoding::detect_and_decode;
pub use incremental::{
    ConcurrencyConfig, ConcurrencyController, ConditionalRequest, ConditionalState,
    IncrementalChecker, PageIterator, PaginationConfig, PaginationStrategy, SitemapParser,
};
pub use observability::{CrawlLogger, CrawlMetrics, CrawlOutcome, CrawlStats};
pub use orchestrator::{CrawlJobConfig, CrawlJobResult, CrawlOrchestrator};
pub use pipeline::{Pipeline, PipelineStage, RawArticle};
pub use rss::RssFetcher;
pub use spider::{SpiderConfig, WebSpider};
pub use stages::{
    AiEnrichmentStage, AsyncPipeline, AsyncPipelineStage, CleaningStage, ContentQualityStage,
    DeduplicationStage, MetadataExtractionStage,
};
