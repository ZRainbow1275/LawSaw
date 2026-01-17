pub mod pipeline;
pub mod rss;
pub mod spider;

pub use pipeline::{CleaningStage, Pipeline, PipelineStage, RawArticle};
pub use rss::RssFetcher;
pub use spider::{SpiderConfig, WebSpider};
