use crate::types::LlmProvider;
use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestUserMessageArgs, CreateChatCompletionRequestArgs,
        CreateEmbeddingRequestArgs,
    },
    Client,
};
use law_eye_common::{Error, Result};
use serde::de::DeserializeOwned;
use tracing::{debug, info};

/// LLM Gateway - 统一的 LLM 调用接口
pub struct LlmGateway {
    client: Client<OpenAIConfig>,
    model: String,
    embedding_model: String,
    provider: LlmProvider,
}

impl LlmGateway {
    pub fn new(api_key: &str, base_url: Option<&str>, model: Option<&str>) -> Self {
        let mut config = OpenAIConfig::new().with_api_key(api_key);

        if let Some(url) = base_url {
            config = config.with_api_base(url);
        }

        let client = Client::with_config(config);

        Self {
            client,
            model: model.unwrap_or("gpt-4o-mini").to_string(),
            embedding_model: "text-embedding-3-small".to_string(),
            provider: LlmProvider::OpenAI,
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

        let response = self
            .client
            .chat()
            .create(request)
            .await
            .map_err(|e| Error::Internal(format!("LLM request failed: {}", e)))?;

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

        let response = self
            .client
            .embeddings()
            .create(request)
            .await
            .map_err(|e| Error::Internal(format!("Embedding request failed: {}", e)))?;

        let embedding = response
            .data
            .first()
            .map(|e| e.embedding.clone())
            .ok_or_else(|| Error::Internal("Empty embedding response".to_string()))?;

        info!("Embedding generated, dimensions: {}", embedding.len());
        Ok(embedding)
    }

    /// 计算 token 数量
    pub fn count_tokens(&self, text: &str) -> usize {
        tiktoken_rs::cl100k_base()
            .map(|bpe| bpe.encode_with_special_tokens(text).len())
            .unwrap_or(text.len() / 4)
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
}
