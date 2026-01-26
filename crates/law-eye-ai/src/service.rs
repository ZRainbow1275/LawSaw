use crate::{Classifier, Embedder, LlmGateway, RiskAssessor, Summarizer, TagExtractor};
use law_eye_common::Result;
use serde_json::json;
use std::sync::Arc;
use tracing::info;

/// AI 处理服务 - 统一封装所有 AI 能力
pub struct AiService {
    classifier: Classifier,
    summarizer: Summarizer,
    risk_assessor: RiskAssessor,
    tag_extractor: TagExtractor,
    embedder: Embedder,
}

impl AiService {
    pub fn new(api_key: &str, base_url: Option<&str>, model: Option<&str>) -> Self {
        let gateway = Arc::new(LlmGateway::new(api_key, base_url, model));
        Self {
            classifier: Classifier::new(LlmGateway::new(api_key, base_url, model)),
            summarizer: Summarizer::new(LlmGateway::new(api_key, base_url, model)),
            risk_assessor: RiskAssessor::new(LlmGateway::new(api_key, base_url, model)),
            tag_extractor: TagExtractor::new(LlmGateway::new(api_key, base_url, model)),
            embedder: Embedder::new(gateway),
        }
    }

    /// 完整的 AI 处理流程
    pub async fn process_article(&self, title: &str, content: &str) -> Result<ArticleAiResult> {
        info!("Starting full AI processing for article: {}", title);

        // 并行执行分类、摘要、风险评估
        let (classify_result, summary_result, risk_result, tags_result) = tokio::try_join!(
            self.classifier.classify(title, content),
            self.summarizer.summarize(title, content),
            self.risk_assessor.assess(title, content),
            self.tag_extractor.extract(title, content),
        )?;

        // 生成嵌入
        let embedding_text = format!("{}\n\n{}", title, content);
        let embedding_result = self.embedder.embed(&embedding_text).await?;

        info!("AI processing completed for article: {}", title);

        Ok(ArticleAiResult {
            category_slug: classify_result.category_slug,
            category_confidence: classify_result.confidence,
            summary: summary_result.brief,
            abstract_text: summary_result.abstract_text,
            key_points: summary_result.key_points,
            entities: summary_result.entities,
            risk_score: risk_result.score,
            risk_level: format!("{:?}", risk_result.level).to_lowercase(),
            risk_dimensions: risk_result.dimensions,
            recommendations: risk_result.recommendations,
            tags: tags_result.tags,
            keywords: tags_result.keywords,
            embedding: embedding_result.vector,
            token_count: embedding_result.token_count,
        })
    }

    /// 仅分类
    pub async fn classify(&self, title: &str, content: &str) -> Result<crate::ClassifyResult> {
        self.classifier.classify(title, content).await
    }

    /// 仅摘要
    pub async fn summarize(&self, title: &str, content: &str) -> Result<crate::SummaryResult> {
        self.summarizer.summarize(title, content).await
    }

    /// 仅风险评估
    pub async fn assess_risk(&self, title: &str, content: &str) -> Result<crate::RiskAssessment> {
        self.risk_assessor.assess(title, content).await
    }

    /// 仅提取标签
    pub async fn extract_tags(&self, title: &str, content: &str) -> Result<crate::TagsResult> {
        self.tag_extractor.extract(title, content).await
    }

    /// 仅嵌入
    pub async fn embed(&self, text: &str) -> Result<crate::EmbeddingResult> {
        self.embedder.embed(text).await
    }

    /// 分块嵌入（用于 RAG / 向量检索）
    pub async fn embed_chunks(&self, text: &str) -> Result<Vec<(String, crate::EmbeddingResult)>> {
        self.embedder.embed_chunks(text).await
    }
}

/// 文章 AI 处理结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleAiResult {
    pub category_slug: String,
    pub category_confidence: f32,
    pub summary: String,
    pub abstract_text: String,
    pub key_points: Vec<String>,
    pub entities: Vec<crate::Entity>,
    pub risk_score: u8,
    pub risk_level: String,
    pub risk_dimensions: Vec<crate::RiskDimension>,
    pub recommendations: Vec<String>,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub embedding: Vec<f32>,
    pub token_count: usize,
}

impl ArticleAiResult {
    /// 转换为 JSON 格式的 ai_metadata
    pub fn to_metadata(&self) -> serde_json::Value {
        json!({
            "category_confidence": self.category_confidence,
            "key_points": self.key_points,
            "entities": self.entities,
            "risk_dimensions": self.risk_dimensions,
            "recommendations": self.recommendations,
            "abstract": self.abstract_text,
        })
    }
}
