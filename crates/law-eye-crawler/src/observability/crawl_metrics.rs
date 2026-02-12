use metrics::{counter, gauge, histogram};

/// Crawler business metrics emitted via the `metrics` crate.
///
/// These metrics are automatically scraped by the Prometheus exporter
/// already configured in `law-eye-api`. They provide deep visibility
/// into crawler health beyond HTTP-level counters.
///
/// ## Exposed Metrics
///
/// | Metric | Type | Labels | Description |
/// |---|---|---|---|
/// | `crawler_runs_total` | Counter | source, status | Total crawl runs |
/// | `crawler_articles_found_total` | Counter | source | Articles discovered |
/// | `crawler_articles_new_total` | Counter | source | New articles persisted |
/// | `crawler_articles_skipped_total` | Counter | source | Skipped (duplicate/quality) |
/// | `crawler_run_duration_seconds` | Histogram | source, status | Crawl run wall-clock time |
/// | `crawler_errors_total` | Counter | source, error_type | Errors by type |
/// | `crawler_active_runs` | Gauge | — | Currently running crawls |
/// | `crawler_ai_enrichment_duration_seconds` | Histogram | source | AI enrichment latency |
/// | `crawler_pipeline_duration_seconds` | Histogram | stage | Per-stage pipeline latency |
pub struct CrawlMetrics;

impl CrawlMetrics {
    // ---- Run-level metrics ----

    /// Record a completed crawl run.
    pub fn record_run(source: &str, status: &str, duration: std::time::Duration) {
        counter!("crawler_runs_total", "source" => source.to_string(), "status" => status.to_string())
            .increment(1);
        histogram!("crawler_run_duration_seconds", "source" => source.to_string(), "status" => status.to_string())
            .record(duration.as_secs_f64());
    }

    /// Increment the active runs gauge (call at crawl start).
    pub fn run_started() {
        gauge!("crawler_active_runs").increment(1.0);
    }

    /// Decrement the active runs gauge (call at crawl end).
    pub fn run_finished() {
        gauge!("crawler_active_runs").decrement(1.0);
    }

    // ---- Article-level metrics ----

    /// Record articles discovered during a crawl.
    pub fn record_articles_found(source: &str, count: u64) {
        counter!("crawler_articles_found_total", "source" => source.to_string())
            .increment(count);
    }

    /// Record new articles successfully persisted.
    pub fn record_articles_new(source: &str, count: u64) {
        counter!("crawler_articles_new_total", "source" => source.to_string())
            .increment(count);
    }

    /// Record articles skipped (dedup, quality filter, etc.).
    pub fn record_articles_skipped(source: &str, count: u64) {
        counter!("crawler_articles_skipped_total", "source" => source.to_string())
            .increment(count);
    }

    // ---- Error metrics ----

    /// Record a crawl error by type.
    pub fn record_error(source: &str, error_type: &str) {
        counter!("crawler_errors_total", "source" => source.to_string(), "error_type" => error_type.to_string())
            .increment(1);
    }

    // ---- AI enrichment metrics ----

    /// Record AI enrichment duration for a batch.
    pub fn record_ai_enrichment(source: &str, duration: std::time::Duration) {
        histogram!("crawler_ai_enrichment_duration_seconds", "source" => source.to_string())
            .record(duration.as_secs_f64());
    }

    // ---- Pipeline stage metrics ----

    /// Record a pipeline stage execution duration.
    pub fn record_pipeline_stage(stage: &str, duration: std::time::Duration) {
        histogram!("crawler_pipeline_duration_seconds", "stage" => stage.to_string())
            .record(duration.as_secs_f64());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_calls_do_not_panic_without_recorder() {
        // These should all be no-ops when no Prometheus recorder is installed
        CrawlMetrics::record_run("test", "success", std::time::Duration::from_secs(1));
        CrawlMetrics::run_started();
        CrawlMetrics::run_finished();
        CrawlMetrics::record_articles_found("test", 10);
        CrawlMetrics::record_articles_new("test", 5);
        CrawlMetrics::record_articles_skipped("test", 3);
        CrawlMetrics::record_error("test", "http");
        CrawlMetrics::record_ai_enrichment("test", std::time::Duration::from_millis(500));
        CrawlMetrics::record_pipeline_stage("cleaning", std::time::Duration::from_millis(10));
    }
}
