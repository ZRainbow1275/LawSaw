use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::observability::CrawlMetrics;

/// Raw article data flowing through the pipeline.
///
/// Fields are progressively enriched by pipeline stages:
/// - Spider/RSS populates `title`, `link`, `content`, `author`, `published_at`
/// - MetadataExtractionStage populates `extracted_*` fields
/// - DeduplicationStage may set `content_hash`
/// - AiEnrichmentStage populates `ai_*` fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawArticle {
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,

    // ---- Enriched by pipeline stages ----

    /// Content hash for deduplication (MD5 hex, set by DeduplicationStage).
    #[serde(default)]
    pub content_hash: Option<String>,

    /// Issuing authority extracted from title/content (e.g. "国务院").
    #[serde(default)]
    pub extracted_issuer: Option<String>,

    /// Legal document number (e.g. "国发〔2026〕1号").
    #[serde(default)]
    pub extracted_doc_number: Option<String>,

    /// Effective date extracted from content.
    #[serde(default)]
    pub extracted_effective_date: Option<chrono::NaiveDate>,

    /// Administrative region code (e.g. "110000" for Beijing).
    #[serde(default)]
    pub extracted_region_code: Option<String>,

    // ---- AI enrichment fields (set by AiEnrichmentStage) ----

    /// AI-assigned category slug (e.g. "legislation", "regulation").
    #[serde(default)]
    pub ai_category: Option<String>,

    /// AI classification confidence (0.0 - 1.0).
    #[serde(default)]
    pub ai_category_confidence: Option<f32>,

    /// AI-generated brief summary.
    #[serde(default)]
    pub ai_summary: Option<String>,

    /// AI-generated abstract text (longer than summary).
    #[serde(default)]
    pub ai_abstract: Option<String>,

    /// AI-extracted key points.
    #[serde(default)]
    pub ai_key_points: Option<Vec<String>>,

    /// AI risk score (0-100).
    #[serde(default)]
    pub ai_risk_score: Option<u8>,

    /// AI risk level label ("low", "medium", "high", "critical").
    #[serde(default)]
    pub ai_risk_level: Option<String>,

    /// AI-extracted tags.
    #[serde(default)]
    pub ai_tags: Option<Vec<String>>,

    /// AI-extracted keywords.
    #[serde(default)]
    pub ai_keywords: Option<Vec<String>>,

    /// AI-generated embedding vector.
    #[serde(default)]
    pub ai_embedding: Option<Vec<f32>>,

    /// Full AI metadata as JSON (entities, risk dimensions, recommendations, etc.).
    #[serde(default)]
    pub ai_metadata: Option<serde_json::Value>,
}

impl RawArticle {
    /// Create a minimal RawArticle with only required fields.
    pub fn new(title: impl Into<String>, link: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            link: link.into(),
            content: None,
            author: None,
            published_at: None,
            content_hash: None,
            extracted_issuer: None,
            extracted_doc_number: None,
            extracted_effective_date: None,
            extracted_region_code: None,
            ai_category: None,
            ai_category_confidence: None,
            ai_summary: None,
            ai_abstract: None,
            ai_key_points: None,
            ai_risk_score: None,
            ai_risk_level: None,
            ai_tags: None,
            ai_keywords: None,
            ai_embedding: None,
            ai_metadata: None,
        }
    }

    /// Check whether AI enrichment has been applied.
    pub fn has_ai_enrichment(&self) -> bool {
        self.ai_category.is_some()
    }
}

/// A processing stage in the article pipeline.
///
/// Return `Some(article)` to pass the article to the next stage,
/// or `None` to filter it out.
pub trait PipelineStage: Send + Sync {
    fn process(&self, article: RawArticle) -> Option<RawArticle>;

    /// Human-readable name for this stage, used in metrics and logging.
    /// Defaults to the type name (e.g. "CleaningStage").
    fn name(&self) -> &str {
        std::any::type_name::<Self>()
            .rsplit("::")
            .next()
            .unwrap_or("unknown")
    }
}

/// A named stage entry in the pipeline (stage + its resolved name).
struct NamedStage {
    stage: Box<dyn PipelineStage>,
    name: String,
}

pub struct Pipeline {
    stages: Vec<NamedStage>,
}

impl Pipeline {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn add_stage<S: PipelineStage + 'static>(mut self, stage: S) -> Self {
        let name = stage.name().to_string();
        self.stages.push(NamedStage {
            stage: Box::new(stage),
            name,
        });
        self
    }

    pub fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        for named in &self.stages {
            let start = Instant::now();
            article = named.stage.process(article)?;
            CrawlMetrics::record_pipeline_stage(&named.name, start.elapsed());
        }
        Some(article)
    }

    pub fn process_batch(&self, articles: Vec<RawArticle>) -> Vec<RawArticle> {
        articles
            .into_iter()
            .filter_map(|a| self.process(a))
            .collect()
    }

    /// Number of registered stages.
    pub fn stage_count(&self) -> usize {
        self.stages.len()
    }

    /// Names of registered stages in order.
    pub fn stage_names(&self) -> Vec<&str> {
        self.stages.iter().map(|s| s.name.as_str()).collect()
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new()
    }
}
