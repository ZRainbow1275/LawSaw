use crate::with_tenant_tx;
use chrono::{DateTime, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::{
    AiBudgetAlert, AiPolicy, AiPromptVersion, AiTokenUsageLog, ContentFlag, FeedExperimentConfig,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha1::{Digest, Sha1};
use sqlx::PgPool;
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use uuid::Uuid;

const DEFAULT_POLICY_KIND: &str = "article_pipeline";
const DEFAULT_POLICY_DISPLAY_NAME: &str = "Article Pipeline";
const DEFAULT_MODEL: &str = "Qwen/Qwen3-8B";
const DEFAULT_EMBEDDING_MODEL: &str = "BAAI/bge-m3";
const DEFAULT_RERANKER_MODEL: &str = "BAAI/bge-reranker-v2-m3";
const HARD_THRESHOLD_PERCENT: i32 = 100;
const EXPERIMENT_FEED_RANKING: &str = "feed_ranking";
const EXPERIMENT_BANNER_DELIVERY: &str = "banner_delivery";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiPolicySnapshot {
    pub policy: AiPolicy,
    pub active_prompt: Option<AiPromptVersion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertAiPolicyInput {
    pub policy_kind: String,
    pub display_name: Option<String>,
    pub model: Option<String>,
    pub embedding_model: Option<String>,
    pub reranker_model: Option<String>,
    pub config: Option<serde_json::Value>,
    pub budget_daily_tokens: Option<i64>,
    pub budget_monthly_tokens: Option<i64>,
    pub is_enabled: Option<bool>,
    pub active_prompt_version: Option<i32>,
    pub actor_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishAiPromptVersionInput {
    pub policy_kind: String,
    pub prompt_template: String,
    pub variables: Option<serde_json::Value>,
    pub change_note: Option<String>,
    pub actor_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListContentFlagsQuery {
    pub article_id: Option<Uuid>,
    pub risk_level: Option<String>,
    pub sentiment: Option<String>,
    pub policy_kind: Option<String>,
    pub model_version: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentFlagMetricBucket {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentFlagMetrics {
    pub total: i64,
    pub processed_24h: i64,
    pub risk_breakdown: Vec<ContentFlagMetricBucket>,
    pub sentiment_breakdown: Vec<ContentFlagMetricBucket>,
    pub model_breakdown: Vec<ContentFlagMetricBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordAiTokenUsageInput {
    pub policy_kind: String,
    pub model_version: String,
    pub operation: String,
    pub actor_user_id: Option<Uuid>,
    pub article_id: Option<Uuid>,
    pub request_id: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub latency_ms: Option<i32>,
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListAiTokenUsageQuery {
    pub policy_kind: Option<String>,
    pub model_version: Option<String>,
    pub status: Option<String>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTokenUsageAggregate {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListAiBudgetAlertsQuery {
    pub policy_kind: Option<String>,
    pub status: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertFeedExperimentInput {
    pub experiment_key: String,
    pub is_enabled: Option<bool>,
    pub rollout_percent: Option<i32>,
    pub variants: Option<serde_json::Value>,
    pub rollback_variant: Option<String>,
    pub config: Option<serde_json::Value>,
    pub actor_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedExperimentAssignment {
    pub experiment_key: String,
    pub variant: String,
    pub is_enabled: bool,
    pub is_in_rollout: bool,
    pub rollout_percent: i32,
    pub rollback_variant: String,
}

pub struct AiGovernanceService {
    pool: PgPool,
}

impl AiGovernanceService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_policy(
        &self,
        tenant_id: Uuid,
        policy_kind: &str,
    ) -> Result<Option<AiPolicySnapshot>> {
        let policy_kind = normalize_non_empty("policy_kind", policy_kind)?;
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let policy = fetch_policy_tx(tx, tenant_id, &policy_kind).await?;
                let Some(policy) = policy else {
                    return Ok(None);
                };
                let active_prompt =
                    fetch_active_prompt_tx(tx, tenant_id, policy.id, policy.active_prompt_version)
                        .await?;
                Ok(Some(AiPolicySnapshot {
                    policy,
                    active_prompt,
                }))
            })
        })
        .await
    }

    pub async fn upsert_policy(
        &self,
        tenant_id: Uuid,
        input: UpsertAiPolicyInput,
    ) -> Result<AiPolicySnapshot> {
        let policy_kind = normalize_non_empty("policy_kind", &input.policy_kind)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let existing = fetch_policy_tx(tx, tenant_id, &policy_kind).await?;

                let display_name = normalize_optional_text(input.display_name)
                    .or_else(|| existing.as_ref().map(|value| value.display_name.clone()))
                    .unwrap_or_else(|| default_display_name(&policy_kind));

                let model = normalize_optional_text(input.model)
                    .or_else(|| existing.as_ref().map(|value| value.model.clone()))
                    .unwrap_or_else(default_model_version);
                let embedding_model = normalize_optional_text(input.embedding_model)
                    .or_else(|| {
                        existing
                            .as_ref()
                            .and_then(|value| value.embedding_model.clone())
                    })
                    .or_else(default_embedding_model);
                let reranker_model = normalize_optional_text(input.reranker_model)
                    .or_else(|| {
                        existing
                            .as_ref()
                            .and_then(|value| value.reranker_model.clone())
                    })
                    .or_else(default_reranker_model);
                let config = input
                    .config
                    .or_else(|| existing.as_ref().map(|value| value.config.clone()))
                    .unwrap_or_else(|| json!({}));

                let budget_daily_tokens = input
                    .budget_daily_tokens
                    .or_else(|| existing.as_ref().map(|value| value.budget_daily_tokens))
                    .unwrap_or(0);
                let budget_monthly_tokens = input
                    .budget_monthly_tokens
                    .or_else(|| existing.as_ref().map(|value| value.budget_monthly_tokens))
                    .unwrap_or(0);

                if budget_daily_tokens < 0 {
                    return Err(Error::Validation(
                        "budget_daily_tokens must be >= 0".to_string(),
                    ));
                }
                if budget_monthly_tokens < 0 {
                    return Err(Error::Validation(
                        "budget_monthly_tokens must be >= 0".to_string(),
                    ));
                }

                let is_enabled = input
                    .is_enabled
                    .or_else(|| existing.as_ref().map(|value| value.is_enabled))
                    .unwrap_or(true);
                let active_prompt_version = input.active_prompt_version.or_else(|| {
                    existing
                        .as_ref()
                        .and_then(|value| value.active_prompt_version)
                });
                if active_prompt_version.is_some_and(|version| version <= 0) {
                    return Err(Error::Validation(
                        "active_prompt_version must be > 0".to_string(),
                    ));
                }

                let policy = sqlx::query_as::<_, AiPolicy>(
                    r#"
                    INSERT INTO ai_policies (
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
                        active_prompt_version,
                        created_by,
                        updated_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
                    ON CONFLICT (tenant_id, policy_kind) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        model = EXCLUDED.model,
                        embedding_model = EXCLUDED.embedding_model,
                        reranker_model = EXCLUDED.reranker_model,
                        config = EXCLUDED.config,
                        budget_daily_tokens = EXCLUDED.budget_daily_tokens,
                        budget_monthly_tokens = EXCLUDED.budget_monthly_tokens,
                        is_enabled = EXCLUDED.is_enabled,
                        active_prompt_version = EXCLUDED.active_prompt_version,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                    RETURNING
                        id,
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
                        active_prompt_version,
                        created_by,
                        updated_by,
                        created_at,
                        updated_at
                    "#,
                )
                .bind(tenant_id)
                .bind(&policy_kind)
                .bind(display_name)
                .bind(model)
                .bind(embedding_model)
                .bind(reranker_model)
                .bind(config)
                .bind(budget_daily_tokens)
                .bind(budget_monthly_tokens)
                .bind(is_enabled)
                .bind(active_prompt_version)
                .bind(input.actor_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let active_prompt =
                    fetch_active_prompt_tx(tx, tenant_id, policy.id, policy.active_prompt_version)
                        .await?;

                Ok(AiPolicySnapshot {
                    policy,
                    active_prompt,
                })
            })
        })
        .await
    }

    pub async fn publish_prompt_version(
        &self,
        tenant_id: Uuid,
        input: PublishAiPromptVersionInput,
    ) -> Result<AiPolicySnapshot> {
        let policy_kind = normalize_non_empty("policy_kind", &input.policy_kind)?;
        let prompt_template = normalize_non_empty("prompt_template", &input.prompt_template)?;
        let variables = input.variables.unwrap_or_else(|| json!({}));
        let change_note = normalize_optional_text(input.change_note);
        let prompt_checksum = checksum_for_prompt(&prompt_template, &variables);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let policy = match fetch_policy_tx(tx, tenant_id, &policy_kind).await? {
                    Some(policy) => policy,
                    None => sqlx::query_as::<_, AiPolicy>(
                        r#"
                            INSERT INTO ai_policies (
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
                                active_prompt_version,
                                created_by,
                                updated_by
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, 0, 0, true, NULL, $7, $7)
                            RETURNING
                                id,
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
                                active_prompt_version,
                                created_by,
                                updated_by,
                                created_at,
                                updated_at
                            "#,
                    )
                    .bind(tenant_id)
                    .bind(&policy_kind)
                    .bind(default_display_name(&policy_kind))
                    .bind(default_model_version())
                    .bind(default_embedding_model())
                    .bind(default_reranker_model())
                    .bind(input.actor_id)
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?,
                };

                let next_version = sqlx::query_scalar::<_, i32>(
                    r#"
                    SELECT COALESCE(MAX(version), 0)::int + 1
                    FROM ai_prompt_versions
                    WHERE tenant_id = $1 AND policy_id = $2
                    "#,
                )
                .bind(tenant_id)
                .bind(policy.id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let active_prompt = sqlx::query_as::<_, AiPromptVersion>(
                    r#"
                    INSERT INTO ai_prompt_versions (
                        tenant_id,
                        policy_id,
                        version,
                        prompt_template,
                        prompt_checksum,
                        variables,
                        change_note,
                        created_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING
                        id,
                        tenant_id,
                        policy_id,
                        version,
                        prompt_template,
                        prompt_checksum,
                        variables,
                        change_note,
                        created_by,
                        created_at
                    "#,
                )
                .bind(tenant_id)
                .bind(policy.id)
                .bind(next_version)
                .bind(prompt_template)
                .bind(prompt_checksum)
                .bind(variables)
                .bind(change_note)
                .bind(input.actor_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let policy = sqlx::query_as::<_, AiPolicy>(
                    r#"
                    UPDATE ai_policies
                    SET
                        active_prompt_version = $3,
                        updated_by = $4,
                        updated_at = NOW()
                    WHERE tenant_id = $1 AND id = $2
                    RETURNING
                        id,
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
                        active_prompt_version,
                        created_by,
                        updated_by,
                        created_at,
                        updated_at
                    "#,
                )
                .bind(tenant_id)
                .bind(policy.id)
                .bind(next_version)
                .bind(input.actor_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(AiPolicySnapshot {
                    policy,
                    active_prompt: Some(active_prompt),
                })
            })
        })
        .await
    }

    pub async fn list_prompt_versions(
        &self,
        tenant_id: Uuid,
        policy_kind: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AiPromptVersion>> {
        let policy_kind = normalize_non_empty("policy_kind", policy_kind)?;
        let limit = limit.clamp(1, 200);
        if offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let policy_id = sqlx::query_scalar::<_, Uuid>(
                    "SELECT id FROM ai_policies WHERE tenant_id = $1 AND policy_kind = $2",
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let Some(policy_id) = policy_id else {
                    return Ok(Vec::new());
                };

                let rows = sqlx::query_as::<_, AiPromptVersion>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        policy_id,
                        version,
                        prompt_template,
                        prompt_checksum,
                        variables,
                        change_note,
                        created_by,
                        created_at
                    FROM ai_prompt_versions
                    WHERE tenant_id = $1 AND policy_id = $2
                    ORDER BY version DESC
                    LIMIT $3 OFFSET $4
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok(rows)
            })
        })
        .await
    }

    pub async fn list_content_flags(
        &self,
        tenant_id: Uuid,
        query: ListContentFlagsQuery,
    ) -> Result<Vec<ContentFlag>> {
        let risk_level = normalize_optional_text(query.risk_level);
        let sentiment = normalize_optional_text(query.sentiment);
        let policy_kind = normalize_optional_text(query.policy_kind);
        let model_version = normalize_optional_text(query.model_version);
        let limit = query.limit.clamp(1, 500);
        if query.offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows = sqlx::query_as::<_, ContentFlag>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        article_id,
                        policy_kind,
                        model_version,
                        prompt_version,
                        sentiment,
                        risk_level,
                        risk_score,
                        importance,
                        industry,
                        region_code,
                        tags,
                        keywords,
                        output_hash,
                        metadata,
                        updated_by_task,
                        processed_at,
                        created_at,
                        updated_at
                    FROM content_flags
                    WHERE tenant_id = $1
                      AND ($2::uuid IS NULL OR article_id = $2)
                      AND ($3::text IS NULL OR risk_level = $3)
                      AND ($4::text IS NULL OR sentiment = $4)
                      AND ($5::text IS NULL OR policy_kind = $5)
                      AND ($6::text IS NULL OR model_version = $6)
                    ORDER BY processed_at DESC, created_at DESC
                    LIMIT $7 OFFSET $8
                    "#,
                )
                .bind(tenant_id)
                .bind(query.article_id)
                .bind(risk_level)
                .bind(sentiment)
                .bind(policy_kind)
                .bind(model_version)
                .bind(limit)
                .bind(query.offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(rows)
            })
        })
        .await
    }

    pub async fn count_content_flags(
        &self,
        tenant_id: Uuid,
        query: ListContentFlagsQuery,
    ) -> Result<i64> {
        let risk_level = normalize_optional_text(query.risk_level);
        let sentiment = normalize_optional_text(query.sentiment);
        let policy_kind = normalize_optional_text(query.policy_kind);
        let model_version = normalize_optional_text(query.model_version);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let count = sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COUNT(*)
                    FROM content_flags
                    WHERE tenant_id = $1
                      AND ($2::uuid IS NULL OR article_id = $2)
                      AND ($3::text IS NULL OR risk_level = $3)
                      AND ($4::text IS NULL OR sentiment = $4)
                      AND ($5::text IS NULL OR policy_kind = $5)
                      AND ($6::text IS NULL OR model_version = $6)
                    "#,
                )
                .bind(tenant_id)
                .bind(query.article_id)
                .bind(risk_level)
                .bind(sentiment)
                .bind(policy_kind)
                .bind(model_version)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(count)
            })
        })
        .await
    }

    pub async fn content_flag_metrics(&self, tenant_id: Uuid) -> Result<ContentFlagMetrics> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let total = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM content_flags WHERE tenant_id = $1",
                )
                .bind(tenant_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let processed_24h = sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COUNT(*)
                    FROM content_flags
                    WHERE tenant_id = $1
                      AND processed_at >= (NOW() - INTERVAL '24 hours')
                    "#,
                )
                .bind(tenant_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let risk_breakdown =
                    query_metric_breakdown(tx, tenant_id, "COALESCE(risk_level, 'unknown')", false)
                        .await?;

                let sentiment_breakdown =
                    query_metric_breakdown(tx, tenant_id, "COALESCE(sentiment, 'unknown')", false)
                        .await?;

                let model_breakdown =
                    query_metric_breakdown(tx, tenant_id, "model_version", true).await?;

                Ok(ContentFlagMetrics {
                    total,
                    processed_24h,
                    risk_breakdown,
                    sentiment_breakdown,
                    model_breakdown,
                })
            })
        })
        .await
    }

    pub async fn record_token_usage(
        &self,
        tenant_id: Uuid,
        input: RecordAiTokenUsageInput,
    ) -> Result<AiTokenUsageLog> {
        let policy_kind = normalize_non_empty("policy_kind", &input.policy_kind)?;
        let model_version = normalize_non_empty("model_version", &input.model_version)?;
        let operation = normalize_non_empty("operation", &input.operation)?;
        let request_id = normalize_optional_text(input.request_id);
        let status = normalize_token_status(input.status)?;
        let metadata = input.metadata.unwrap_or_else(|| json!({}));
        if input.input_tokens < 0 {
            return Err(Error::Validation("input_tokens must be >= 0".to_string()));
        }
        if input.output_tokens < 0 {
            return Err(Error::Validation("output_tokens must be >= 0".to_string()));
        }
        if input.latency_ms.is_some_and(|value| value < 0) {
            return Err(Error::Validation("latency_ms must be >= 0".to_string()));
        }
        let total_tokens = input
            .input_tokens
            .checked_add(input.output_tokens)
            .ok_or_else(|| Error::Validation("token counters overflow".to_string()))?;
        let policy_kind_for_alerts = policy_kind.clone();

        let usage = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AiTokenUsageLog>(
                    r#"
                    INSERT INTO ai_token_usage_logs (
                        tenant_id,
                        policy_kind,
                        model_version,
                        operation,
                        actor_user_id,
                        article_id,
                        request_id,
                        input_tokens,
                        output_tokens,
                        total_tokens,
                        latency_ms,
                        status,
                        metadata
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    RETURNING
                        id,
                        tenant_id,
                        policy_kind,
                        model_version,
                        operation,
                        actor_user_id,
                        article_id,
                        request_id,
                        input_tokens,
                        output_tokens,
                        total_tokens,
                        latency_ms,
                        status,
                        metadata,
                        recorded_at,
                        created_at
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .bind(model_version)
                .bind(operation)
                .bind(input.actor_user_id)
                .bind(input.article_id)
                .bind(request_id)
                .bind(input.input_tokens)
                .bind(input.output_tokens)
                .bind(total_tokens)
                .bind(input.latency_ms)
                .bind(status)
                .bind(metadata)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        self.refresh_budget_alerts_for_policy(tenant_id, &policy_kind_for_alerts)
            .await?;
        Ok(usage)
    }

    pub async fn list_token_usage(
        &self,
        tenant_id: Uuid,
        query: ListAiTokenUsageQuery,
    ) -> Result<Vec<AiTokenUsageLog>> {
        let policy_kind = normalize_optional_text(query.policy_kind);
        let model_version = normalize_optional_text(query.model_version);
        let status = normalize_optional_token_status(query.status)?;
        let limit = query.limit.clamp(1, 500);
        if query.offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }
        if query.from.zip(query.to).is_some_and(|(from, to)| from > to) {
            return Err(Error::Validation("from must be <= to".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AiTokenUsageLog>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        policy_kind,
                        model_version,
                        operation,
                        actor_user_id,
                        article_id,
                        request_id,
                        input_tokens,
                        output_tokens,
                        total_tokens,
                        latency_ms,
                        status,
                        metadata,
                        recorded_at,
                        created_at
                    FROM ai_token_usage_logs
                    WHERE tenant_id = $1
                      AND ($2::text IS NULL OR policy_kind = $2)
                      AND ($3::text IS NULL OR model_version = $3)
                      AND ($4::text IS NULL OR status = $4)
                      AND ($5::timestamptz IS NULL OR recorded_at >= $5)
                      AND ($6::timestamptz IS NULL OR recorded_at <= $6)
                    ORDER BY recorded_at DESC, created_at DESC
                    LIMIT $7 OFFSET $8
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .bind(model_version)
                .bind(status)
                .bind(query.from)
                .bind(query.to)
                .bind(limit)
                .bind(query.offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn count_token_usage(
        &self,
        tenant_id: Uuid,
        query: ListAiTokenUsageQuery,
    ) -> Result<i64> {
        let policy_kind = normalize_optional_text(query.policy_kind);
        let model_version = normalize_optional_text(query.model_version);
        let status = normalize_optional_token_status(query.status)?;
        if query.from.zip(query.to).is_some_and(|(from, to)| from > to) {
            return Err(Error::Validation("from must be <= to".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COUNT(*)
                    FROM ai_token_usage_logs
                    WHERE tenant_id = $1
                      AND ($2::text IS NULL OR policy_kind = $2)
                      AND ($3::text IS NULL OR model_version = $3)
                      AND ($4::text IS NULL OR status = $4)
                      AND ($5::timestamptz IS NULL OR recorded_at >= $5)
                      AND ($6::timestamptz IS NULL OR recorded_at <= $6)
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .bind(model_version)
                .bind(status)
                .bind(query.from)
                .bind(query.to)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn aggregate_token_usage(
        &self,
        tenant_id: Uuid,
        query: ListAiTokenUsageQuery,
    ) -> Result<AiTokenUsageAggregate> {
        let policy_kind = normalize_optional_text(query.policy_kind);
        let model_version = normalize_optional_text(query.model_version);
        let status = normalize_optional_token_status(query.status)?;
        if query.from.zip(query.to).is_some_and(|(from, to)| from > to) {
            return Err(Error::Validation("from must be <= to".to_string()));
        }

        let row = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<i64>)>(
                    r#"
                    SELECT
                        SUM(input_tokens) AS input_tokens,
                        SUM(output_tokens) AS output_tokens,
                        SUM(total_tokens) AS total_tokens
                    FROM ai_token_usage_logs
                    WHERE tenant_id = $1
                      AND ($2::text IS NULL OR policy_kind = $2)
                      AND ($3::text IS NULL OR model_version = $3)
                      AND ($4::text IS NULL OR status = $4)
                      AND ($5::timestamptz IS NULL OR recorded_at >= $5)
                      AND ($6::timestamptz IS NULL OR recorded_at <= $6)
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .bind(model_version)
                .bind(status)
                .bind(query.from)
                .bind(query.to)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        Ok(AiTokenUsageAggregate {
            input_tokens: row.0.unwrap_or(0),
            output_tokens: row.1.unwrap_or(0),
            total_tokens: row.2.unwrap_or(0),
        })
    }

    pub async fn list_budget_alerts(
        &self,
        tenant_id: Uuid,
        query: ListAiBudgetAlertsQuery,
    ) -> Result<Vec<AiBudgetAlert>> {
        let policy_kind = normalize_optional_text(query.policy_kind);
        let status = normalize_optional_alert_status(query.status)?;
        let limit = query.limit.clamp(1, 500);
        if query.offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AiBudgetAlert>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        policy_kind,
                        alert_window,
                        threshold_percent,
                        budget_tokens,
                        used_tokens,
                        status,
                        note,
                        metadata,
                        triggered_at,
                        resolved_at,
                        created_at,
                        updated_at
                    FROM ai_budget_alerts
                    WHERE tenant_id = $1
                      AND ($2::text IS NULL OR policy_kind = $2)
                      AND ($3::text IS NULL OR status = $3)
                    ORDER BY created_at DESC, triggered_at DESC
                    LIMIT $4 OFFSET $5
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .bind(status)
                .bind(limit)
                .bind(query.offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn count_budget_alerts(
        &self,
        tenant_id: Uuid,
        query: ListAiBudgetAlertsQuery,
    ) -> Result<i64> {
        let policy_kind = normalize_optional_text(query.policy_kind);
        let status = normalize_optional_alert_status(query.status)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COUNT(*)
                    FROM ai_budget_alerts
                    WHERE tenant_id = $1
                      AND ($2::text IS NULL OR policy_kind = $2)
                      AND ($3::text IS NULL OR status = $3)
                    "#,
                )
                .bind(tenant_id)
                .bind(policy_kind)
                .bind(status)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn refresh_budget_alerts_for_policy(
        &self,
        tenant_id: Uuid,
        policy_kind: &str,
    ) -> Result<()> {
        let policy_kind = normalize_non_empty("policy_kind", policy_kind)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let Some(policy) = fetch_policy_tx(tx, tenant_id, &policy_kind).await? else {
                    return Ok(());
                };

                let daily_used = sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COALESCE(SUM(total_tokens), 0)::bigint
                    FROM ai_token_usage_logs
                    WHERE tenant_id = $1
                      AND policy_kind = $2
                      AND recorded_at >= date_trunc('day', NOW())
                    "#,
                )
                .bind(tenant_id)
                .bind(&policy_kind)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let monthly_used = sqlx::query_scalar::<_, i64>(
                    r#"
                    SELECT COALESCE(SUM(total_tokens), 0)::bigint
                    FROM ai_token_usage_logs
                    WHERE tenant_id = $1
                      AND policy_kind = $2
                      AND recorded_at >= date_trunc('month', NOW())
                    "#,
                )
                .bind(tenant_id)
                .bind(&policy_kind)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                sync_budget_alert_tx(
                    tx,
                    tenant_id,
                    &policy_kind,
                    "daily",
                    policy.budget_daily_tokens,
                    daily_used,
                )
                .await?;
                sync_budget_alert_tx(
                    tx,
                    tenant_id,
                    &policy_kind,
                    "monthly",
                    policy.budget_monthly_tokens,
                    monthly_used,
                )
                .await?;
                Ok(())
            })
        })
        .await
    }

    pub async fn recompute_budget_alerts(&self, tenant_id: Uuid) -> Result<i64> {
        let policy_kinds = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, String>(
                    r#"
                    SELECT policy_kind
                    FROM ai_policies
                    WHERE tenant_id = $1
                    "#,
                )
                .bind(tenant_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await?;

        for policy_kind in policy_kinds {
            self.refresh_budget_alerts_for_policy(tenant_id, &policy_kind)
                .await?;
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM ai_budget_alerts WHERE tenant_id = $1 AND status = 'triggered'",
                )
                .bind(tenant_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn list_feed_experiments(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<FeedExperimentConfig>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, FeedExperimentConfig>(
                    r#"
                    SELECT
                        id,
                        tenant_id,
                        experiment_key,
                        is_enabled,
                        rollout_percent,
                        variants,
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
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn get_feed_experiment(
        &self,
        tenant_id: Uuid,
        experiment_key: &str,
    ) -> Result<Option<FeedExperimentConfig>> {
        let experiment_key = normalize_experiment_key(experiment_key)?;
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { fetch_feed_experiment_tx(tx, tenant_id, &experiment_key).await })
        })
        .await
    }

    pub async fn upsert_feed_experiment(
        &self,
        tenant_id: Uuid,
        input: UpsertFeedExperimentInput,
    ) -> Result<FeedExperimentConfig> {
        let experiment_key = normalize_experiment_key(&input.experiment_key)?;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let existing = fetch_feed_experiment_tx(tx, tenant_id, &experiment_key).await?;

                let is_enabled = input
                    .is_enabled
                    .or_else(|| existing.as_ref().map(|row| row.is_enabled))
                    .unwrap_or(false);
                let rollout_percent = input
                    .rollout_percent
                    .or_else(|| existing.as_ref().map(|row| row.rollout_percent))
                    .unwrap_or(0);
                if !(0..=100).contains(&rollout_percent) {
                    return Err(Error::Validation(
                        "rollout_percent must be between 0 and 100".to_string(),
                    ));
                }

                let variants = input
                    .variants
                    .or_else(|| existing.as_ref().map(|row| row.variants.clone()))
                    .unwrap_or_else(|| json!({ "control": 100 }));
                let normalized_variants = normalize_experiment_variants(&variants)?;

                let rollback_variant = normalize_optional_text(input.rollback_variant)
                    .or_else(|| existing.as_ref().map(|row| row.rollback_variant.clone()))
                    .unwrap_or_else(|| "control".to_string());
                if !normalized_variants.contains_key(&rollback_variant) {
                    return Err(Error::Validation(
                        "rollback_variant must exist in variants".to_string(),
                    ));
                }

                let config = input
                    .config
                    .or_else(|| existing.as_ref().map(|row| row.config.clone()))
                    .unwrap_or_else(|| json!({}));

                sqlx::query_as::<_, FeedExperimentConfig>(
                    r#"
                    INSERT INTO feed_experiment_configs (
                        tenant_id,
                        experiment_key,
                        is_enabled,
                        rollout_percent,
                        variants,
                        rollback_variant,
                        config,
                        created_by,
                        updated_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
                    ON CONFLICT (tenant_id, experiment_key) DO UPDATE SET
                        is_enabled = EXCLUDED.is_enabled,
                        rollout_percent = EXCLUDED.rollout_percent,
                        variants = EXCLUDED.variants,
                        rollback_variant = EXCLUDED.rollback_variant,
                        config = EXCLUDED.config,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                    RETURNING
                        id,
                        tenant_id,
                        experiment_key,
                        is_enabled,
                        rollout_percent,
                        variants,
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
                .bind(is_enabled)
                .bind(rollout_percent)
                .bind(variants)
                .bind(rollback_variant)
                .bind(config)
                .bind(input.actor_id)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn resolve_feed_experiment_variant(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        experiment_key: &str,
    ) -> Result<FeedExperimentAssignment> {
        let experiment_key = normalize_experiment_key(experiment_key)?;
        let config = self.get_feed_experiment(tenant_id, &experiment_key).await?;

        let Some(config) = config else {
            return Ok(FeedExperimentAssignment {
                experiment_key,
                variant: "control".to_string(),
                is_enabled: false,
                is_in_rollout: false,
                rollout_percent: 0,
                rollback_variant: "control".to_string(),
            });
        };

        let is_in_rollout = config.is_enabled
            && config.rollout_percent > 0
            && stable_rollout_bucket(tenant_id, user_id, &config.experiment_key)
                < config.rollout_percent as u64;

        let variant = if is_in_rollout {
            pick_experiment_variant(
                tenant_id,
                user_id,
                &config.experiment_key,
                &config.variants,
                &config.rollback_variant,
            )?
        } else {
            config.rollback_variant.clone()
        };

        Ok(FeedExperimentAssignment {
            experiment_key: config.experiment_key,
            variant,
            is_enabled: config.is_enabled,
            is_in_rollout,
            rollout_percent: config.rollout_percent,
            rollback_variant: config.rollback_variant,
        })
    }
}

async fn fetch_policy_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    policy_kind: &str,
) -> Result<Option<AiPolicy>> {
    sqlx::query_as::<_, AiPolicy>(
        r#"
        SELECT
            id,
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
            active_prompt_version,
            created_by,
            updated_by,
            created_at,
            updated_at
        FROM ai_policies
        WHERE tenant_id = $1 AND policy_kind = $2
        "#,
    )
    .bind(tenant_id)
    .bind(policy_kind)
    .fetch_optional(tx.as_mut())
    .await
    .map_err(|e| Error::Database(e.to_string()))
}

async fn fetch_active_prompt_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    policy_id: Uuid,
    active_prompt_version: Option<i32>,
) -> Result<Option<AiPromptVersion>> {
    let Some(version) = active_prompt_version else {
        return Ok(None);
    };

    sqlx::query_as::<_, AiPromptVersion>(
        r#"
        SELECT
            id,
            tenant_id,
            policy_id,
            version,
            prompt_template,
            prompt_checksum,
            variables,
            change_note,
            created_by,
            created_at
        FROM ai_prompt_versions
        WHERE tenant_id = $1
          AND policy_id = $2
          AND version = $3
        "#,
    )
    .bind(tenant_id)
    .bind(policy_id)
    .bind(version)
    .fetch_optional(tx.as_mut())
    .await
    .map_err(|e| Error::Database(e.to_string()))
}

async fn query_metric_breakdown(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    bucket_sql: &str,
    top10: bool,
) -> Result<Vec<ContentFlagMetricBucket>> {
    let sql = if top10 {
        format!(
            "SELECT {bucket} AS bucket, COUNT(*) AS count
             FROM content_flags
             WHERE tenant_id = $1
             GROUP BY 1
             ORDER BY count DESC, bucket ASC
             LIMIT 10",
            bucket = bucket_sql
        )
    } else {
        format!(
            "SELECT {bucket} AS bucket, COUNT(*) AS count
             FROM content_flags
             WHERE tenant_id = $1
             GROUP BY 1
             ORDER BY count DESC, bucket ASC",
            bucket = bucket_sql
        )
    };

    let rows = sqlx::query_as::<_, (String, i64)>(&sql)
        .bind(tenant_id)
        .fetch_all(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|(key, count)| ContentFlagMetricBucket { key, count })
        .collect())
}

async fn fetch_feed_experiment_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    experiment_key: &str,
) -> Result<Option<FeedExperimentConfig>> {
    sqlx::query_as::<_, FeedExperimentConfig>(
        r#"
        SELECT
            id,
            tenant_id,
            experiment_key,
            is_enabled,
            rollout_percent,
            variants,
            rollback_variant,
            config,
            created_by,
            updated_by,
            created_at,
            updated_at
        FROM feed_experiment_configs
        WHERE tenant_id = $1 AND experiment_key = $2
        "#,
    )
    .bind(tenant_id)
    .bind(experiment_key)
    .fetch_optional(tx.as_mut())
    .await
    .map_err(|e| Error::Database(e.to_string()))
}

async fn sync_budget_alert_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant_id: Uuid,
    policy_kind: &str,
    alert_window: &str,
    budget_tokens: i64,
    used_tokens: i64,
) -> Result<()> {
    if budget_tokens <= 0 {
        return Ok(());
    }

    if used_tokens >= budget_tokens {
        let note = format!("Hard threshold reached: {used_tokens}/{budget_tokens}");
        sqlx::query(
            r#"
            INSERT INTO ai_budget_alerts (
                tenant_id,
                policy_kind,
                alert_window,
                threshold_percent,
                budget_tokens,
                used_tokens,
                status,
                note,
                metadata,
                triggered_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'triggered', $7, $8, NOW())
            ON CONFLICT (tenant_id, policy_kind, alert_window, threshold_percent)
            WHERE status = 'triggered'
            DO UPDATE SET
                budget_tokens = EXCLUDED.budget_tokens,
                used_tokens = EXCLUDED.used_tokens,
                status = 'triggered',
                note = EXCLUDED.note,
                metadata = EXCLUDED.metadata,
                resolved_at = NULL,
                updated_at = NOW()
            "#,
        )
        .bind(tenant_id)
        .bind(policy_kind)
        .bind(alert_window)
        .bind(HARD_THRESHOLD_PERCENT)
        .bind(budget_tokens)
        .bind(used_tokens)
        .bind(note)
        .bind(json!({
            "hard_threshold_percent": HARD_THRESHOLD_PERCENT,
            "budget_tokens": budget_tokens,
            "used_tokens": used_tokens
        }))
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
    } else {
        sqlx::query(
            r#"
            UPDATE ai_budget_alerts
            SET
                status = 'resolved',
                resolved_at = NOW(),
                budget_tokens = $4,
                used_tokens = $5,
                updated_at = NOW()
            WHERE tenant_id = $1
              AND policy_kind = $2
              AND alert_window = $3
              AND threshold_percent = $6
              AND status = 'triggered'
            "#,
        )
        .bind(tenant_id)
        .bind(policy_kind)
        .bind(alert_window)
        .bind(budget_tokens)
        .bind(used_tokens)
        .bind(HARD_THRESHOLD_PERCENT)
        .execute(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
    }

    Ok(())
}

fn normalize_token_status(value: Option<String>) -> Result<String> {
    let status = normalize_optional_text(value).unwrap_or_else(|| "success".to_string());
    match status.as_str() {
        "success" | "failed" | "degraded" => Ok(status),
        _ => Err(Error::Validation(
            "status must be one of: success, failed, degraded".to_string(),
        )),
    }
}

fn normalize_optional_token_status(value: Option<String>) -> Result<Option<String>> {
    match normalize_optional_text(value) {
        Some(status) => match status.as_str() {
            "success" | "failed" | "degraded" => Ok(Some(status)),
            _ => Err(Error::Validation(
                "status must be one of: success, failed, degraded".to_string(),
            )),
        },
        None => Ok(None),
    }
}

fn normalize_optional_alert_status(value: Option<String>) -> Result<Option<String>> {
    match normalize_optional_text(value) {
        Some(status) => match status.as_str() {
            "triggered" | "resolved" | "suppressed" => Ok(Some(status)),
            _ => Err(Error::Validation(
                "status must be one of: triggered, resolved, suppressed".to_string(),
            )),
        },
        None => Ok(None),
    }
}

fn normalize_experiment_key(value: &str) -> Result<String> {
    let key = normalize_non_empty("experiment_key", value)?;
    match key.as_str() {
        EXPERIMENT_FEED_RANKING | EXPERIMENT_BANNER_DELIVERY => Ok(key),
        _ => Err(Error::Validation(format!(
            "experiment_key must be one of: {EXPERIMENT_FEED_RANKING}, {EXPERIMENT_BANNER_DELIVERY}"
        ))),
    }
}

fn normalize_experiment_variants(value: &serde_json::Value) -> Result<HashMap<String, u64>> {
    let object = value
        .as_object()
        .ok_or_else(|| Error::Validation("variants must be a JSON object".to_string()))?;
    if object.is_empty() {
        return Err(Error::Validation(
            "variants must include at least one variant".to_string(),
        ));
    }

    let mut variants = HashMap::new();
    for (key, raw_weight) in object {
        let key = key.trim();
        if key.is_empty() {
            return Err(Error::Validation(
                "variant name cannot be empty".to_string(),
            ));
        }

        let weight = raw_weight.as_u64().ok_or_else(|| {
            Error::Validation("variant weight must be an unsigned integer".to_string())
        })?;
        if weight == 0 {
            return Err(Error::Validation("variant weight must be > 0".to_string()));
        }
        variants.insert(key.to_string(), weight);
    }

    Ok(variants)
}

fn stable_rollout_bucket(tenant_id: Uuid, user_id: Uuid, experiment_key: &str) -> u64 {
    hash_u64(&format!(
        "{}:{}:{}:rollout",
        tenant_id, user_id, experiment_key
    )) % 100
}

fn pick_experiment_variant(
    tenant_id: Uuid,
    user_id: Uuid,
    experiment_key: &str,
    variants: &serde_json::Value,
    rollback_variant: &str,
) -> Result<String> {
    let normalized = normalize_experiment_variants(variants)?;
    let mut weighted = normalized.into_iter().collect::<Vec<_>>();
    weighted.sort_by(|left, right| left.0.cmp(&right.0));
    let total_weight = weighted
        .iter()
        .fold(0u64, |acc, (_, weight)| acc.saturating_add(*weight));
    if total_weight == 0 {
        return Ok(rollback_variant.to_string());
    }

    let mut cursor = hash_u64(&format!(
        "{}:{}:{}:variant",
        tenant_id, user_id, experiment_key
    )) % total_weight;
    for (variant, weight) in weighted {
        if cursor < weight {
            return Ok(variant);
        }
        cursor -= weight;
    }

    Ok(rollback_variant.to_string())
}

fn hash_u64(value: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn normalize_non_empty(field: &str, value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(Error::Validation(format!("{field} cannot be empty")));
    }
    Ok(trimmed.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn default_display_name(policy_kind: &str) -> String {
    if policy_kind == DEFAULT_POLICY_KIND {
        DEFAULT_POLICY_DISPLAY_NAME.to_string()
    } else {
        policy_kind.replace('_', " ")
    }
}

fn default_model_version() -> String {
    std::env::var("LAW_EYE__AI__MODEL")
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

fn default_embedding_model() -> Option<String> {
    std::env::var("LAW_EYE__AI__EMBEDDING_MODEL")
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| Some(DEFAULT_EMBEDDING_MODEL.to_string()))
}

fn default_reranker_model() -> Option<String> {
    std::env::var("LAW_EYE__AI__RERANKER_MODEL")
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| Some(DEFAULT_RERANKER_MODEL.to_string()))
}

fn checksum_for_prompt(prompt_template: &str, variables: &serde_json::Value) -> String {
    let mut hasher = Sha1::new();
    hasher.update(prompt_template.as_bytes());
    hasher.update(b"\n");
    let encoded = serde_json::to_vec(variables).unwrap_or_default();
    hasher.update(encoded);
    format!("{:x}", hasher.finalize())
}
