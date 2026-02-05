use anyhow::Context;
use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use law_eye_ai::{AiService, ClassifyResult, RiskAssessment, SummaryResult, TagsResult};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_common::AppConfig;
use law_eye_core::{ArticleService, SourceService};
use law_eye_crawler::{RssFetcher, SpiderConfig, WebSpider};
use law_eye_db::{
    create_pool_with_session_role, create_pool_with_session_role_retry, CreateArticle,
};
use law_eye_queue::{AiTask, AiTaskType, IngestTask, PushTask, ReservedTask, RetryableTask, TaskQueue};
use serde_json::json;
use sqlx::{types::Json as DbJson, PgPool, Postgres, QueryBuilder};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::time::{timeout, Duration, Instant};
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const QUEUE_INGEST: &str = "queue:ingest";
const QUEUE_AI: &str = "queue:ai";
const QUEUE_PUSH: &str = "queue:push";

const MAINTENANCE_INTERVAL_SECS: u64 = 15;
const MAINTENANCE_MAX_BATCH: usize = 200;
const OUTBOX_FLUSH_MAX_BATCH: i64 = 500;
const OUTBOX_LOCK_TIMEOUT_MS: i64 = 2 * 60 * 1_000;

const DB_CONNECT_MAX_ATTEMPTS: u32 = 30;

const VISIBILITY_TIMEOUT_INGEST_MS: i64 = 10 * 60 * 1_000;
const VISIBILITY_TIMEOUT_AI_MS: i64 = 20 * 60 * 1_000;
const VISIBILITY_TIMEOUT_PUSH_MS: i64 = 5 * 60 * 1_000;

// Hard per-task execution budgets. These should be < visibility timeouts to allow retries.
const TASK_TIMEOUT_INGEST_SECS: u64 = 8 * 60;
const TASK_TIMEOUT_AI_SECS: u64 = 10 * 60;
const TASK_TIMEOUT_PUSH_SECS: u64 = 60;

#[derive(Clone)]
struct WorkerHealthState {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    shutdown: Arc<AtomicBool>,
    check_timeout: Duration,
}

async fn health_live() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

async fn health_ready(
    State(state): State<WorkerHealthState>,
) -> (StatusCode, Json<serde_json::Value>) {
    if state.shutdown.load(Ordering::Relaxed) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "shutting_down" })),
        );
    }

    let db_ok = timeout(
        state.check_timeout,
        sqlx::query("SELECT 1").execute(&state.pool),
    )
    .await
    .is_ok_and(|res| res.is_ok());

    if !db_ok {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "unready", "dependency": "postgres" })),
        );
    }

    let redis_ok = timeout(state.check_timeout, state.task_queue.ping())
        .await
        .is_ok_and(|res| res.is_ok());

    if !redis_ok {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "unready", "dependency": "redis" })),
        );
    }

    (StatusCode::OK, Json(json!({ "status": "ready" })))
}

async fn serve_worker_health_http(
    host: String,
    port: u16,
    state: WorkerHealthState,
) -> anyhow::Result<()> {
    if port == 0 {
        warn!("worker health http port is 0; skipping http health server");
        return Ok(());
    }

    let addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .with_context(|| format!("bind worker health http to {addr}"))?;

    let app = Router::new()
        .route("/health/live", get(health_live))
        .route("/health/ready", get(health_ready))
        .route("/health", get(health_ready))
        .with_state(state);

    info!(%addr, "worker health http server started");
    axum::serve(listener, app)
        .await
        .context("serve worker health http")?;
    Ok(())
}

fn is_ai_rate_limited_error(error_msg: &str) -> bool {
    let msg = error_msg.to_ascii_lowercase();
    if msg.contains("insufficient_quota") {
        return false;
    }

    msg.contains("status code: 429")
        || msg.contains("http 429")
        || msg.contains("rate limit")
        || msg.contains("rate_limit")
        || msg.contains("too many requests")
        || msg.contains("ai_rate_limited")
}

async fn validate_webhook_url(raw: &str, allow_internal: bool) -> anyhow::Result<reqwest::Url> {
    let policy = OutboundUrlPolicy::https_or_http_internal(allow_internal);
    let url = validate_outbound_url(raw, &policy)
        .await
        .map_err(|e| anyhow::anyhow!("{}: {}", e.code(), e))?;
    Ok(url)
}

struct Worker {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    rss_fetcher: RssFetcher,
    web_spider: WebSpider,
    ai_service: Option<AiService>,
    push_http_client: reqwest::Client,
    allow_internal_source_urls: bool,
    allow_internal_webhook_urls: bool,
    worker_id: uuid::Uuid,
    shutdown: Arc<AtomicBool>,
}

#[derive(Debug, Clone)]
struct QueueOutboxEntry {
    queue: String,
    dedupe_key: String,
    payload: DbJson<serde_json::Value>,
}

#[derive(Debug, sqlx::FromRow)]
struct QueueOutboxRow {
    id: uuid::Uuid,
    queue: String,
    payload: DbJson<serde_json::Value>,
    attempts: i32,
}

impl QueueOutboxEntry {
    fn new(queue: &str, dedupe_key: String, payload: serde_json::Value) -> Self {
        Self {
            queue: queue.to_string(),
            dedupe_key,
            payload: DbJson(payload),
        }
    }
}

impl Worker {
    fn new(
        pool: PgPool,
        task_queue: TaskQueue,
        ai_service: Option<AiService>,
        shutdown: Arc<AtomicBool>,
        allow_internal_source_urls: bool,
        allow_internal_webhook_urls: bool,
        push_http_client: reqwest::Client,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            pool,
            task_queue: Arc::new(task_queue),
            rss_fetcher: RssFetcher::new().context("create RSS fetcher")?,
            web_spider: WebSpider::new().context("create web spider")?,
            ai_service,
            push_http_client,
            allow_internal_source_urls,
            allow_internal_webhook_urls,
            worker_id: uuid::Uuid::new_v4(),
            shutdown,
        })
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

        self.flush_queue_outbox_all_tenants().await?;

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

    async fn resolve_tenant_id(&self, tenant_id: uuid::Uuid) -> anyhow::Result<uuid::Uuid> {
        if !tenant_id.is_nil() {
            return Ok(tenant_id);
        }

        sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants WHERE slug = 'default'")
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Default tenant not found"))
    }

    fn ai_task_dedupe_key(article_id: uuid::Uuid, task_type: &AiTaskType) -> String {
        let task_type = match task_type {
            AiTaskType::Classify => "classify",
            AiTaskType::Summarize => "summarize",
            AiTaskType::RiskAssess => "risk_assess",
            AiTaskType::ExtractTags => "extract_tags",
            AiTaskType::Embed => "embed",
            AiTaskType::Full => "full",
        };
        format!("ai:{article_id}:{task_type}")
    }

    fn outbox_retry_delay_ms(attempt: i32) -> i64 {
        const BASE_MS: i64 = 5_000;
        const MAX_MS: i64 = 60_000;

        let attempt = attempt.max(1) as u32;
        let shift = attempt.saturating_sub(1).min(16);
        let delay = BASE_MS.saturating_mul(1i64 << shift);
        delay.min(MAX_MS)
    }

    async fn insert_queue_outbox_entries(
        &self,
        tx: &mut sqlx::Transaction<'_, Postgres>,
        entries: &[QueueOutboxEntry],
    ) -> anyhow::Result<()> {
        if entries.is_empty() {
            return Ok(());
        }

        for chunk in entries.chunks(OUTBOX_FLUSH_MAX_BATCH as usize) {
            let mut qb: QueryBuilder<'_, Postgres> =
                QueryBuilder::new("INSERT INTO queue_outbox (queue, dedupe_key, payload) ");
            qb.push_values(chunk, |mut row, entry| {
                row.push_bind(&entry.queue)
                    .push_bind(&entry.dedupe_key)
                    .push_bind(&entry.payload);
            });
            qb.push(
                " ON CONFLICT (tenant_id, queue, dedupe_key) WHERE delivered_at IS NULL DO NOTHING",
            );
            qb.build().execute(tx.as_mut()).await?;
        }

        Ok(())
    }

    async fn flush_queue_outbox_all_tenants(&self) -> anyhow::Result<()> {
        let tenant_ids = sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants ORDER BY created_at")
            .fetch_all(&self.pool)
            .await?;

        for tenant_id in tenant_ids {
            if let Err(e) = self.flush_queue_outbox_for_tenant(tenant_id).await {
                error!(%tenant_id, "Queue outbox flush failed: {}", e);
            }
        }

        Ok(())
    }

    async fn flush_queue_outbox_for_tenant(&self, tenant_id: uuid::Uuid) -> anyhow::Result<()> {
        let mut lock_tx = self.begin_tenant_tx(tenant_id).await?;
        let rows = sqlx::query_as::<_, QueueOutboxRow>(
            r#"
            WITH candidates AS (
                SELECT id
                FROM queue_outbox
                WHERE delivered_at IS NULL
                  AND next_attempt_at <= NOW()
                  AND (
                    locked_at IS NULL
                    OR locked_at < NOW() - ($1 * INTERVAL '1 millisecond')
                  )
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT $2
            )
            UPDATE queue_outbox q
            SET locked_at = NOW(),
                locked_by = $3
            FROM candidates c
            WHERE q.id = c.id
            RETURNING q.id, q.queue, q.payload, q.attempts
            "#,
        )
        .bind(OUTBOX_LOCK_TIMEOUT_MS)
        .bind(OUTBOX_FLUSH_MAX_BATCH)
        .bind(self.worker_id)
        .fetch_all(&mut *lock_tx)
        .await?;
        lock_tx.commit().await?;

        if rows.is_empty() {
            return Ok(());
        }

        let mut results: Vec<(uuid::Uuid, Result<(), String>, i32)> = Vec::with_capacity(rows.len());
        for row in rows {
            let outcome = self
                .task_queue
                .enqueue(&row.queue, &row.payload.0)
                .await
                .map_err(|e| e.to_string());
            results.push((row.id, outcome, row.attempts));
        }

        let mut update_tx = self.begin_tenant_tx(tenant_id).await?;
        for (id, outcome, attempts) in results {
            match outcome {
                Ok(()) => {
                    sqlx::query(
                        r#"
                        UPDATE queue_outbox
                        SET delivered_at = NOW(),
                            last_error = NULL,
                            locked_at = NULL,
                            locked_by = NULL,
                            updated_at = NOW()
                        WHERE id = $1
                        "#,
                    )
                    .bind(id)
                    .execute(&mut *update_tx)
                    .await?;
                }
                Err(err_msg) => {
                    let err_msg = err_msg.chars().take(500).collect::<String>();
                    let new_attempt = attempts.saturating_add(1);
                    let delay_ms = Self::outbox_retry_delay_ms(new_attempt);
                    sqlx::query(
                        r#"
                        UPDATE queue_outbox
                        SET attempts = attempts + 1,
                            last_error = $2,
                            next_attempt_at = NOW() + ($3 * INTERVAL '1 millisecond'),
                            locked_at = NULL,
                            locked_by = NULL,
                            updated_at = NOW()
                        WHERE id = $1
                        "#,
                    )
                    .bind(id)
                    .bind(err_msg)
                    .bind(delay_ms)
                    .execute(&mut *update_tx)
                    .await?;
                }
            }
        }
        update_tx.commit().await?;

        Ok(())
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
        let result = timeout(
            Duration::from_secs(TASK_TIMEOUT_INGEST_SECS),
            self.process_ingest_task(payload),
        )
        .await;

        match result {
            Ok(Ok(())) => {
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
            Ok(Err(e)) => {
                let mut error_msg = e.to_string();
                if is_ai_rate_limited_error(&error_msg) {
                    error_msg = format!("AI_RATE_LIMITED: {}", error_msg);
                }
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
            Err(_) => {
                let error_msg = format!("TASK_TIMEOUT after {}s", TASK_TIMEOUT_INGEST_SECS);
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
                            error!("Failed to ack timed out ingest task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for timed out ingest task {}: {}",
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
        let result = timeout(
            Duration::from_secs(TASK_TIMEOUT_AI_SECS),
            self.process_ai_task(payload),
        )
        .await;

        match result {
            Ok(Ok(())) => {
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
            Ok(Err(e)) => {
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
            Err(_) => {
                let error_msg = format!("TASK_TIMEOUT after {}s", TASK_TIMEOUT_AI_SECS);
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
                            error!("Failed to ack timed out AI task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for timed out AI task {}: {}",
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
        let result = timeout(
            Duration::from_secs(TASK_TIMEOUT_PUSH_SECS),
            self.process_push_task(payload),
        )
        .await;

        match result {
            Ok(Ok(())) => {
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
            Ok(Err(e)) => {
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
            Err(_) => {
                let error_msg = format!("TASK_TIMEOUT after {}s", TASK_TIMEOUT_PUSH_SECS);
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
                            error!("Failed to ack timed out push task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for timed out push task {}: {}",
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
        let tenant_id = self.resolve_tenant_id(tenant_id).await?;

        let source_service = SourceService::new(self.pool.clone());

        let articles = match task.source_type.as_str() {
            "rss" => {
                self.rss_fetcher
                    .fetch(&task.url, self.allow_internal_source_urls)
                    .await
            }
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
                self.web_spider
                    .fetch(&task.url, &config, self.allow_internal_source_urls)
                    .await
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
                let mut seen_links = HashSet::with_capacity(articles.len());
                let mut create_articles = Vec::with_capacity(articles.len());

                for article in articles {
                    if seen_links.contains(&article.link) {
                        continue;
                    }
                    seen_links.insert(article.link.clone());

                    let title_raw = article.title;
                    let link = article.link;
                    let content_raw = article.content;
                    let author = article.author;
                    let published_at = article.published_at;

                    let title = law_eye_core::article::truncate_string_to_max_bytes(
                        title_raw,
                        law_eye_core::article::MAX_ARTICLE_TITLE_BYTES,
                    );
                    let content = content_raw.map(|value| {
                        law_eye_core::article::truncate_string_to_max_bytes(
                            value,
                            law_eye_core::article::MAX_ARTICLE_CONTENT_BYTES,
                        )
                    });

                    create_articles.push(CreateArticle {
                        source_id: task.source_id,
                        title,
                        link,
                        content,
                        author,
                        published_at,
                    });
                }

                let mut tx = self.begin_tenant_tx(tenant_id).await?;
                let saved_article_ids = article_service
                    .upsert_many_tx(&mut tx, &create_articles)
                    .await?;

                if self.ai_service.is_some() {
                    let mut outbox_entries = Vec::with_capacity(saved_article_ids.len());
                    for article_id in &saved_article_ids {
                        let ai_task = RetryableTask::new(AiTask {
                            tenant_id,
                            article_id: *article_id,
                            task_type: AiTaskType::Full,
                        });
                        let payload = serde_json::to_value(&ai_task)?;
                        outbox_entries.push(QueueOutboxEntry::new(
                            QUEUE_AI,
                            Self::ai_task_dedupe_key(*article_id, &AiTaskType::Full),
                            payload,
                        ));
                    }
                    self.insert_queue_outbox_entries(&mut tx, &outbox_entries)
                        .await?;
                }

                tx.commit().await?;

                if let Err(e) = self.flush_queue_outbox_for_tenant(tenant_id).await {
                    error!(%tenant_id, "Failed to flush queue outbox after ingest: {}", e);
                }

                info!(
                    "Upserted {} articles from source {}",
                    saved_article_ids.len(),
                    task.source_id
                );
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

    async fn process_ai_task(&self, task: AiTask) -> anyhow::Result<()> {
        info!(
            "Processing AI task for article: {} (type={:?})",
            task.article_id, task.task_type
        );

        let tenant_id = task.tenant_id;
        if tenant_id.is_nil() {
            warn!("AI task missing tenant_id; falling back to default tenant");
        }
        let tenant_id = self.resolve_tenant_id(tenant_id).await?;

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

                if let Err(e) = self.flush_queue_outbox_for_tenant(tenant_id).await {
                    error!(
                        %tenant_id,
                        article_id = %task.article_id,
                        "Failed to flush queue outbox after AI full: {}",
                        e
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
                category_id = (SELECT id FROM categories WHERE slug = $4 AND deleted_at IS NULL),
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

        let embed_task = RetryableTask::new(AiTask {
            tenant_id,
            article_id,
            task_type: AiTaskType::Embed,
        });
        let payload = serde_json::to_value(&embed_task)?;
        let outbox_entry = QueueOutboxEntry::new(
            QUEUE_AI,
            Self::ai_task_dedupe_key(article_id, &AiTaskType::Embed),
            payload,
        );
        self.insert_queue_outbox_entries(&mut tx, std::slice::from_ref(&outbox_entry))
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
                category_id = (SELECT id FROM categories WHERE slug = $2 AND deleted_at IS NULL),
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

        sqlx::query("UPDATE article_chunks SET deleted_at = NOW() WHERE article_id = $1 AND deleted_at IS NULL")
            .bind(article_id)
            .execute(&mut *tx)
            .await?;

        for (idx, (_, embedding)) in chunks.iter().enumerate() {
            if embedding.vector.len() != EXPECTED_VECTOR_DIM {
                return Err(anyhow::anyhow!(
                    "Embedding dimension mismatch for article {} chunk {}: expected {}, got {}",
                    article_id,
                    idx,
                    EXPECTED_VECTOR_DIM,
                    embedding.vector.len()
                ));
            }
        }

        const INSERT_BATCH_SIZE: usize = 200;
        for (batch_idx, batch) in chunks.chunks(INSERT_BATCH_SIZE).enumerate() {
            let base_idx = batch_idx * INSERT_BATCH_SIZE;

            let mut builder = sqlx::QueryBuilder::new(
                "INSERT INTO article_chunks (article_id, chunk_index, content, embedding, token_count) ",
            );

            builder.push_values(
                batch.iter().enumerate(),
                |mut row, (offset, (content, embedding))| {
                    row.push_bind(article_id);
                    row.push_bind((base_idx + offset) as i32);
                    row.push_bind(content);
                    row.push_bind(&embedding.vector);
                    row.push("::vector");
                    row.push_bind(embedding.token_count as i32);
                },
            );

            builder.push(
                " ON CONFLICT (tenant_id, article_id, chunk_index) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, token_count = EXCLUDED.token_count, deleted_at = NULL",
            );

            builder.build().execute(&mut *tx).await?;
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

        let webhook_url =
            validate_webhook_url(&task.webhook_url, self.allow_internal_webhook_urls).await?;
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

        match self
            .push_http_client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await
        {
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

        let mut term = match unix_signal(SignalKind::terminate()) {
            Ok(signal) => signal,
            Err(err) => {
                warn!(
                    error = %err,
                    "failed to install SIGTERM handler for worker; falling back to ctrl_c only"
                );
                let _ = signal::ctrl_c().await;
                return;
            }
        };

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

async fn run_healthcheck() -> anyhow::Result<()> {
    let config = AppConfig::load()
        .await
        .context("load application config (file/env + optional Vault secrets)")?;

    let check_timeout = Duration::from_secs(2);

    let pool = timeout(
        check_timeout,
        create_pool_with_session_role(
            &config.database.url,
            1,
            config.database.session_role.as_deref(),
        ),
    )
    .await
    .context("healthcheck: postgres connect timed out")??;

    timeout(check_timeout, sqlx::query("SELECT 1").execute(&pool))
        .await
        .context("healthcheck: postgres query timed out")?
        .context("healthcheck: postgres query failed")?;

    let task_queue = TaskQueue::new(&config.redis.url).context("healthcheck: init redis client")?;
    timeout(check_timeout, task_queue.ping())
        .await
        .context("healthcheck: redis ping timed out")?
        .context("healthcheck: redis ping failed")?;

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().any(|arg| arg == "--healthcheck") {
        run_healthcheck().await.context("healthcheck")?;
        return Ok(());
    }

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
    let task_queue_for_health = Arc::new(task_queue.clone());

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

    if config.worker.health_enabled {
        let timeout_ms = if config.worker.health_check_timeout_ms == 0 {
            2_000
        } else {
            config.worker.health_check_timeout_ms
        };
        let check_timeout = Duration::from_millis(timeout_ms);
        let host = config.worker.health_host.clone();
        let port = config.worker.health_port;
        let state = WorkerHealthState {
            pool: pool.clone(),
            task_queue: task_queue_for_health,
            shutdown: shutdown.clone(),
            check_timeout,
        };

        tokio::spawn(async move {
            if let Err(err) = serve_worker_health_http(host, port, state).await {
                error!(error = %err, "worker health http server exited");
            }
        });
    }

    let push_timeout_ms = if config.server.request_timeout_ms == 0 {
        warn!(
            "LAW_EYE__SERVER__REQUEST_TIMEOUT_MS is 0; using 30000ms for outbound webhook timeout"
        );
        30_000
    } else {
        config.server.request_timeout_ms
    };

    let push_http_client = reqwest::Client::builder()
        .timeout(Duration::from_millis(push_timeout_ms))
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("LawEyeWorker/1.0")
        .build()
        .context("build webhook http client")?;

    let worker = Worker::new(
        pool,
        task_queue,
        ai_service,
        shutdown,
        config.security.allow_internal_source_urls,
        config.security.allow_internal_webhook_urls,
        push_http_client,
    )?;
    worker.run().await
}

#[cfg(test)]
mod webhook_url_tests {
    use super::*;

    #[tokio::test]
    async fn validate_webhook_url_requires_https_for_external_by_default() {
        assert!(validate_webhook_url("http://example.com/hook", false)
            .await
            .is_err());
        assert!(validate_webhook_url("https://example.com/hook", false)
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn validate_webhook_url_blocks_internal_hosts_by_default() {
        assert!(validate_webhook_url("https://127.0.0.1/hook", false)
            .await
            .is_err());
        assert!(validate_webhook_url("https://localhost/hook", false)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn validate_webhook_url_allows_localhost_when_configured() {
        assert!(validate_webhook_url("http://127.0.0.1:1234/hook", true)
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn validate_webhook_url_rejects_userinfo_credentials() {
        assert!(
            validate_webhook_url("https://user:pass@example.com/hook", false)
                .await
                .is_err()
        );
    }
}
