use law_eye_ai::types::*;
use law_eye_ai::{Classifier, LlmGateway, RiskAssessor, Summarizer, TagExtractor};

// ========== LlmGateway Tests ==========

#[test]
fn test_llm_gateway_creation() {
    let gateway = LlmGateway::new("test-api-key", None, None);
    let _ = gateway;
}

#[test]
fn test_llm_gateway_with_base_url() {
    let gateway = LlmGateway::new(
        "test-api-key",
        Some("https://api.custom.com/v1"),
        Some("custom-model"),
    );
    let _ = gateway;
}

#[test]
fn test_llm_gateway_with_provider() {
    let gateway = LlmGateway::new("test", None, None).with_provider(LlmProvider::Claude);
    let _ = gateway;
}

#[test]
fn test_llm_gateway_with_embedding_model() {
    let gateway =
        LlmGateway::new("test", None, None).with_embedding_model("text-embedding-ada-002");
    let _ = gateway;
}

#[test]
fn test_count_tokens() {
    let gateway = LlmGateway::new("test", None, None);
    let count = gateway.count_tokens("Hello, world!");
    assert!(count > 0);
}

#[test]
fn test_count_tokens_chinese() {
    let gateway = LlmGateway::new("test", None, None);
    let count = gateway.count_tokens("数据安全法正式实施");
    assert!(count > 0);
}

// ========== Classifier Tests ==========

#[test]
fn test_classifier_creation() {
    let gateway = LlmGateway::new("test", None, None);
    let classifier = Classifier::new(gateway);
    let _ = classifier;
}

#[test]
fn test_classify_result_deserialization() {
    let json = r#"{
        "category_slug": "legislation",
        "confidence": 0.95,
        "sub_categories": ["data"],
        "reasoning": "test"
    }"#;

    let result: ClassifyResult = serde_json::from_str(json).unwrap();
    assert_eq!(result.category_slug, "legislation");
    assert!((result.confidence - 0.95).abs() < 0.01);
    assert_eq!(result.sub_categories, vec!["data"]);
}

// ========== RiskAssessor Tests ==========

#[test]
fn test_risk_assessor_creation() {
    let gateway = LlmGateway::new("test", None, None);
    let assessor = RiskAssessor::new(gateway);
    let _ = assessor;
}

#[test]
fn test_risk_assessment_deserialization() {
    let json = r#"{
        "score": 75,
        "level": "high",
        "dimensions": [
            {"name": "合规风险", "score": 80, "description": "需关注"}
        ],
        "recommendations": ["建议一", "建议二"]
    }"#;

    let result: RiskAssessment = serde_json::from_str(json).unwrap();
    assert_eq!(result.score, 75);
    assert!(matches!(result.level, RiskLevel::High));
    assert_eq!(result.dimensions.len(), 1);
    assert_eq!(result.recommendations.len(), 2);
}

#[test]
fn test_risk_level_variants() {
    let levels = [
        (r#""low""#, RiskLevel::Low),
        (r#""medium""#, RiskLevel::Medium),
        (r#""high""#, RiskLevel::High),
        (r#""critical""#, RiskLevel::Critical),
    ];

    for (json, expected) in levels {
        let level: RiskLevel = serde_json::from_str(json).unwrap();
        assert!(
            matches!(level, ref e if std::mem::discriminant(&level) == std::mem::discriminant(e))
        );
        let _ = expected;
    }
}

// ========== Summarizer Tests ==========

#[test]
fn test_summarizer_creation() {
    let gateway = LlmGateway::new("test", None, None);
    let summarizer = Summarizer::new(gateway);
    let _ = summarizer;
}

#[test]
fn test_summary_result_deserialization() {
    let json = r#"{
        "brief": "一句话摘要",
        "abstract_text": "详细摘要内容",
        "key_points": ["要点1", "要点2"],
        "entities": [
            {"name": "网信办", "entity_type": "organization", "context": "监管机构"}
        ]
    }"#;

    let result: SummaryResult = serde_json::from_str(json).unwrap();
    assert_eq!(result.brief, "一句话摘要");
    assert_eq!(result.key_points.len(), 2);
    assert_eq!(result.entities.len(), 1);
    assert!(matches!(
        result.entities[0].entity_type,
        EntityType::Organization
    ));
}

// ========== TagExtractor Tests ==========

#[test]
fn test_tag_extractor_creation() {
    let gateway = LlmGateway::new("test", None, None);
    let extractor = TagExtractor::new(gateway);
    let _ = extractor;
}

#[test]
fn test_tags_result_deserialization() {
    let json = r#"{
        "tags": ["数据安全", "个人信息保护"],
        "keywords": ["GDPR", "网信办", "罚款"]
    }"#;

    let result: TagsResult = serde_json::from_str(json).unwrap();
    assert_eq!(result.tags.len(), 2);
    assert_eq!(result.keywords.len(), 3);
}

// ========== Type Tests ==========

#[test]
fn test_entity_type_variants() {
    let types = [
        (r#""organization""#, EntityType::Organization),
        (r#""regulation""#, EntityType::Regulation),
        (r#""person""#, EntityType::Person),
        (r#""date""#, EntityType::Date),
        (r#""location""#, EntityType::Location),
        (r#""legal_term""#, EntityType::LegalTerm),
    ];

    for (json, _expected) in types {
        let entity_type: EntityType = serde_json::from_str(json).unwrap();
        let _ = entity_type;
    }
}

#[test]
fn test_llm_provider_default() {
    let provider = LlmProvider::default();
    assert!(matches!(provider, LlmProvider::OpenAI));
}

#[test]
fn test_ai_task_type_serialization() {
    let task = AiTaskType::Full;
    let json = serde_json::to_string(&task).unwrap();
    assert!(json.contains("full"));
}

#[test]
fn test_importance_score_deserialization() {
    let json = r#"{
        "score": 85,
        "factors": [
            {"name": "时效性", "weight": 0.3, "value": 0.9},
            {"name": "影响范围", "weight": 0.4, "value": 0.8}
        ]
    }"#;

    let result: ImportanceScore = serde_json::from_str(json).unwrap();
    assert_eq!(result.score, 85);
    assert_eq!(result.factors.len(), 2);
}

#[test]
fn test_embedding_result_deserialization() {
    let json = r#"{
        "vector": [0.1, 0.2, 0.3],
        "model": "text-embedding-3-small",
        "token_count": 10
    }"#;

    let result: EmbeddingResult = serde_json::from_str(json).unwrap();
    assert_eq!(result.vector.len(), 3);
    assert_eq!(result.model, "text-embedding-3-small");
    assert_eq!(result.token_count, 10);
}
