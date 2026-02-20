use std::time::Instant;
use tracing::{error, info, warn};
use uuid::Uuid;

use super::crawl_metrics::CrawlMetrics;

/// Outcome of a crawl run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CrawlOutcome {
    /// All articles fetched and processed successfully.
    Success,
    /// Some articles fetched, but errors occurred for others.
    Partial,
    /// Crawl failed entirely.
    Failed,
}

impl CrawlOutcome {
    pub fn as_str(&self) -> &'static str {
        match self {
            CrawlOutcome::Success => "success",
            CrawlOutcome::Partial => "partial",
            CrawlOutcome::Failed => "failed",
        }
    }
}

impl std::fmt::Display for CrawlOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Statistics collected during a crawl run.
#[derive(Debug, Clone, Default)]
pub struct CrawlStats {
    pub articles_found: i32,
    pub articles_new: i32,
    pub articles_updated: i32,
    pub articles_skipped: i32,
    pub errors: Vec<String>,
}

impl CrawlStats {
    pub fn new() -> Self {
        Self::default()
    }

    /// Determine the outcome based on collected stats.
    pub fn outcome(&self) -> CrawlOutcome {
        if self.articles_found == 0 && !self.errors.is_empty() {
            CrawlOutcome::Failed
        } else if !self.errors.is_empty() {
            CrawlOutcome::Partial
        } else {
            CrawlOutcome::Success
        }
    }

    /// First error message, if any (for storing in crawl_logs.error_message).
    pub fn first_error(&self) -> Option<String> {
        self.errors.first().cloned()
    }

    /// Merge another stats instance into this one.
    pub fn merge(&mut self, other: &CrawlStats) {
        self.articles_found += other.articles_found;
        self.articles_new += other.articles_new;
        self.articles_updated += other.articles_updated;
        self.articles_skipped += other.articles_skipped;
        self.errors.extend(other.errors.iter().cloned());
    }
}

/// Orchestrates crawl lifecycle logging and metrics.
///
/// Usage:
/// ```ignore
/// let logger = CrawlLogger::start(tenant_id, source_id, "npc_gov");
///
/// // ... perform crawl, updating stats ...
/// logger.stats_mut().articles_found = 42;
/// logger.stats_mut().articles_new = 10;
///
/// // Finish and emit metrics + structured log
/// let outcome = logger.finish();
/// ```
pub struct CrawlLogger {
    tenant_id: Uuid,
    source_id: Uuid,
    source_name: String,
    start: Instant,
    stats: CrawlStats,
}

impl CrawlLogger {
    /// Start a new crawl run. Emits the `crawler_active_runs` gauge increment.
    pub fn start(tenant_id: Uuid, source_id: Uuid, source_name: impl Into<String>) -> Self {
        let name = source_name.into();
        CrawlMetrics::run_started();

        info!(
            source = %name,
            tenant_id = %tenant_id,
            source_id = %source_id,
            "Crawl run started"
        );

        Self {
            tenant_id,
            source_id,
            source_name: name,
            start: Instant::now(),
            stats: CrawlStats::new(),
        }
    }

    /// Get a mutable reference to the stats for updating during crawl.
    pub fn stats_mut(&mut self) -> &mut CrawlStats {
        &mut self.stats
    }

    /// Get a read-only reference to the stats.
    pub fn stats(&self) -> &CrawlStats {
        &self.stats
    }

    /// Record an error that occurred during the crawl.
    pub fn record_error(&mut self, error_type: &str, message: impl Into<String>) {
        let msg = message.into();
        CrawlMetrics::record_error(&self.source_name, error_type);
        self.stats.errors.push(msg);
    }

    /// The source name for this crawl run.
    pub fn source_name(&self) -> &str {
        &self.source_name
    }

    /// The tenant ID for this crawl run.
    pub fn tenant_id(&self) -> Uuid {
        self.tenant_id
    }

    /// The source ID for this crawl run.
    pub fn source_id(&self) -> Uuid {
        self.source_id
    }

    /// Elapsed time since the crawl started.
    pub fn elapsed(&self) -> std::time::Duration {
        self.start.elapsed()
    }

    /// Duration in milliseconds since the crawl started (for DB storage).
    pub fn duration_ms(&self) -> i32 {
        self.start.elapsed().as_millis() as i32
    }

    /// Finish the crawl run: emit metrics, log outcome, return stats.
    ///
    /// Decrements the `crawler_active_runs` gauge and records all
    /// run-level counters and histograms.
    pub fn finish(self) -> (CrawlOutcome, CrawlStats) {
        let duration = self.start.elapsed();
        let outcome = self.stats.outcome();

        // Emit metrics
        CrawlMetrics::run_finished();
        CrawlMetrics::record_run(&self.source_name, outcome.as_str(), duration);
        CrawlMetrics::record_articles_found(&self.source_name, self.stats.articles_found as u64);
        CrawlMetrics::record_articles_new(&self.source_name, self.stats.articles_new as u64);
        CrawlMetrics::record_articles_skipped(
            &self.source_name,
            self.stats.articles_skipped as u64,
        );

        // Structured log
        match &outcome {
            CrawlOutcome::Success => {
                info!(
                    source = %self.source_name,
                    tenant_id = %self.tenant_id,
                    source_id = %self.source_id,
                    articles_found = self.stats.articles_found,
                    articles_new = self.stats.articles_new,
                    articles_updated = self.stats.articles_updated,
                    articles_skipped = self.stats.articles_skipped,
                    duration_ms = duration.as_millis() as u64,
                    "Crawl run completed successfully"
                );
            }
            CrawlOutcome::Partial => {
                warn!(
                    source = %self.source_name,
                    tenant_id = %self.tenant_id,
                    source_id = %self.source_id,
                    articles_found = self.stats.articles_found,
                    articles_new = self.stats.articles_new,
                    errors = self.stats.errors.len(),
                    first_error = ?self.stats.first_error(),
                    duration_ms = duration.as_millis() as u64,
                    "Crawl run completed with partial errors"
                );
            }
            CrawlOutcome::Failed => {
                error!(
                    source = %self.source_name,
                    tenant_id = %self.tenant_id,
                    source_id = %self.source_id,
                    errors = self.stats.errors.len(),
                    first_error = ?self.stats.first_error(),
                    duration_ms = duration.as_millis() as u64,
                    "Crawl run failed"
                );
            }
        }

        (outcome, self.stats)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crawl_outcome_as_str() {
        assert_eq!(CrawlOutcome::Success.as_str(), "success");
        assert_eq!(CrawlOutcome::Partial.as_str(), "partial");
        assert_eq!(CrawlOutcome::Failed.as_str(), "failed");
    }

    #[test]
    fn crawl_outcome_display() {
        assert_eq!(format!("{}", CrawlOutcome::Success), "success");
    }

    #[test]
    fn crawl_stats_outcome_success_when_no_errors() {
        let stats = CrawlStats {
            articles_found: 10,
            articles_new: 5,
            ..Default::default()
        };
        assert_eq!(stats.outcome(), CrawlOutcome::Success);
    }

    #[test]
    fn crawl_stats_outcome_partial_when_some_articles_and_errors() {
        let stats = CrawlStats {
            articles_found: 10,
            articles_new: 5,
            errors: vec!["timeout".to_string()],
            ..Default::default()
        };
        assert_eq!(stats.outcome(), CrawlOutcome::Partial);
    }

    #[test]
    fn crawl_stats_outcome_failed_when_no_articles_and_errors() {
        let stats = CrawlStats {
            articles_found: 0,
            errors: vec!["connection refused".to_string()],
            ..Default::default()
        };
        assert_eq!(stats.outcome(), CrawlOutcome::Failed);
    }

    #[test]
    fn crawl_stats_merge() {
        let mut a = CrawlStats {
            articles_found: 5,
            articles_new: 3,
            articles_updated: 1,
            articles_skipped: 1,
            errors: vec!["err1".to_string()],
        };
        let b = CrawlStats {
            articles_found: 3,
            articles_new: 2,
            articles_updated: 0,
            articles_skipped: 1,
            errors: vec!["err2".to_string()],
        };

        a.merge(&b);
        assert_eq!(a.articles_found, 8);
        assert_eq!(a.articles_new, 5);
        assert_eq!(a.articles_updated, 1);
        assert_eq!(a.articles_skipped, 2);
        assert_eq!(a.errors.len(), 2);
    }

    #[test]
    fn crawl_stats_first_error() {
        let stats = CrawlStats {
            errors: vec!["first".to_string(), "second".to_string()],
            ..Default::default()
        };
        assert_eq!(stats.first_error(), Some("first".to_string()));
    }

    #[test]
    fn crawl_stats_first_error_none_when_empty() {
        let stats = CrawlStats::default();
        assert!(stats.first_error().is_none());
    }

    #[test]
    fn crawl_logger_lifecycle() {
        let tenant_id = Uuid::new_v4();
        let source_id = Uuid::new_v4();

        let mut logger = CrawlLogger::start(tenant_id, source_id, "test_source");

        assert_eq!(logger.source_name(), "test_source");
        assert_eq!(logger.tenant_id(), tenant_id);
        assert_eq!(logger.source_id(), source_id);

        logger.stats_mut().articles_found = 10;
        logger.stats_mut().articles_new = 5;
        logger.stats_mut().articles_skipped = 3;

        assert!(logger.elapsed() >= std::time::Duration::ZERO);
        assert!(logger.duration_ms() >= 0);

        let (outcome, stats) = logger.finish();
        assert_eq!(outcome, CrawlOutcome::Success);
        assert_eq!(stats.articles_found, 10);
        assert_eq!(stats.articles_new, 5);
    }

    #[test]
    fn crawl_logger_records_errors() {
        let mut logger = CrawlLogger::start(Uuid::new_v4(), Uuid::new_v4(), "err_source");

        logger.record_error("http", "connection timeout");
        logger.record_error("parse", "invalid HTML");

        assert_eq!(logger.stats().errors.len(), 2);
        assert_eq!(
            logger.stats().first_error(),
            Some("connection timeout".to_string())
        );

        let (outcome, _) = logger.finish();
        assert_eq!(outcome, CrawlOutcome::Failed); // 0 articles + errors = failed
    }

    #[test]
    fn crawl_logger_partial_outcome() {
        let mut logger = CrawlLogger::start(Uuid::new_v4(), Uuid::new_v4(), "partial_source");

        logger.stats_mut().articles_found = 5;
        logger.stats_mut().articles_new = 3;
        logger.record_error("http", "one page timeout");

        let (outcome, _) = logger.finish();
        assert_eq!(outcome, CrawlOutcome::Partial);
    }
}
