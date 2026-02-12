use std::sync::Arc;
use std::time::Instant;

use law_eye_ai::AiService;
use tracing::{info, warn};
use uuid::Uuid;

use crate::adapters::{AdapterRegistry, FetchContext};
use crate::anti_crawl::{DomainRateLimiter, RobotsChecker};
use crate::incremental::{ConcurrencyController, IncrementalChecker};
use crate::observability::{CrawlLogger, CrawlMetrics, CrawlOutcome, CrawlStats};
use crate::pipeline::{Pipeline, RawArticle};
use crate::stages::{
    AiEnrichmentStage, AsyncPipeline, CleaningStage, ContentQualityStage, DeduplicationStage,
    MetadataExtractionStage,
};

/// Configuration for a single crawl job.
#[derive(Debug, Clone)]
pub struct CrawlJobConfig {
    /// Tenant owning this source.
    pub tenant_id: Uuid,
    /// Source ID from the database.
    pub source_id: Uuid,
    /// Adapter kind (e.g. "rss", "spider", "npc_gov").
    pub kind: String,
    /// Human-readable source name for logging.
    pub source_name: String,
    /// Source URL.
    pub url: String,
    /// Raw JSON config blob from the `sources.config` column.
    pub config: serde_json::Value,
    /// Optional encoding override (e.g. "gbk").
    pub encoding: Option<String>,
    /// Rendering mode: "static" or "dynamic".
    pub render_mode: Option<String>,
    /// Whether internal/localhost URLs are allowed.
    pub allow_internal: bool,
    /// Whether to run AI enrichment on fetched articles.
    pub enable_ai: bool,
    /// Whether to check robots.txt before crawling.
    pub respect_robots: bool,
}

/// Result of a completed crawl job.
#[derive(Debug)]
pub struct CrawlJobResult {
    /// The outcome of the crawl.
    pub outcome: CrawlOutcome,
    /// Collected statistics.
    pub stats: CrawlStats,
    /// Articles that survived the full pipeline.
    pub articles: Vec<RawArticle>,
    /// Total wall-clock duration in milliseconds.
    pub duration_ms: i32,
}

/// Top-level crawl orchestrator that wires together all subsystems:
///
/// ```text
/// AdapterRegistry.fetch()
///   → robots.txt check (optional)
///   → rate limiting
///   → Pipeline(Cleaning → Quality → Metadata → Dedup)
///   → AsyncPipeline(AiEnrichment) (optional)
///   → CrawlLogger + CrawlMetrics instrumentation
/// ```
///
/// This is the single entry point for running a crawl. Callers (API handlers,
/// worker jobs, CLI tools) create a `CrawlOrchestrator` once and call
/// `run_job()` for each source to crawl.
pub struct CrawlOrchestrator {
    registry: AdapterRegistry,
    rate_limiter: Arc<DomainRateLimiter>,
    robots_checker: Option<Arc<RobotsChecker>>,
    concurrency: Arc<ConcurrencyController>,
    incremental_checker: Option<Arc<IncrementalChecker>>,
    ai_service: Option<Arc<AiService>>,
}

impl CrawlOrchestrator {
    /// Create an orchestrator with default adapters and subsystems.
    pub fn new(
        registry: AdapterRegistry,
        rate_limiter: Arc<DomainRateLimiter>,
        concurrency: Arc<ConcurrencyController>,
    ) -> Self {
        Self {
            registry,
            rate_limiter,
            robots_checker: None,
            concurrency,
            incremental_checker: None,
            ai_service: None,
        }
    }

    /// Enable robots.txt checking.
    pub fn with_robots_checker(mut self, checker: Arc<RobotsChecker>) -> Self {
        self.robots_checker = Some(checker);
        self
    }

    /// Enable cross-session incremental deduplication.
    ///
    /// When set, articles whose `content_hash` is already known will be
    /// filtered out after the sync pipeline, and newly seen hashes will
    /// be recorded for future runs.
    pub fn with_incremental_checker(mut self, checker: Arc<IncrementalChecker>) -> Self {
        self.incremental_checker = Some(checker);
        self
    }

    /// Enable AI enrichment.
    pub fn with_ai_service(mut self, ai_service: Arc<AiService>) -> Self {
        self.ai_service = Some(ai_service);
        self
    }

    /// Access the adapter registry (for inspection / registration).
    pub fn registry(&self) -> &AdapterRegistry {
        &self.registry
    }

    /// Access the adapter registry mutably (for dynamic registration).
    pub fn registry_mut(&mut self) -> &mut AdapterRegistry {
        &mut self.registry
    }

    /// Run a single crawl job end-to-end.
    ///
    /// This is the main entry point. It:
    /// 1. Starts a `CrawlLogger` for lifecycle tracking
    /// 2. Optionally checks robots.txt compliance
    /// 3. Acquires a concurrency permit for the target domain
    /// 4. Applies rate limiting before the fetch
    /// 5. Fetches articles via the adapter registry
    /// 6. Runs the synchronous pipeline (cleaning, quality, metadata, dedup)
    /// 7. Optionally runs the async AI enrichment pipeline
    /// 8. Finishes the logger (emits metrics + structured logs)
    /// 9. Returns the processed articles + stats
    pub async fn run_job(&self, job: &CrawlJobConfig) -> CrawlJobResult {
        let start = Instant::now();
        let mut logger =
            CrawlLogger::start(job.tenant_id, job.source_id, &job.source_name);

        // --- Step 1: robots.txt check ---
        if job.respect_robots {
            if let Some(ref checker) = self.robots_checker {
                if !checker.is_allowed(&job.url).await {
                    warn!(
                        source = %job.source_name,
                        url = %job.url,
                        "robots.txt disallows crawling this URL, skipping"
                    );
                    logger.record_error("robots", format!("robots.txt disallows: {}", job.url));
                    let (outcome, stats) = logger.finish();
                    return CrawlJobResult {
                        outcome,
                        stats,
                        articles: Vec::new(),
                        duration_ms: start.elapsed().as_millis() as i32,
                    };
                }
            }
        }

        // --- Step 2: domain extraction for rate limiting / concurrency ---
        let domain = DomainRateLimiter::domain_from_url(&job.url)
            .unwrap_or_else(|| "unknown".to_string());

        // --- Step 3: acquire concurrency permit ---
        let _permit = self.concurrency.acquire(&domain).await;

        // --- Step 4: rate limiting ---
        self.rate_limiter.wait(&domain).await;

        // --- Step 5: fetch articles via adapter ---
        let fetch_start = Instant::now();
        let ctx = FetchContext {
            config: job.config.clone(),
            allow_internal: job.allow_internal,
            url: job.url.clone(),
            encoding: job.encoding.clone(),
            render_mode: job.render_mode.clone(),
        };

        let raw_articles = match self.registry.fetch(&job.kind, &ctx).await {
            Ok(articles) => {
                let fetch_duration = fetch_start.elapsed();
                CrawlMetrics::record_pipeline_stage("fetch", fetch_duration);
                info!(
                    source = %job.source_name,
                    count = articles.len(),
                    fetch_ms = fetch_duration.as_millis() as u64,
                    "fetched articles from source"
                );
                logger.stats_mut().articles_found = articles.len() as i32;
                articles
            }
            Err(err) => {
                logger.record_error("fetch", format!("adapter fetch failed: {}", err));
                let (outcome, stats) = logger.finish();
                return CrawlJobResult {
                    outcome,
                    stats,
                    articles: Vec::new(),
                    duration_ms: start.elapsed().as_millis() as i32,
                };
            }
        };

        if raw_articles.is_empty() {
            info!(source = %job.source_name, "no articles found, finishing early");
            let (outcome, stats) = logger.finish();
            return CrawlJobResult {
                outcome,
                stats,
                articles: Vec::new(),
                duration_ms: start.elapsed().as_millis() as i32,
            };
        }

        // --- Step 6: synchronous pipeline ---
        let pipeline_start = Instant::now();
        let pipeline = Pipeline::new()
            .add_stage(CleaningStage)
            .add_stage(ContentQualityStage::new())
            .add_stage(MetadataExtractionStage)
            .add_stage(DeduplicationStage::new());

        let before_count = raw_articles.len();
        let processed = pipeline.process_batch(raw_articles);
        let after_count = processed.len();
        let pipeline_duration = pipeline_start.elapsed();

        CrawlMetrics::record_pipeline_stage("sync_pipeline", pipeline_duration);

        let filtered = (before_count - after_count) as i32;
        logger.stats_mut().articles_skipped += filtered;

        info!(
            source = %job.source_name,
            before = before_count,
            after = after_count,
            filtered = filtered,
            pipeline_ms = pipeline_duration.as_millis() as u64,
            "synchronous pipeline completed"
        );

        // --- Step 6b: cross-session incremental deduplication ---
        let processed = if let Some(ref checker) = self.incremental_checker {
            let before_incr = processed.len();
            let mut kept = Vec::with_capacity(before_incr);
            for article in processed {
                if let Some(ref hash) = article.content_hash {
                    if checker.is_known(hash) {
                        continue;
                    }
                    checker.record(hash.clone(), article.link.clone());
                }
                kept.push(article);
            }
            let incr_skipped = (before_incr - kept.len()) as i32;
            if incr_skipped > 0 {
                logger.stats_mut().articles_skipped += incr_skipped;
                info!(
                    source = %job.source_name,
                    skipped = incr_skipped,
                    "incremental checker filtered known articles"
                );
            }
            kept
        } else {
            processed
        };

        // --- Step 7: async AI enrichment (optional) ---
        let enriched = if job.enable_ai {
            if let Some(ref ai_service) = self.ai_service {
                let ai_start = Instant::now();
                let ai_stage = AiEnrichmentStage::new(ai_service.clone());
                let ai_pipeline = AsyncPipeline::new().add_stage(ai_stage);
                let result = ai_pipeline.process_batch(processed).await;
                let ai_duration = ai_start.elapsed();

                CrawlMetrics::record_ai_enrichment(&job.source_name, ai_duration);
                CrawlMetrics::record_pipeline_stage("ai_enrichment", ai_duration);

                let enriched_count = result.iter().filter(|a| a.has_ai_enrichment()).count();
                info!(
                    source = %job.source_name,
                    total = result.len(),
                    enriched = enriched_count,
                    ai_ms = ai_duration.as_millis() as u64,
                    "AI enrichment pipeline completed"
                );

                result
            } else {
                warn!(
                    source = %job.source_name,
                    "AI enrichment requested but no AiService configured, skipping"
                );
                processed
            }
        } else {
            processed
        };

        // --- Step 8: compute final stats ---
        logger.stats_mut().articles_new = enriched.len() as i32;

        // --- Step 9: finish logger (emits all metrics + structured log) ---
        let (outcome, stats) = logger.finish();

        CrawlJobResult {
            outcome,
            stats,
            articles: enriched,
            duration_ms: start.elapsed().as_millis() as i32,
        }
    }

    /// Run multiple crawl jobs sequentially, merging stats.
    ///
    /// This is a convenience method for batch crawling (e.g. daily cron job
    /// that crawls all configured sources).
    pub async fn run_batch(&self, jobs: &[CrawlJobConfig]) -> Vec<CrawlJobResult> {
        let mut results = Vec::with_capacity(jobs.len());
        for job in jobs {
            let result = self.run_job(job).await;
            results.push(result);
        }
        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anti_crawl::RateLimiterConfig;
    use crate::incremental::ConcurrencyConfig;

    fn make_orchestrator() -> CrawlOrchestrator {
        let registry = AdapterRegistry::new();
        let rate_limiter = Arc::new(DomainRateLimiter::new(RateLimiterConfig {
            burst_size: 10,
            tokens_per_second: 100.0,
        }));
        let concurrency = Arc::new(ConcurrencyController::new(ConcurrencyConfig::default()));
        CrawlOrchestrator::new(registry, rate_limiter, concurrency)
    }

    fn make_job() -> CrawlJobConfig {
        CrawlJobConfig {
            tenant_id: Uuid::new_v4(),
            source_id: Uuid::new_v4(),
            kind: "nonexistent".to_string(),
            source_name: "test_source".to_string(),
            url: "https://example.com".to_string(),
            config: serde_json::json!({}),
            encoding: None,
            render_mode: None,
            allow_internal: false,
            enable_ai: false,
            respect_robots: false,
        }
    }

    #[test]
    fn orchestrator_creation() {
        let orch = make_orchestrator();
        assert!(orch.registry().is_empty());
        assert!(orch.ai_service.is_none());
        assert!(orch.robots_checker.is_none());
    }

    #[test]
    fn orchestrator_with_ai_service() {
        let orch = make_orchestrator()
            .with_ai_service(Arc::new(AiService::new("test-key", None, None)));
        assert!(orch.ai_service.is_some());
    }

    #[tokio::test]
    async fn run_job_returns_failed_when_adapter_not_found() {
        let orch = make_orchestrator();
        let job = make_job();

        let result = orch.run_job(&job).await;
        assert_eq!(result.outcome, CrawlOutcome::Failed);
        assert!(result.articles.is_empty());
        assert!(result.stats.errors.len() >= 1);
        assert!(result.duration_ms >= 0);
    }

    #[tokio::test]
    async fn run_job_with_robots_blocked() {
        // robots_checker is None, so even with respect_robots=true
        // it should proceed (no checker = no block)
        let orch = make_orchestrator();
        let mut job = make_job();
        job.respect_robots = true;

        let result = orch.run_job(&job).await;
        // Will still fail because adapter is not registered, but NOT because of robots
        assert_eq!(result.outcome, CrawlOutcome::Failed);
        assert!(result.stats.errors.iter().any(|e| e.contains("adapter")));
    }

    #[tokio::test]
    async fn run_job_with_default_adapters() {
        // Register adapters but point to a non-existent URL
        // This tests the full flow up to the network fetch failure
        let registry = AdapterRegistry::with_defaults().unwrap();
        let rate_limiter = Arc::new(DomainRateLimiter::new(RateLimiterConfig {
            burst_size: 10,
            tokens_per_second: 100.0,
        }));
        let concurrency = Arc::new(ConcurrencyController::new(ConcurrencyConfig::default()));
        let orch = CrawlOrchestrator::new(registry, rate_limiter, concurrency);

        let mut job = make_job();
        job.kind = "rss".to_string();
        job.url = "https://localhost:1/nonexistent-feed.xml".to_string();
        job.allow_internal = true;

        let result = orch.run_job(&job).await;
        // Network error expected — should be Failed with fetch error
        assert_eq!(result.outcome, CrawlOutcome::Failed);
        assert!(result.stats.errors.iter().any(|e| e.contains("fetch")));
    }

    #[tokio::test]
    async fn run_batch_processes_multiple_jobs() {
        let orch = make_orchestrator();
        let jobs = vec![make_job(), make_job()];

        let results = orch.run_batch(&jobs).await;
        assert_eq!(results.len(), 2);
        // Both should fail (no adapters registered)
        for r in &results {
            assert_eq!(r.outcome, CrawlOutcome::Failed);
        }
    }

    #[test]
    fn crawl_job_config_fields() {
        let job = CrawlJobConfig {
            tenant_id: Uuid::nil(),
            source_id: Uuid::nil(),
            kind: "spider".to_string(),
            source_name: "test".to_string(),
            url: "https://example.com".to_string(),
            config: serde_json::json!({"list_selector": ".items"}),
            encoding: Some("gbk".to_string()),
            render_mode: Some("dynamic".to_string()),
            allow_internal: true,
            enable_ai: true,
            respect_robots: true,
        };

        assert_eq!(job.kind, "spider");
        assert_eq!(job.encoding.as_deref(), Some("gbk"));
        assert_eq!(job.render_mode.as_deref(), Some("dynamic"));
        assert!(job.enable_ai);
        assert!(job.respect_robots);
    }

    #[test]
    fn crawl_job_result_debug() {
        let result = CrawlJobResult {
            outcome: CrawlOutcome::Success,
            stats: CrawlStats::new(),
            articles: vec![RawArticle::new("test", "https://example.com")],
            duration_ms: 100,
        };

        // Ensure Debug trait is implemented
        let debug_str = format!("{:?}", result);
        assert!(debug_str.contains("Success"));
    }
}
