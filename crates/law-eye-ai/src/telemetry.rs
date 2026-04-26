use async_trait::async_trait;
use chrono::{DateTime, Utc};
use law_eye_common::Result;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

tokio::task_local! {
    static AI_TELEMETRY_CONTEXT: AiTelemetryContext;
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiOperation {
    Chat,
    Embedding,
    Rerank,
}

impl AiOperation {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::Embedding => "embedding",
            Self::Rerank => "rerank",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTelemetryContext {
    pub tenant_id: Uuid,
    pub request_scope: String,
    pub article_id: Option<Uuid>,
    pub report_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub request_id: Option<String>,
    pub dedupe_key: Option<String>,
    pub attempt: Option<i32>,
    #[serde(default = "default_metadata")]
    pub metadata: Value,
}

impl AiTelemetryContext {
    pub fn new(tenant_id: Uuid, request_scope: impl Into<String>) -> Self {
        Self {
            tenant_id,
            request_scope: request_scope.into(),
            article_id: None,
            report_id: None,
            user_id: None,
            request_id: None,
            dedupe_key: None,
            attempt: None,
            metadata: default_metadata(),
        }
    }

    pub fn with_article_id(mut self, article_id: Uuid) -> Self {
        self.article_id = Some(article_id);
        self
    }

    pub fn with_report_id(mut self, report_id: Uuid) -> Self {
        self.report_id = Some(report_id);
        self
    }

    pub fn with_user_id(mut self, user_id: Uuid) -> Self {
        self.user_id = Some(user_id);
        self
    }

    pub fn with_request_id(mut self, request_id: impl Into<String>) -> Self {
        self.request_id = Some(request_id.into());
        self
    }

    pub fn with_dedupe_key(mut self, dedupe_key: impl Into<String>) -> Self {
        self.dedupe_key = Some(dedupe_key.into());
        self
    }

    pub fn with_attempt(mut self, attempt: i32) -> Self {
        self.attempt = Some(attempt);
        self
    }

    pub fn with_metadata_value(mut self, key: impl Into<String>, value: Value) -> Self {
        let mut metadata = normalize_metadata(self.metadata);
        if let Value::Object(object) = &mut metadata {
            object.insert(key.into(), value);
        }
        self.metadata = metadata;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiTokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub estimated_input_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTelemetryEvent {
    pub occurred_at: DateTime<Utc>,
    pub tenant_id: Uuid,
    pub request_scope: String,
    pub operation: AiOperation,
    pub provider: String,
    pub model: Option<String>,
    pub success: bool,
    pub error_category: Option<String>,
    pub error_message: Option<String>,
    pub latency_ms: i64,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub estimated_input_tokens: Option<u32>,
    pub trace_id: Option<String>,
    pub request_id: Option<String>,
    pub dedupe_key: Option<String>,
    pub attempt: Option<i32>,
    pub article_id: Option<Uuid>,
    pub report_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    #[serde(default = "default_metadata")]
    pub metadata: Value,
}

impl AiTelemetryEvent {
    #[allow(clippy::too_many_arguments)]
    pub fn from_context(
        context: AiTelemetryContext,
        operation: AiOperation,
        provider: impl Into<String>,
        model: Option<String>,
        success: bool,
        error_category: Option<String>,
        error_message: Option<String>,
        latency_ms: i64,
        usage: AiTokenUsage,
        trace_id: Option<String>,
    ) -> Self {
        Self {
            occurred_at: Utc::now(),
            tenant_id: context.tenant_id,
            request_scope: context.request_scope,
            operation,
            provider: provider.into(),
            model,
            success,
            error_category,
            error_message,
            latency_ms,
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            estimated_input_tokens: usage.estimated_input_tokens,
            trace_id,
            request_id: context.request_id,
            dedupe_key: context.dedupe_key,
            attempt: context.attempt,
            article_id: context.article_id,
            report_id: context.report_id,
            user_id: context.user_id,
            metadata: normalize_metadata(context.metadata),
        }
    }
}

#[async_trait]
pub trait AiTelemetrySink: Send + Sync {
    async fn record(&self, event: AiTelemetryEvent) -> Result<()>;
}

pub async fn with_ai_telemetry_context<F, T>(context: AiTelemetryContext, future: F) -> T
where
    F: std::future::Future<Output = T>,
{
    AI_TELEMETRY_CONTEXT.scope(context, future).await
}

pub fn current_ai_telemetry_context() -> Option<AiTelemetryContext> {
    AI_TELEMETRY_CONTEXT.try_with(Clone::clone).ok()
}

fn default_metadata() -> Value {
    Value::Object(Map::new())
}

fn normalize_metadata(value: Value) -> Value {
    match value {
        Value::Null => default_metadata(),
        Value::Object(_) => value,
        other => {
            let mut object = Map::new();
            object.insert("value".to_string(), other);
            Value::Object(object)
        }
    }
}
