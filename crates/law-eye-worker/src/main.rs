use anyhow::Context;
use law_eye_ai::{AiService, ClassifyResult, RiskAssessment, SummaryResult, TagsResult};
use law_eye_common::AppConfig;
use law_eye_core::{ArticleService, SourceService};
use law_eye_crawler::{RawArticle, RssFetcher, SpiderConfig, WebSpider};
use law_eye_db::{create_pool_with_session_role_retry, CreateArticle};
use law_eye_queue::{AiTask, AiTaskType, IngestTask, PushTask, ReservedTask, TaskQueue};
use serde_json::json;
use sqlx::PgPool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::signal;
use tokio::time::{Duration, Instant};
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const QUEUE_INGEST: &str = "queue:ingest";
const QUEUE_AI: &str = "queue:ai";
const QUEUE_PUSH: &str = "queue:push";

const MAINTENANCE_INTERVAL_SECS: u64 = 15;
const MAINTENANCE_MAX_BATCH: usize = 200;

const DB_CONNECT_MAX_ATTEMPTS: u32 = 30;

const VISIBILITY_TIMEOUT_INGEST_MS: i64 = 10 * 60 * 1_000;
const VISIBILITY_TIMEOUT_AI_MS: i64 = 20 * 60 * 1_000;
const VISIBILITY_TIMEOUT_PUSH_MS: i64 = 5 * 60 * 1_000;

struct Worker {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    rss_fetcher: RssFetcher,
    web_spider: WebSpider,
    ai_service: Option<AiService>,
    shutdown: Arc<AtomicBool>,
}

impl Worker {
    fn new(
        pool: PgPool,
        task_queue: TaskQueue,
        ai_service: Option<AiService>,
        shutdown: Arc<AtomicBool>,
    ) -> Self {
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

        let maintenance_interval = Duration::from_secs(MAINTENANCE_INTERVAL_SECS);
        let mut last_maintenance = Instant::now() - maintenance_interval;

        while !self.shutdown.load(Ordering::Relaxed) {
            if last_maintenance.elapsed() >= maintenance_interval {
                if let Err(e) = self.run_queue_maintenance().await {
                    error!("Queue maintenance failed: {}", e);
                }
                last_maintenance = Instant::now();
            }

            if let Some(reserved) = self
                .task_queue
                .reserve_retryable::<IngestTask>(QUEUE_INGEST, 5)
                .await?
            {
                self.handle_ingest_reserved(reserved).await;
            }

            if self.shutdown.load(Ordering::Relaxed) {
                break;
            }

            if let Some(reserved) = self
                .task_queue
                .reserve_retryable::<AiTask>(QUEUE_AI, 1)
                .await?
            {
                self.handle_ai_reserved(reserved).await;
            }

            if self.shutdown.load(Ordering::Relaxed) {
                break;
            }

            if let Some(reserved) = self
                .task_queue
                .reserve_retryable::<PushTask>(QUEUE_PUSH, 1)
                .await?
            {
                self.handle_push_reserved(reserved).await;
            }
        }

        info!("Worker shutting down gracefully...");
        Ok(())
    }

    async fn run_queue_maintenance(&self) -> anyhow::Result<()> {
        let queues = [
            (QUEUE_INGEST, VISIBILITY_TIMEOUT_INGEST_MS),
            (QUEUE_AI, VISIBILITY_TIMEOUT_AI_MS),
            (QUEUE_PUSH, VISIBILITY_TIMEOUT_PUSH_MS),
        ];

        for (queue, visibility_timeout_ms) in queues {
            if let Err(e) = self.task_queue.process_delayed_tasks(queue).await {
                error!("Failed to process delayed tasks for {}: {}", queue, e);
            }
            if let Err(e) = self
                .task_queue
                .requeue_stuck_tasks(queue, visibility_timeout_ms, MAINTENANCE_MAX_BATCH)
                .await
            {
                error!("Failed to re-queue stuck tasks for {}: {}", queue, e);
            }
        }

        Ok(())
    }

    async fn begin_tenant_tx(
        &self,
        tenant_id: uuid::Uuid,
    ) -> anyhow::Result<sqlx::Transaction<'_, sqlx::Postgres>> {
        let mut tx = self.pool.begin().await?;
        let tenant_id = if tenant_id.is_nil() {
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants WHERE slug = 'default'")
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| anyhow::anyhow!("Default tenant not found"))?
        } else {
            tenant_id
        };
        sqlx::query("SELECT set_config('app.tenant_id', $1, true)")
            .bind(tenant_id.to_string())
            .execute(&mut *tx)
            .await?;
        Ok(tx)
    }

    async fn handle_ingest_reserved(&self, reserved: ReservedTask<IngestTask>) {
        let queue = QUEUE_INGEST;
        let task = reserved.task;
        let task_id = task.id;

        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack duplicate ingest task {}: {}", task_id, e);
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check ingest task {} done: {}", task_id, e);
                return;
            }
        }

        let payload = task.payload.clone();
        match self.process_ingest_task(payload).await {
            Ok(()) => {
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark ingest task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack ingest task {}: {}", task_id, e);
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                match self
                    .task_queue
                    .retry_or_dead_letter(queue, task, error_msg)
                    .await
                {
                    Ok(_) => {
                        if let Err(e) = self
                            .task_queue
                            .ack_reserved(queue, &reserved.raw_payload)
                            .await
                        {
                            error!("Failed to ack failed ingest task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for ingest task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
        }
    }

    async fn handle_ai_reserved(&self, reserved: ReservedTask<AiTask>) {
        let queue = QUEUE_AI;
        let task = reserved.task;
        let task_id = task.id;

        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack duplicate AI task {}: {}", task_id, e);
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check AI task {} done: {}", task_id, e);
                return;
            }
        }

        let payload = task.payload.clone();
        match self.process_ai_task(payload).await {
            Ok(()) => {
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark AI task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack AI task {}: {}", task_id, e);
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                match self
                    .task_queue
                    .retry_or_dead_letter(queue, task, error_msg)
                    .await
                {
                    Ok(_) => {
                        if let Err(e) = self
                            .task_queue
                            .ack_reserved(queue, &reserved.raw_payload)
                            .await
                        {
                            error!("Failed to ack failed AI task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for AI task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
        }
    }

    async fn handle_push_reserved(&self, reserved: ReservedTask<PushTask>) {
        let queue = QUEUE_PUSH;
        let task = reserved.task;
        let task_id = task.id;

        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack duplicate push task {}: {}", task_id, e);
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check push task {} done: {}", task_id, e);
                return;
            }
        }

        let payload = task.payload.clone();
        match self.process_push_task(payload).await {
            Ok(()) => {
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark push task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack push task {}: {}", task_id, e);
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                match self
                    .task_queue
                    .retry_or_dead_letter(queue, task, error_msg)
                    .await
                {
                    Ok(_) => {
                        if let Err(e) = self
                            .task_queue
                            .ack_reserved(queue, &reserved.raw_payload)
                            .await
                        {
                            error!("Failed to ack failed push task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for push task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
        }
    }

    async fn process_ingest_task(&self, task: IngestTask) -> anyhow::Result<()> {
        info!("Processing ingest task for source: {}", task.source_id);

        let tenant_id = task.tenant_id;
        if tenant_id.is_nil() {
            warn!("Ingest task missing tenant_id; falling back to default tenant");
        }

        let source_service = SourceService::new(self.pool.clone());

        let articles = match task.source_type.as_str() {
            "rss" => self.rss_fetcher.fetch(&task.url).await,
            "spider" => {
                let config: SpiderConfig = match serde_json::from_value(task.config) {
                    Ok(c) => c,
                    Err(e) => {
                        let msg = format!("Failed to parse spider config: {}", e);
                        error!("{}", msg);
                        let _ = source_service
                            .update_last_fetch(tenant_id, task.source_id, Some(msg.as_str()))
                            .await;
                        return Err(anyhow::anyhow!(msg));
                    }
                };
                self.web_spider.fetch(&task.url, &config).await
            }
            _ => {
                let msg = format!("Unknown source type: {}", task.source_type);
                error!("{}", msg);
                let _ = source_service
                    .update_last_fetch(tenant_id, task.source_id, Some(msg.as_str()))
                    .await;
                return Err(anyhow::anyhow!(msg));
            }
        };

        match articles {
            Ok(articles) => {
                let article_service = ArticleService::new(self.pool.clone());
                let mut saved = 0;

                for article in articles {
                    match self
                        .save_article(&article_service, tenant_id, task.source_id, article)
                        .await
                    {
                        Ok(Some(article_id)) => {
                            saved += 1;
                            if self.ai_service.is_some() {
                                let ai_task = AiTask {
                                    tenant_id,
                                    article_id,
                                    task_type: AiTaskType::Full,
                                };
                                if let Err(e) =
                                    self.task_queue.enqueue_retryable(QUEUE_AI, ai_task).await
                                {
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
                let _ = source_service
                    .update_last_fetch(tenant_id, task.source_id, None)
                    .await;
                Ok(())
            }
            Err(e) => {
                let msg = e.to_string();
                let msg = msg.chars().take(500).collect::<String>();
                error!("Failed to fetch articles: {}", msg);
                let _ = source_service
                    .update_last_fetch(tenant_id, task.source_id, Some(msg.as_str()))
                    .await;
                Err(anyhow::anyhow!(msg))
            }
        }
    }

    async fn save_article(
        &self,
        service: &ArticleService,
        tenant_id: uuid::Uuid,
        source_id: uuid::Uuid,
        article: RawArticle,
    ) -> anyhow::Result<Option<uuid::Uuid>> {
        if service.exists_by_link(tenant_id, &article.link).await? {
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

        let created = service.create(tenant_id, create).await?;
        Ok(Some(created.id))
    }

    async fn process_ai_task(&self, task: AiTask) -> anyhow::Result<()> {
        info!(
            "Processing AI task for article: {} (type={:?})",
            task.article_id, task.task_type
        );

        let tenant_id = task.tenant_id;
        if tenant_id.is_nil() {
            warn!("AI task missing tenant_id; falling back to default tenant");
        }

        let ai_service = match &self.ai_service {
            Some(s) => s,
            None => {
                warn!("AI service not configured, cannot process AI task");
                return Err(anyhow::anyhow!("AI service not configured"));
            }
        };

        let article_service = ArticleService::new(self.pool.clone());

        let article = match article_service.get_by_id(tenant_id, task.article_id).await {
            Ok(a) => a,
            Err(e) => {
                error!("Failed to get article {}: {}", task.article_id, e);
                return Err(anyhow::anyhow!(
                    "Failed to get article {}: {}",
                    task.article_id,
                    e
                ));
            }
        };

        let content = article.content.as_deref().unwrap_or("").trim();
        if content.is_empty() {
            warn!(
                "Article {} has no content, skipping AI processing",
                task.article_id
            );
            return Ok(());
        }

        match task.task_type {
            AiTaskType::Full => {
                let (classify, summary, risk, tags) = tokio::try_join!(
                    ai_service.classify(&article.title, content),
                    ai_service.summarize(&article.title, content),
                    ai_service.assess_risk(&article.title, content),
                    ai_service.extract_tags(&article.title, content),
                )
                .map_err(|e| anyhow::anyhow!("AI full processing failed: {}", e))?;

                self.update_article_full(
                    tenant_id,
                    task.article_id,
                    &classify,
                    &summary,
                    &risk,
                    &tags,
                )
                .await?;

                // Embedding 可能较慢且对外部依赖敏感：拆成单独的任务，失败可独立重试/DLQ。
                let embed_task = AiTask {
                    tenant_id,
                    article_id: task.article_id,
                    task_type: AiTaskType::Embed,
                };
                if let Err(e) = self
                    .task_queue
                    .enqueue_retryable(QUEUE_AI, embed_task)
                    .await
                {
                    warn!(
                        "Failed to enqueue embed task for article {}: {}",
                        task.article_id, e
                    );
                }

                info!(
                    "AI full processing completed for article: {}",
                    task.article_id
                );
                Ok(())
            }
            AiTaskType::Classify => {
                let classify = ai_service
                    .classify(&article.title, content)
                    .await
                    .map_err(|e| anyhow::anyhow!("AI classify failed: {}", e))?;
                self.update_article_classify(tenant_id, task.article_id, &classify)
                    .await?;
                info!("AI classify completed for article: {}", task.article_id);
                Ok(())
            }
            AiTaskType::Summarize => {
                let summary = ai_service
                    .summarize(&article.title, content)
                    .await
                    .map_err(|e| anyhow::anyhow!("AI summarize failed: {}", e))?;
                self.update_article_summary(tenant_id, task.article_id, &summary)
                    .await?;
                info!("AI summarize completed for article: {}", task.article_id);
                Ok(())
            }
            AiTaskType::RiskAssess => {
                let risk = ai_service
                    .assess_risk(&article.title, content)
                    .await
                    .map_err(|e| anyhow::anyhow!("AI risk assessment failed: {}", e))?;
                self.update_article_risk(tenant_id, task.article_id, &risk)
                    .await?;
                info!(
                    "AI risk assessment completed for article: {}",
                    task.article_id
                );
                Ok(())
            }
            AiTaskType::ExtractTags => {
                let tags = ai_service
                    .extract_tags(&article.title, content)
                    .await
                    .map_err(|e| anyhow::anyhow!("AI tag extraction failed: {}", e))?;
                self.update_article_tags(tenant_id, task.article_id, &tags)
                    .await?;
                info!(
                    "AI tag extraction completed for article: {}",
                    task.article_id
                );
                Ok(())
            }
            AiTaskType::Embed => {
                let text = format!("{}\n\n{}", article.title, content);
                let chunks = ai_service
                    .embed_chunks(&text)
                    .await
                    .map_err(|e| anyhow::anyhow!("AI embed_chunks failed: {}", e))?;
                self.replace_article_chunks(tenant_id, task.article_id, chunks)
                    .await?;
                self.mark_ai_embed_done(tenant_id, task.article_id).await?;
                info!("AI embedding completed for article: {}", task.article_id);
                Ok(())
            }
        }
    }

    async fn update_article_full(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        classify: &ClassifyResult,
        summary: &SummaryResult,
        risk: &RiskAssessment,
        tags: &TagsResult,
    ) -> anyhow::Result<()> {
        let tasks = json!({
            "full": true,
            "classify": true,
            "summarize": true,
            "risk_assess": true,
            "extract_tags": true,
        });

        let metadata_patch = json!({
            "category_confidence": classify.confidence,
            "sub_categories": &classify.sub_categories,
            "reasoning": &classify.reasoning,
            "key_points": &summary.key_points,
            "entities": &summary.entities,
            "risk_dimensions": &risk.dimensions,
            "recommendations": &risk.recommendations,
            "risk_level": format!("{:?}", risk.level).to_lowercase(),
            "abstract": &summary.abstract_text,
            "tasks": tasks,
        });

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        sqlx::query(
            r#"
            UPDATE articles SET
                summary = COALESCE(NULLIF($2, ''), summary),
                risk_score = $3,
                category_id = (SELECT id FROM categories WHERE slug = $4),
                tags = $5,
                keywords = $6,
                ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || $7::jsonb,
                ai_processed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(&summary.brief)
        .bind(risk.score as i32)
        .bind(&classify.category_slug)
        .bind(&tags.tags)
        .bind(&tags.keywords)
        .bind(&metadata_patch)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(())
    }

    async fn update_article_classify(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        classify: &ClassifyResult,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "category_confidence": classify.confidence,
            "sub_categories": &classify.sub_categories,
            "reasoning": &classify.reasoning,
        });

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        sqlx::query(
            r#"
            UPDATE articles SET
                category_id = (SELECT id FROM categories WHERE slug = $2),
                ai_metadata = jsonb_set(COALESCE(ai_metadata, '{}'::jsonb) || $3::jsonb, '{tasks,classify}', 'true'::jsonb, true),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(&classify.category_slug)
        .bind(&metadata_patch)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(())
    }

    async fn update_article_summary(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        summary: &SummaryResult,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "key_points": &summary.key_points,
            "entities": &summary.entities,
            "abstract": &summary.abstract_text,
        });

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        sqlx::query(
            r#"
            UPDATE articles SET
                summary = COALESCE(NULLIF($2, ''), summary),
                ai_metadata = jsonb_set(COALESCE(ai_metadata, '{}'::jsonb) || $3::jsonb, '{tasks,summarize}', 'true'::jsonb, true),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(&summary.brief)
        .bind(&metadata_patch)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(())
    }

    async fn update_article_risk(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        risk: &RiskAssessment,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "risk_dimensions": &risk.dimensions,
            "recommendations": &risk.recommendations,
            "risk_level": format!("{:?}", risk.level).to_lowercase(),
        });

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        sqlx::query(
            r#"
            UPDATE articles SET
                risk_score = $2,
                ai_metadata = jsonb_set(COALESCE(ai_metadata, '{}'::jsonb) || $3::jsonb, '{tasks,risk_assess}', 'true'::jsonb, true),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(risk.score as i32)
        .bind(&metadata_patch)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(())
    }

    async fn update_article_tags(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        tags: &TagsResult,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "tags": &tags.tags,
            "keywords": &tags.keywords,
        });

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        sqlx::query(
            r#"
            UPDATE articles SET
                tags = $2,
                keywords = $3,
                ai_metadata = jsonb_set(COALESCE(ai_metadata, '{}'::jsonb) || $4::jsonb, '{tasks,extract_tags}', 'true'::jsonb, true),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(&tags.tags)
        .bind(&tags.keywords)
        .bind(&metadata_patch)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(())
    }

    async fn replace_article_chunks(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        chunks: Vec<(String, law_eye_ai::EmbeddingResult)>,
    ) -> anyhow::Result<()> {
        const EXPECTED_VECTOR_DIM: usize = 1536;

        let mut tx = self.begin_tenant_tx(tenant_id).await?;

        sqlx::query("DELETE FROM article_chunks WHERE article_id = $1")
            .bind(article_id)
            .execute(&mut *tx)
            .await?;

        for (idx, (content, embedding)) in chunks.into_iter().enumerate() {
            if embedding.vector.len() != EXPECTED_VECTOR_DIM {
                return Err(anyhow::anyhow!(
                    "Embedding dimension mismatch for article {} chunk {}: expected {}, got {}",
                    article_id,
                    idx,
                    EXPECTED_VECTOR_DIM,
                    embedding.vector.len()
                ));
            }

            sqlx::query(
                r#"
                INSERT INTO article_chunks (article_id, chunk_index, content, embedding, token_count)
                VALUES ($1, $2, $3, $4::vector, $5)
                ON CONFLICT (tenant_id, article_id, chunk_index)
                DO UPDATE SET
                    content = EXCLUDED.content,
                    embedding = EXCLUDED.embedding,
                    token_count = EXCLUDED.token_count
                "#,
            )
            .bind(article_id)
            .bind(idx as i32)
            .bind(&content)
            .bind(&embedding.vector)
            .bind(embedding.token_count as i32)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn mark_ai_embed_done(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
    ) -> anyhow::Result<()> {
        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        sqlx::query(
            r#"
            UPDATE articles
            SET
                ai_metadata = jsonb_set(COALESCE(ai_metadata, '{}'::jsonb), '{tasks,embed}', 'true'::jsonb, true),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(())
    }

    async fn process_push_task(&self, task: PushTask) -> anyhow::Result<()> {
        info!(
            "Processing push task for {} articles",
            task.article_ids.len()
        );

        let tenant_id = task.tenant_id;
        if tenant_id.is_nil() {
            warn!("Push task missing tenant_id; falling back to default tenant");
        }

        let client = reqwest::Client::new();
        let article_service = ArticleService::new(self.pool.clone());

        let mut articles = Vec::new();
        for id in &task.article_ids {
            if let Ok(article) = article_service.get_by_id(tenant_id, *id).await {
                articles.push(article);
            }
        }

        if articles.is_empty() {
            return Ok(());
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
                    Ok(())
                } else {
                    error!("Push failed with status: {}", resp.status());
                    Err(anyhow::anyhow!(
                        "Push failed with status: {}",
                        resp.status()
                    ))
                }
            }
            Err(e) => {
                error!("Push request failed: {}", e);
                Err(anyhow::anyhow!("Push request failed: {}", e))
            }
        }
    }
}

fn format_push_message(articles: &[law_eye_db::Article]) -> String {
    let mut msg = String::from(
        "📰 法眼资讯速递

",
    );

    for article in articles.iter().take(10) {
        msg.push_str(&format!(
            "- {}
  {}

",
            article.title, article.link
        ));
    }

    if articles.len() > 10 {
        msg.push_str(&format!(
            "... 及其他 {} 条资讯
",
            articles.len() - 10
        ));
    }

    msg
}

async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal as unix_signal, SignalKind};

        let mut term =
            unix_signal(SignalKind::terminate()).expect("install SIGTERM handler for worker");

        tokio::select! {
            _ = signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }

    #[cfg(not(unix))]
    {
        let _ = signal::ctrl_c().await;
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let is_production = std::env::var_os("PRODUCTION").is_some();

    if is_production {
        tracing_subscriber::registry()
            .with(tracing_subscriber::EnvFilter::from_default_env())
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_current_span(true)
                    .with_span_list(true),
            )
            .init();
    } else {
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .with(tracing_subscriber::EnvFilter::from_default_env())
            .init();
    }

    let config = AppConfig::load()
        .await
        .context("load application config (file/env + optional Vault secrets)")?;

    info!("Starting Law Eye Worker...");

    let pool = create_pool_with_session_role_retry(
        &config.database.url,
        config.database.max_connections,
        config.database.session_role.as_deref(),
        DB_CONNECT_MAX_ATTEMPTS,
    )
    .await?;

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
        wait_for_shutdown_signal().await;
        info!("Received shutdown signal, shutting down gracefully");
        shutdown_clone.store(true, Ordering::Relaxed);
    });

    let worker = Worker::new(pool, task_queue, ai_service, shutdown);
    worker.run().await
}
