use crate::types::LlmProvider;
use async_openai::{
    config::OpenAIConfig,
    error::OpenAIError,
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestUserMessageArgs, CreateChatCompletionRequestArgs,
        CreateEmbeddingRequestArgs,
    },
    Client,
};
use law_eye_common::{CircuitBreaker, CircuitBreakerConfig, Error, Result};
use serde::de::DeserializeOwned;
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tracing::{debug, info, warn};

/// LLM Gateway - 统一的 LLM 调用接口
#[derive(Clone)]
pub struct LlmGateway {
    client: Client<OpenAIConfig>,
    model: String,
    embedding_model: String,
    embedding_vector_dim: usize,
    embedding_dimension_strategy: EmbeddingDimensionStrategy,
    provider: LlmProvider,
    request_semaphore: Arc<Semaphore>,
    circuit_breaker: CircuitBreaker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EmbeddingDimensionStrategy {
    Strict,
    PadOrTruncate,
}

impl EmbeddingDimensionStrategy {
    fn from_env() -> Self {
        match std::env::var("LAW_EYE__AI__EMBEDDING_DIMENSION_STRATEGY")
            .ok()
            .as_deref()
            .unwrap_or("strict")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "pad_or_truncate" | "pad-or-truncate" | "pad" | "truncate" => Self::PadOrTruncate,
            _ => Self::Strict,
        }
    }
}

impl LlmGateway {
    pub fn new(api_key: &str, base_url: Option<&str>, model: Option<&str>) -> Self {
        let mut config = OpenAIConfig::new().with_api_key(api_key);

        if let Some(url) = base_url {
            config = config.with_api_base(url);
        }

        let client = Client::with_config(config);

        let max_concurrency = env_u32("LAW_EYE__AI__MAX_CONCURRENT_REQUESTS")
            .unwrap_or(4)
            .clamp(1, 64) as usize;

        let failure_threshold = env_u32("LAW_EYE__AI__CIRCUIT_FAILURE_THRESHOLD")
            .unwrap_or(5)
            .clamp(1, 50);
        let open_seconds = env_u64("LAW_EYE__AI__CIRCUIT_OPEN_SECONDS")
            .unwrap_or(30)
            .clamp(1, 600);
        let embedding_vector_dim = env_u32("LAW_EYE__AI__EMBEDDING_VECTOR_DIM")
            .unwrap_or(1536)
            .clamp(1, 8192) as usize;
        let embedding_dimension_strategy = EmbeddingDimensionStrategy::from_env();

        Self {
            client,
            model: model.unwrap_or("gpt-4o-mini").to_string(),
            embedding_model: "text-embedding-3-small".to_string(),
            embedding_vector_dim,
            embedding_dimension_strategy,
            provider: LlmProvider::OpenAI,
            request_semaphore: Arc::new(Semaphore::new(max_concurrency)),
            circuit_breaker: CircuitBreaker::new(CircuitBreakerConfig {
                failure_threshold,
                open_duration: Duration::from_secs(open_seconds),
            }),
        }
    }

    pub fn with_provider(mut self, provider: LlmProvider) -> Self {
        self.provider = provider;
        self
    }

    pub fn with_embedding_model(mut self, model: &str) -> Self {
        self.embedding_model = model.to_string();
        self
    }

    pub fn embedding_model(&self) -> &str {
        &self.embedding_model
    }

    fn normalize_embedding_dimensions(&self, vector: Vec<f32>) -> Result<Vec<f32>> {
        let actual = vector.len();
        if actual == self.embedding_vector_dim {
            return Ok(vector);
        }

        match self.embedding_dimension_strategy {
            EmbeddingDimensionStrategy::Strict => Err(Error::Config(format!(
                "embedding dimension mismatch: got {}, expected {} (model={}, strategy=strict). \
set LAW_EYE__AI__EMBEDDING_VECTOR_DIM to match provider output or set \
LAW_EYE__AI__EMBEDDING_DIMENSION_STRATEGY=pad_or_truncate for local compatibility",
                actual, self.embedding_vector_dim, self.embedding_model
            ))),
            EmbeddingDimensionStrategy::PadOrTruncate => {
                warn!(
                    model = %self.embedding_model,
                    actual_dim = actual,
                    expected_dim = self.embedding_vector_dim,
                    "embedding dimension mismatch detected; applying pad_or_truncate normalization"
                );

                let mut adjusted = vector;
                if adjusted.len() > self.embedding_vector_dim {
                    adjusted.truncate(self.embedding_vector_dim);
                } else {
                    adjusted.resize(self.embedding_vector_dim, 0.0);
                }
                Ok(adjusted)
            }
        }
    }

    /// 发送聊天请求并解析 JSON 响应
    pub async fn chat_json<T: DeserializeOwned>(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<T> {
        let response = self.chat(system_prompt, user_prompt).await?;

        // 尝试从 markdown code block 中提取 JSON
        let json_str = extract_json(&response);

        serde_json::from_str(json_str).map_err(|e| {
            Error::Internal(format!(
                "Failed to parse LLM response as JSON: {}. Response: {}",
                e, response
            ))
        })
    }

    /// 发送聊天请求
    pub async fn chat(&self, system_prompt: &str, user_prompt: &str) -> Result<String> {
        debug!("Sending chat request to LLM");

        let messages = vec![
            ChatCompletionRequestMessage::System(
                ChatCompletionRequestSystemMessageArgs::default()
                    .content(system_prompt)
                    .build()
                    .map_err(|e| Error::Internal(e.to_string()))?,
            ),
            ChatCompletionRequestMessage::User(
                ChatCompletionRequestUserMessageArgs::default()
                    .content(user_prompt)
                    .build()
                    .map_err(|e| Error::Internal(e.to_string()))?,
            ),
        ];

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages(messages)
            .temperature(0.3)
            .build()
            .map_err(|e| Error::Internal(e.to_string()))?;

        let breaker_check = self.circuit_breaker.check().await;
        if !breaker_check.allowed {
            let retry_after = breaker_check.retry_after_seconds.unwrap_or(30);
            return Err(Error::Http(format!(
                "AI_CIRCUIT_OPEN retry_after_seconds={}: circuit open",
                retry_after
            )));
        }

        // Global concurrency limiter to reduce 429s during bursts (e.g. Full task fan-out).
        let _permit = self
            .request_semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| Error::Internal(format!("Failed to acquire AI semaphore: {}", e)))?;

        let response = match self.client.chat().create(request).await {
            Ok(resp) => {
                self.circuit_breaker.record_success().await;
                resp
            }
            Err(err) => {
                self.circuit_breaker.record_failure().await;
                return Err(map_openai_error(err));
            }
        };

        let content = response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .ok_or_else(|| Error::Internal("Empty LLM response".to_string()))?;

        info!("LLM response received, length: {}", content.len());
        Ok(content)
    }

    /// 生成向量嵌入
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        debug!("Generating embedding for text of length: {}", text.len());

        let request = CreateEmbeddingRequestArgs::default()
            .model(&self.embedding_model)
            .input(text)
            .build()
            .map_err(|e| Error::Internal(e.to_string()))?;

        let breaker_check = self.circuit_breaker.check().await;
        if !breaker_check.allowed {
            let retry_after = breaker_check.retry_after_seconds.unwrap_or(30);
            return Err(Error::Http(format!(
                "AI_CIRCUIT_OPEN retry_after_seconds={}: circuit open",
                retry_after
            )));
        }

        let _permit = self
            .request_semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| Error::Internal(format!("Failed to acquire AI semaphore: {}", e)))?;

        let response = match self.client.embeddings().create(request).await {
            Ok(resp) => {
                self.circuit_breaker.record_success().await;
                resp
            }
            Err(err) => {
                self.circuit_breaker.record_failure().await;
                return Err(map_openai_error(err));
            }
        };

        let embedding = response
            .data
            .first()
            .map(|e| e.embedding.clone())
            .ok_or_else(|| Error::Internal("Empty embedding response".to_string()))?;

        let provider_dim = embedding.len();
        let normalized = self.normalize_embedding_dimensions(embedding)?;

        info!(
            provider_dim,
            normalized_dim = normalized.len(),
            model = %self.embedding_model,
            "Embedding generated"
        );
        Ok(normalized)
    }

    /// 计算 token 数量
    pub fn count_tokens(&self, text: &str) -> usize {
        tiktoken_rs::cl100k_base()
            .map(|bpe| bpe.encode_with_special_tokens(text).len())
            .unwrap_or(text.len() / 4)
    }

    pub async fn health_check(&self) -> Result<()> {
        let breaker_check = self.circuit_breaker.check().await;
        if !breaker_check.allowed {
            let retry_after = breaker_check.retry_after_seconds.unwrap_or(30);
            return Err(Error::Http(format!(
                "AI_CIRCUIT_OPEN retry_after_seconds={}: circuit open",
                retry_after
            )));
        }

        let _permit = self
            .request_semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| Error::Internal(format!("Failed to acquire AI semaphore: {}", e)))?;

        match self.client.models().list().await {
            Ok(_) => {
                self.circuit_breaker.record_success().await;
                Ok(())
            }
            Err(err) => {
                self.circuit_breaker.record_failure().await;
                Err(map_openai_error(err))
            }
        }
    }
}

fn env_u32(name: &str) -> Option<u32> {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
}

fn env_u64(name: &str) -> Option<u64> {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
}

fn is_rate_limited_api_error(err: &async_openai::error::ApiError) -> bool {
    // async-openai already retries 429s internally. If we still get here, treat it as recoverable
    // and propagate a marker understood by our queue retry logic.
    if err.r#type.as_deref() == Some("insufficient_quota") {
        return false;
    }

    let ty = err.r#type.as_deref().unwrap_or("").to_ascii_lowercase();
    if ty.contains("rate_limit") {
        return true;
    }

    let msg = err.message.to_ascii_lowercase();
    msg.contains("rate limit") || msg.contains("too many requests") || msg.contains("429")
}

fn extract_retry_after_seconds_from_message(message: &str) -> Option<u64> {
    // Best-effort parsing. OpenAI sometimes embeds the wait duration in the message.
    // Examples: "Please try again in 20s." / "Please try again in 20 seconds."
    let lower = message.to_ascii_lowercase();

    for marker in ["try again in ", "retry after ", "in ", "after "] {
        if let Some(pos) = lower.find(marker) {
            let start = pos + marker.len();
            let digits: String = lower[start..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if digits.is_empty() {
                continue;
            }
            if let Ok(value) = digits.parse::<u64>() {
                return Some(value);
            }
        }
    }

    None
}

fn map_openai_error(err: OpenAIError) -> Error {
    match err {
        OpenAIError::ApiError(api_err) => {
            if is_rate_limited_api_error(&api_err) {
                let retry_after = extract_retry_after_seconds_from_message(&api_err.message)
                    .unwrap_or(60)
                    .min(60 * 60); // cap at 1h

                return Error::Http(format!(
                    "AI_RATE_LIMITED retry_after_seconds={}: {}",
                    retry_after, api_err
                ));
            }

            if api_err.r#type.as_deref() == Some("insufficient_quota") {
                return Error::Config(format!("OpenAI quota exceeded: {}", api_err.message));
            }

            Error::Internal(format!("LLM request failed: {}", api_err))
        }
        OpenAIError::Reqwest(req_err) => {
            if req_err.status().map(|s| s.as_u16()) == Some(429) {
                return Error::Http("AI_RATE_LIMITED retry_after_seconds=60: HTTP 429".to_string());
            }
            Error::Http(format!("LLM HTTP error: {}", req_err))
        }
        other => Error::Internal(format!("LLM request failed: {}", other)),
    }
}

/// 从响应中提取 JSON (处理 markdown code block)
fn extract_json(text: &str) -> &str {
    let text = text.trim();

    // 尝试匹配 ```json ... ``` 格式
    if let Some(start) = text.find("```json") {
        if let Some(end) = text[start + 7..].find("```") {
            return text[start + 7..start + 7 + end].trim();
        }
    }

    // 尝试匹配 ``` ... ``` 格式
    if let Some(start) = text.find("```") {
        if let Some(end) = text[start + 3..].find("```") {
            return text[start + 3..start + 3 + end].trim();
        }
    }

    // 尝试找到 JSON 对象或数组
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            return &text[start..=end];
        }
    }

    if let Some(start) = text.find('[') {
        if let Some(end) = text.rfind(']') {
            return &text[start..=end];
        }
    }

    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_from_code_block() {
        let input = r#"```json
{"category": "test"}
```"#;
        assert_eq!(extract_json(input), r#"{"category": "test"}"#);
    }

    #[test]
    fn test_extract_json_plain() {
        let input = r#"{"category": "test"}"#;
        assert_eq!(extract_json(input), r#"{"category": "test"}"#);
    }

    #[test]
    fn normalize_embedding_dimensions_strict_rejects_mismatch() {
        let gateway = LlmGateway::new("test", None, None);
        let result = gateway.normalize_embedding_dimensions(vec![0.1, 0.2, 0.3]);
        assert!(matches!(result, Err(Error::Config(_))));
    }

    #[test]
    fn normalize_embedding_dimensions_pad_or_truncate_pads_short_vector() {
        let mut gateway = LlmGateway::new("test", None, None);
        gateway.embedding_vector_dim = 5;
        gateway.embedding_dimension_strategy = EmbeddingDimensionStrategy::PadOrTruncate;

        let normalized = gateway
            .normalize_embedding_dimensions(vec![0.1, 0.2, 0.3])
            .expect("pad_or_truncate should normalize short vector");
        assert_eq!(normalized, vec![0.1, 0.2, 0.3, 0.0, 0.0]);
    }

    #[test]
    fn normalize_embedding_dimensions_pad_or_truncate_truncates_long_vector() {
        let mut gateway = LlmGateway::new("test", None, None);
        gateway.embedding_vector_dim = 2;
        gateway.embedding_dimension_strategy = EmbeddingDimensionStrategy::PadOrTruncate;

        let normalized = gateway
            .normalize_embedding_dimensions(vec![0.1, 0.2, 0.3])
            .expect("pad_or_truncate should normalize long vector");
        assert_eq!(normalized, vec![0.1, 0.2]);
    }
}
