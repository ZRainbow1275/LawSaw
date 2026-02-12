use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// LLM Provider 类型
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmProvider {
    #[default]
    OpenAI,
    Claude,
    ClaudeRelay,
    NewApi,
}

/// AI 分类结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifyResult {
    pub category_slug: String,
    pub confidence: f32,
    pub sub_categories: Vec<String>,
    pub reasoning: String,
}

/// AI 摘要结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryResult {
    pub brief: String,
    pub abstract_text: String,
    pub key_points: Vec<String>,
    pub entities: Vec<Entity>,
}

/// 命名实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub name: String,
    pub entity_type: EntityType,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityType {
    Organization,
    Regulation,
    Person,
    Date,
    Location,
    LegalTerm,
}

/// 风险评估结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub score: u8,
    pub level: RiskLevel,
    pub dimensions: Vec<RiskDimension>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskDimension {
    pub name: String,
    pub score: u8,
    pub description: String,
}

/// 重要性评分
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportanceScore {
    pub score: u8,
    pub factors: Vec<ImportanceFactor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportanceFactor {
    pub name: String,
    pub weight: f32,
    pub value: f32,
}

/// 标签提取结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagsResult {
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
}

/// 向量嵌入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResult {
    pub vector: Vec<f32>,
    pub model: String,
    pub token_count: usize,
}

/// AI 处理任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTask {
    pub article_id: Uuid,
    pub task_type: AiTaskType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskType {
    Classify,
    Summarize,
    RiskAssess,
    ExtractTags,
    Embed,
    ExtractEntities,
    Full,
}
