// Phase G.6 — admin AI governance endpoint stubs.
//
// `apps/web/src/hooks/use-ai-governance.ts` calls 11 paths under
// `/admin/ai/*` (policies, prompts, content-flags, metrics, token-usage,
// budget-alerts, experiments). The real backend tables / pipelines are
// V2 backlog (ai_governance_policies, ai_prompt_versions,
// ai_content_flags, ai_token_usage_events, ai_budget_alerts,
// feed_experiment_configs). These handlers return shape-aligned
// empty-list / zero-default payloads so the admin AI dashboard renders
// without phantom 404s, while preserving the auth gate so anonymous
// probes are still rejected.
//
// TODO V2: replace each handler with real persistence + service logic.

use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use utoipa::{IntoParams, ToSchema};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/policies/:policy_kind",
            get(get_ai_policy).put(upsert_ai_policy),
        )
        .route(
            "/policies/:policy_kind/publish",
            post(publish_prompt_version),
        )
        .route(
            "/policies/:policy_kind/prompts",
            get(list_prompt_versions),
        )
        .route("/content-flags", get(list_content_flags))
        .route("/metrics", get(get_ai_metrics))
        .route("/token-usage", get(list_token_usage))
        .route("/budget-alerts", get(list_budget_alerts))
        .route("/budget-alerts/recompute", post(recompute_budget_alerts))
        .route("/experiments", get(list_feed_experiments))
        .route("/experiments/:experiment_key", put(upsert_feed_experiment))
}

// --------------------------------------------------------------------
// Response shapes (mirroring apps/web/src/lib/api/types.ts asserts).
// --------------------------------------------------------------------

#[derive(Debug, Serialize, ToSchema)]
pub struct AiGovernancePolicy {
    pub id: String,
    pub policy_kind: String,
    pub display_name: String,
    pub model: String,
    pub embedding_model: Option<String>,
    pub reranker_model: Option<String>,
    pub config: JsonValue,
    pub budget_daily_tokens: i64,
    pub budget_monthly_tokens: i64,
    pub is_enabled: bool,
    pub active_prompt_version: Option<i64>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiPromptVersion {
    pub id: String,
    pub version: i64,
    pub prompt_template: String,
    pub prompt_checksum: String,
    pub variables: JsonValue,
    pub change_note: Option<String>,
    pub created_by: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiPolicySnapshotResponse {
    pub policy: AiGovernancePolicy,
    pub active_prompt: Option<AiPromptVersion>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiPromptVersionListResponse {
    pub data: Vec<AiPromptVersion>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiContentFlag {
    pub id: String,
    pub article_id: String,
    pub policy_kind: String,
    pub model_version: String,
    pub prompt_version: Option<i64>,
    pub sentiment: Option<String>,
    pub risk_level: Option<String>,
    pub risk_score: Option<f64>,
    pub importance: Option<f64>,
    pub industry: Option<String>,
    pub region_code: Option<String>,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub output_hash: String,
    pub metadata: JsonValue,
    pub updated_by_task: String,
    pub processed_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiContentFlagListResponse {
    pub data: Vec<AiContentFlag>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiMetricBucket {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiMetricsResponse {
    pub total: i64,
    pub processed_24h: i64,
    pub risk_breakdown: Vec<AiMetricBucket>,
    pub sentiment_breakdown: Vec<AiMetricBucket>,
    pub model_breakdown: Vec<AiMetricBucket>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiTokenUsage {
    pub id: String,
    pub policy_kind: String,
    pub model_version: String,
    pub operation: String,
    pub actor_user_id: Option<String>,
    pub article_id: Option<String>,
    pub request_id: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub latency_ms: Option<i64>,
    pub status: String,
    pub metadata: JsonValue,
    pub recorded_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiTokenUsageAggregate {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiTokenUsageListResponse {
    pub data: Vec<AiTokenUsage>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub aggregate: AiTokenUsageAggregate,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiBudgetAlert {
    pub id: String,
    pub policy_kind: String,
    pub alert_window: String,
    pub threshold_percent: f64,
    pub budget_tokens: i64,
    pub used_tokens: i64,
    pub status: String,
    pub note: Option<String>,
    pub metadata: JsonValue,
    pub triggered_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiBudgetAlertListResponse {
    pub data: Vec<AiBudgetAlert>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RecomputeAiBudgetAlertsResponse {
    pub active_alerts: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FeedExperimentConfig {
    pub id: String,
    pub experiment_key: String,
    pub is_enabled: bool,
    pub rollout_percent: f64,
    pub variants: JsonValue,
    pub rollback_variant: String,
    pub config: JsonValue,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FeedExperimentConfigListResponse {
    pub data: Vec<FeedExperimentConfig>,
}

// --------------------------------------------------------------------
// Request shapes (validated for shape parity, payload is otherwise ignored).
// --------------------------------------------------------------------

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct PromptVersionsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// V2 stub: filter fields parsed for shape parity, not yet applied.
#[allow(dead_code)]
#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ContentFlagsQuery {
    pub article_id: Option<String>,
    pub risk_level: Option<String>,
    pub sentiment: Option<String>,
    pub policy_kind: Option<String>,
    pub model_version: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct TokenUsageQuery {
    pub policy_kind: Option<String>,
    pub model_version: Option<String>,
    pub status: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct BudgetAlertsQuery {
    pub policy_kind: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpsertAiPolicyBody {
    pub display_name: Option<String>,
    pub model: Option<String>,
    pub embedding_model: Option<Option<String>>,
    pub reranker_model: Option<Option<String>>,
    pub config: Option<JsonValue>,
    pub budget_daily_tokens: Option<i64>,
    pub budget_monthly_tokens: Option<i64>,
    pub is_enabled: Option<bool>,
    pub active_prompt_version: Option<Option<i64>>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, ToSchema)]
pub struct PublishPromptVersionBody {
    pub prompt_template: String,
    pub variables: Option<JsonValue>,
    pub change_note: Option<Option<String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpsertFeedExperimentBody {
    pub is_enabled: Option<bool>,
    pub rollout_percent: Option<f64>,
    pub variants: Option<JsonValue>,
    pub rollback_variant: Option<String>,
    pub config: Option<JsonValue>,
}

// --------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------

fn require_auth(auth_session: &AuthSession) -> Result<(), AppError> {
    auth_session
        .user
        .as_ref()
        .map(|_| ())
        .ok_or_else(|| AppError::unauthorized("Authentication required"))
}

fn default_policy(policy_kind: &str, display_name_override: Option<String>) -> AiGovernancePolicy {
    let now = Utc::now();
    AiGovernancePolicy {
        id: String::new(),
        policy_kind: policy_kind.to_string(),
        display_name: display_name_override.unwrap_or_else(|| policy_kind.to_string()),
        model: String::new(),
        embedding_model: None,
        reranker_model: None,
        config: JsonValue::Object(serde_json::Map::new()),
        budget_daily_tokens: 0,
        budget_monthly_tokens: 0,
        is_enabled: false,
        active_prompt_version: None,
        created_by: None,
        updated_by: None,
        created_at: now,
        updated_at: now,
    }
}

fn default_feed_experiment(experiment_key: &str) -> FeedExperimentConfig {
    let now = Utc::now();
    FeedExperimentConfig {
        id: String::new(),
        experiment_key: experiment_key.to_string(),
        is_enabled: false,
        rollout_percent: 0.0,
        variants: JsonValue::Object(serde_json::Map::new()),
        rollback_variant: String::from("control"),
        config: JsonValue::Object(serde_json::Map::new()),
        created_by: None,
        updated_by: None,
        created_at: now,
        updated_at: now,
    }
}

// --------------------------------------------------------------------
// Handlers — V2 backlog stubs.
// --------------------------------------------------------------------

// TODO V2: query ai_governance_policies + ai_prompt_versions joined on
// active_prompt_version, return real snapshot.
pub(crate) async fn get_ai_policy(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
) -> ApiResult<Json<AiPolicySnapshotResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiPolicySnapshotResponse {
        policy: default_policy(&policy_kind, None),
        active_prompt: None,
    }))
}

// TODO V2: upsert into ai_governance_policies, audit-log change, return
// fresh snapshot.
pub(crate) async fn upsert_ai_policy(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
    Json(body): Json<UpsertAiPolicyBody>,
) -> ApiResult<Json<AiPolicySnapshotResponse>> {
    require_auth(&auth_session)?;
    let mut policy = default_policy(&policy_kind, body.display_name);
    if let Some(model) = body.model {
        policy.model = model;
    }
    if let Some(config) = body.config {
        policy.config = config;
    }
    if let Some(budget) = body.budget_daily_tokens {
        policy.budget_daily_tokens = budget;
    }
    if let Some(budget) = body.budget_monthly_tokens {
        policy.budget_monthly_tokens = budget;
    }
    if let Some(enabled) = body.is_enabled {
        policy.is_enabled = enabled;
    }
    if let Some(embedding) = body.embedding_model {
        policy.embedding_model = embedding;
    }
    if let Some(reranker) = body.reranker_model {
        policy.reranker_model = reranker;
    }
    if let Some(active) = body.active_prompt_version {
        policy.active_prompt_version = active;
    }
    Ok(Json(AiPolicySnapshotResponse {
        policy,
        active_prompt: None,
    }))
}

// TODO V2: insert ai_prompt_versions row, flip ai_governance_policies
// active_prompt_version, audit-log + return snapshot.
pub(crate) async fn publish_prompt_version(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
    Json(_body): Json<PublishPromptVersionBody>,
) -> ApiResult<Json<AiPolicySnapshotResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiPolicySnapshotResponse {
        policy: default_policy(&policy_kind, None),
        active_prompt: None,
    }))
}

// TODO V2: paginate ai_prompt_versions by policy_kind ORDER BY version DESC.
pub(crate) async fn list_prompt_versions(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Path(_policy_kind): Path<String>,
    Query(query): Query<PromptVersionsQuery>,
) -> ApiResult<Json<AiPromptVersionListResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiPromptVersionListResponse {
        data: Vec::new(),
        limit: query.limit.unwrap_or(20),
        offset: query.offset.unwrap_or(0),
    }))
}

// TODO V2: paginate ai_content_flags joined with articles, apply filters.
pub(crate) async fn list_content_flags(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ContentFlagsQuery>,
) -> ApiResult<Json<AiContentFlagListResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiContentFlagListResponse {
        data: Vec::new(),
        total: 0,
        limit: query.limit.unwrap_or(50),
        offset: query.offset.unwrap_or(0),
    }))
}

// TODO V2: aggregate ai_content_flags by risk_level / sentiment / model_version
// over the last 24h + total counts.
pub(crate) async fn get_ai_metrics(
    State(_state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<AiMetricsResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiMetricsResponse {
        total: 0,
        processed_24h: 0,
        risk_breakdown: Vec::new(),
        sentiment_breakdown: Vec::new(),
        model_breakdown: Vec::new(),
    }))
}

// TODO V2: paginate ai_token_usage_events with filters + aggregate sums in
// the same response.
pub(crate) async fn list_token_usage(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<TokenUsageQuery>,
) -> ApiResult<Json<AiTokenUsageListResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiTokenUsageListResponse {
        data: Vec::new(),
        total: 0,
        limit: query.limit.unwrap_or(100),
        offset: query.offset.unwrap_or(0),
        aggregate: AiTokenUsageAggregate {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
        },
    }))
}

// TODO V2: paginate ai_budget_alerts with filters.
pub(crate) async fn list_budget_alerts(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<BudgetAlertsQuery>,
) -> ApiResult<Json<AiBudgetAlertListResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(AiBudgetAlertListResponse {
        data: Vec::new(),
        total: 0,
        limit: query.limit.unwrap_or(100),
        offset: query.offset.unwrap_or(0),
    }))
}

// TODO V2: enqueue recompute job, return number of currently-active alerts.
pub(crate) async fn recompute_budget_alerts(
    State(_state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<RecomputeAiBudgetAlertsResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(RecomputeAiBudgetAlertsResponse { active_alerts: 0 }))
}

// TODO V2: select feed_experiment_configs ORDER BY experiment_key.
pub(crate) async fn list_feed_experiments(
    State(_state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<FeedExperimentConfigListResponse>> {
    require_auth(&auth_session)?;
    Ok(Json(FeedExperimentConfigListResponse { data: Vec::new() }))
}

// TODO V2: upsert feed_experiment_configs row + audit-log change.
pub(crate) async fn upsert_feed_experiment(
    State(_state): State<AppState>,
    auth_session: AuthSession,
    Path(experiment_key): Path<String>,
    Json(body): Json<UpsertFeedExperimentBody>,
) -> ApiResult<Json<FeedExperimentConfig>> {
    require_auth(&auth_session)?;
    let mut config = default_feed_experiment(&experiment_key);
    if let Some(enabled) = body.is_enabled {
        config.is_enabled = enabled;
    }
    if let Some(rollout) = body.rollout_percent {
        config.rollout_percent = rollout;
    }
    if let Some(variants) = body.variants {
        config.variants = variants;
    }
    if let Some(rollback) = body.rollback_variant {
        config.rollback_variant = rollback;
    }
    if let Some(cfg) = body.config {
        config.config = cfg;
    }
    Ok(Json(config))
}
