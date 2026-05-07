// Phase G.6 — admin AI governance endpoints backed by migration 078 tables.

use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error as CoreError;
use law_eye_core::with_tenant_tx;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/policies/{policy_kind}",
            get(get_ai_policy).put(upsert_ai_policy),
        )
        .route(
            "/policies/{policy_kind}/publish",
            post(publish_prompt_version),
        )
        .route("/policies/{policy_kind}/prompts", get(list_prompt_versions))
        .route("/content-flags", get(list_content_flags))
        .route("/metrics", get(get_ai_metrics))
        .route("/token-usage", get(list_token_usage))
        .route("/budget-alerts", get(list_budget_alerts))
        .route("/budget-alerts/recompute", post(recompute_budget_alerts))
        .route("/experiments", get(list_feed_experiments))
        .route("/experiments/{experiment_key}", put(upsert_feed_experiment))
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

// Migration-backed filters accepted by /admin/ai/content-flags.
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
// Persistence rows and helpers.
// --------------------------------------------------------------------

const DEFAULT_MODEL: &str = "Qwen/Qwen3-8B";
const DEFAULT_EMBEDDING_MODEL: &str = "BAAI/bge-m3";
const DEFAULT_RERANKER_MODEL: &str = "BAAI/bge-reranker-v2-m3";

#[derive(Debug, FromRow)]
struct AiGovernancePolicyRow {
    id: Uuid,
    policy_kind: String,
    display_name: String,
    model: String,
    embedding_model: Option<String>,
    reranker_model: Option<String>,
    config: JsonValue,
    budget_daily_tokens: i64,
    budget_monthly_tokens: i64,
    is_enabled: bool,
    active_prompt_version: Option<i64>,
    created_by: Option<Uuid>,
    updated_by: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct AiPromptVersionRow {
    id: Uuid,
    version: i64,
    prompt_template: String,
    prompt_checksum: String,
    variables: JsonValue,
    change_note: Option<String>,
    created_by: Option<Uuid>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct AiContentFlagRow {
    id: Uuid,
    article_id: Uuid,
    policy_kind: String,
    model_version: String,
    prompt_version: Option<i64>,
    sentiment: Option<String>,
    risk_level: Option<String>,
    risk_score: Option<f64>,
    importance: Option<f64>,
    industry: Option<String>,
    region_code: Option<String>,
    tags: Vec<String>,
    keywords: Vec<String>,
    output_hash: String,
    metadata: JsonValue,
    updated_by_task: String,
    processed_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct AiTokenUsageRow {
    id: Uuid,
    policy_kind: String,
    model_version: String,
    operation: String,
    actor_user_id: Option<Uuid>,
    article_id: Option<Uuid>,
    request_id: Option<String>,
    input_tokens: i64,
    output_tokens: i64,
    total_tokens: i64,
    latency_ms: Option<i64>,
    status: String,
    metadata: JsonValue,
    recorded_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct AiBudgetAlertRow {
    id: Uuid,
    policy_kind: String,
    alert_window: String,
    threshold_percent: f64,
    budget_tokens: i64,
    used_tokens: i64,
    status: String,
    note: Option<String>,
    metadata: JsonValue,
    triggered_at: DateTime<Utc>,
    resolved_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct FeedExperimentConfigRow {
    id: Uuid,
    experiment_key: String,
    is_enabled: bool,
    rollout_percent: f64,
    variants: JsonValue,
    rollback_variant: String,
    config: JsonValue,
    created_by: Option<Uuid>,
    updated_by: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct CountRow {
    total: i64,
}

#[derive(Debug, FromRow)]
struct TokenAggregateRow {
    input_tokens: i64,
    output_tokens: i64,
    total_tokens: i64,
}

#[derive(Debug, FromRow)]
struct MetricBucketRow {
    key: String,
    count: i64,
}

impl From<AiGovernancePolicyRow> for AiGovernancePolicy {
    fn from(row: AiGovernancePolicyRow) -> Self {
        Self {
            id: row.id.to_string(),
            policy_kind: row.policy_kind,
            display_name: row.display_name,
            model: row.model,
            embedding_model: row.embedding_model,
            reranker_model: row.reranker_model,
            config: row.config,
            budget_daily_tokens: row.budget_daily_tokens,
            budget_monthly_tokens: row.budget_monthly_tokens,
            is_enabled: row.is_enabled,
            active_prompt_version: row.active_prompt_version,
            created_by: row.created_by.map(|id| id.to_string()),
            updated_by: row.updated_by.map(|id| id.to_string()),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl From<AiPromptVersionRow> for AiPromptVersion {
    fn from(row: AiPromptVersionRow) -> Self {
        Self {
            id: row.id.to_string(),
            version: row.version,
            prompt_template: row.prompt_template,
            prompt_checksum: row.prompt_checksum,
            variables: row.variables,
            change_note: row.change_note,
            created_by: row.created_by.map(|id| id.to_string()),
            created_at: row.created_at,
        }
    }
}

impl From<AiContentFlagRow> for AiContentFlag {
    fn from(row: AiContentFlagRow) -> Self {
        Self {
            id: row.id.to_string(),
            article_id: row.article_id.to_string(),
            policy_kind: row.policy_kind,
            model_version: row.model_version,
            prompt_version: row.prompt_version,
            sentiment: row.sentiment,
            risk_level: row.risk_level,
            risk_score: row.risk_score,
            importance: row.importance,
            industry: row.industry,
            region_code: row.region_code,
            tags: row.tags,
            keywords: row.keywords,
            output_hash: row.output_hash,
            metadata: row.metadata,
            updated_by_task: row.updated_by_task,
            processed_at: row.processed_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl From<AiTokenUsageRow> for AiTokenUsage {
    fn from(row: AiTokenUsageRow) -> Self {
        Self {
            id: row.id.to_string(),
            policy_kind: row.policy_kind,
            model_version: row.model_version,
            operation: row.operation,
            actor_user_id: row.actor_user_id.map(|id| id.to_string()),
            article_id: row.article_id.map(|id| id.to_string()),
            request_id: row.request_id,
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
            total_tokens: row.total_tokens,
            latency_ms: row.latency_ms,
            status: row.status,
            metadata: row.metadata,
            recorded_at: row.recorded_at,
            created_at: row.created_at,
        }
    }
}

impl From<AiBudgetAlertRow> for AiBudgetAlert {
    fn from(row: AiBudgetAlertRow) -> Self {
        Self {
            id: row.id.to_string(),
            policy_kind: row.policy_kind,
            alert_window: row.alert_window,
            threshold_percent: row.threshold_percent,
            budget_tokens: row.budget_tokens,
            used_tokens: row.used_tokens,
            status: row.status,
            note: row.note,
            metadata: row.metadata,
            triggered_at: row.triggered_at,
            resolved_at: row.resolved_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl From<FeedExperimentConfigRow> for FeedExperimentConfig {
    fn from(row: FeedExperimentConfigRow) -> Self {
        Self {
            id: row.id.to_string(),
            experiment_key: row.experiment_key,
            is_enabled: row.is_enabled,
            rollout_percent: row.rollout_percent,
            variants: row.variants,
            rollback_variant: row.rollback_variant,
            config: row.config,
            created_by: row.created_by.map(|id| id.to_string()),
            updated_by: row.updated_by.map(|id| id.to_string()),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}
fn require_auth(auth_session: &AuthSession) -> Result<&crate::auth::AuthenticatedUser, AppError> {
    auth_session
        .user
        .as_ref()
        .ok_or_else(|| AppError::unauthorized("Authentication required"))
}

fn normalize_key(field: &str, value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::validation(format!("{field} cannot be empty")));
    }
    if value.len() > 128 {
        return Err(AppError::validation(format!("{field} is too long")));
    }
    Ok(value.to_string())
}

fn normalize_limit(value: Option<i64>, default: i64, max: i64) -> i64 {
    value.unwrap_or(default).clamp(1, max)
}

fn normalize_offset(value: Option<i64>) -> Result<i64, AppError> {
    let offset = value.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }
    Ok(offset)
}

fn parse_optional_uuid(field: &str, value: Option<String>) -> Result<Option<Uuid>, AppError> {
    value
        .map(|raw| {
            Uuid::parse_str(raw.trim())
                .map_err(|_| AppError::validation(format!("{field} must be a UUID")))
        })
        .transpose()
}

fn parse_optional_datetime(
    field: &str,
    value: Option<String>,
) -> Result<Option<DateTime<Utc>>, AppError> {
    value
        .map(|raw| {
            DateTime::parse_from_rfc3339(raw.trim())
                .map(|dt| dt.with_timezone(&Utc))
                .map_err(|_| AppError::validation(format!("{field} must be RFC3339 datetime")))
        })
        .transpose()
}

fn prompt_checksum(template: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(template.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn default_display_name(policy_kind: &str) -> String {
    policy_kind
        .split(['_', '-'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn as_db_error(err: sqlx::Error) -> CoreError {
    CoreError::Database(err.to_string())
}

async fn ensure_policy_row(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    policy_kind: &str,
    actor_id: Option<Uuid>,
) -> Result<AiGovernancePolicyRow, CoreError> {
    sqlx::query_as::<_, AiGovernancePolicyRow>(
        r#"
        INSERT INTO ai_governance_policies (
            tenant_id,
            policy_kind,
            display_name,
            model,
            embedding_model,
            reranker_model,
            config,
            budget_daily_tokens,
            budget_monthly_tokens,
            is_enabled,
            created_by,
            updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, 0, 0, true, $7, $7)
        ON CONFLICT (tenant_id, policy_kind) DO UPDATE
        SET updated_at = ai_governance_policies.updated_at
        RETURNING
            id,
            policy_kind,
            display_name,
            model,
            embedding_model,
            reranker_model,
            config,
            budget_daily_tokens,
            budget_monthly_tokens,
            is_enabled,
            active_prompt_version,
            created_by,
            updated_by,
            created_at,
            updated_at
        "#,
    )
    .bind(tenant_id)
    .bind(policy_kind)
    .bind(default_display_name(policy_kind))
    .bind(DEFAULT_MODEL)
    .bind(DEFAULT_EMBEDDING_MODEL)
    .bind(DEFAULT_RERANKER_MODEL)
    .bind(actor_id)
    .fetch_one(tx.as_mut())
    .await
    .map_err(as_db_error)
}

async fn fetch_active_prompt_row(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    policy_kind: &str,
    active_prompt_version: Option<i64>,
) -> Result<Option<AiPromptVersionRow>, CoreError> {
    let Some(version) = active_prompt_version else {
        return Ok(None);
    };

    sqlx::query_as::<_, AiPromptVersionRow>(
        r#"
        SELECT
            id,
            version,
            prompt_template,
            prompt_checksum,
            COALESCE(params -> 'variables', '{}'::jsonb) AS variables,
            params ->> 'change_note' AS change_note,
            published_by AS created_by,
            created_at
        FROM ai_prompt_versions
        WHERE tenant_id = $1 AND policy_kind = $2 AND version = $3
        LIMIT 1
        "#,
    )
    .bind(tenant_id)
    .bind(policy_kind)
    .bind(version)
    .fetch_optional(tx.as_mut())
    .await
    .map_err(as_db_error)
}

fn map_snapshot(
    policy: AiGovernancePolicyRow,
    prompt: Option<AiPromptVersionRow>,
) -> AiPolicySnapshotResponse {
    AiPolicySnapshotResponse {
        policy: policy.into(),
        active_prompt: prompt.map(Into::into),
    }
}

fn split_variants(variants: Option<JsonValue>) -> (JsonValue, JsonValue) {
    match variants {
        Some(JsonValue::Object(mut object)) => {
            let control = object
                .remove("control")
                .or_else(|| object.remove("variant_a"))
                .unwrap_or_else(|| JsonValue::Object(serde_json::Map::new()));
            let treatment = object
                .remove("treatment")
                .or_else(|| object.remove("variant_b"))
                .unwrap_or_else(|| JsonValue::Object(serde_json::Map::new()));
            (control, treatment)
        }
        Some(value) => (value, JsonValue::Object(serde_json::Map::new())),
        None => (
            JsonValue::Object(serde_json::Map::new()),
            JsonValue::Object(serde_json::Map::new()),
        ),
    }
}

fn normalize_experiment_config(config: Option<JsonValue>) -> Option<JsonValue> {
    config.map(|value| match value {
        JsonValue::Object(object) => JsonValue::Object(object),
        value => {
            let mut object = serde_json::Map::new();
            object.insert("value".to_string(), value);
            JsonValue::Object(object)
        }
    })
}

// --------------------------------------------------------------------
// Handlers backed by migration 078 persistence.
// --------------------------------------------------------------------

pub(crate) async fn get_ai_policy(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
) -> ApiResult<Json<AiPolicySnapshotResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let actor_id = Some(user.id);
    let policy_kind = normalize_key("policy_kind", &policy_kind)?;

    let snapshot = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let policy = ensure_policy_row(tx, tenant_id, &policy_kind, actor_id).await?;
            let prompt =
                fetch_active_prompt_row(tx, tenant_id, &policy_kind, policy.active_prompt_version)
                    .await?;
            Ok(map_snapshot(policy, prompt))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(snapshot))
}

pub(crate) async fn upsert_ai_policy(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
    Json(body): Json<UpsertAiPolicyBody>,
) -> ApiResult<Json<AiPolicySnapshotResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let actor_id = Some(user.id);
    let policy_kind = normalize_key("policy_kind", &policy_kind)?;
    if body.budget_daily_tokens.is_some_and(|value| value < 0) {
        return Err(AppError::validation("budget_daily_tokens must be >= 0"));
    }
    if body.budget_monthly_tokens.is_some_and(|value| value < 0) {
        return Err(AppError::validation("budget_monthly_tokens must be >= 0"));
    }

    let embedding_set = body.embedding_model.is_some();
    let embedding_model = body.embedding_model.flatten();
    let reranker_set = body.reranker_model.is_some();
    let reranker_model = body.reranker_model.flatten();
    let active_prompt_set = body.active_prompt_version.is_some();
    let active_prompt_version = body.active_prompt_version.flatten();
    let snapshot = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            ensure_policy_row(tx, tenant_id, &policy_kind, actor_id).await?;
            let policy = sqlx::query_as::<_, AiGovernancePolicyRow>(
                r#"
                UPDATE ai_governance_policies
                SET
                    display_name = COALESCE($3, display_name),
                    model = COALESCE($4, model),
                    embedding_model = CASE WHEN $5 THEN $6 ELSE embedding_model END,
                    reranker_model = CASE WHEN $7 THEN $8 ELSE reranker_model END,
                    config = COALESCE($9, config),
                    budget_daily_tokens = COALESCE($10, budget_daily_tokens),
                    budget_monthly_tokens = COALESCE($11, budget_monthly_tokens),
                    is_enabled = COALESCE($12, is_enabled),
                    active_prompt_version = CASE WHEN $13 THEN $14 ELSE active_prompt_version END,
                    updated_by = $15,
                    updated_at = NOW()
                WHERE tenant_id = $1 AND policy_kind = $2
                RETURNING
                    id,
                    policy_kind,
                    display_name,
                    model,
                    embedding_model,
                    reranker_model,
                    config,
                    budget_daily_tokens,
                    budget_monthly_tokens,
                    is_enabled,
                    active_prompt_version,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                "#,
            )
            .bind(tenant_id)
            .bind(&policy_kind)
            .bind(body.display_name)
            .bind(body.model)
            .bind(embedding_set)
            .bind(embedding_model)
            .bind(reranker_set)
            .bind(reranker_model)
            .bind(body.config)
            .bind(body.budget_daily_tokens)
            .bind(body.budget_monthly_tokens)
            .bind(body.is_enabled)
            .bind(active_prompt_set)
            .bind(active_prompt_version)
            .bind(actor_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let prompt =
                fetch_active_prompt_row(tx, tenant_id, &policy_kind, policy.active_prompt_version)
                    .await?;
            Ok(map_snapshot(policy, prompt))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(snapshot))
}

pub(crate) async fn publish_prompt_version(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
    Json(body): Json<PublishPromptVersionBody>,
) -> ApiResult<Json<AiPolicySnapshotResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let actor_id = Some(user.id);
    let policy_kind = normalize_key("policy_kind", &policy_kind)?;
    if body.prompt_template.trim().is_empty() {
        return Err(AppError::validation("prompt_template cannot be empty"));
    }
    let prompt_template = body.prompt_template;
    let variables = body.variables.unwrap_or_else(|| json!({}));
    let change_note = body.change_note.flatten();
    let checksum = prompt_checksum(&prompt_template);

    let snapshot = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let current_policy = ensure_policy_row(tx, tenant_id, &policy_kind, actor_id).await?;
            let next_version = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT COALESCE(MAX(version), 0)::bigint + 1
                FROM ai_prompt_versions
                WHERE tenant_id = $1 AND policy_kind = $2
                "#,
            )
            .bind(tenant_id)
            .bind(&policy_kind)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            sqlx::query(
                r#"
                UPDATE ai_prompt_versions
                SET is_active = false
                WHERE tenant_id = $1 AND policy_kind = $2
                "#,
            )
            .bind(tenant_id)
            .bind(&policy_kind)
            .execute(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let params = json!({
                "variables": variables,
                "change_note": change_note,
            });
            let prompt = sqlx::query_as::<_, AiPromptVersionRow>(
                r#"
                INSERT INTO ai_prompt_versions (
                    tenant_id,
                    policy_kind,
                    version,
                    prompt_template,
                    prompt_checksum,
                    model,
                    params,
                    is_active,
                    published_by,
                    published_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW())
                RETURNING
                    id,
                    version,
                    prompt_template,
                    prompt_checksum,
                    COALESCE(params -> 'variables', '{}'::jsonb) AS variables,
                    params ->> 'change_note' AS change_note,
                    published_by AS created_by,
                    created_at
                "#,
            )
            .bind(tenant_id)
            .bind(&policy_kind)
            .bind(next_version)
            .bind(prompt_template)
            .bind(checksum)
            .bind(&current_policy.model)
            .bind(params)
            .bind(actor_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let policy = sqlx::query_as::<_, AiGovernancePolicyRow>(
                r#"
                UPDATE ai_governance_policies
                SET active_prompt_version = $3,
                    updated_by = $4,
                    updated_at = NOW()
                WHERE tenant_id = $1 AND policy_kind = $2
                RETURNING
                    id,
                    policy_kind,
                    display_name,
                    model,
                    embedding_model,
                    reranker_model,
                    config,
                    budget_daily_tokens,
                    budget_monthly_tokens,
                    is_enabled,
                    active_prompt_version,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                "#,
            )
            .bind(tenant_id)
            .bind(&policy_kind)
            .bind(next_version)
            .bind(actor_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            Ok(map_snapshot(policy, Some(prompt)))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(snapshot))
}

pub(crate) async fn list_prompt_versions(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(policy_kind): Path<String>,
    Query(query): Query<PromptVersionsQuery>,
) -> ApiResult<Json<AiPromptVersionListResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let policy_kind = normalize_key("policy_kind", &policy_kind)?;
    let limit = normalize_limit(query.limit, 20, 200);
    let offset = normalize_offset(query.offset)?;

    let rows = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, AiPromptVersionRow>(
                r#"
                SELECT
                    id,
                    version,
                    prompt_template,
                    prompt_checksum,
                    COALESCE(params -> 'variables', '{}'::jsonb) AS variables,
                    params ->> 'change_note' AS change_note,
                    published_by AS created_by,
                    created_at
                FROM ai_prompt_versions
                WHERE tenant_id = $1 AND policy_kind = $2
                ORDER BY version DESC
                LIMIT $3 OFFSET $4
                "#,
            )
            .bind(tenant_id)
            .bind(policy_kind)
            .bind(limit)
            .bind(offset)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(AiPromptVersionListResponse {
        data: rows.into_iter().map(Into::into).collect(),
        limit,
        offset,
    }))
}

pub(crate) async fn list_content_flags(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ContentFlagsQuery>,
) -> ApiResult<Json<AiContentFlagListResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let article_id = parse_optional_uuid("article_id", query.article_id)?;
    let limit = normalize_limit(query.limit, 50, 200);
    let offset = normalize_offset(query.offset)?;
    let risk_level = query.risk_level;
    let sentiment = query.sentiment;
    let policy_kind = query.policy_kind;
    let model_version = query.model_version;

    let (rows, total) = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, AiContentFlagRow>(
                r#"
                SELECT
                    id,
                    target_id AS article_id,
                    flag_type AS policy_kind,
                    COALESCE(model_output ->> 'model_version', '') AS model_version,
                    NULLIF(model_output ->> 'prompt_version', '')::bigint AS prompt_version,
                    model_output ->> 'sentiment' AS sentiment,
                    severity AS risk_level,
                    NULLIF(model_output ->> 'risk_score', '')::float8 AS risk_score,
                    NULLIF(model_output ->> 'importance', '')::float8 AS importance,
                    model_output ->> 'industry' AS industry,
                    model_output ->> 'region_code' AS region_code,
                    COALESCE(ARRAY(SELECT jsonb_array_elements_text(model_output -> 'tags')), ARRAY[]::text[]) AS tags,
                    COALESCE(ARRAY(SELECT jsonb_array_elements_text(model_output -> 'keywords')), ARRAY[]::text[]) AS keywords,
                    COALESCE(model_output ->> 'output_hash', id::text) AS output_hash,
                    model_output AS metadata,
                    COALESCE(model_output ->> 'updated_by_task', 'ai_governance') AS updated_by_task,
                    updated_at AS processed_at,
                    created_at,
                    updated_at
                FROM ai_content_flags
                WHERE tenant_id = $1
                  AND target_kind = 'article'
                  AND ($2::uuid IS NULL OR target_id = $2)
                  AND ($3::text IS NULL OR severity = $3)
                  AND ($4::text IS NULL OR model_output ->> 'sentiment' = $4)
                  AND ($5::text IS NULL OR flag_type = $5)
                  AND ($6::text IS NULL OR model_output ->> 'model_version' = $6)
                ORDER BY created_at DESC, id DESC
                LIMIT $7 OFFSET $8
                "#,
            )
            .bind(tenant_id)
            .bind(article_id)
            .bind(risk_level.clone())
            .bind(sentiment.clone())
            .bind(policy_kind.clone())
            .bind(model_version.clone())
            .bind(limit)
            .bind(offset)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let count = sqlx::query_as::<_, CountRow>(
                r#"
                SELECT COUNT(*)::bigint AS total
                FROM ai_content_flags
                WHERE tenant_id = $1
                  AND target_kind = 'article'
                  AND ($2::uuid IS NULL OR target_id = $2)
                  AND ($3::text IS NULL OR severity = $3)
                  AND ($4::text IS NULL OR model_output ->> 'sentiment' = $4)
                  AND ($5::text IS NULL OR flag_type = $5)
                  AND ($6::text IS NULL OR model_output ->> 'model_version' = $6)
                "#,
            )
            .bind(tenant_id)
            .bind(article_id)
            .bind(risk_level)
            .bind(sentiment)
            .bind(policy_kind)
            .bind(model_version)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            Ok((rows, count.total))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(AiContentFlagListResponse {
        data: rows.into_iter().map(Into::into).collect(),
        total,
        limit,
        offset,
    }))
}

pub(crate) async fn get_ai_metrics(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<AiMetricsResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;

    let metrics = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let total = sqlx::query_as::<_, CountRow>(
                "SELECT COUNT(*)::bigint AS total FROM ai_content_flags WHERE tenant_id = $1",
            )
            .bind(tenant_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?
            .total;

            let processed_24h = sqlx::query_as::<_, CountRow>(
                r#"
                SELECT COUNT(*)::bigint AS total
                FROM ai_content_flags
                WHERE tenant_id = $1 AND updated_at >= NOW() - INTERVAL '24 hours'
                "#,
            )
            .bind(tenant_id)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?
            .total;

            let risk_breakdown = sqlx::query_as::<_, MetricBucketRow>(
                r#"
                SELECT COALESCE(severity, 'unknown') AS key, COUNT(*)::bigint AS count
                FROM ai_content_flags
                WHERE tenant_id = $1
                GROUP BY COALESCE(severity, 'unknown')
                ORDER BY count DESC, key ASC
                "#,
            )
            .bind(tenant_id)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let sentiment_breakdown = sqlx::query_as::<_, MetricBucketRow>(
                r#"
                SELECT COALESCE(model_output ->> 'sentiment', 'unknown') AS key, COUNT(*)::bigint AS count
                FROM ai_content_flags
                WHERE tenant_id = $1
                GROUP BY COALESCE(model_output ->> 'sentiment', 'unknown')
                ORDER BY count DESC, key ASC
                "#,
            )
            .bind(tenant_id)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let model_breakdown = sqlx::query_as::<_, MetricBucketRow>(
                r#"
                SELECT COALESCE(NULLIF(model_output ->> 'model_version', ''), 'unknown') AS key,
                       COUNT(*)::bigint AS count
                FROM ai_content_flags
                WHERE tenant_id = $1
                GROUP BY COALESCE(NULLIF(model_output ->> 'model_version', ''), 'unknown')
                ORDER BY count DESC, key ASC
                "#,
            )
            .bind(tenant_id)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            Ok(AiMetricsResponse {
                total,
                processed_24h,
                risk_breakdown: risk_breakdown
                    .into_iter()
                    .map(|row| AiMetricBucket { key: row.key, count: row.count })
                    .collect(),
                sentiment_breakdown: sentiment_breakdown
                    .into_iter()
                    .map(|row| AiMetricBucket { key: row.key, count: row.count })
                    .collect(),
                model_breakdown: model_breakdown
                    .into_iter()
                    .map(|row| AiMetricBucket { key: row.key, count: row.count })
                    .collect(),
            })
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(metrics))
}

pub(crate) async fn list_token_usage(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<TokenUsageQuery>,
) -> ApiResult<Json<AiTokenUsageListResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let limit = normalize_limit(query.limit, 100, 500);
    let offset = normalize_offset(query.offset)?;
    let from = parse_optional_datetime("from", query.from)?;
    let to = parse_optional_datetime("to", query.to)?;
    let policy_kind = query.policy_kind;
    let model_version = query.model_version;
    let status = query.status;

    let (rows, total, aggregate) = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, AiTokenUsageRow>(
                r#"
                SELECT
                    id,
                    policy_kind,
                    model AS model_version,
                    'governance'::text AS operation,
                    user_id AS actor_user_id,
                    NULL::uuid AS article_id,
                    NULL::text AS request_id,
                    input_tokens::bigint AS input_tokens,
                    output_tokens::bigint AS output_tokens,
                    (input_tokens + output_tokens)::bigint AS total_tokens,
                    latency_ms::bigint AS latency_ms,
                    status,
                    jsonb_build_object(
                        'cost_usd', cost_usd,
                        'error_kind', error_kind,
                        'prompt_version', prompt_version
                    ) AS metadata,
                    occurred_at AS recorded_at,
                    occurred_at AS created_at
                FROM ai_token_usage_events
                WHERE tenant_id = $1
                  AND ($2::text IS NULL OR policy_kind = $2)
                  AND ($3::text IS NULL OR model = $3)
                  AND ($4::text IS NULL OR status = $4)
                  AND ($5::timestamptz IS NULL OR occurred_at >= $5)
                  AND ($6::timestamptz IS NULL OR occurred_at <= $6)
                ORDER BY occurred_at DESC, id DESC
                LIMIT $7 OFFSET $8
                "#,
            )
            .bind(tenant_id)
            .bind(policy_kind.clone())
            .bind(model_version.clone())
            .bind(status.clone())
            .bind(from)
            .bind(to)
            .bind(limit)
            .bind(offset)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)?;
            let total = sqlx::query_as::<_, CountRow>(
                r#"
                SELECT COUNT(*)::bigint AS total
                FROM ai_token_usage_events
                WHERE tenant_id = $1
                  AND ($2::text IS NULL OR policy_kind = $2)
                  AND ($3::text IS NULL OR model = $3)
                  AND ($4::text IS NULL OR status = $4)
                  AND ($5::timestamptz IS NULL OR occurred_at >= $5)
                  AND ($6::timestamptz IS NULL OR occurred_at <= $6)
                "#,
            )
            .bind(tenant_id)
            .bind(policy_kind.clone())
            .bind(model_version.clone())
            .bind(status.clone())
            .bind(from)
            .bind(to)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?
            .total;

            let aggregate = sqlx::query_as::<_, TokenAggregateRow>(
                r#"
                SELECT
                    COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
                    COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
                    COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS total_tokens
                FROM ai_token_usage_events
                WHERE tenant_id = $1
                  AND ($2::text IS NULL OR policy_kind = $2)
                  AND ($3::text IS NULL OR model = $3)
                  AND ($4::text IS NULL OR status = $4)
                  AND ($5::timestamptz IS NULL OR occurred_at >= $5)
                  AND ($6::timestamptz IS NULL OR occurred_at <= $6)
                "#,
            )
            .bind(tenant_id)
            .bind(policy_kind)
            .bind(model_version)
            .bind(status)
            .bind(from)
            .bind(to)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            Ok((rows, total, aggregate))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(AiTokenUsageListResponse {
        data: rows.into_iter().map(Into::into).collect(),
        total,
        limit,
        offset,
        aggregate: AiTokenUsageAggregate {
            input_tokens: aggregate.input_tokens,
            output_tokens: aggregate.output_tokens,
            total_tokens: aggregate.total_tokens,
        },
    }))
}

pub(crate) async fn list_budget_alerts(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<BudgetAlertsQuery>,
) -> ApiResult<Json<AiBudgetAlertListResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let limit = normalize_limit(query.limit, 100, 500);
    let offset = normalize_offset(query.offset)?;
    let policy_kind = query.policy_kind;
    let status = query.status;

    let (rows, total) = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            let rows = sqlx::query_as::<_, AiBudgetAlertRow>(
                r#"
                SELECT
                    a.id,
                    COALESCE(p.policy_kind, a.scope) AS policy_kind,
                    a.period AS alert_window,
                    a.threshold_pct::float8 AS threshold_percent,
                    a.tokens_limit AS budget_tokens,
                    a.tokens_used AS used_tokens,
                    a.status,
                    NULL::text AS note,
                    jsonb_build_object('scope', a.scope, 'scope_id', a.scope_id) AS metadata,
                    COALESCE(a.alerted_at, NOW()) AS triggered_at,
                    CASE WHEN a.status = 'recovered' THEN a.alerted_at ELSE NULL END AS resolved_at,
                    COALESCE(a.alerted_at, NOW()) AS created_at,
                    COALESCE(a.alerted_at, NOW()) AS updated_at
                FROM ai_budget_alerts a
                LEFT JOIN ai_governance_policies p
                    ON p.tenant_id = a.tenant_id AND p.id = a.scope_id
                WHERE a.tenant_id = $1
                  AND ($2::text IS NULL OR COALESCE(p.policy_kind, a.scope) = $2)
                  AND ($3::text IS NULL OR a.status = $3)
                ORDER BY COALESCE(a.alerted_at, NOW()) DESC, a.id DESC
                LIMIT $4 OFFSET $5
                "#,
            )
            .bind(tenant_id)
            .bind(policy_kind.clone())
            .bind(status.clone())
            .bind(limit)
            .bind(offset)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            let total = sqlx::query_as::<_, CountRow>(
                r#"
                SELECT COUNT(*)::bigint AS total
                FROM ai_budget_alerts a
                LEFT JOIN ai_governance_policies p
                    ON p.tenant_id = a.tenant_id AND p.id = a.scope_id
                WHERE a.tenant_id = $1
                  AND ($2::text IS NULL OR COALESCE(p.policy_kind, a.scope) = $2)
                  AND ($3::text IS NULL OR a.status = $3)
                "#,
            )
            .bind(tenant_id)
            .bind(policy_kind)
            .bind(status)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)?
            .total;

            Ok((rows, total))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(AiBudgetAlertListResponse {
        data: rows.into_iter().map(Into::into).collect(),
        total,
        limit,
        offset,
    }))
}

pub(crate) async fn recompute_budget_alerts(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<RecomputeAiBudgetAlertsResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;

    let active_alerts = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query(
                r#"
                WITH monthly_usage AS (
                    SELECT policy_kind, COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS tokens_used
                    FROM ai_token_usage_events
                    WHERE tenant_id = $1 AND occurred_at >= date_trunc('month', NOW())
                    GROUP BY policy_kind
                )
                INSERT INTO ai_budget_alerts (
                    tenant_id,
                    scope,
                    scope_id,
                    threshold_pct,
                    period,
                    tokens_used,
                    tokens_limit,
                    alerted_at,
                    status
                )
                SELECT
                    p.tenant_id,
                    'policy',
                    p.id,
                    80,
                    'monthly',
                    u.tokens_used,
                    p.budget_monthly_tokens,
                    NOW(),
                    'active'
                FROM ai_governance_policies p
                JOIN monthly_usage u ON u.policy_kind = p.policy_kind
                WHERE p.tenant_id = $1
                  AND p.budget_monthly_tokens > 0
                  AND u.tokens_used * 100 >= p.budget_monthly_tokens * 80
                  AND NOT EXISTS (
                      SELECT 1
                      FROM ai_budget_alerts existing
                      WHERE existing.tenant_id = p.tenant_id
                        AND existing.scope = 'policy'
                        AND existing.scope_id = p.id
                        AND existing.period = 'monthly'
                        AND existing.threshold_pct = 80
                        AND existing.status = 'active'
                  )
                "#,
            )
            .bind(tenant_id)
            .execute(tx.as_mut())
            .await
            .map_err(as_db_error)?;

            sqlx::query_as::<_, CountRow>(
                r#"
                SELECT COUNT(*)::bigint AS total
                FROM ai_budget_alerts
                WHERE tenant_id = $1 AND status = 'active'
                "#,
            )
            .bind(tenant_id)
            .fetch_one(tx.as_mut())
            .await
            .map(|row| row.total)
            .map_err(as_db_error)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(RecomputeAiBudgetAlertsResponse { active_alerts }))
}

pub(crate) async fn list_feed_experiments(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<FeedExperimentConfigListResponse>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;

    let rows = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, FeedExperimentConfigRow>(
                r#"
                SELECT
                    id,
                    experiment_key,
                    is_active AS is_enabled,
                    (traffic_split::float8 * 100.0) AS rollout_percent,
                    jsonb_build_object('control', variant_a, 'treatment', variant_b) AS variants,
                    rollback_variant,
                    config,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                FROM feed_experiment_configs
                WHERE tenant_id = $1
                ORDER BY experiment_key ASC
                "#,
            )
            .bind(tenant_id)
            .fetch_all(tx.as_mut())
            .await
            .map_err(as_db_error)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(FeedExperimentConfigListResponse {
        data: rows.into_iter().map(Into::into).collect(),
    }))
}
pub(crate) async fn upsert_feed_experiment(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(experiment_key): Path<String>,
    Json(body): Json<UpsertFeedExperimentBody>,
) -> ApiResult<Json<FeedExperimentConfig>> {
    let user = require_auth(&auth_session)?;
    let tenant_id = user.tenant_id;
    let actor_id = Some(user.id);
    let experiment_key = normalize_key("experiment_key", &experiment_key)?;
    let traffic_split = body
        .rollout_percent
        .map(|value| (value / 100.0).clamp(0.0, 1.0));
    let (variant_a, variant_b) = split_variants(body.variants);
    let rollback_variant = body
        .rollback_variant
        .as_deref()
        .map(|value| normalize_key("rollback_variant", value))
        .transpose()?;
    let config = normalize_experiment_config(body.config);

    let row = with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, FeedExperimentConfigRow>(
                r#"
                INSERT INTO feed_experiment_configs (
                    tenant_id,
                    experiment_key,
                    name,
                    description,
                    variant_a,
                    variant_b,
                    traffic_split,
                    is_active,
                    started_at,
                    created_by,
                    updated_by,
                    rollback_variant,
                    config
                )
                VALUES (
                    $1,
                    $2,
                    $2,
                    NULL,
                    $3,
                    $4,
                    COALESCE($5, 0.50),
                    COALESCE($6, false),
                    CASE WHEN COALESCE($6, false) THEN NOW() ELSE NULL END,
                    $7,
                    $7,
                    COALESCE($8, 'control'),
                    COALESCE($9, '{}'::jsonb)
                )
                ON CONFLICT (tenant_id, experiment_key) DO UPDATE
                SET
                    variant_a = $3,
                    variant_b = $4,
                    traffic_split = COALESCE($5, feed_experiment_configs.traffic_split),
                    is_active = COALESCE($6, feed_experiment_configs.is_active),
                    started_at = CASE
                        WHEN COALESCE($6, feed_experiment_configs.is_active) AND feed_experiment_configs.started_at IS NULL THEN NOW()
                        ELSE feed_experiment_configs.started_at
                    END,
                    ended_at = CASE
                        WHEN $6 = false THEN NOW()
                        ELSE feed_experiment_configs.ended_at
                    END,
                    updated_by = $7,
                    updated_at = NOW(),
                    rollback_variant = COALESCE($8, feed_experiment_configs.rollback_variant),
                    config = COALESCE($9, feed_experiment_configs.config)
                RETURNING
                    id,
                    experiment_key,
                    is_active AS is_enabled,
                    (traffic_split::float8 * 100.0) AS rollout_percent,
                    jsonb_build_object('control', variant_a, 'treatment', variant_b) AS variants,
                    rollback_variant,
                    config,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                "#,
            )
            .bind(tenant_id)
            .bind(experiment_key)
            .bind(variant_a)
            .bind(variant_b)
            .bind(traffic_split)
            .bind(body.is_enabled)
            .bind(actor_id)
            .bind(rollback_variant)
            .bind(config)
            .fetch_one(tx.as_mut())
            .await
            .map_err(as_db_error)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(row.into()))
}
