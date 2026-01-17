use law_eye_ai::{AiService, ArticleAiResult};
use law_eye_common::AppConfig;
use law_eye_core::ArticleService;
use law_eye_crawler::{RawArticle, RssFetcher, SpiderConfig, WebSpider};
use law_eye_db::{create_pool, CreateArticle};
use law_eye_queue::{AiTask, AiTaskType, IngestTask, PushTask, TaskQueue};
use sqlx::PgPool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

struct Worker {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    rss_fetcher: RssFetcher,
    web_spider: WebSpider,
    ai_service: Option<AiService>,
    shutdown: Arc<AtomicBool>,
}

impl Worker {
    fn new(pool: PgPool, task_queue: TaskQueue, ai_service: Option<AiService>, shutdown: Arc<AtomicBool>) -> Self {
        Self {
            pool,
            task_queue: Arc::new(task_queue),
            rss_fetcher: RssFetcher::new(),
            web_spider: WebSpider::new(),
            ai_service,
            shutdown,
        }
    }

    async fn run(&self) -> anyhow::Result<()> {
        info!("Worker started, waiting for tasks...");

        while !self.shutdown.load(Ordering::Relaxed) {
            if let Some(task) = self
                .task_queue
                .dequeue::<IngestTask>("queue:ingest", 5)
                .await?
            {
                self.process_ingest_task(task).await;
            }

            if self.shutdown.load(Ordering::Relaxed) {
                break;
            }

            if let Some(task) = self
                .task_queue
                .dequeue::<AiTask>("queue:ai", 1)
                .await?
            {
                self.process_ai_task(task).await;
            }

            if self.shutdown.load(Ordering::Relaxed) {
                break;
            }

            if let Some(task) = self
                .task_queue
                .dequeue::<PushTask>("queue:push", 1)
                .await?
            {
                self.process_push_task(task).await;
            }
        }

        info!("Worker shutting down gracefully...");
        Ok(())
    }

    async fn process_ingest_task(&self, task: IngestTask) {
        info!("Processing ingest task for source: {}", task.source_id);

        let articles = match task.source_type.as_str() {
            "rss" => self.rss_fetcher.fetch(&task.url).await,
            "spider" => {
                let config: SpiderConfig = match serde_json::from_value(task.config) {
                    Ok(c) => c,
                    Err(e) => {
                        error!("Failed to parse spider config: {}", e);
                        return;
                    }
                };
                self.web_spider.fetch(&task.url, &config).await
            }
            _ => {
                error!("Unknown source type: {}", task.source_type);
                return;
            }
        };

        match articles {
            Ok(articles) => {
                let article_service = ArticleService::new(self.pool.clone());
                let mut saved = 0;

                for article in articles {
                    match self
                        .save_article(&article_service, task.source_id, article)
                        .await
                    {
                        Ok(Some(article_id)) => {
                            saved += 1;
                            if self.ai_service.is_some() {
                                let ai_task = AiTask {
                                    article_id,
                                    task_type: AiTaskType::Full,
                                };
                                if let Err(e) = self.task_queue.enqueue("queue:ai", &ai_task).await {
                                    error!("Failed to enqueue AI task: {}", e);
                                }
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            error!("Failed to save article: {}", e);
                        }
                    }
                }

                info!("Saved {} articles from source {}", saved, task.source_id);
            }
            Err(e) => {
                error!("Failed to fetch articles: {}", e);
            }
        }
    }

    async fn save_article(
        &self,
        service: &ArticleService,
        source_id: uuid::Uuid,
        article: RawArticle,
    ) -> anyhow::Result<Option<uuid::Uuid>> {
        if service.exists_by_link(&article.link).await? {
            return Ok(None);
        }

        let create = CreateArticle {
            source_id,
            title: article.title,
            link: article.link,
            content: article.content,
            author: article.author,
            published_at: article.published_at,
        };

        let created = service.create(create).await?;
        Ok(Some(created.id))
    }

    async fn process_ai_task(&self, task: AiTask) {
        info!("Processing AI task for article: {}", task.article_id);

        let ai_service = match &self.ai_service {
            Some(s) => s,
            None => {
                warn!("AI service not configured, skipping AI task");
                return;
            }
        };

        let article_service = ArticleService::new(self.pool.clone());

        let article = match article_service.get_by_id(task.article_id).await {
            Ok(a) => a,
            Err(e) => {
                error!("Failed to get article {}: {}", task.article_id, e);
                return;
            }
        };

        let content = article.content.as_deref().unwrap_or("");
        if content.is_empty() {
            warn!("Article {} has no content, skipping AI processing", task.article_id);
            return;
        }

        let result = match task.task_type {
            AiTaskType::Full => ai_service.process_article(&article.title, content).await,
            _ => {
                warn!("Partial AI task types not yet implemented");
                return;
            }
        };

        match result {
            Ok(ai_result) => {
                if let Err(e) = self
                    .update_article_with_ai(&article_service, task.article_id, &ai_result)
                    .await
                {
                    error!("Failed to update article with AI result: {}", e);
                } else {
                    info!("AI processing completed for article: {}", task.article_id);
                }
            }
            Err(e) => {
                error!("AI processing failed for article {}: {}", task.article_id, e);
            }
        }
    }

    async fn update_article_with_ai(
        &self,
        _service: &ArticleService,
        article_id: uuid::Uuid,
        result: &ArticleAiResult,
    ) -> anyhow::Result<()> {
        let metadata = result.to_metadata();

        sqlx::query(
            r#"
            UPDATE articles SET
                summary = COALESCE(NULLIF($2, ''), summary),
                risk_score = CASE WHEN $3 > 0 THEN $3 ELSE risk_score END,
                ai_metadata = $4,
                status = 'ai_processed',
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(&result.summary)
        .bind(result.risk_score as i32)
        .bind(&metadata)
        .execute(&self.pool)
        .await?;

        if !result.category_slug.is_empty() {
            sqlx::query(
                r#"
                UPDATE articles SET
                    category_id = (SELECT id FROM categories WHERE slug = $2)
                WHERE id = $1
                "#,
            )
            .bind(article_id)
            .bind(&result.category_slug)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    async fn process_push_task(&self, task: PushTask) {
        info!("Processing push task for {} articles", task.article_ids.len());

        let client = reqwest::Client::new();
        let article_service = ArticleService::new(self.pool.clone());

        let mut articles = Vec::new();
        for id in &task.article_ids {
            if let Ok(article) = article_service.get_by_id(*id).await {
                articles.push(article);
            }
        }

        if articles.is_empty() {
            return;
        }

        let message = format_push_message(&articles);

        let payload = serde_json::json!({
            "content": message,
            "articles": articles.len()
        });

        match client.post(&task.webhook_url).json(&payload).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    info!("Push sent successfully");
                } else {
                    error!("Push failed with status: {}", resp.status());
                }
            }
            Err(e) => {
                error!("Push request failed: {}", e);
            }
        }
    }
}

fn format_push_message(articles: &[law_eye_db::Article]) -> String {
    let mut msg = String::from("📰 法眼资讯速递

");

    for article in articles.iter().take(10) {
        msg.push_str(&format!("- {}
  {}

", article.title, article.link));
    }

    if articles.len() > 10 {
        msg.push_str(&format!("... 及其他 {} 条资讯
", articles.len() - 10));
    }

    msg
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::load().unwrap_or_default();

    info!("Starting Law Eye Worker...");

    let pool = create_pool(&config.database.url, config.database.max_connections).await?;

    let task_queue = TaskQueue::new(&config.redis.url)?;

    let ai_service = if !config.ai.api_key.is_empty() {
        info!("AI service enabled");
        Some(AiService::new(
            &config.ai.api_key,
            config.ai.base_url.as_deref(),
            Some(&config.ai.model),
        ))
    } else {
        warn!("AI service not configured (missing api_key)");
        None
    };

    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_clone = shutdown.clone();

    tokio::spawn(async move {
        let _ = signal::ctrl_c().await;
        info!("Received shutdown signal (Ctrl+C)");
        shutdown_clone.store(true, Ordering::Relaxed);
    });

    let worker = Worker::new(pool, task_queue, ai_service, shutdown);
    worker.run().await
}
