use crate::{types::EmbeddingResult, LlmGateway};
use law_eye_common::Result;
use std::sync::Arc;
use tracing::info;

/// 向量嵌入器
pub struct Embedder {
    gateway: Arc<LlmGateway>,
    chunk_size: usize,
    chunk_overlap: usize,
}

impl Embedder {
    pub fn new(gateway: Arc<LlmGateway>) -> Self {
        Self {
            gateway,
            chunk_size: 1000,
            chunk_overlap: 200,
        }
    }

    pub fn with_chunk_size(mut self, size: usize) -> Self {
        self.chunk_size = size;
        self
    }

    pub fn with_overlap(mut self, overlap: usize) -> Self {
        self.chunk_overlap = overlap;
        self
    }

    /// 生成文本嵌入
    pub async fn embed(&self, text: &str) -> Result<EmbeddingResult> {
        let token_count = self.gateway.count_tokens(text);

        let vector = self.gateway.embed(text).await?;

        info!(
            "Generated embedding: {} dimensions, {} tokens",
            vector.len(),
            token_count
        );

        Ok(EmbeddingResult {
            vector,
            model: self.gateway.embedding_model().to_string(),
            token_count,
        })
    }

    /// 将文本分块并生成嵌入（并行调用所有 chunk 的 embed 请求）
    pub async fn embed_chunks(&self, text: &str) -> Result<Vec<(String, EmbeddingResult)>> {
        let chunks = self.chunk_text(text);

        let embed_futures: Vec<_> = chunks.iter().map(|chunk| self.embed(chunk)).collect();
        let embeddings = futures::future::try_join_all(embed_futures).await?;

        let results: Vec<(String, EmbeddingResult)> = chunks.into_iter().zip(embeddings).collect();

        info!("Generated {} chunk embeddings", results.len());
        Ok(results)
    }

    /// 文本分块
    fn chunk_text(&self, text: &str) -> Vec<String> {
        let mut chunks = Vec::new();
        let chars: Vec<char> = text.chars().collect();

        if chars.len() <= self.chunk_size {
            return vec![text.to_string()];
        }

        let mut start = 0;
        while start < chars.len() {
            let end = (start + self.chunk_size).min(chars.len());
            let chunk: String = chars[start..end].iter().collect();
            chunks.push(chunk);

            if end >= chars.len() {
                break;
            }

            start = end - self.chunk_overlap;
        }

        chunks
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_text_short() {
        let gateway = Arc::new(LlmGateway::new("test", None, None));
        let embedder = Embedder::new(gateway);

        let chunks = embedder.chunk_text("短文本");
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_chunk_text_long() {
        let gateway = Arc::new(LlmGateway::new("test", None, None));
        let embedder = Embedder::new(gateway).with_chunk_size(100).with_overlap(20);

        let long_text = "a".repeat(250);
        let chunks = embedder.chunk_text(&long_text);
        assert!(chunks.len() >= 2);
    }
}
