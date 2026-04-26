use std::{env, sync::Arc};

use law_eye_crawler::{
    AdapterRegistry, ConcurrencyConfig, ConcurrencyController, CrawlJobConfig, CrawlOrchestrator,
    DomainRateLimiter, RateLimiterConfig,
};
use serde_json::json;
use uuid::Uuid;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = tracing_subscriber::fmt::try_init();

    let args = env::args().collect::<Vec<_>>();
    if args.len() < 4 {
        eprintln!(
            "usage: cargo run -p law-eye-crawler --example public_source_probe -- <kind> <url> <source_name> [respect_robots:true|false]"
        );
        std::process::exit(2);
    }

    let kind = args[1].clone();
    let url = args[2].clone();
    let source_name = args[3].clone();
    let respect_robots = args
        .get(4)
        .map(|raw| {
            matches!(
                raw.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(true);

    let registry = AdapterRegistry::with_defaults()?;
    let rate_limiter = Arc::new(DomainRateLimiter::new(RateLimiterConfig {
        burst_size: 10,
        tokens_per_second: 20.0,
    }));
    let concurrency = Arc::new(ConcurrencyController::new(ConcurrencyConfig::default()));
    let orchestrator = CrawlOrchestrator::new(registry, rate_limiter, concurrency);

    let job = CrawlJobConfig {
        tenant_id: Uuid::nil(),
        source_id: Uuid::new_v4(),
        kind,
        source_name,
        url,
        config: json!({}),
        encoding: None,
        render_mode: None,
        allow_internal: false,
        enable_ai: false,
        respect_robots,
    };

    let result = orchestrator.run_job(&job).await;

    println!("outcome={}", result.outcome);
    println!("duration_ms={}", result.duration_ms);
    println!("articles_found={}", result.stats.articles_found);
    println!("articles_new={}", result.stats.articles_new);
    println!("articles_updated={}", result.stats.articles_updated);
    println!("articles_skipped={}", result.stats.articles_skipped);
    println!("errors={}", result.stats.errors.len());
    for (index, error) in result.stats.errors.iter().enumerate() {
        println!("error[{index}]={error}");
    }

    for (index, article) in result.articles.iter().take(5).enumerate() {
        let title = if article.title.chars().count() > 80 {
            format!("{}...", article.title.chars().take(80).collect::<String>())
        } else {
            article.title.clone()
        };
        println!("article[{index}].title={title}");
        println!("article[{index}].link={}", article.link);
        if let Some(published_at) = article.published_at {
            println!("article[{index}].published_at={published_at}");
        }
    }

    Ok(())
}
