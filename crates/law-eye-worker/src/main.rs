use anyhow::Context;
use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use hmac::{Hmac, Mac};
use law_eye_ai::{
    AiService, ClassifyResult, Entity, EntityType, RiskAssessment, RiskDimension, RiskLevel,
    SummaryResult, TagsResult,
};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_common::AppConfig;
use law_eye_core::{
    source::CrawlFetchStats, ArticleService, CrawlLogService, DomainEventInput, DomainEventService,
    KnowledgeService, ObjectService, ReportService, ReportTemplateService, SourceService,
    OBJECT_KIND_REPORT_EXPORT, OBJECT_KIND_USER_AVATAR,
};
use law_eye_crawler::{
    AdapterRegistry, ConcurrencyConfig, ConcurrencyController, CrawlJobConfig, CrawlOrchestrator,
    CrawlOutcome, DomainRateLimiter, IncrementalChecker, RateLimiterConfig, RobotsChecker,
};
use law_eye_db::{
    create_pool_with_session_role, create_pool_with_session_role_retry, CreateArticle,
    CreateCrawlLog, FinishCrawlLog,
};
use law_eye_queue::{
    AiTask, AiTaskType, IngestTask, OrderedTaskGate, PushTask, ReportExportTask,
    ReportGenerateTask, ReservedTask, RetryableTask, TaskQueue,
};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use serde_json::json;
use sha2::Sha256;
use sqlx::{types::Json as DbJson, PgPool, Postgres, QueryBuilder};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tokio::signal;
use tokio::time::{timeout, Duration, Instant};
use tracing::{debug, error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const QUEUE_INGEST: &str = "queue:ingest";
const QUEUE_AI: &str = "queue:ai";
const QUEUE_PUSH: &str = "queue:push";
const QUEUE_REPORT_EXPORT: &str = "queue:report-export";
const QUEUE_REPORT_GENERATE: &str = "queue:report";

const MAINTENANCE_INTERVAL_SECS: u64 = 15;
const MAINTENANCE_MAX_BATCH: usize = 200;
const SCHEDULER_INTERVAL_SECS: u64 = 60;
const OUTBOX_FLUSH_MAX_BATCH: i64 = 500;
const OUTBOX_LOCK_TIMEOUT_MS: i64 = 2 * 60 * 1_000;
const WEBHOOK_FLUSH_MAX_BATCH: i64 = 200;
const WEBHOOK_LOCK_TIMEOUT_MS: i64 = 2 * 60 * 1_000;
const WEBHOOK_SIGNATURE_HEADER: &str = "X-LawEye-Signature";
const WEBHOOK_SIGNATURE_TIMESTAMP_HEADER: &str = "X-LawEye-Signature-Timestamp";
const WEBHOOK_EVENT_ID_HEADER: &str = "X-LawEye-Event-Id";
const WEBHOOK_EVENT_TYPE_HEADER: &str = "X-LawEye-Event-Type";

const DB_CONNECT_MAX_ATTEMPTS: u32 = 30;

const VISIBILITY_TIMEOUT_INGEST_MS: i64 = 10 * 60 * 1_000;
const VISIBILITY_TIMEOUT_AI_MS: i64 = 20 * 60 * 1_000;
const VISIBILITY_TIMEOUT_PUSH_MS: i64 = 5 * 60 * 1_000;
const VISIBILITY_TIMEOUT_REPORT_EXPORT_MS: i64 = 15 * 60 * 1_000;
const VISIBILITY_TIMEOUT_REPORT_GENERATE_MS: i64 = 20 * 60 * 1_000;

const EVENT_VERSION_V1: i32 = 1;

// Hard per-task execution budgets. These should be < visibility timeouts to allow retries.
const TASK_TIMEOUT_INGEST_SECS: u64 = 8 * 60;
const TASK_TIMEOUT_AI_SECS: u64 = 10 * 60;
const TASK_TIMEOUT_PUSH_SECS: u64 = 60;
const TASK_TIMEOUT_REPORT_EXPORT_SECS: u64 = 10 * 60;
const TASK_TIMEOUT_REPORT_GENERATE_SECS: u64 = 15 * 60;
const DLQ_REPLAY_MAX_BATCH: usize = 20;
const DEFAULT_INCREMENTAL_SEED_LIMIT: i64 = 200_000;
const MAX_INCREMENTAL_SEED_LIMIT: i64 = 2_000_000;

fn contains_any_keyword(haystack: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| haystack.contains(keyword))
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    if input.chars().count() <= max_chars {
        input.to_string()
    } else {
        format!("{}...", input.chars().take(max_chars).collect::<String>())
    }
}

fn parse_env_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn env_bool_with_default(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(raw) => match parse_env_bool(&raw) {
            Some(value) => value,
            None => {
                warn!(
                    env = name,
                    value = %raw,
                    default,
                    "invalid boolean env value; using default"
                );
                default
            }
        },
        Err(_) => default,
    }
}

fn parse_env_i64(raw: &str) -> Option<i64> {
    raw.trim().parse::<i64>().ok()
}

fn env_i64_with_bounds(name: &str, default: i64, min: i64, max: i64) -> i64 {
    if min > max {
        return default;
    }

    match std::env::var(name) {
        Ok(raw) => match parse_env_i64(&raw) {
            Some(value) => value.clamp(min, max),
            None => {
                warn!(
                    env = name,
                    value = %raw,
                    default,
                    "invalid integer env value; using default"
                );
                default
            }
        },
        Err(_) => default,
    }
}

fn ai_fallback_classify(title: &str, content: &str) -> ClassifyResult {
    let text = format!("{} {}", title, content).to_lowercase();

    let (category_slug, confidence, reasoning) = if contains_any_keyword(
        &text,
        &["法律", "法规", "条例", "草案", "立法", "修订", "出台"],
    ) {
        ("legislation", 0.85, "匹配立法相关关键词")
    } else if contains_any_keyword(
        &text,
        &["处罚", "监管", "约谈", "整改", "责令", "通报", "警示"],
    ) {
        ("regulation", 0.85, "匹配监管相关关键词")
    } else if contains_any_keyword(&text, &["判决", "裁定", "案例", "起诉", "审判", "判刑"])
    {
        ("enforcement", 0.85, "匹配执法案例关键词")
    } else if contains_any_keyword(
        &text,
        &[
            "数据安全",
            "个人信息",
            "隐私",
            "数据出境",
            "跨境传输",
            "数据保护",
        ],
    ) {
        ("data", 0.85, "匹配数据合规关键词")
    } else if contains_any_keyword(
        &text,
        &["网络安全", "漏洞", "攻击", "黑客", "安全事件", "勒索"],
    ) {
        ("security", 0.85, "匹配网络安全关键词")
    } else if contains_any_keyword(
        &text,
        &["gdpr", "欧盟", "美国", "跨境", "国际", "海外", "境外"],
    ) {
        ("international", 0.80, "匹配国际法规关键词")
    } else {
        ("industry", 0.55, "未命中高置信规则，回落默认行业资讯")
    };

    ClassifyResult {
        category_slug: category_slug.to_string(),
        confidence,
        sub_categories: vec![],
        reasoning: format!("fallback_rule: {reasoning}"),
    }
}

fn ai_fallback_summary(title: &str, content: &str) -> SummaryResult {
    let normalized = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let abstract_text = truncate_chars(&normalized, 300);
    let brief = if abstract_text.is_empty() {
        truncate_chars(title, 100)
    } else {
        truncate_chars(&abstract_text, 100)
    };

    let mut key_points = Vec::new();
    if !brief.is_empty() {
        key_points.push(brief.clone());
    }
    let secondary = if normalized.is_empty() {
        String::new()
    } else {
        truncate_chars(&normalized, 180)
    };
    if !secondary.is_empty() && secondary != brief {
        key_points.push(secondary);
    }

    if key_points.is_empty() {
        key_points.push("原文内容较短，摘要采用保守回退结果".to_string());
    }

    SummaryResult {
        brief,
        abstract_text,
        key_points,
        entities: vec![Entity {
            name: title.to_string(),
            entity_type: EntityType::LegalTerm,
            context: "fallback_rule".to_string(),
        }],
    }
}

fn ai_fallback_risk(title: &str, content: &str) -> RiskAssessment {
    let text = format!("{} {}", title, content).to_lowercase();

    let mut score: u8 = 10;
    for keyword in [
        "处罚",
        "罚款",
        "违法",
        "违规",
        "责令",
        "整改",
        "约谈",
        "警示",
        "通报批评",
    ] {
        if text.contains(keyword) {
            score = score.saturating_add(15);
        }
    }

    for keyword in ["刑事", "拘留", "逮捕", "起诉", "判刑", "吊销", "关停"] {
        if text.contains(keyword) {
            score = score.saturating_add(25);
        }
    }

    for keyword in ["整顿", "排查", "专项", "检查", "督查"] {
        if text.contains(keyword) {
            score = score.saturating_add(8);
        }
    }

    let score = score.min(100);
    let level = if score <= 25 {
        RiskLevel::Low
    } else if score <= 50 {
        RiskLevel::Medium
    } else if score <= 75 {
        RiskLevel::High
    } else {
        RiskLevel::Critical
    };

    RiskAssessment {
        score,
        level,
        dimensions: vec![RiskDimension {
            name: "fallback_rule".to_string(),
            score,
            description: "基于规则关键词生成的降级风险评估".to_string(),
        }],
        recommendations: vec!["AI 服务不可用，当前结果由规则引擎生成，请人工复核".to_string()],
    }
}

fn ai_fallback_tags(title: &str, content: &str) -> TagsResult {
    let base = format!("{} {}", title, content);
    let mut tags = Vec::<String>::new();

    for (keyword, tag) in [
        ("数据", "数据合规"),
        ("隐私", "隐私保护"),
        ("监管", "监管动态"),
        ("处罚", "行政处罚"),
        ("网络", "网络安全"),
        ("立法", "立法前沿"),
        ("国际", "国际合规"),
    ] {
        if base.contains(keyword) {
            tags.push(tag.to_string());
        }
    }

    if tags.is_empty() {
        tags.push("法律资讯".to_string());
    }

    let keywords = base
        .split(|c: char| c.is_whitespace() || [',', '，', '。', ';', '；'].contains(&c))
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .take(12)
        .map(|part| truncate_chars(part, 20))
        .collect::<Vec<_>>();

    TagsResult { tags, keywords }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AiStageStatus {
    Success,
    Degraded,
}

impl AiStageStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Degraded => "degraded",
        }
    }
}

#[derive(Debug, Clone)]
struct AiStageReport {
    stage: &'static str,
    status: AiStageStatus,
    error_summary: Option<String>,
}

impl AiStageReport {
    fn success(stage: &'static str) -> Self {
        Self {
            stage,
            status: AiStageStatus::Success,
            error_summary: None,
        }
    }

    fn degraded(stage: &'static str, error_summary: String) -> Self {
        Self {
            stage,
            status: AiStageStatus::Degraded,
            error_summary: Some(error_summary),
        }
    }
}

#[derive(Debug, Clone)]
struct AiFullStageSummary {
    full_status: &'static str,
    partial_success: bool,
    degraded: bool,
    error_summary: Option<String>,
    stage_status: serde_json::Value,
    tasks: serde_json::Value,
}

fn summarize_ai_full_stages(stage_reports: &[AiStageReport]) -> AiFullStageSummary {
    let mut stage_status = serde_json::Map::new();
    let mut tasks = serde_json::Map::new();
    let mut success_count = 0usize;
    let mut degraded_count = 0usize;
    let mut error_summaries = Vec::new();

    for report in stage_reports {
        stage_status.insert(
            report.stage.to_string(),
            json!({
                "status": report.status.as_str(),
                "error_summary": report.error_summary,
            }),
        );

        tasks.insert(report.stage.to_string(), json!(true));

        if let Some(error) = &report.error_summary {
            error_summaries.push(format!("{}: {}", report.stage, error));
        }

        match report.status {
            AiStageStatus::Success => success_count += 1,
            AiStageStatus::Degraded => degraded_count += 1,
        }
    }

    let full_status = if degraded_count > 0 {
        "degraded"
    } else {
        "success"
    };

    tasks.insert("full".to_string(), json!(true));

    let partial_success = success_count > 0 && degraded_count > 0;
    let degraded = degraded_count > 0;
    let error_summary = if error_summaries.is_empty() {
        None
    } else {
        Some(truncate_chars(
            &error_summaries.join(" | "),
            WORKER_ERROR_MAX_CHARS,
        ))
    };

    AiFullStageSummary {
        full_status,
        partial_success,
        degraded,
        error_summary,
        stage_status: serde_json::Value::Object(stage_status),
        tasks: serde_json::Value::Object(tasks),
    }
}

#[derive(Clone)]
struct WorkerHealthState {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    shutdown: Arc<AtomicBool>,
    check_timeout: Duration,
    metrics_handle: PrometheusHandle,
    metrics_token: Option<String>,
    is_production: bool,
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

async fn metrics_endpoint(State(state): State<WorkerHealthState>, headers: HeaderMap) -> Response {
    if state.is_production {
        let Some(token) = state
            .metrics_token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty())
        else {
            return StatusCode::NOT_FOUND.into_response();
        };

        let expected = format!("Bearer {}", token);
        let auth_ok = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.trim() == expected);
        if !auth_ok {
            return StatusCode::NOT_FOUND.into_response();
        }
    }

    let metrics = state.metrics_handle.render();
    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; version=0.0.4"),
        )],
        metrics,
    )
        .into_response()
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
        .route("/metrics", get(metrics_endpoint))
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

const WORKER_ERROR_MAX_CHARS: usize = 240;
const WORKER_ERROR_REDACTED: &str = "internal error (details redacted)";

fn sanitize_error_message(raw: impl AsRef<str>) -> String {
    let collapsed = raw
        .as_ref()
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if collapsed.is_empty() {
        return "internal error".to_string();
    }

    let lowered = collapsed.to_ascii_lowercase();
    if contains_any_keyword(
        &lowered,
        &[
            "authorization",
            "bearer ",
            "api_key",
            "apikey",
            "secret",
            "token",
            "password",
            "passwd",
            "set-cookie",
            "cookie:",
        ],
    ) {
        return WORKER_ERROR_REDACTED.to_string();
    }

    truncate_chars(&collapsed, WORKER_ERROR_MAX_CHARS)
}

async fn validate_webhook_url(raw: &str, allow_internal: bool) -> anyhow::Result<reqwest::Url> {
    let policy = OutboundUrlPolicy::https_or_http_internal(allow_internal);
    let url = validate_outbound_url(raw, &policy)
        .await
        .map_err(|e| anyhow::anyhow!("{}: {}", e.code(), e))?;
    Ok(url)
}

fn classify_slug_to_domain_root(slug: &str) -> &'static str {
    match slug {
        "legislation" => "legislation",
        "regulation" => "regulation",
        "enforcement" => "enforcement",
        "industry" => "industry",
        "international" => "international",
        // Fallback classifier emits "data"/"security"; map them to technology domain.
        "data" | "security" | "technology" => "technology",
        "academic" => "academic",
        _ => "compliance",
    }
}

fn derive_domain_sub_from_host(host: &str) -> Option<String> {
    host.split('.')
        .find(|part| !part.is_empty() && *part != "www")
        .map(|part| part.to_string())
}

fn derive_ingest_legal_metadata(
    source_type: &str,
    source_priority: Option<i32>,
    link: &str,
    title: &str,
    content: Option<&str>,
    issuer: Option<&str>,
) -> (Option<String>, Option<String>, Option<i32>, Option<i32>) {
    let host = reqwest::Url::parse(link)
        .ok()
        .and_then(|url| url.host_str().map(|h| h.to_ascii_lowercase()));

    let content_snippet = content
        .map(|value| truncate_chars(value, 1200))
        .unwrap_or_default();
    let classify = ai_fallback_classify(title, &content_snippet);
    let mut domain_root = classify_slug_to_domain_root(&classify.category_slug).to_string();

    if domain_root == "industry" && host.as_deref().is_some_and(|h| h.ends_with(".gov.cn")) {
        domain_root = "regulation".to_string();
    }

    let mut domain_sub = host
        .as_deref()
        .and_then(derive_domain_sub_from_host)
        .or_else(|| {
            let normalized = source_type.trim().to_ascii_lowercase();
            (!normalized.is_empty()).then_some(normalized)
        });
    if domain_sub.as_deref() == Some("gov") {
        domain_sub = Some("government".to_string());
    }

    let authority_level = if host.as_deref().is_some_and(|h| h.ends_with(".gov.cn")) {
        Some(match domain_root.as_str() {
            "legislation" => 2,
            "regulation" => 3,
            "enforcement" => 7,
            _ => 4,
        })
    } else if issuer.is_some_and(|value| value.contains("国务院") || value.contains("人大")) {
        Some(2)
    } else if domain_root == "academic" {
        Some(9)
    } else {
        None
    };

    let risk = ai_fallback_risk(title, &content_snippet);
    let mut importance = match risk.score {
        0..=20 => 1,
        21..=40 => 2,
        41..=60 => 3,
        61..=80 => 4,
        _ => 5,
    };
    if authority_level.is_some_and(|level| level <= 3) {
        importance = importance.max(4);
    }
    if let Some(priority) = source_priority {
        if priority >= 8 {
            importance = (importance + 1).min(5);
        } else if priority <= 2 {
            importance = (importance - 1).max(1);
        }
    }

    (
        Some(domain_root),
        domain_sub,
        authority_level,
        Some(importance),
    )
}

fn derive_region_code(extracted_region_code: Option<String>, link: &str) -> Option<String> {
    if extracted_region_code.is_some() {
        return extracted_region_code;
    }

    let host = reqwest::Url::parse(link)
        .ok()
        .and_then(|url| url.host_str().map(|h| h.to_ascii_lowercase()));

    let code = match host.as_deref() {
        Some(h) if h.contains("beijing") || h.starts_with("bj.") || h.contains(".bj.") => "110000",
        Some(h) if h.contains("shanghai") || h.starts_with("sh.") || h.contains(".sh.") => "310000",
        Some(h) if h.contains("guangdong") || h.starts_with("gd.") || h.contains(".gd.") => {
            "440000"
        }
        Some(h) if h.contains("zhejiang") || h.starts_with("zj.") || h.contains(".zj.") => "330000",
        Some(h) if h.contains("jiangsu") || h.starts_with("js.") || h.contains(".js.") => "320000",
        // Unknown/foreign source still maps to a stable bucket so regional stats remain queryable.
        _ => "000000",
    };

    Some(code.to_string())
}

struct Worker {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    orchestrator: CrawlOrchestrator,
    incremental_checker: Arc<IncrementalChecker>,
    incremental_seeded_tenants: Mutex<HashSet<uuid::Uuid>>,
    incremental_seed_limit: i64,
    ai_service: Option<AiService>,
    knowledge_service: Option<KnowledgeService>,
    object_service: Option<ObjectService>,
    report_service: ReportService,
    report_template_service: ReportTemplateService,
    push_http_client: reqwest::Client,
    allow_internal_source_urls: bool,
    allow_internal_webhook_urls: bool,
    scheduler_enabled: bool,
    dlq_replay_enabled: bool,
    worker_id: uuid::Uuid,
    shutdown: Arc<AtomicBool>,
    object_purge: Option<ObjectPurgeConfig>,
}

struct WorkerInit {
    pool: PgPool,
    task_queue: TaskQueue,
    ai_service: Option<AiService>,
    knowledge_service: Option<KnowledgeService>,
    object_service: Option<ObjectService>,
    shutdown: Arc<AtomicBool>,
    allow_internal_source_urls: bool,
    allow_internal_webhook_urls: bool,
    push_http_client: reqwest::Client,
    object_purge: Option<ObjectPurgeConfig>,
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

#[derive(sqlx::FromRow)]
struct WebhookDispatchRow {
    id: uuid::Uuid,
    endpoint_id: uuid::Uuid,
    event_type: String,
    payload: DbJson<serde_json::Value>,
    occurred_at_unix: i64,
    attempts: i32,
    max_retries: i32,
    url: String,
    signing_secret: String,
    timeout_ms: i32,
}

impl std::fmt::Debug for WebhookDispatchRow {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WebhookDispatchRow")
            .field("id", &self.id)
            .field("endpoint_id", &self.endpoint_id)
            .field("event_type", &self.event_type)
            .field("payload", &self.payload)
            .field("occurred_at_unix", &self.occurred_at_unix)
            .field("attempts", &self.attempts)
            .field("max_retries", &self.max_retries)
            .field("url", &self.url)
            .field("signing_secret", &"[REDACTED]")
            .field("timeout_ms", &self.timeout_ms)
            .finish()
    }
}

#[derive(Debug)]
struct WebhookDispatchOutcome {
    event_id: uuid::Uuid,
    endpoint_id: uuid::Uuid,
    attempts: i32,
    max_retries: i32,
    status_code: Option<i32>,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct ObjectPurgeConfig {
    interval: Duration,
    batch_size: i64,
    grace_period_seconds: i64,
    max_attempts: i32,
    lock_timeout_ms: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct ObjectPurgeLockRow {
    id: uuid::Uuid,
    object_key: String,
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

#[derive(Debug, Clone)]
struct DomainEventRecord {
    aggregate_type: String,
    aggregate_id: uuid::Uuid,
    aggregate_version: i64,
    event_type: String,
    dedupe_key: String,
    payload: serde_json::Value,
    metadata: serde_json::Value,
}

impl DomainEventRecord {
    fn into_input(self) -> DomainEventInput {
        DomainEventInput {
            aggregate_type: self.aggregate_type,
            aggregate_id: self.aggregate_id,
            aggregate_version: self.aggregate_version,
            event_type: self.event_type,
            event_version: EVENT_VERSION_V1,
            dedupe_key: self.dedupe_key,
            payload: self.payload,
            metadata: self.metadata,
            occurred_at: None,
        }
    }
}

impl Worker {
    fn new(init: WorkerInit) -> anyhow::Result<Self> {
        // --- Build CrawlOrchestrator ---
        let registry = AdapterRegistry::with_defaults()
            .map_err(|e| anyhow::anyhow!("create adapter registry: {}", e))?;
        let rate_limiter = std::sync::Arc::new(DomainRateLimiter::new(RateLimiterConfig {
            burst_size: 5,
            tokens_per_second: 2.0,
        }));
        let concurrency =
            std::sync::Arc::new(ConcurrencyController::new(ConcurrencyConfig::default()));
        let mut orchestrator = CrawlOrchestrator::new(registry, rate_limiter, concurrency);

        // Optionally configure robots.txt checker
        match RobotsChecker::new() {
            Ok(checker) => {
                orchestrator = orchestrator.with_robots_checker(std::sync::Arc::new(checker));
            }
            Err(e) => {
                warn!(
                    "Failed to create RobotsChecker, proceeding without robots.txt checking: {}",
                    e
                );
            }
        }

        // Note: AI enrichment runs via the separate AI queue (process_ai_task),
        // not in-pipeline, so we intentionally do NOT attach AiService to the orchestrator.

        // Configure incremental checker for cross-session content deduplication
        let incremental_checker = Arc::new(IncrementalChecker::new());
        orchestrator = orchestrator.with_incremental_checker(incremental_checker.clone());
        let incremental_seed_limit = env_i64_with_bounds(
            "LAW_EYE_WORKER_INCREMENTAL_SEED_LIMIT",
            DEFAULT_INCREMENTAL_SEED_LIMIT,
            1,
            MAX_INCREMENTAL_SEED_LIMIT,
        );
        let scheduler_enabled = env_bool_with_default("LAW_EYE_WORKER_SCHEDULER_ENABLED", true);
        let dlq_replay_enabled = env_bool_with_default("LAW_EYE_WORKER_DLQ_REPLAY_ENABLED", true);
        info!(
            scheduler_enabled,
            dlq_replay_enabled,
            incremental_seed_limit,
            "worker source scheduler configuration loaded"
        );

        Ok(Self {
            report_service: ReportService::new(init.pool.clone()),
            report_template_service: ReportTemplateService::new(init.pool.clone()),
            pool: init.pool,
            task_queue: Arc::new(init.task_queue),
            orchestrator,
            incremental_checker,
            incremental_seeded_tenants: Mutex::new(HashSet::new()),
            incremental_seed_limit,
            ai_service: init.ai_service,
            knowledge_service: init.knowledge_service,
            object_service: init.object_service,
            push_http_client: init.push_http_client,
            allow_internal_source_urls: init.allow_internal_source_urls,
            allow_internal_webhook_urls: init.allow_internal_webhook_urls,
            scheduler_enabled,
            dlq_replay_enabled,
            worker_id: uuid::Uuid::new_v4(),
            shutdown: init.shutdown,
            object_purge: init.object_purge,
        })
    }

    async fn run(&self) -> anyhow::Result<()> {
        info!("Worker started, waiting for tasks...");

        let maintenance_interval = Duration::from_secs(MAINTENANCE_INTERVAL_SECS);
        let mut last_maintenance = Instant::now() - maintenance_interval;

        let scheduler_interval = Duration::from_secs(SCHEDULER_INTERVAL_SECS);
        let mut last_scheduler = Instant::now() - scheduler_interval;

        let object_purge_interval = self.object_purge.as_ref().map(|cfg| cfg.interval);
        let mut last_object_purge = Instant::now();
        if let Some(interval) = object_purge_interval {
            last_object_purge = Instant::now() - interval;
        }

        while !self.shutdown.load(Ordering::Relaxed) {
            if last_maintenance.elapsed() >= maintenance_interval {
                if let Err(e) = self.run_queue_maintenance().await {
                    error!("Queue maintenance failed: {}", e);
                }
                last_maintenance = Instant::now();
            }

            if let Some(interval) = object_purge_interval {
                if last_object_purge.elapsed() >= interval {
                    if let Err(e) = self.run_object_purge_maintenance().await {
                        error!("Object purge maintenance failed: {}", e);
                    }
                    last_object_purge = Instant::now();
                }
            }

            // Scheduled source crawl trigger
            if self.scheduler_enabled && last_scheduler.elapsed() >= scheduler_interval {
                if let Err(e) = self.run_scheduler().await {
                    error!("Scheduler run failed: {}", e);
                }
                last_scheduler = Instant::now();
            }

            // Reserve from all queues in parallel so no single queue starves others.
            let (res_ingest, res_ai, res_push, res_report_export, res_report_generate) = tokio::join!(
                self.task_queue
                    .reserve_retryable::<IngestTask>(QUEUE_INGEST, 5),
                self.task_queue.reserve_retryable::<AiTask>(QUEUE_AI, 1),
                self.task_queue.reserve_retryable::<PushTask>(QUEUE_PUSH, 1),
                self.task_queue
                    .reserve_retryable::<ReportExportTask>(QUEUE_REPORT_EXPORT, 1),
                self.task_queue
                    .reserve_retryable::<ReportGenerateTask>(QUEUE_REPORT_GENERATE, 1),
            );

            let mut had_task = false;
            let mut had_error = false;

            match res_ingest {
                Ok(Some(reserved)) => {
                    self.handle_ingest_reserved(reserved).await;
                    had_task = true;
                }
                Ok(None) => {}
                Err(e) => {
                    error!("Failed to reserve from {}: {}", QUEUE_INGEST, e);
                    had_error = true;
                }
            }

            match res_ai {
                Ok(Some(reserved)) => {
                    self.handle_ai_reserved(reserved).await;
                    had_task = true;
                }
                Ok(None) => {}
                Err(e) => {
                    error!("Failed to reserve from {}: {}", QUEUE_AI, e);
                    had_error = true;
                }
            }

            match res_push {
                Ok(Some(reserved)) => {
                    self.handle_push_reserved(reserved).await;
                    had_task = true;
                }
                Ok(None) => {}
                Err(e) => {
                    error!("Failed to reserve from {}: {}", QUEUE_PUSH, e);
                    had_error = true;
                }
            }

            match res_report_export {
                Ok(Some(reserved)) => {
                    self.handle_report_export_reserved(reserved).await;
                    had_task = true;
                }
                Ok(None) => {}
                Err(e) => {
                    error!("Failed to reserve from {}: {}", QUEUE_REPORT_EXPORT, e);
                    had_error = true;
                }
            }

            match res_report_generate {
                Ok(Some(reserved)) => {
                    self.handle_report_generate_reserved(reserved).await;
                    had_task = true;
                }
                Ok(None) => {}
                Err(e) => {
                    error!("Failed to reserve from {}: {}", QUEUE_REPORT_GENERATE, e);
                    had_error = true;
                }
            }

            // If all queues were empty and no errors, brief sleep to avoid busy-loop.
            // If there was an error, back off slightly longer.
            if !had_task {
                let backoff = if had_error {
                    Duration::from_secs(2)
                } else {
                    Duration::from_millis(100)
                };
                tokio::time::sleep(backoff).await;
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
            (QUEUE_REPORT_EXPORT, VISIBILITY_TIMEOUT_REPORT_EXPORT_MS),
            (QUEUE_REPORT_GENERATE, VISIBILITY_TIMEOUT_REPORT_GENERATE_MS),
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
            match self.task_queue.dlq_length(queue).await {
                Ok(dlq_len) if dlq_len > 0 => {
                    warn!(
                        queue,
                        dlq_len,
                        dlq_replay_enabled = self.dlq_replay_enabled,
                        "DLQ contains pending tasks"
                    );
                }
                Ok(_) => {}
                Err(e) => {
                    error!("Failed to check DLQ length for {}: {}", queue, e);
                }
            }
        }

        if self.dlq_replay_enabled {
            if let Err(e) = self
                .task_queue
                .replay_dead_letter_tasks::<IngestTask>(QUEUE_INGEST, DLQ_REPLAY_MAX_BATCH)
                .await
            {
                error!("Failed to replay DLQ tasks for {}: {}", QUEUE_INGEST, e);
            }
            if let Err(e) = self
                .task_queue
                .replay_dead_letter_tasks::<AiTask>(QUEUE_AI, DLQ_REPLAY_MAX_BATCH)
                .await
            {
                error!("Failed to replay DLQ tasks for {}: {}", QUEUE_AI, e);
            }
            if let Err(e) = self
                .task_queue
                .replay_dead_letter_tasks::<PushTask>(QUEUE_PUSH, DLQ_REPLAY_MAX_BATCH)
                .await
            {
                error!("Failed to replay DLQ tasks for {}: {}", QUEUE_PUSH, e);
            }
            if let Err(e) = self
                .task_queue
                .replay_dead_letter_tasks::<ReportExportTask>(
                    QUEUE_REPORT_EXPORT,
                    DLQ_REPLAY_MAX_BATCH,
                )
                .await
            {
                error!(
                    "Failed to replay DLQ tasks for {}: {}",
                    QUEUE_REPORT_EXPORT, e
                );
            }
            if let Err(e) = self
                .task_queue
                .replay_dead_letter_tasks::<ReportGenerateTask>(
                    QUEUE_REPORT_GENERATE,
                    DLQ_REPLAY_MAX_BATCH,
                )
                .await
            {
                error!(
                    "Failed to replay DLQ tasks for {}: {}",
                    QUEUE_REPORT_GENERATE, e
                );
            }
        }

        self.flush_queue_outbox_all_tenants().await?;
        self.flush_webhook_events_all_tenants().await?;

        Ok(())
    }

    /// Periodically check active sources with cron schedules and enqueue
    /// IngestTasks for those that are due.
    async fn run_scheduler(&self) -> anyhow::Result<()> {
        let tenant_ids =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants ORDER BY created_at")
                .fetch_all(&self.pool)
                .await?;

        let mut enqueued = 0u32;

        for tenant_id in tenant_ids {
            let source_service = SourceService::new(self.pool.clone());

            // Use SourceService (handles RLS) and filter in-memory
            let sources = match source_service.list_active(tenant_id).await {
                Ok(s) => s,
                Err(e) => {
                    warn!(%tenant_id, "scheduler: failed to list active sources: {}", e);
                    continue;
                }
            };

            let now = chrono::Utc::now();

            for source in sources {
                // Skip sources without schedule, or in unhealthy state
                let schedule_str = match &source.schedule {
                    Some(s) if !s.is_empty() && source.health_status != "unhealthy" => s.as_str(),
                    _ => continue,
                };

                // Parse cron expression
                let schedule = match schedule_str.parse::<cron::Schedule>() {
                    Ok(s) => s,
                    Err(e) => {
                        warn!(
                            source_id = %source.id,
                            schedule = %schedule_str,
                            "scheduler: invalid cron expression: {}", e
                        );
                        continue;
                    }
                };

                // Determine if this source is due for a crawl.
                // A source is due when:
                //   - It has never been fetched (last_fetch IS NULL), OR
                //   - The most recent scheduled fire time before `now` is after `last_fetch`
                let is_due = match source.last_fetch {
                    None => true,
                    Some(last) => {
                        // Find the most recent fire time <= now
                        schedule
                            .after(&last)
                            .take_while(|t| *t <= now)
                            .last()
                            .is_some()
                    }
                };

                if !is_due {
                    continue;
                }

                // Enqueue an IngestTask
                let task = IngestTask {
                    tenant_id: source.tenant_id,
                    source_id: source.id,
                    source_type: source.source_type.clone(),
                    url: source.url.clone(),
                    config: source.config.clone(),
                };

                match self.task_queue.enqueue_retryable(QUEUE_INGEST, task).await {
                    Ok(_) => {
                        enqueued += 1;
                        info!(
                            source_id = %source.id,
                            source_name = %source.name,
                            "scheduler: enqueued ingest task"
                        );
                    }
                    Err(e) => {
                        warn!(
                            source_id = %source.id,
                            "scheduler: failed to enqueue ingest task: {}", e
                        );
                    }
                }
            }
        }

        if enqueued > 0 {
            info!(count = enqueued, "scheduler: enqueued due source crawls");
        }

        Ok(())
    }

    fn unix_now_secs() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }

    async fn run_object_purge_maintenance(&self) -> anyhow::Result<()> {
        let Some(cfg) = self.object_purge.as_ref() else {
            return Ok(());
        };
        let Some(object_service) = self.object_service.as_ref() else {
            return Ok(());
        };

        let tenant_ids =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants ORDER BY created_at")
                .fetch_all(&self.pool)
                .await?;

        for tenant_id in tenant_ids {
            match self
                .mark_orphan_object_records_for_tenant(tenant_id, cfg)
                .await
            {
                Ok(marked) if marked > 0 => {
                    info!(%tenant_id, marked, "Marked orphan object records (soft delete)");
                }
                Ok(_) => {}
                Err(err) => error!(%tenant_id, error = %err, "Mark orphan object records failed"),
            }

            match self
                .purge_deleted_object_records_for_tenant(tenant_id, cfg, object_service)
                .await
            {
                Ok(purged) if purged > 0 => {
                    info!(%tenant_id, purged, "Purged soft-deleted objects from storage");
                }
                Ok(_) => {}
                Err(err) => error!(%tenant_id, error = %err, "Purge soft-deleted objects failed"),
            }

            match self
                .cleanup_orphan_storage_objects_for_tenant(tenant_id, cfg, object_service)
                .await
            {
                Ok(deleted) if deleted > 0 => {
                    info!(%tenant_id, deleted, "Deleted orphan storage objects without DB records");
                }
                Ok(_) => {}
                Err(err) => {
                    error!(%tenant_id, error = %err, "Cleanup orphan storage objects failed")
                }
            }
        }

        Ok(())
    }

    async fn mark_orphan_object_records_for_tenant(
        &self,
        tenant_id: uuid::Uuid,
        cfg: &ObjectPurgeConfig,
    ) -> anyhow::Result<i64> {
        let mut tx = self.begin_tenant_tx(tenant_id).await?;

        let res = sqlx::query(
            r#"
            WITH candidates AS (
                SELECT o.id
                FROM objects o
                LEFT JOIN users u
                  ON u.id = o.owner_user_id
                 AND u.avatar_url = ('/api/v1/objects/' || o.id::text)
                WHERE o.deleted_at IS NULL
                  AND o.purged_at IS NULL
                  AND o.kind = $1
                  AND o.created_at < NOW() - ($2::bigint * interval '1 second')
                  AND u.id IS NULL
                ORDER BY o.created_at ASC
                LIMIT $3
            )
            UPDATE objects
            SET deleted_at = NOW()
            WHERE id IN (SELECT id FROM candidates)
            "#,
        )
        .bind(OBJECT_KIND_USER_AVATAR)
        .bind(cfg.grace_period_seconds)
        .bind(cfg.batch_size)
        .execute(tx.as_mut())
        .await?;

        tx.commit().await?;
        Ok(res.rows_affected() as i64)
    }

    async fn purge_deleted_object_records_for_tenant(
        &self,
        tenant_id: uuid::Uuid,
        cfg: &ObjectPurgeConfig,
        object_service: &ObjectService,
    ) -> anyhow::Result<i64> {
        let mut lock_tx = self.begin_tenant_tx(tenant_id).await?;
        let rows = sqlx::query_as::<_, ObjectPurgeLockRow>(
            r#"
            WITH candidates AS (
                SELECT id
                FROM objects
                WHERE deleted_at IS NOT NULL
                  AND purged_at IS NULL
                  AND purge_attempts < $2
                  AND (purge_locked_at IS NULL OR purge_locked_at < NOW() - ($3::bigint * interval '1 millisecond'))
                  AND deleted_at < NOW() - ($4::bigint * interval '1 second')
                ORDER BY deleted_at ASC
                LIMIT $5
                FOR UPDATE SKIP LOCKED
            )
            UPDATE objects
            SET purge_locked_at = NOW(),
                purge_locked_by = $1
            WHERE id IN (SELECT id FROM candidates)
            RETURNING id, object_key
            "#,
        )
        .bind(self.worker_id)
        .bind(cfg.max_attempts)
        .bind(cfg.lock_timeout_ms)
        .bind(cfg.grace_period_seconds)
        .bind(cfg.batch_size)
        .fetch_all(lock_tx.as_mut())
        .await?;
        lock_tx.commit().await?;

        if rows.is_empty() {
            return Ok(0);
        }

        let mut outcomes: Vec<(uuid::Uuid, Result<(), String>)> = Vec::with_capacity(rows.len());
        for row in &rows {
            let result = object_service
                .delete_object_key(&row.object_key)
                .await
                .map_err(|e| e.to_string());
            outcomes.push((row.id, result));
        }

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        for (id, outcome) in outcomes {
            match outcome {
                Ok(()) => {
                    sqlx::query(
                        r#"
                        UPDATE objects
                        SET purged_at = NOW(),
                            purge_last_error = NULL,
                            purge_locked_at = NULL,
                            purge_locked_by = NULL
                        WHERE id = $1
                        "#,
                    )
                    .bind(id)
                    .execute(tx.as_mut())
                    .await?;
                }
                Err(err) => {
                    sqlx::query(
                        r#"
                        UPDATE objects
                        SET purge_attempts = purge_attempts + 1,
                            purge_last_error = $2,
                            purge_locked_at = NULL,
                            purge_locked_by = NULL
                        WHERE id = $1
                        "#,
                    )
                    .bind(id)
                    .bind(err)
                    .execute(tx.as_mut())
                    .await?;
                }
            }
        }
        tx.commit().await?;

        Ok(rows.len() as i64)
    }

    async fn cleanup_orphan_storage_objects_for_tenant(
        &self,
        tenant_id: uuid::Uuid,
        cfg: &ObjectPurgeConfig,
        object_service: &ObjectService,
    ) -> anyhow::Result<i64> {
        if cfg.batch_size <= 0 {
            return Ok(0);
        }

        let now_secs = Self::unix_now_secs();
        let cutoff_secs = now_secs.saturating_sub(cfg.grace_period_seconds.max(0));
        let prefix = format!("tenants/{tenant_id}/");

        let mut continuation: Option<String> = None;
        let mut deleted: i64 = 0;

        while deleted < cfg.batch_size {
            let page = object_service
                .list_objects_page(&prefix, continuation.clone(), None)
                .await?;

            if page.objects.is_empty() {
                break;
            }

            let mut candidates: Vec<String> = page
                .objects
                .iter()
                .filter_map(|obj| {
                    let modified = obj.last_modified_epoch_secs?;
                    if modified <= cutoff_secs {
                        Some(obj.object_key.clone())
                    } else {
                        None
                    }
                })
                .collect();

            if !candidates.is_empty() {
                let mut tx = self.begin_tenant_tx(tenant_id).await?;
                let existing = sqlx::query_scalar::<_, String>(
                    "SELECT object_key FROM objects WHERE bucket = $1 AND object_key = ANY($2) AND purged_at IS NULL",
                )
                .bind(object_service.bucket())
                .bind(&candidates)
                .fetch_all(tx.as_mut())
                .await?;
                tx.commit().await?;

                let existing: HashSet<String> = existing.into_iter().collect();
                candidates.retain(|key| !existing.contains(key));

                for key in candidates {
                    if deleted >= cfg.batch_size {
                        break;
                    }
                    match object_service.delete_object_key(&key).await {
                        Ok(()) => deleted += 1,
                        Err(err) => {
                            warn!(%tenant_id, object_key = %key, error = %err, "Delete orphan storage object failed")
                        }
                    }
                }
            }

            continuation = page.next_continuation_token;
            if continuation.is_none() {
                break;
            }
        }

        Ok(deleted)
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

    async fn ensure_incremental_seed_for_tenant(
        &self,
        tenant_id: uuid::Uuid,
    ) -> anyhow::Result<()> {
        let already_seeded = self
            .incremental_seeded_tenants
            .lock()
            .unwrap_or_else(|poisoned| {
                warn!("incremental_seeded_tenants mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .contains(&tenant_id);

        if already_seeded {
            return Ok(());
        }

        let mut tx = self.begin_tenant_tx(tenant_id).await?;
        let seed_rows = sqlx::query_as::<_, (uuid::Uuid, String, String)>(
            r#"
            SELECT tenant_id, content_hash, link
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND content_hash IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT $2
            "#,
        )
        .bind(tenant_id)
        .bind(self.incremental_seed_limit)
        .fetch_all(tx.as_mut())
        .await?;
        tx.commit().await?;

        let seeded_count = seed_rows.len();
        self.incremental_checker.seed(seed_rows);
        self.incremental_seeded_tenants
            .lock()
            .unwrap_or_else(|poisoned| {
                warn!("incremental_seeded_tenants mutex was poisoned, recovering");
                poisoned.into_inner()
            })
            .insert(tenant_id);

        info!(
            %tenant_id,
            seeded_count,
            seed_limit = self.incremental_seed_limit,
            "Seeded incremental checker from persisted article hashes"
        );

        Ok(())
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
            AiTaskType::ExtractEntities => "extract_entities",
            AiTaskType::Full => "full",
        };
        format!("ai:{article_id}:{task_type}")
    }

    fn domain_event_dedupe_key(prefix: &str, aggregate_id: uuid::Uuid) -> String {
        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        format!("{}:{}:{}", prefix, aggregate_id, timestamp_ms)
    }

    async fn append_domain_event(
        &self,
        tenant_id: uuid::Uuid,
        event: DomainEventRecord,
    ) -> anyhow::Result<()> {
        let service = DomainEventService::new(self.pool.clone());
        let _ = service.append(tenant_id, event.into_input()).await?;
        Ok(())
    }

    fn outbox_retry_delay_ms(attempt: i32) -> i64 {
        const BASE_MS: i64 = 5_000;
        const MAX_MS: i64 = 60_000;

        let attempt = attempt.max(1) as u32;
        let shift = attempt.saturating_sub(1).min(16);
        let delay = BASE_MS.saturating_mul(1i64 << shift);
        delay.min(MAX_MS)
    }

    fn webhook_signature(
        signing_secret: &str,
        timestamp_secs: i64,
        body: &[u8],
    ) -> anyhow::Result<String> {
        let mut mac = Hmac::<Sha256>::new_from_slice(signing_secret.as_bytes())
            .map_err(|e| anyhow::anyhow!("invalid webhook signing secret: {e}"))?;
        mac.update(timestamp_secs.to_string().as_bytes());
        mac.update(b".");
        mac.update(body);

        let signature = BASE64_STANDARD.encode(mac.finalize().into_bytes());
        Ok(format!("sha256={signature}"))
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
        let tenant_ids =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants ORDER BY created_at")
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

        let mut results: Vec<(uuid::Uuid, Result<(), String>, i32)> =
            Vec::with_capacity(rows.len());
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

    async fn flush_webhook_events_all_tenants(&self) -> anyhow::Result<()> {
        let tenant_ids =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM tenants ORDER BY created_at")
                .fetch_all(&self.pool)
                .await?;

        for tenant_id in tenant_ids {
            if let Err(err) = self.flush_webhook_events_for_tenant(tenant_id).await {
                error!(%tenant_id, "Webhook events flush failed: {}", err);
            }
        }

        Ok(())
    }

    async fn flush_webhook_events_for_tenant(&self, tenant_id: uuid::Uuid) -> anyhow::Result<()> {
        let mut lock_tx = self.begin_tenant_tx(tenant_id).await?;
        let rows = sqlx::query_as::<_, WebhookDispatchRow>(
            r#"
            WITH candidates AS (
                SELECT we.id, we.endpoint_id
                FROM webhook_events we
                JOIN webhook_endpoints ep ON ep.id = we.endpoint_id
                WHERE we.delivered_at IS NULL
                  AND we.next_attempt_at <= NOW()
                  AND we.attempts <= we.max_retries
                  AND ep.deleted_at IS NULL
                  AND ep.enabled = true
                  AND (
                    we.locked_at IS NULL
                    OR we.locked_at < NOW() - ($1 * INTERVAL '1 millisecond')
                  )
                ORDER BY we.next_attempt_at, we.created_at
                FOR UPDATE OF we SKIP LOCKED
                LIMIT $2
            )
            UPDATE webhook_events we
            SET locked_at = NOW(),
                locked_by = $3
            FROM candidates c
            JOIN webhook_endpoints ep ON ep.id = c.endpoint_id
            WHERE we.id = c.id
            RETURNING
                we.id,
                we.endpoint_id,
                we.event_type,
                we.payload,
                EXTRACT(EPOCH FROM we.occurred_at)::bigint AS occurred_at_unix,
                we.attempts,
                we.max_retries,
                ep.url,
                ep.signing_secret,
                ep.timeout_ms
            "#,
        )
        .bind(WEBHOOK_LOCK_TIMEOUT_MS)
        .bind(WEBHOOK_FLUSH_MAX_BATCH)
        .bind(self.worker_id)
        .fetch_all(&mut *lock_tx)
        .await?;
        lock_tx.commit().await?;

        if rows.is_empty() {
            return Ok(());
        }

        let mut outcomes = Vec::with_capacity(rows.len());
        for row in rows {
            outcomes.push(self.dispatch_webhook_event(&row).await);
        }

        let mut update_tx = self.begin_tenant_tx(tenant_id).await?;
        for outcome in outcomes {
            match outcome.error {
                None => {
                    sqlx::query(
                        r#"
                        UPDATE webhook_events
                        SET delivered_at = NOW(),
                            last_error = NULL,
                            locked_at = NULL,
                            locked_by = NULL,
                            updated_at = NOW()
                        WHERE id = $1
                        "#,
                    )
                    .bind(outcome.event_id)
                    .execute(&mut *update_tx)
                    .await?;

                    sqlx::query(
                        r#"
                        UPDATE webhook_endpoints
                        SET last_success_at = NOW(),
                            last_status_code = $2,
                            last_error = NULL,
                            updated_at = NOW()
                        WHERE id = $1
                        "#,
                    )
                    .bind(outcome.endpoint_id)
                    .bind(outcome.status_code)
                    .execute(&mut *update_tx)
                    .await?;
                }
                Some(error) => {
                    let error_msg = error.chars().take(500).collect::<String>();
                    let new_attempt = outcome.attempts.saturating_add(1);
                    let should_retry = new_attempt <= outcome.max_retries;

                    if should_retry {
                        let delay_ms = Self::outbox_retry_delay_ms(new_attempt);
                        sqlx::query(
                            r#"
                            UPDATE webhook_events
                            SET attempts = attempts + 1,
                                last_error = $2,
                                next_attempt_at = NOW() + ($3 * INTERVAL '1 millisecond'),
                                locked_at = NULL,
                                locked_by = NULL,
                                updated_at = NOW()
                            WHERE id = $1
                            "#,
                        )
                        .bind(outcome.event_id)
                        .bind(&error_msg)
                        .bind(delay_ms)
                        .execute(&mut *update_tx)
                        .await?;
                    } else {
                        sqlx::query(
                            r#"
                            UPDATE webhook_events
                            SET attempts = attempts + 1,
                                last_error = $2,
                                next_attempt_at = NOW(),
                                locked_at = NULL,
                                locked_by = NULL,
                                updated_at = NOW()
                            WHERE id = $1
                            "#,
                        )
                        .bind(outcome.event_id)
                        .bind(&error_msg)
                        .execute(&mut *update_tx)
                        .await?;

                        warn!(
                            event_id = %outcome.event_id,
                            endpoint_id = %outcome.endpoint_id,
                            max_retries = outcome.max_retries,
                            "Webhook event reached max retries"
                        );
                    }

                    sqlx::query(
                        r#"
                        UPDATE webhook_endpoints
                        SET last_failure_at = NOW(),
                            last_status_code = $2,
                            last_error = $3,
                            updated_at = NOW()
                        WHERE id = $1
                        "#,
                    )
                    .bind(outcome.endpoint_id)
                    .bind(outcome.status_code)
                    .bind(&error_msg)
                    .execute(&mut *update_tx)
                    .await?;
                }
            }
        }

        update_tx.commit().await?;
        Ok(())
    }

    async fn dispatch_webhook_event(&self, row: &WebhookDispatchRow) -> WebhookDispatchOutcome {
        let webhook_url =
            match validate_webhook_url(&row.url, self.allow_internal_webhook_urls).await {
                Ok(url) => url,
                Err(err) => {
                    return WebhookDispatchOutcome {
                        event_id: row.id,
                        endpoint_id: row.endpoint_id,
                        attempts: row.attempts,
                        max_retries: row.max_retries,
                        status_code: None,
                        error: Some(sanitize_error_message(format!(
                            "invalid webhook endpoint url: {err}"
                        ))),
                    };
                }
            };

        let request_payload = json!({
            "id": row.id,
            "type": row.event_type,
            "occurred_at": row.occurred_at_unix,
            "payload": row.payload.0,
        });

        let body = match serde_json::to_vec(&request_payload) {
            Ok(bytes) => bytes,
            Err(err) => {
                return WebhookDispatchOutcome {
                    event_id: row.id,
                    endpoint_id: row.endpoint_id,
                    attempts: row.attempts,
                    max_retries: row.max_retries,
                    status_code: None,
                    error: Some(sanitize_error_message(format!(
                        "serialize webhook payload failed: {err}"
                    ))),
                };
            }
        };

        let timestamp_secs = Self::unix_now_secs();
        let signature = match Self::webhook_signature(&row.signing_secret, timestamp_secs, &body) {
            Ok(sig) => sig,
            Err(err) => {
                return WebhookDispatchOutcome {
                    event_id: row.id,
                    endpoint_id: row.endpoint_id,
                    attempts: row.attempts,
                    max_retries: row.max_retries,
                    status_code: None,
                    error: Some(sanitize_error_message(err.to_string())),
                };
            }
        };

        let timeout_ms = row.timeout_ms.clamp(1_000, 60_000) as u64;

        let result = self
            .push_http_client
            .post(webhook_url)
            .timeout(Duration::from_millis(timeout_ms))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(WEBHOOK_EVENT_ID_HEADER, row.id.to_string())
            .header(WEBHOOK_EVENT_TYPE_HEADER, &row.event_type)
            .header(
                WEBHOOK_SIGNATURE_TIMESTAMP_HEADER,
                timestamp_secs.to_string(),
            )
            .header(WEBHOOK_SIGNATURE_HEADER, signature)
            .body(body)
            .send()
            .await;

        match result {
            Ok(response) => {
                let status_code = i32::from(response.status().as_u16());
                if response.status().is_success() {
                    WebhookDispatchOutcome {
                        event_id: row.id,
                        endpoint_id: row.endpoint_id,
                        attempts: row.attempts,
                        max_retries: row.max_retries,
                        status_code: Some(status_code),
                        error: None,
                    }
                } else {
                    let response_body = match response.text().await {
                        Ok(body) => {
                            let trimmed = body.trim();
                            if trimmed.is_empty() {
                                String::new()
                            } else {
                                format!("; body={}", truncate_chars(trimmed, 280))
                            }
                        }
                        Err(err) => format!("; read_body_failed={err}"),
                    };

                    WebhookDispatchOutcome {
                        event_id: row.id,
                        endpoint_id: row.endpoint_id,
                        attempts: row.attempts,
                        max_retries: row.max_retries,
                        status_code: Some(status_code),
                        error: Some(sanitize_error_message(format!(
                            "webhook request returned non-success status {status_code}{response_body}"
                        ))),
                    }
                }
            }
            Err(err) => WebhookDispatchOutcome {
                event_id: row.id,
                endpoint_id: row.endpoint_id,
                attempts: row.attempts,
                max_retries: row.max_retries,
                status_code: None,
                error: Some(sanitize_error_message(format!(
                    "webhook request failed: {err}"
                ))),
            },
        }
    }

    async fn handle_ingest_reserved(&self, reserved: ReservedTask<IngestTask>) {
        let queue = QUEUE_INGEST;
        let task = reserved.task;
        let task_id = task.id;
        let ordering_key = task.ordering_key.clone();
        let ordering_seq = task.ordering_seq;

        match self
            .task_queue
            .try_acquire_ordering_gate(
                queue,
                task_id,
                ordering_key.as_deref(),
                ordering_seq,
                VISIBILITY_TIMEOUT_INGEST_MS,
            )
            .await
        {
            Ok(OrderedTaskGate::Unordered | OrderedTaskGate::Acquired) => {}
            Ok(OrderedTaskGate::Blocked) => {
                if let Err(e) = self
                    .task_queue
                    .release_reserved_back_to_queue(queue, &reserved.raw_payload)
                    .await
                {
                    error!(
                        "Failed to release blocked ingest task {} back to queue: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(OrderedTaskGate::Stale) => {
                warn!(
                    task_id = %task_id,
                    ordering_key,
                    ordering_seq,
                    "Dropping stale ordered ingest task"
                );
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark stale ingest task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack stale ingest task {}: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release ingest ordering gate for {}: {}",
                        task_id, e
                    );
                }
                return;
            }
            Err(e) => {
                error!(
                    "Failed to acquire ingest ordering gate for {}: {}",
                    task_id, e
                );
                return;
            }
        }

        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack duplicate ingest task {}: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        true,
                    )
                    .await
                {
                    error!(
                        "Failed to release ingest ordering gate for {}: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check ingest task {} done: {}", task_id, e);
                if let Err(release_err) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release ingest ordering gate after done-check error for {}: {}",
                        task_id, release_err
                    );
                }
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        true,
                    )
                    .await
                {
                    error!(
                        "Failed to release ingest ordering gate for {}: {}",
                        task_id, e
                    );
                }
            }
            Ok(Err(e)) => {
                let raw_error_msg = e.to_string();
                let mut error_msg = sanitize_error_message(&raw_error_msg);
                if is_ai_rate_limited_error(&raw_error_msg) {
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release ingest ordering gate for {}: {}",
                        task_id, e
                    );
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release ingest ordering gate for {}: {}",
                        task_id, e
                    );
                }
            }
        }
    }

    async fn handle_ai_reserved(&self, reserved: ReservedTask<AiTask>) {
        let queue = QUEUE_AI;
        let task = reserved.task;
        let task_id = task.id;
        let ordering_key = task.ordering_key.clone();
        let ordering_seq = task.ordering_seq;

        match self
            .task_queue
            .try_acquire_ordering_gate(
                queue,
                task_id,
                ordering_key.as_deref(),
                ordering_seq,
                VISIBILITY_TIMEOUT_AI_MS,
            )
            .await
        {
            Ok(OrderedTaskGate::Unordered | OrderedTaskGate::Acquired) => {}
            Ok(OrderedTaskGate::Blocked) => {
                if let Err(e) = self
                    .task_queue
                    .release_reserved_back_to_queue(queue, &reserved.raw_payload)
                    .await
                {
                    error!(
                        "Failed to release blocked AI task {} back to queue: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(OrderedTaskGate::Stale) => {
                warn!(
                    task_id = %task_id,
                    ordering_key,
                    ordering_seq,
                    "Dropping stale ordered AI task"
                );
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark stale AI task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack stale AI task {}: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!("Failed to release AI ordering gate for {}: {}", task_id, e);
                }
                return;
            }
            Err(e) => {
                error!("Failed to acquire AI ordering gate for {}: {}", task_id, e);
                return;
            }
        }

        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack duplicate AI task {}: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        true,
                    )
                    .await
                {
                    error!("Failed to release AI ordering gate for {}: {}", task_id, e);
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check AI task {} done: {}", task_id, e);
                if let Err(release_err) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release AI ordering gate after done-check error for {}: {}",
                        task_id, release_err
                    );
                }
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        true,
                    )
                    .await
                {
                    error!("Failed to release AI ordering gate for {}: {}", task_id, e);
                }
            }
            Ok(Err(e)) => {
                let error_msg = sanitize_error_message(e.to_string());
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!("Failed to release AI ordering gate for {}: {}", task_id, e);
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!("Failed to release AI ordering gate for {}: {}", task_id, e);
                }
            }
        }
    }

    async fn handle_push_reserved(&self, reserved: ReservedTask<PushTask>) {
        let queue = QUEUE_PUSH;
        let task = reserved.task;
        let task_id = task.id;
        let ordering_key = task.ordering_key.clone();
        let ordering_seq = task.ordering_seq;

        match self
            .task_queue
            .try_acquire_ordering_gate(
                queue,
                task_id,
                ordering_key.as_deref(),
                ordering_seq,
                VISIBILITY_TIMEOUT_PUSH_MS,
            )
            .await
        {
            Ok(OrderedTaskGate::Unordered | OrderedTaskGate::Acquired) => {}
            Ok(OrderedTaskGate::Blocked) => {
                if let Err(e) = self
                    .task_queue
                    .release_reserved_back_to_queue(queue, &reserved.raw_payload)
                    .await
                {
                    error!(
                        "Failed to release blocked push task {} back to queue: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(OrderedTaskGate::Stale) => {
                warn!(
                    task_id = %task_id,
                    ordering_key,
                    ordering_seq,
                    "Dropping stale ordered push task"
                );
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark stale push task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack stale push task {}: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release push ordering gate for {}: {}",
                        task_id, e
                    );
                }
                return;
            }
            Err(e) => {
                error!(
                    "Failed to acquire push ordering gate for {}: {}",
                    task_id, e
                );
                return;
            }
        }

        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack duplicate push task {}: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        true,
                    )
                    .await
                {
                    error!(
                        "Failed to release push ordering gate for {}: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check push task {} done: {}", task_id, e);
                if let Err(release_err) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release push ordering gate after done-check error for {}: {}",
                        task_id, release_err
                    );
                }
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        true,
                    )
                    .await
                {
                    error!(
                        "Failed to release push ordering gate for {}: {}",
                        task_id, e
                    );
                }
            }
            Ok(Err(e)) => {
                let error_msg = sanitize_error_message(e.to_string());
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release push ordering gate for {}: {}",
                        task_id, e
                    );
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
                if let Err(e) = self
                    .task_queue
                    .release_ordering_gate(
                        queue,
                        task_id,
                        ordering_key.as_deref(),
                        ordering_seq,
                        false,
                    )
                    .await
                {
                    error!(
                        "Failed to release push ordering gate for {}: {}",
                        task_id, e
                    );
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
        self.ensure_incremental_seed_for_tenant(tenant_id)
            .await
            .context("seed incremental checker from existing hashes")?;

        let source_service = SourceService::new(self.pool.clone());
        let crawl_log_service = CrawlLogService::new(self.pool.clone());

        // Fetch source record for encoding/render_mode metadata
        let source = source_service
            .get_by_id(tenant_id, task.source_id)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to fetch source {}: {}", task.source_id, e))?;

        // Build CrawlJobConfig from IngestTask + source record
        let job = CrawlJobConfig {
            tenant_id,
            source_id: task.source_id,
            kind: task.source_type.clone(),
            source_name: source.name.clone(),
            url: task.url.clone(),
            config: task.config.clone(),
            encoding: source.encoding.clone(),
            render_mode: Some(source.render_mode.clone()),
            allow_internal: self.allow_internal_source_urls,
            enable_ai: false, // AI runs via separate queue, not in-pipeline
            respect_robots: true,
        };

        // Start crawl log entry (non-critical, failures are not fatal)
        let crawl_log_id = crawl_log_service
            .start(
                tenant_id,
                CreateCrawlLog {
                    tenant_id,
                    source_id: task.source_id,
                },
            )
            .await
            .ok();

        let crawl_start = Instant::now();
        let result = self.orchestrator.run_job(&job).await;
        let crawl_duration_ms = crawl_start.elapsed().as_millis() as i32;

        // Map CrawlJobResult to the existing article processing flow
        match result.outcome {
            CrawlOutcome::Success | CrawlOutcome::Partial => {
                let articles = result.articles;

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
                    let (domain_root, domain_sub, authority_level, importance) =
                        derive_ingest_legal_metadata(
                            &task.source_type,
                            Some(source.priority),
                            &link,
                            &title,
                            content.as_deref(),
                            article.extracted_issuer.as_deref(),
                        );
                    let region_code =
                        derive_region_code(article.extracted_region_code.clone(), &link);

                    create_articles.push(CreateArticle {
                        source_id: task.source_id,
                        title,
                        link,
                        content,
                        author,
                        published_at,
                        domain_root,
                        domain_sub,
                        authority_level,
                        importance,
                        issuer: article.extracted_issuer,
                        doc_number: article.extracted_doc_number,
                        effective_date: article.extracted_effective_date,
                        region_code,
                        content_hash: article.content_hash,
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

                if let Err(err) = self
                    .append_domain_event(
                        tenant_id,
                        DomainEventRecord {
                            aggregate_type: "source".to_string(),
                            aggregate_id: task.source_id,
                            aggregate_version: 0,
                            event_type: "ingest.completed".to_string(),
                            dedupe_key: Self::domain_event_dedupe_key("ingest", task.source_id),
                            payload: json!({
                                "source_id": task.source_id,
                                "article_ids": saved_article_ids,
                                "article_count": saved_article_ids.len(),
                            }),
                            metadata: json!({
                                "component": "worker",
                                "task": "ingest",
                            }),
                        },
                    )
                    .await
                {
                    warn!(%tenant_id, source_id = %task.source_id, error = %err, "append ingest domain event failed");
                }

                info!(
                    "Upserted {} articles from source {} (crawl outcome: {})",
                    saved_article_ids.len(),
                    task.source_id,
                    result.outcome,
                );

                // Update source health monitoring with crawl statistics
                let fetch_stats = CrawlFetchStats {
                    articles_fetched: result.stats.articles_found,
                    duration_ms: Some(crawl_duration_ms),
                };
                let _ = source_service
                    .update_last_fetch_with_stats(
                        tenant_id,
                        task.source_id,
                        None,
                        Some(fetch_stats),
                    )
                    .await;

                // Finish crawl log entry
                if let Some(log_id) = crawl_log_id {
                    let _ = crawl_log_service
                        .finish(
                            tenant_id,
                            log_id,
                            FinishCrawlLog {
                                status: "completed".to_string(),
                                articles_found: result.stats.articles_found,
                                articles_new: result.stats.articles_new,
                                articles_updated: result.stats.articles_updated,
                                articles_skipped: result.stats.articles_skipped,
                                error_message: None,
                                duration_ms: crawl_duration_ms,
                                metadata: None,
                            },
                        )
                        .await;
                }

                Ok(())
            }
            CrawlOutcome::Failed => {
                let error_msg = result.stats.errors.join("; ");
                let msg = sanitize_error_message(&error_msg);
                error!("Crawl job failed for source {}: {}", task.source_id, msg);

                // Update source health monitoring with failure
                let fetch_stats = CrawlFetchStats {
                    articles_fetched: 0,
                    duration_ms: Some(crawl_duration_ms),
                };
                let _ = source_service
                    .update_last_fetch_with_stats(
                        tenant_id,
                        task.source_id,
                        Some(msg.as_str()),
                        Some(fetch_stats),
                    )
                    .await;

                // Finish crawl log entry with failure
                if let Some(log_id) = crawl_log_id {
                    let _ = crawl_log_service
                        .finish(
                            tenant_id,
                            log_id,
                            FinishCrawlLog {
                                status: "failed".to_string(),
                                articles_found: result.stats.articles_found,
                                articles_new: 0,
                                articles_updated: 0,
                                articles_skipped: 0,
                                error_message: Some(msg.clone()),
                                duration_ms: crawl_duration_ms,
                                metadata: None,
                            },
                        )
                        .await;
                }

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

        let ai_service = match &self.ai_service {
            Some(s) => s,
            None => {
                warn!(
                    article_id = %task.article_id,
                    "AI service not configured, switching to rule-based fallback"
                );
                return self
                    .process_ai_task_with_fallback(tenant_id, task, &article)
                    .await;
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
                let mut stage_reports = Vec::with_capacity(4);

                let (classify, classify_stage) =
                    match ai_service.classify(&article.title, content).await {
                        Ok(classify) => (classify, AiStageReport::success("classify")),
                        Err(err) => {
                            warn!(
                                article_id = %task.article_id,
                                error = %err,
                                "AI full classify failed, switching to fallback"
                            );
                            (
                                ai_fallback_classify(&article.title, content),
                                AiStageReport::degraded(
                                    "classify",
                                    sanitize_error_message(err.to_string()),
                                ),
                            )
                        }
                    };
                stage_reports.push(classify_stage);

                let (summary, summary_stage) =
                    match ai_service.summarize(&article.title, content).await {
                        Ok(summary) => (summary, AiStageReport::success("summarize")),
                        Err(err) => {
                            warn!(
                                article_id = %task.article_id,
                                error = %err,
                                "AI full summarize failed, switching to fallback"
                            );
                            (
                                ai_fallback_summary(&article.title, content),
                                AiStageReport::degraded(
                                    "summarize",
                                    sanitize_error_message(err.to_string()),
                                ),
                            )
                        }
                    };
                stage_reports.push(summary_stage);

                let (risk, risk_stage) = match ai_service.assess_risk(&article.title, content).await
                {
                    Ok(risk) => (risk, AiStageReport::success("risk_assess")),
                    Err(err) => {
                        warn!(
                            article_id = %task.article_id,
                            error = %err,
                            "AI full risk assessment failed, switching to fallback"
                        );
                        (
                            ai_fallback_risk(&article.title, content),
                            AiStageReport::degraded(
                                "risk_assess",
                                sanitize_error_message(err.to_string()),
                            ),
                        )
                    }
                };
                stage_reports.push(risk_stage);

                let (tags, tags_stage) =
                    match ai_service.extract_tags(&article.title, content).await {
                        Ok(tags) => (tags, AiStageReport::success("extract_tags")),
                        Err(err) => {
                            warn!(
                                article_id = %task.article_id,
                                error = %err,
                                "AI full tag extraction failed, switching to fallback"
                            );
                            (
                                ai_fallback_tags(&article.title, content),
                                AiStageReport::degraded(
                                    "extract_tags",
                                    sanitize_error_message(err.to_string()),
                                ),
                            )
                        }
                    };
                stage_reports.push(tags_stage);

                // Knowledge graph: extract entities and relations
                if let Some(ref ks) = self.knowledge_service {
                    let entities_stage = match ks
                        .process_article(tenant_id, task.article_id, &article.title, content)
                        .await
                    {
                        Ok(ids) => {
                            info!(
                                article_id = %task.article_id,
                                entity_count = ids.len(),
                                "Entity extraction succeeded"
                            );
                            AiStageReport::success("extract_entities")
                        }
                        Err(err) => {
                            warn!(
                                article_id = %task.article_id,
                                error = %err,
                                "AI full entity extraction failed, degraded"
                            );
                            AiStageReport::degraded(
                                "extract_entities",
                                sanitize_error_message(err.to_string()),
                            )
                        }
                    };
                    stage_reports.push(entities_stage);
                }

                let stage_summary = summarize_ai_full_stages(&stage_reports);

                self.update_article_full(
                    tenant_id,
                    task.article_id,
                    &classify,
                    &summary,
                    &risk,
                    &tags,
                    &stage_summary,
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
                    article_id = %task.article_id,
                    full_status = stage_summary.full_status,
                    partial_success = stage_summary.partial_success,
                    degraded = stage_summary.degraded,
                    "AI full processing completed"
                );
                Ok(())
            }
            AiTaskType::Classify => {
                let (classify, degraded) = match ai_service.classify(&article.title, content).await
                {
                    Ok(classify) => (classify, false),
                    Err(err) => {
                        warn!(
                            article_id = %task.article_id,
                            error = %err,
                            "AI classify failed, switching to fallback"
                        );
                        (ai_fallback_classify(&article.title, content), true)
                    }
                };
                self.update_article_classify(tenant_id, task.article_id, &classify, degraded)
                    .await?;
                info!("AI classify completed for article: {}", task.article_id);
                Ok(())
            }
            AiTaskType::Summarize => {
                let (summary, degraded) = match ai_service.summarize(&article.title, content).await
                {
                    Ok(summary) => (summary, false),
                    Err(err) => {
                        warn!(
                            article_id = %task.article_id,
                            error = %err,
                            "AI summarize failed, switching to fallback"
                        );
                        (ai_fallback_summary(&article.title, content), true)
                    }
                };
                self.update_article_summary(tenant_id, task.article_id, &summary, degraded)
                    .await?;
                info!("AI summarize completed for article: {}", task.article_id);
                Ok(())
            }
            AiTaskType::RiskAssess => {
                let (risk, degraded) = match ai_service.assess_risk(&article.title, content).await {
                    Ok(risk) => (risk, false),
                    Err(err) => {
                        warn!(
                            article_id = %task.article_id,
                            error = %err,
                            "AI risk assessment failed, switching to fallback"
                        );
                        (ai_fallback_risk(&article.title, content), true)
                    }
                };
                self.update_article_risk(tenant_id, task.article_id, &risk, degraded)
                    .await?;
                info!(
                    "AI risk assessment completed for article: {}",
                    task.article_id
                );
                Ok(())
            }
            AiTaskType::ExtractTags => {
                let (tags, degraded) = match ai_service.extract_tags(&article.title, content).await
                {
                    Ok(tags) => (tags, false),
                    Err(err) => {
                        warn!(
                            article_id = %task.article_id,
                            error = %err,
                            "AI tag extraction failed, switching to fallback"
                        );
                        (ai_fallback_tags(&article.title, content), true)
                    }
                };
                self.update_article_tags(tenant_id, task.article_id, &tags, degraded)
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
            AiTaskType::ExtractEntities => {
                let ks = self.knowledge_service.as_ref().ok_or_else(|| {
                    anyhow::anyhow!(
                        "KnowledgeService not configured, cannot process ExtractEntities task"
                    )
                })?;
                match ks
                    .process_article(tenant_id, task.article_id, &article.title, content)
                    .await
                {
                    Ok(ids) => {
                        info!(
                            article_id = %task.article_id,
                            entity_count = ids.len(),
                            "Entity extraction completed"
                        );
                        Ok(())
                    }
                    Err(err) => {
                        error!(
                            article_id = %task.article_id,
                            error = %err,
                            "Entity extraction failed"
                        );
                        Err(anyhow::anyhow!("Entity extraction failed: {}", err))
                    }
                }
            }
        }
    }

    async fn process_ai_task_with_fallback(
        &self,
        tenant_id: uuid::Uuid,
        task: AiTask,
        article: &law_eye_db::Article,
    ) -> anyhow::Result<()> {
        let content = article.content.as_deref().unwrap_or("").trim();
        match task.task_type {
            AiTaskType::Full => {
                let classify = ai_fallback_classify(&article.title, content);
                let summary = ai_fallback_summary(&article.title, content);
                let risk = ai_fallback_risk(&article.title, content);
                let tags = ai_fallback_tags(&article.title, content);
                let stage_summary = summarize_ai_full_stages(&[
                    AiStageReport::degraded("classify", "ai service unavailable".to_string()),
                    AiStageReport::degraded("summarize", "ai service unavailable".to_string()),
                    AiStageReport::degraded("risk_assess", "ai service unavailable".to_string()),
                    AiStageReport::degraded("extract_tags", "ai service unavailable".to_string()),
                ]);
                self.update_article_full(
                    tenant_id,
                    task.article_id,
                    &classify,
                    &summary,
                    &risk,
                    &tags,
                    &stage_summary,
                )
                .await
            }
            AiTaskType::Classify => {
                let classify = ai_fallback_classify(&article.title, content);
                self.update_article_classify(tenant_id, task.article_id, &classify, true)
                    .await
            }
            AiTaskType::Summarize => {
                let summary = ai_fallback_summary(&article.title, content);
                self.update_article_summary(tenant_id, task.article_id, &summary, true)
                    .await
            }
            AiTaskType::RiskAssess => {
                let risk = ai_fallback_risk(&article.title, content);
                self.update_article_risk(tenant_id, task.article_id, &risk, true)
                    .await
            }
            AiTaskType::ExtractTags => {
                let tags = ai_fallback_tags(&article.title, content);
                self.update_article_tags(tenant_id, task.article_id, &tags, true)
                    .await
            }
            AiTaskType::Embed => {
                warn!(
                    article_id = %task.article_id,
                    "AI embed task skipped in fallback mode"
                );
                Ok(())
            }
            AiTaskType::ExtractEntities => {
                warn!(
                    article_id = %task.article_id,
                    "AI entity extraction skipped in fallback mode"
                );
                Ok(())
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn update_article_full(
        &self,
        tenant_id: uuid::Uuid,
        article_id: uuid::Uuid,
        classify: &ClassifyResult,
        summary: &SummaryResult,
        risk: &RiskAssessment,
        tags: &TagsResult,
        stage_summary: &AiFullStageSummary,
    ) -> anyhow::Result<()> {
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
            "full_status": stage_summary.full_status,
            "partial_success": stage_summary.partial_success,
            "degraded": stage_summary.degraded,
            "degraded_reason": stage_summary.error_summary.as_deref(),
            "stage_status": &stage_summary.stage_status,
            "tasks": &stage_summary.tasks,
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
        degraded: bool,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "category_confidence": classify.confidence,
            "sub_categories": &classify.sub_categories,
            "reasoning": &classify.reasoning,
            "degraded": degraded,
            "degraded_reason": if degraded { Some("rule-based fallback") } else { None },
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
        degraded: bool,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "key_points": &summary.key_points,
            "entities": &summary.entities,
            "abstract": &summary.abstract_text,
            "degraded": degraded,
            "degraded_reason": if degraded { Some("rule-based fallback") } else { None },
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
        degraded: bool,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "risk_dimensions": &risk.dimensions,
            "recommendations": &risk.recommendations,
            "risk_level": format!("{:?}", risk.level).to_lowercase(),
            "degraded": degraded,
            "degraded_reason": if degraded { Some("rule-based fallback") } else { None },
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
        degraded: bool,
    ) -> anyhow::Result<()> {
        let metadata_patch = json!({
            "tags": &tags.tags,
            "keywords": &tags.keywords,
            "degraded": degraded,
            "degraded_reason": if degraded { Some("rule-based fallback") } else { None },
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
                    if let Some(first_article_id) = task.article_ids.first().copied() {
                        if let Err(err) = self
                            .append_domain_event(
                                tenant_id,
                                DomainEventRecord {
                                    aggregate_type: "article".to_string(),
                                    aggregate_id: first_article_id,
                                    aggregate_version: 0,
                                    event_type: "push.sent".to_string(),
                                    dedupe_key: Self::domain_event_dedupe_key(
                                        "push",
                                        first_article_id,
                                    ),
                                    payload: json!({
                                        "article_ids": task.article_ids,
                                        "article_count": articles.len(),
                                        "webhook_url": task.webhook_url,
                                    }),
                                    metadata: json!({
                                        "component": "worker",
                                        "task": "push",
                                    }),
                                },
                            )
                            .await
                        {
                            warn!(%tenant_id, error = %err, "append push domain event failed");
                        }
                    }
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

    // ══════════════════════════════════════════════════════════════
    // 报告导出队列处理
    // ══════════════════════════════════════════════════════════════

    async fn handle_report_export_reserved(&self, reserved: ReservedTask<ReportExportTask>) {
        let queue = QUEUE_REPORT_EXPORT;
        let task = reserved.task;
        let task_id = task.id;

        // 无需 ordering gate，报告导出不需要顺序保证
        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!(
                        "Failed to ack duplicate report export task {}: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!("Failed to check report export task {} done: {}", task_id, e);
                return;
            }
        }

        let payload = task.payload.clone();
        let export_report_id = payload.report_id;
        let export_tenant_id = payload.tenant_id;
        let export_format = payload.format.clone();
        let request_id = task_id.to_string();
        let result = timeout(
            Duration::from_secs(TASK_TIMEOUT_REPORT_EXPORT_SECS),
            self.process_report_export_task(payload, &request_id),
        )
        .await;

        match result {
            Ok(Ok(())) => {
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!("Failed to mark report export task {} done: {}", task_id, e);
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack report export task {}: {}", task_id, e);
                }
            }
            Ok(Err(e)) => {
                let error_msg = sanitize_error_message(e.to_string());
                error!(
                    %task_id,
                    report_id = %export_report_id,
                    tenant_id = %export_tenant_id,
                    format = %export_format,
                    %error_msg,
                    "Report export task failed"
                );
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
                            error!("Failed to ack failed report export task {}: {}", task_id, e);
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for report export task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
            Err(_) => {
                let error_msg = format!("TASK_TIMEOUT after {}s", TASK_TIMEOUT_REPORT_EXPORT_SECS);
                error!(
                    %task_id,
                    report_id = %export_report_id,
                    tenant_id = %export_tenant_id,
                    format = %export_format,
                    %error_msg,
                    "Report export task timed out"
                );
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
                            error!(
                                "Failed to ack timed out report export task {}: {}",
                                task_id, e
                            );
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for timed out report export task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
        }
    }

    /// 处理报告导出任务：获取报告 → 获取模板 → 聚合数据 → 渲染 → 上传到对象存储 → 更新报告
    async fn process_report_export_task(
        &self,
        task: ReportExportTask,
        request_id: &str,
    ) -> anyhow::Result<()> {
        use law_eye_core::report::{DocxExporter, ExportFormat, HtmlExporter, PdfExporter};

        let tenant_id = task.tenant_id;
        let report_id = task.report_id;
        let format: ExportFormat = task
            .format
            .parse()
            .map_err(|e| anyhow::anyhow!("Invalid export format '{}': {}", task.format, e))?;

        info!(
            %report_id,
            %tenant_id,
            request_id = %request_id,
            format = %task.format,
            "Processing report export task"
        );

        // 1. 获取报告详情
        let report = self
            .report_service
            .get_report_by_id(tenant_id, report_id)
            .await
            .map_err(|e| anyhow::anyhow!("获取报告失败: {}", e))?;

        // 2. 获取模板（如果报告关联了模板）
        let template = if let Some(template_id) = report.template_id {
            Some(
                self.report_template_service
                    .get_by_id(tenant_id, template_id)
                    .await
                    .map_err(|e| anyhow::anyhow!("获取模板失败: {}", e))?,
            )
        } else {
            None
        };

        // 3. 聚合报告期间数据
        let aggregated = self
            .report_service
            .aggregate_period_data(tenant_id, report.period_start, report.period_end)
            .await
            .map_err(|e| anyhow::anyhow!("聚合数据失败: {}", e))?;

        let period_start_str = report.period_start.to_string();
        let period_end_str = report.period_end.to_string();

        // 4. 根据格式渲染导出
        let (bytes, content_type) = match format {
            ExportFormat::Html => {
                let template = template
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("HTML 导出需要报告模板"))?;
                let html = HtmlExporter::render(
                    template,
                    &report.title,
                    &report.report_number,
                    &period_start_str,
                    &period_end_str,
                    &aggregated,
                )
                .map_err(|e| anyhow::anyhow!("HTML 渲染失败: {}", e))?;
                (html.into_bytes(), "text/html; charset=utf-8")
            }
            ExportFormat::Pdf => {
                // 先渲染 HTML，再转 PDF
                let template = template
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("PDF 导出需要报告模板"))?;
                let html = HtmlExporter::render(
                    template,
                    &report.title,
                    &report.report_number,
                    &period_start_str,
                    &period_end_str,
                    &aggregated,
                )
                .map_err(|e| anyhow::anyhow!("HTML 渲染失败: {}", e))?;

                let pdf_exporter = PdfExporter::from_env()
                    .map_err(|e| anyhow::anyhow!("PDF 导出器初始化失败: {}", e))?;
                let page_config = template.page_config.clone();
                let pdf_bytes = pdf_exporter
                    .html_to_pdf(&html, &page_config, request_id)
                    .await
                    .map_err(|e| anyhow::anyhow!("PDF 生成失败: {}", e))?;
                (pdf_bytes, "application/pdf")
            }
            ExportFormat::Docx => {
                let docx_bytes = DocxExporter::generate(
                    &report.title,
                    &report.report_number,
                    &period_start_str,
                    &period_end_str,
                    &aggregated,
                )
                .map_err(|e| anyhow::anyhow!("DOCX 生成失败: {}", e))?;
                (
                    docx_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            }
        };

        let byte_size = bytes.len();
        let ext = format.extension();
        let object_key = format!(
            "tenants/{}/reports/{}/export_{}.{}",
            tenant_id,
            report_id,
            chrono::Utc::now().format("%Y%m%d%H%M%S"),
            ext
        );

        // 5. 上传到对象存储并登记 objects 元数据，避免被 orphan 清理误删
        if let Some(ref object_service) = self.object_service {
            object_service
                .upload_raw_bytes_with_record(
                    tenant_id,
                    Some(task.requested_by),
                    OBJECT_KIND_REPORT_EXPORT,
                    &object_key,
                    content_type,
                    bytes,
                )
                .await
                .map_err(|e| anyhow::anyhow!("上传导出文件失败: {}", e))?;

            info!(
                %report_id,
                %object_key,
                request_id = %request_id,
                byte_size,
                "Report export uploaded to object storage"
            );

            // 6. 只在上传成功后才更新报告中的导出路径
            match self
                .report_service
                .set_export_key(tenant_id, report_id, format, &object_key, report.version)
                .await
            {
                Ok(()) => {}
                Err(law_eye_common::Error::Conflict(err_msg)) => {
                    warn!(
                        %report_id,
                        %tenant_id,
                        request_id = %request_id,
                        %object_key,
                        error = %err_msg,
                        "Skip stale report export key update due to CAS conflict"
                    );
                    return Ok(());
                }
                Err(e) => return Err(anyhow::anyhow!("更新导出路径失败: {}", e)),
            }
        } else {
            return Err(anyhow::anyhow!(
                "Object storage not configured, cannot complete report export for report {}",
                report_id
            ));
        }

        info!(
            %report_id,
            %tenant_id,
            request_id = %request_id,
            format = %task.format,
            %object_key,
            "Report export task completed successfully"
        );

        Ok(())
    }

    // ══════════════════════════════════════════════════════════════
    // 报告 AI 生成队列处理
    // ══════════════════════════════════════════════════════════════

    async fn handle_report_generate_reserved(&self, reserved: ReservedTask<ReportGenerateTask>) {
        let queue = QUEUE_REPORT_GENERATE;
        let task = reserved.task;
        let task_id = task.id;

        // 幂等检查
        match self.task_queue.is_done(queue, task_id).await {
            Ok(true) => {
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!(
                        "Failed to ack duplicate report generate task {}: {}",
                        task_id, e
                    );
                }
                return;
            }
            Ok(false) => {}
            Err(e) => {
                error!(
                    "Failed to check report generate task {} done: {}",
                    task_id, e
                );
                return;
            }
        }

        let payload = task.payload.clone();
        let result = timeout(
            Duration::from_secs(TASK_TIMEOUT_REPORT_GENERATE_SECS),
            self.process_report_generate_task(payload),
        )
        .await;

        match result {
            Ok(Ok(())) => {
                if let Err(e) = self.task_queue.mark_done(queue, task_id).await {
                    error!(
                        "Failed to mark report generate task {} done: {}",
                        task_id, e
                    );
                }
                if let Err(e) = self
                    .task_queue
                    .ack_reserved(queue, &reserved.raw_payload)
                    .await
                {
                    error!("Failed to ack report generate task {}: {}", task_id, e);
                }
            }
            Ok(Err(e)) => {
                let error_msg = sanitize_error_message(e.to_string());
                error!(
                    %task_id,
                    %error_msg,
                    "Report generate task failed"
                );
                // 失败时回退状态到 draft，以允许用户重新触发生成
                if let Err(rollback_err) =
                    self.rollback_report_status_on_failure(&task.payload).await
                {
                    error!(
                        %task_id,
                        error = %rollback_err,
                        "Failed to rollback report status to draft after generate failure"
                    );
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
                            error!(
                                "Failed to ack failed report generate task {}: {}",
                                task_id, e
                            );
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for report generate task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
            Err(_) => {
                let error_msg =
                    format!("TASK_TIMEOUT after {}s", TASK_TIMEOUT_REPORT_GENERATE_SECS);
                error!(
                    %task_id,
                    %error_msg,
                    "Report generate task timed out"
                );
                if let Err(rollback_err) =
                    self.rollback_report_status_on_failure(&task.payload).await
                {
                    error!(
                        %task_id,
                        error = %rollback_err,
                        "Failed to rollback report status to draft after generate timeout"
                    );
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
                            error!(
                                "Failed to ack timed out report generate task {}: {}",
                                task_id, e
                            );
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to schedule retry/DLQ for timed out report generate task {}: {}",
                            task_id, e
                        );
                    }
                }
            }
        }
    }

    /// 报告生成失败时回退状态，防止报告卡在 generating/generated 状态。
    ///
    /// 状态机合法转换：
    ///   - Generating -> Error（生成过程中失败，标记为错误状态）
    ///   - Generated -> Draft（已生成但后处理失败，回退到草稿）
    ///
    /// 注意：Generating -> Draft 不是合法转换，必须经过 Error 中间态。
    async fn rollback_report_status_on_failure(
        &self,
        task: &ReportGenerateTask,
    ) -> anyhow::Result<()> {
        use law_eye_core::report::ReportStatus;

        let report = self
            .report_service
            .get_report_by_id(task.tenant_id, task.report_id)
            .await
            .map_err(|e| anyhow::anyhow!("获取报告失败: {}", e))?;

        let current_status = ReportStatus::from_db_str(&report.status);
        match current_status {
            Some(ReportStatus::Generating) => {
                // Generating -> Error 是合法转换
                self.report_service
                    .transition_status(
                        task.tenant_id,
                        task.report_id,
                        ReportStatus::Error,
                        report.version,
                    )
                    .await
                    .map_err(|e| anyhow::anyhow!("转换到 Error 状态失败: {}", e))?;
                warn!(
                    report_id = %task.report_id,
                    from_status = "generating",
                    to_status = "error",
                    "Report generation failed, transitioned to error state"
                );
            }
            Some(ReportStatus::Generated) => {
                // Generated -> Draft 是合法转换
                self.report_service
                    .transition_status(
                        task.tenant_id,
                        task.report_id,
                        ReportStatus::Draft,
                        report.version,
                    )
                    .await
                    .map_err(|e| anyhow::anyhow!("回退到 Draft 状态失败: {}", e))?;
                warn!(
                    report_id = %task.report_id,
                    from_status = "generated",
                    to_status = "draft",
                    "Post-generation processing failed, rolled back to draft"
                );
            }
            _ => {
                // 其他状态无需回退
                debug!(
                    report_id = %task.report_id,
                    status = %report.status,
                    "Report not in generating/generated state, no rollback needed"
                );
            }
        }

        Ok(())
    }

    /// 处理报告 AI 生成任务：获取报告 → 聚合数据 → (可选) AI 摘要 → 更新报告内容 → 转换到 review
    async fn process_report_generate_task(&self, task: ReportGenerateTask) -> anyhow::Result<()> {
        use law_eye_core::report::ReportStatus;

        let tenant_id = task.tenant_id;
        let report_id = task.report_id;

        info!(
            %report_id,
            %tenant_id,
            "Processing report generate task"
        );

        // 1. 获取报告详情
        let report = self
            .report_service
            .get_report_by_id(tenant_id, report_id)
            .await
            .map_err(|e| anyhow::anyhow!("获取报告失败: {}", e))?;

        // 校验报告状态必须是 generating
        let current_status = ReportStatus::from_db_str(&report.status)
            .ok_or_else(|| anyhow::anyhow!("Unknown report status: {}", report.status))?;
        if current_status != ReportStatus::Generating {
            return Err(anyhow::anyhow!(
                "Report {} is in '{}' status, expected 'generating'",
                report_id,
                report.status
            ));
        }

        // 2. 聚合期间数据
        let aggregated = self
            .report_service
            .aggregate_period_data(tenant_id, report.period_start, report.period_end)
            .await
            .map_err(|e| anyhow::anyhow!("聚合数据失败: {}", e))?;

        // 3. (可选) 如果有 AI 服务，生成摘要
        let ai_summary = if let Some(ref ai_service) = self.ai_service {
            let overview_json =
                serde_json::to_string(&aggregated.overview).unwrap_or_else(|_| "{}".to_string());
            let highlight_titles: Vec<&str> = aggregated
                .highlights
                .iter()
                .take(5)
                .map(|h| h.title.as_str())
                .collect();

            let system_prompt =
                "你是法规监测报告的摘要生成助手。根据提供的数据生成简洁的中文执行摘要。";
            let user_prompt = format!(
                "根据以下法规监测报告数据，生成一段100-200字的中文执行摘要。\n\n\
                 报告期间: {} 至 {}\n\
                 概览: {}\n\
                 重点文章标题: {}\n\
                 风险项数量: {}\n\n\
                 请直接输出摘要内容，不要添加任何前缀或标题。",
                report.period_start,
                report.period_end,
                overview_json,
                highlight_titles.join(", "),
                aggregated.risk_items.len(),
            );

            let gateway = ai_service.gateway();
            match gateway.chat(system_prompt, &user_prompt).await {
                Ok(summary_text) => {
                    info!(
                        %report_id,
                        "AI summary generated successfully"
                    );
                    Some(summary_text)
                }
                Err(e) => {
                    warn!(
                        %report_id,
                        error = %e,
                        "AI summary generation failed, proceeding without summary"
                    );
                    None
                }
            }
        } else {
            None
        };

        // 4. 构建报告内容 JSON
        let mut content = serde_json::to_value(&aggregated)
            .map_err(|e| anyhow::anyhow!("序列化聚合数据失败: {}", e))?;

        // 注入 AI 摘要到 overview.ai_summary
        if let Some(ref summary) = ai_summary {
            if let Some(overview) = content.get_mut("overview") {
                overview["ai_summary"] = serde_json::Value::String(summary.clone());
            }
        }

        let article_count = aggregated.overview.total_articles as i32;
        let ai_model = if self.ai_service.is_some() {
            "ai-assisted"
        } else {
            "data-only"
        };

        // 5. 更新报告内容（update_ai_content 会将 status 设为 generated）
        let updated_report = self
            .report_service
            .update_ai_content(tenant_id, report_id, content, article_count, ai_model)
            .await
            .map_err(|e| anyhow::anyhow!("更新 AI 内容失败: {}", e))?;

        // 6. 转换状态: generated -> review（单步 transition，崩溃安全）
        self.report_service
            .transition_status(
                tenant_id,
                report_id,
                ReportStatus::Review,
                updated_report.version,
            )
            .await
            .map_err(|e| anyhow::anyhow!("转换状态到 review 失败: {}", e))?;

        info!(
            %report_id,
            %tenant_id,
            article_count,
            has_ai_summary = ai_summary.is_some(),
            "Report generate task completed successfully"
        );

        Ok(())
    }
}

fn push_preview_limit() -> usize {
    const DEFAULT_LIMIT: usize = 50;
    const MAX_LIMIT: usize = 500;

    std::env::var("LAW_EYE__PUSH__PREVIEW_LIMIT")
        .ok()
        .and_then(|raw| raw.trim().parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_LIMIT)
        .min(MAX_LIMIT)
}

fn format_push_message(articles: &[law_eye_db::Article]) -> String {
    let mut msg = String::from(
        "📰 法眼资讯速递

",
    );

    let preview_limit = push_preview_limit();
    for article in articles.iter().take(preview_limit) {
        msg.push_str(&format!(
            "- {}
  {}

",
            article.title, article.link
        ));
    }

    if articles.len() > preview_limit {
        msg.push_str(&format!(
            "... 及其他 {} 条资讯
",
            articles.len() - preview_limit
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

    let task_queue = TaskQueue::new_with_pool_timeouts(
        &config.redis.url,
        config.redis.pool_wait_timeout_ms,
        config.redis.pool_create_timeout_ms,
        config.redis.pool_recycle_timeout_ms,
    )
    .context("healthcheck: init redis client")?;
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

    let metrics_handle = PrometheusBuilder::new()
        .install_recorder()
        .context("install prometheus metrics recorder")?;

    if is_production {
        if config
            .metrics
            .token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .is_some()
        {
            info!("Worker metrics enabled at /metrics (token protected)");
        } else {
            warn!("Worker metrics disabled in production (LAW_EYE__METRICS__TOKEN not set)");
        }
    } else {
        info!("Worker metrics enabled at /metrics (development mode)");
    }

    info!("Starting Law Eye Worker...");

    let pool = create_pool_with_session_role_retry(
        &config.database.url,
        config.database.max_connections,
        config.database.session_role.as_deref(),
        DB_CONNECT_MAX_ATTEMPTS,
    )
    .await?;

    let task_queue = TaskQueue::new_with_pool_timeouts(
        &config.redis.url,
        config.redis.pool_wait_timeout_ms,
        config.redis.pool_create_timeout_ms,
        config.redis.pool_recycle_timeout_ms,
    )?;
    let task_queue_for_health = Arc::new(task_queue.clone());

    let ai_service = if !config.ai.api_key.is_empty() {
        info!("AI service enabled");
        Some(AiService::new(
            &config.ai.api_key,
            config.ai.base_url.as_deref(),
            Some(&config.ai.model),
        ))
    } else {
        if is_production {
            anyhow::bail!("LAW_EYE__AI__API_KEY must be set in production");
        }
        warn!("AI service not configured (missing api_key)");
        None
    };

    let object_service = if config.object_storage.enabled {
        info!(
            "Object storage enabled (bucket: {}, endpoint: {})",
            config.object_storage.bucket, config.object_storage.endpoint
        );
        Some(ObjectService::new(pool.clone(), &config.object_storage).await?)
    } else {
        info!("Object storage disabled");
        None
    };

    let object_purge = if object_service.is_some()
        && config.object_storage.purge_interval_seconds > 0
        && config.object_storage.purge_batch_size > 0
        && config.object_storage.purge_max_attempts > 0
    {
        Some(ObjectPurgeConfig {
            interval: Duration::from_secs(config.object_storage.purge_interval_seconds),
            batch_size: config.object_storage.purge_batch_size,
            grace_period_seconds: config.object_storage.purge_grace_period_seconds as i64,
            max_attempts: config.object_storage.purge_max_attempts,
            lock_timeout_ms: OUTBOX_LOCK_TIMEOUT_MS,
        })
    } else {
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
            metrics_handle: metrics_handle.clone(),
            metrics_token: config.metrics.token.clone(),
            is_production,
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

    let knowledge_service = ai_service
        .as_ref()
        .map(|ai| KnowledgeService::new(pool.clone(), ai.gateway()));

    let worker = Worker::new(WorkerInit {
        pool,
        task_queue,
        ai_service,
        knowledge_service,
        object_service,
        shutdown,
        allow_internal_source_urls: config.security.allow_internal_source_urls,
        allow_internal_webhook_urls: config.security.allow_internal_webhook_urls,
        push_http_client,
        object_purge,
    })?;
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

    #[test]
    fn sanitize_error_message_redacts_sensitive_payload() {
        let input = "request failed: Authorization: Bearer sk-live-very-secret-token";
        let sanitized = sanitize_error_message(input);
        assert_eq!(sanitized, WORKER_ERROR_REDACTED);
        assert!(!sanitized.contains("sk-live-very-secret-token"));
    }

    #[test]
    fn sanitize_error_message_truncates_and_normalizes_controls() {
        let input = format!("line1\nline2\t{}", "x".repeat(600));
        let sanitized = sanitize_error_message(input);
        assert!(!sanitized.contains('\n'));
        assert!(sanitized.len() <= WORKER_ERROR_MAX_CHARS + 3);
    }
}

#[cfg(test)]
mod crawler_integration_tests {
    use super::*;

    #[test]
    fn create_article_has_all_legal_metadata_fields() {
        let article = CreateArticle {
            source_id: uuid::Uuid::new_v4(),
            title: "国务院关于数据安全的通知".to_string(),
            link: "https://gov.cn/123".to_string(),
            content: Some("正文内容".to_string()),
            author: None,
            published_at: None,
            domain_root: Some("regulation".to_string()),
            domain_sub: Some("government".to_string()),
            authority_level: Some(3),
            importance: Some(4),
            issuer: Some("国务院".to_string()),
            doc_number: Some("国发〔2026〕1号".to_string()),
            effective_date: Some(chrono::NaiveDate::from_ymd_opt(2026, 3, 1).unwrap()),
            region_code: Some("000000".to_string()),
            content_hash: Some("abc123".to_string()),
        };

        assert_eq!(article.issuer.as_deref(), Some("国务院"));
        assert_eq!(article.doc_number.as_deref(), Some("国发〔2026〕1号"));
        assert!(article.effective_date.is_some());
        assert_eq!(article.region_code.as_deref(), Some("000000"));
        assert_eq!(article.content_hash.as_deref(), Some("abc123"));
        assert_eq!(article.domain_root.as_deref(), Some("regulation"));
        assert_eq!(article.authority_level, Some(3));
        assert_eq!(article.importance, Some(4));
    }

    #[test]
    fn crawl_fetch_stats_construction() {
        let stats = CrawlFetchStats {
            articles_fetched: 42,
            duration_ms: Some(1500),
        };
        assert_eq!(stats.articles_fetched, 42);
        assert_eq!(stats.duration_ms, Some(1500));

        let stats_no_duration = CrawlFetchStats {
            articles_fetched: 0,
            duration_ms: None,
        };
        assert_eq!(stats_no_duration.articles_fetched, 0);
        assert!(stats_no_duration.duration_ms.is_none());
    }

    #[test]
    fn finish_crawl_log_construction() {
        let finish = FinishCrawlLog {
            status: "completed".to_string(),
            articles_found: 10,
            articles_new: 5,
            articles_updated: 3,
            articles_skipped: 2,
            error_message: None,
            duration_ms: 4500,
            metadata: None,
        };
        assert_eq!(finish.status, "completed");
        assert_eq!(finish.articles_found, 10);
        assert_eq!(finish.articles_new, 5);
        assert!(finish.error_message.is_none());

        let failed = FinishCrawlLog {
            status: "failed".to_string(),
            articles_found: 0,
            articles_new: 0,
            articles_updated: 0,
            articles_skipped: 0,
            error_message: Some("connection timeout".to_string()),
            duration_ms: 30000,
            metadata: None,
        };
        assert_eq!(failed.status, "failed");
        assert!(failed.error_message.is_some());
    }

    #[test]
    fn scheduler_constant_is_reasonable() {
        assert!(
            SCHEDULER_INTERVAL_SECS >= 30,
            "Scheduler should not run more often than every 30s"
        );
        assert!(
            SCHEDULER_INTERVAL_SECS <= 300,
            "Scheduler should run at least every 5 minutes"
        );
    }

    #[test]
    fn parse_env_bool_accepts_common_true_and_false_values() {
        for value in ["1", "true", "TRUE", " yes ", "on"] {
            assert_eq!(parse_env_bool(value), Some(true), "value={value}");
        }
        for value in ["0", "false", "FALSE", " no ", "off"] {
            assert_eq!(parse_env_bool(value), Some(false), "value={value}");
        }
    }

    #[test]
    fn parse_env_bool_rejects_invalid_values() {
        for value in ["", "2", "enabled", "maybe"] {
            assert_eq!(parse_env_bool(value), None, "value={value}");
        }
    }

    #[test]
    fn parse_env_i64_accepts_valid_values() {
        assert_eq!(parse_env_i64("200000"), Some(200000));
        assert_eq!(parse_env_i64(" 42 "), Some(42));
        assert_eq!(parse_env_i64("-1"), Some(-1));
    }

    #[test]
    fn parse_env_i64_rejects_invalid_values() {
        for value in ["", "abc", "12x", "true"] {
            assert_eq!(parse_env_i64(value), None, "value={value}");
        }
    }

    #[test]
    fn cron_schedule_parsing_six_field_format() {
        // Verify the 6-field cron format used in migration 031
        let expr = "0 0 6 * * *"; // Every day at 06:00:00
        let schedule: cron::Schedule = expr.parse().expect("Should parse 6-field cron");
        let next = schedule.upcoming(chrono::Utc).next();
        assert!(next.is_some(), "Schedule should produce future fire times");
    }

    #[test]
    fn cron_schedule_with_day_of_week() {
        let expr = "0 0 9 * * 1"; // Every Monday at 09:00:00
        let schedule: cron::Schedule = expr.parse().expect("Should parse cron with DOW");
        let next = schedule.upcoming(chrono::Utc).next();
        assert!(next.is_some());
    }

    #[test]
    fn cron_schedule_with_multiple_days() {
        let expr = "0 0 9 * * 2,5"; // Tuesday and Friday at 09:00:00
        let schedule: cron::Schedule = expr.parse().expect("Should parse cron with multi-DOW");
        // Should produce multiple fire times
        let mut iter = schedule.upcoming(chrono::Utc);
        let first = iter.next().unwrap();
        let second = iter.next().unwrap();
        assert!(second > first);
    }
}
