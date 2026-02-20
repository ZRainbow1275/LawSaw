use std::sync::Arc;

use law_eye_ai::AiService;
use tracing::{info, warn};

use crate::pipeline::RawArticle;

/// Asynchronous pipeline stage trait for stages that require async I/O
/// (e.g., AI service calls, network requests).
///
/// Unlike the synchronous `PipelineStage`, this trait supports `await` in
/// its `process` method. The pipeline runner must call these stages via
/// an async executor.
#[async_trait::async_trait]
pub trait AsyncPipelineStage: Send + Sync {
    /// Process an article asynchronously.
    /// Returns `Some(article)` to continue or `None` to filter it out.
    async fn process(&self, article: RawArticle) -> Option<RawArticle>;
}

/// AI enrichment stage that uses `AiService` to populate AI fields on articles.
///
/// This stage:
/// - Classifies the article into a legal domain category
/// - Generates a brief summary and abstract
/// - Assesses risk score and level
/// - Extracts tags and keywords
/// - Generates embedding vectors
/// - Stores full AI metadata as JSON
///
/// **Graceful degradation**: If AI processing fails for any reason (network error,
/// rate limit, API key issue), the article is returned unchanged — the pipeline
/// is never blocked by AI failures.
pub struct AiEnrichmentStage {
    ai_service: Arc<AiService>,
    /// Skip articles that already have AI enrichment.
    skip_enriched: bool,
    /// Minimum content length (chars) required for AI processing.
    /// Articles with shorter content are passed through unchanged.
    min_content_length: usize,
}

impl AiEnrichmentStage {
    /// Create a new AI enrichment stage wrapping the given `AiService`.
    pub fn new(ai_service: Arc<AiService>) -> Self {
        Self {
            ai_service,
            skip_enriched: true,
            min_content_length: 50,
        }
    }

    /// Set whether to skip articles that already have AI enrichment.
    pub fn with_skip_enriched(mut self, skip: bool) -> Self {
        self.skip_enriched = skip;
        self
    }

    /// Set minimum content length for AI processing.
    pub fn with_min_content_length(mut self, len: usize) -> Self {
        self.min_content_length = len;
        self
    }

    /// Process a batch of articles concurrently with AI enrichment.
    ///
    /// Articles without sufficient content are passed through unchanged.
    /// AI failures are logged and the original article is preserved.
    pub async fn process_batch(&self, articles: Vec<RawArticle>) -> Vec<RawArticle> {
        let mut results = Vec::with_capacity(articles.len());

        for article in articles {
            results.push(self.process_single(article).await);
        }

        results
    }

    async fn process_single(&self, mut article: RawArticle) -> RawArticle {
        // Skip if already enriched
        if self.skip_enriched && article.has_ai_enrichment() {
            return article;
        }

        // Skip if content is too short or absent
        let content = match &article.content {
            Some(c) if c.chars().count() >= self.min_content_length => c.clone(),
            _ => {
                // Try title-only classification if content is missing/short
                return self.enrich_title_only(article).await;
            }
        };

        // Full AI processing
        match self
            .ai_service
            .process_article(&article.title, &content)
            .await
        {
            Ok(result) => {
                // Compute metadata before moving fields out of result
                let metadata = result.to_metadata();

                article.ai_category = Some(result.category_slug);
                article.ai_category_confidence = Some(result.category_confidence);
                article.ai_summary = Some(result.summary);
                article.ai_abstract = Some(result.abstract_text);
                article.ai_key_points = Some(result.key_points);
                article.ai_risk_score = Some(result.risk_score);
                article.ai_risk_level = Some(result.risk_level);
                article.ai_tags = Some(result.tags);
                article.ai_keywords = Some(result.keywords);
                article.ai_embedding = Some(result.embedding);
                article.ai_metadata = Some(metadata);

                info!(
                    title = %article.title,
                    category = ?article.ai_category,
                    risk_score = ?article.ai_risk_score,
                    "AI enrichment completed"
                );
            }
            Err(err) => {
                warn!(
                    title = %article.title,
                    error = %err,
                    "AI enrichment failed, passing article through unchanged"
                );
            }
        }

        article
    }

    /// Attempt classification using only the title (for articles without content).
    async fn enrich_title_only(&self, mut article: RawArticle) -> RawArticle {
        match self
            .ai_service
            .classify(&article.title, &article.title)
            .await
        {
            Ok(result) => {
                article.ai_category = Some(result.category_slug);
                article.ai_category_confidence = Some(result.confidence);

                info!(
                    title = %article.title,
                    category = ?article.ai_category,
                    "AI title-only classification completed"
                );
            }
            Err(err) => {
                warn!(
                    title = %article.title,
                    error = %err,
                    "AI title-only classification failed"
                );
            }
        }

        article
    }
}

#[async_trait::async_trait]
impl AsyncPipelineStage for AiEnrichmentStage {
    async fn process(&self, article: RawArticle) -> Option<RawArticle> {
        // AI enrichment never filters articles — always returns Some
        Some(self.process_single(article).await)
    }
}

/// An async pipeline that runs multiple `AsyncPipelineStage`s in sequence.
pub struct AsyncPipeline {
    stages: Vec<Box<dyn AsyncPipelineStage>>,
}

impl AsyncPipeline {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn add_stage<S: AsyncPipelineStage + 'static>(mut self, stage: S) -> Self {
        self.stages.push(Box::new(stage));
        self
    }

    /// Process a single article through all async stages.
    pub async fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        for stage in &self.stages {
            article = stage.process(article).await?;
        }
        Some(article)
    }

    /// Process a batch of articles through all async stages.
    pub async fn process_batch(&self, articles: Vec<RawArticle>) -> Vec<RawArticle> {
        let mut results = Vec::with_capacity(articles.len());
        for article in articles {
            if let Some(processed) = self.process(article).await {
                results.push(processed);
            }
        }
        results
    }
}

impl Default for AsyncPipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_enrichment_stage_creation() {
        let ai_service = Arc::new(AiService::new("test-key", None, None));
        let stage = AiEnrichmentStage::new(ai_service)
            .with_skip_enriched(true)
            .with_min_content_length(100);

        assert!(stage.skip_enriched);
        assert_eq!(stage.min_content_length, 100);
    }

    #[test]
    fn raw_article_has_ai_enrichment_false_by_default() {
        let article = RawArticle::new("test", "https://example.com");
        assert!(!article.has_ai_enrichment());
    }

    #[test]
    fn raw_article_has_ai_enrichment_true_when_set() {
        let mut article = RawArticle::new("test", "https://example.com");
        article.ai_category = Some("legislation".to_string());
        assert!(article.has_ai_enrichment());
    }

    #[tokio::test]
    async fn ai_enrichment_skips_already_enriched() {
        let ai_service = Arc::new(AiService::new("test-key", None, None));
        let stage = AiEnrichmentStage::new(ai_service).with_skip_enriched(true);

        let mut article = RawArticle::new("test", "https://example.com");
        article.ai_category = Some("legislation".to_string());
        article.content =
            Some("这是一段很长的内容用于测试AI增强管线是否会跳过已经富化过的文章".to_string());

        let result = stage.process(article.clone()).await.unwrap();
        // Should be unchanged (skipped due to already enriched)
        assert_eq!(result.ai_category.as_deref(), Some("legislation"));
    }

    #[tokio::test]
    async fn ai_enrichment_passes_through_short_content() {
        let ai_service = Arc::new(AiService::new("test-key", None, None));
        let stage = AiEnrichmentStage::new(ai_service).with_min_content_length(100);

        let mut article = RawArticle::new("法规标题", "https://example.com");
        article.content = Some("短内容".to_string());

        // AI call will fail (no real API key) but should not panic
        let result = stage.process(article).await.unwrap();
        // Article should still exist (not filtered)
        assert_eq!(result.title, "法规标题");
    }

    #[tokio::test]
    async fn async_pipeline_empty_passes_through() {
        let pipeline = AsyncPipeline::new();

        let article = RawArticle::new("test", "https://example.com");
        let result = pipeline.process(article).await.unwrap();
        assert_eq!(result.title, "test");
    }

    #[tokio::test]
    async fn async_pipeline_batch_processing() {
        let pipeline = AsyncPipeline::new();

        let articles = vec![
            RawArticle::new("Article 1", "https://example.com/1"),
            RawArticle::new("Article 2", "https://example.com/2"),
        ];

        let results = pipeline.process_batch(articles).await;
        assert_eq!(results.len(), 2);
    }
}
