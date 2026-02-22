use crate::{
    AuthorityDetector, Classifier, DomainClassifier, Embedder, ImportanceAssessor, LlmGateway,
    RiskAssessor, Summarizer, TagExtractor,
};
use law_eye_common::Result;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    env,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use tracing::info;

const DEFAULT_AI_RESULT_CACHE_TTL_SECONDS: u64 = 300;
const DEFAULT_AI_RESULT_CACHE_MAX_ENTRIES: usize = 256;
const AI_RESULT_CACHE_TTL_SECONDS_ENV: &str = "LAW_EYE__AI__CACHE_TTL_SECONDS";
const AI_RESULT_CACHE_MAX_ENTRIES_ENV: &str = "LAW_EYE__AI__CACHE_MAX_ENTRIES";

#[derive(Debug, Clone)]
struct AiResultCacheEntry {
    result: ArticleAiResult,
    expires_at: Instant,
}

#[derive(Debug)]
struct AiResultCache {
    ttl: Duration,
    max_entries: usize,
    entries: HashMap<String, AiResultCacheEntry>,
    insertion_order: VecDeque<String>,
}

impl AiResultCache {
    fn new(ttl: Duration, max_entries: usize) -> Self {
        Self {
            ttl,
            max_entries,
            entries: HashMap::new(),
            insertion_order: VecDeque::new(),
        }
    }

    fn get(&mut self, key: &str) -> Option<ArticleAiResult> {
        if self.is_disabled() {
            return None;
        }

        self.remove_expired();
        self.entries.get(key).map(|entry| entry.result.clone())
    }

    fn insert(&mut self, key: String, result: ArticleAiResult) {
        if self.is_disabled() {
            return;
        }

        self.remove_expired();

        if self.entries.contains_key(&key) {
            self.insertion_order
                .retain(|existing_key| existing_key != &key);
        }

        self.insertion_order.push_back(key.clone());
        self.entries.insert(
            key,
            AiResultCacheEntry {
                result,
                expires_at: Instant::now() + self.ttl,
            },
        );
        self.evict_over_capacity();
    }

    fn is_disabled(&self) -> bool {
        self.ttl.is_zero() || self.max_entries == 0
    }

    fn remove_expired(&mut self) {
        let now = Instant::now();
        self.entries.retain(|_, entry| entry.expires_at > now);
        self.insertion_order
            .retain(|key| self.entries.contains_key(key));
    }

    fn evict_over_capacity(&mut self) {
        while self.entries.len() > self.max_entries {
            let Some(oldest_key) = self.insertion_order.pop_front() else {
                break;
            };

            self.entries.remove(&oldest_key);
        }
    }
}

fn parse_env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default)
}

fn parse_env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
}

fn ai_result_cache_ttl() -> Duration {
    Duration::from_secs(parse_env_u64(
        AI_RESULT_CACHE_TTL_SECONDS_ENV,
        DEFAULT_AI_RESULT_CACHE_TTL_SECONDS,
    ))
}

fn ai_result_cache_max_entries() -> usize {
    parse_env_usize(
        AI_RESULT_CACHE_MAX_ENTRIES_ENV,
        DEFAULT_AI_RESULT_CACHE_MAX_ENTRIES,
    )
}

fn build_cache_key(title: &str, content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update((title.len() as u64).to_le_bytes());
    hasher.update(title.as_bytes());
    hasher.update((content.len() as u64).to_le_bytes());
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// AI 处理服务 - 统一封装所有 AI 能力
pub struct AiService {
    classifier: Classifier,
    summarizer: Summarizer,
    risk_assessor: RiskAssessor,
    tag_extractor: TagExtractor,
    embedder: Embedder,
    importance_assessor: ImportanceAssessor,
    domain_classifier: DomainClassifier,
    authority_detector: AuthorityDetector,
    gateway: LlmGateway,
    cache: Mutex<AiResultCache>,
}

impl AiService {
    pub fn new(api_key: &str, base_url: Option<&str>, model: Option<&str>) -> Self {
        Self::new_with_embedding_model(api_key, base_url, model, None)
    }

    pub fn new_with_embedding_model(
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
        embedding_model: Option<&str>,
    ) -> Self {
        let mut gateway = LlmGateway::new(api_key, base_url, model);
        if let Some(embedding_model) = embedding_model.map(str::trim).filter(|v| !v.is_empty()) {
            gateway = gateway.with_embedding_model(embedding_model);
        }
        let gateway_arc = Arc::new(gateway.clone());
        let cache_ttl = ai_result_cache_ttl();
        let cache_max_entries = ai_result_cache_max_entries();

        if cache_ttl.is_zero() || cache_max_entries == 0 {
            info!(
                ttl_seconds = cache_ttl.as_secs(),
                max_entries = cache_max_entries,
                "AI result cache disabled"
            );
        } else {
            info!(
                ttl_seconds = cache_ttl.as_secs(),
                max_entries = cache_max_entries,
                "AI result cache enabled"
            );
        }

        Self {
            classifier: Classifier::new(gateway.clone()),
            summarizer: Summarizer::new(gateway.clone()),
            risk_assessor: RiskAssessor::new(gateway.clone()),
            tag_extractor: TagExtractor::new(gateway.clone()),
            embedder: Embedder::new(gateway_arc),
            importance_assessor: ImportanceAssessor,
            domain_classifier: DomainClassifier,
            authority_detector: AuthorityDetector,
            gateway,
            cache: Mutex::new(AiResultCache::new(cache_ttl, cache_max_entries)),
        }
    }

    /// 完整的 AI 处理流程
    pub async fn process_article(&self, title: &str, content: &str) -> Result<ArticleAiResult> {
        self.process_article_with_metadata(title, content, None, None)
            .await
    }

    /// 完整的 AI 处理流程 (含文章元数据, 用于 importance/domain/authority 评估)
    pub async fn process_article_with_metadata(
        &self,
        title: &str,
        content: &str,
        issuer: Option<&str>,
        existing_authority_level: Option<i32>,
    ) -> Result<ArticleAiResult> {
        let cache_key = build_cache_key(title, content);
        if let Some(cached_result) = self.get_cached_result(&cache_key).await {
            info!(article_hash = %cache_key, "AI result cache hit");
            return Ok(cached_result);
        }

        info!(article_hash = %cache_key, "AI result cache miss");
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

        // Run rule-based assessors (no LLM call needed)
        let authority_level = self.authority_detector.detect(title, issuer);
        let importance = self.importance_assessor.rule_assess(
            title,
            existing_authority_level.or_else(|| authority_level.map(|v| v as i32)),
            issuer,
        );
        let domain = self
            .domain_classifier
            .classify(&classify_result.category_slug, title);

        let result = ArticleAiResult {
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
            importance,
            domain_root: Some(domain.domain_root),
            domain_sub: domain.domain_sub,
            authority_level,
        };

        self.store_cached_result(cache_key, result.clone()).await;

        Ok(result)
    }

    async fn get_cached_result(&self, key: &str) -> Option<ArticleAiResult> {
        let mut cache = self.cache.lock().await;
        cache.get(key)
    }

    async fn store_cached_result(&self, key: String, result: ArticleAiResult) {
        let mut cache = self.cache.lock().await;
        cache.insert(key, result);
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

    /// Expose the underlying LLM gateway (e.g. for KnowledgeService).
    pub fn gateway(&self) -> Arc<LlmGateway> {
        Arc::new(self.gateway.clone())
    }

    /// AI 上游健康检查（不改变业务状态，仅用于健康探针）。
    pub async fn health_check(&self) -> Result<()> {
        self.gateway.health_check().await
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
    /// Importance score (1-5), rule-based.
    pub importance: u8,
    /// Primary domain classification.
    pub domain_root: Option<String>,
    /// Secondary domain classification.
    pub domain_sub: Option<String>,
    /// Legal authority level (1-10).
    pub authority_level: Option<u8>,
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
            "importance": self.importance,
            "domain_root": self.domain_root,
            "domain_sub": self.domain_sub,
            "authority_level": self.authority_level,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_result(label: &str) -> ArticleAiResult {
        ArticleAiResult {
            category_slug: label.to_string(),
            category_confidence: 0.9,
            summary: format!("{label}-summary"),
            abstract_text: format!("{label}-abstract"),
            key_points: vec![format!("{label}-point")],
            entities: vec![],
            risk_score: 10,
            risk_level: "low".to_string(),
            risk_dimensions: vec![],
            recommendations: vec![],
            tags: vec![label.to_string()],
            keywords: vec![label.to_string()],
            embedding: vec![0.1, 0.2],
            token_count: 2,
            importance: 3,
            domain_root: Some("industry".to_string()),
            domain_sub: None,
            authority_level: Some(8),
        }
    }

    #[test]
    fn cache_key_uses_hash_without_plaintext() {
        let key = build_cache_key("测试标题", "这是很长的正文内容");
        assert_eq!(key.len(), 64);
        assert!(!key.contains("测试标题"));
        assert!(!key.contains("正文内容"));
    }

    #[test]
    fn cache_returns_none_after_ttl_expires() {
        let mut cache = AiResultCache::new(Duration::from_millis(20), 8);
        cache.insert("k1".to_string(), sample_result("v1"));
        assert!(cache.get("k1").is_some());

        std::thread::sleep(Duration::from_millis(30));
        assert!(cache.get("k1").is_none());
    }

    #[test]
    fn cache_evicts_oldest_when_capacity_exceeded() {
        let mut cache = AiResultCache::new(Duration::from_secs(60), 2);
        cache.insert("k1".to_string(), sample_result("v1"));
        cache.insert("k2".to_string(), sample_result("v2"));
        cache.insert("k3".to_string(), sample_result("v3"));

        assert!(cache.get("k1").is_none());
        assert!(cache.get("k2").is_some());
        assert!(cache.get("k3").is_some());
    }
}
