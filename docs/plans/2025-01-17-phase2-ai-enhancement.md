# Phase 2: AI 能力增强实施计划

> **维护状态（2026-02-08）**
> - 本文档属于 2025-01 的历史规划归档，主要用于追溯早期决策背景。
> - 当前系统交付状态请以 `prompt/audit-report.md`（v2.6 修复清单）与 `prompts/audit/2.6audit.md`（审计基线）为准。
> - 规格与验收标准请参考 `prompts/specs/archive/`；执行队列与全局状态请参考 `prompts/state/`。
> - 若本文内容与现行代码冲突，请以代码与上述“真相源”文档为准。


**Goal:** 实现 LLM Gateway、智能分类、摘要生成、风险评估、标签提取和向量嵌入能力

**Architecture:** 新建 law-eye-ai crate 封装所有 AI 能力，通过统一的 LLM Gateway 调用 Claude/OpenAI API，处理结果存储到 PostgreSQL (pgvector 支持向量检索)

**Tech Stack:** Rust, reqwest (HTTP client), async-openai, pgvector, serde_json (structured output)

---

## Task 1: 添加 AI 相关依赖到 Workspace

**Files:**
- Modify: `D:/Desktop/LawSaw/Cargo.toml`

**Step 1: 添加 AI 相关依赖**

在 `[workspace.dependencies]` 部分添加以下依赖：

```toml
# AI / LLM
async-openai = "0.27"
tiktoken-rs = "0.6"

# Vector
pgvector = "0.4"

# Async utilities
futures = "0.3"
async-trait = "0.1"
```

**Step 2: 添加 law-eye-ai 到 workspace members**

```toml
[workspace]
resolver = "2"
members = [
    "crates/law-eye-api",
    "crates/law-eye-worker",
    "crates/law-eye-core",
    "crates/law-eye-crawler",
    "crates/law-eye-db",
    "crates/law-eye-queue",
    "crates/law-eye-common",
    "crates/law-eye-ai",  # 新增
]
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check --workspace`
Expected: 编译成功 (新 crate 还未创建会警告，无影响)

**Step 4: Commit**

```bash
git add Cargo.toml
git commit -m "chore: add AI dependencies to workspace"
```

---

## Task 2: 创建 law-eye-ai Crate 基础结构

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/lib.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/gateway.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/types.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-ai"
version.workspace = true
edition.workspace = true

[dependencies]
law-eye-common = { path = "../law-eye-common" }

# Async
tokio.workspace = true
async-trait.workspace = true
futures.workspace = true

# HTTP
reqwest.workspace = true

# Serialization
serde.workspace = true
serde_json.workspace = true

# AI
async-openai.workspace = true
tiktoken-rs.workspace = true

# Error handling
thiserror.workspace = true
anyhow.workspace = true

# Logging
tracing.workspace = true

# Utils
uuid.workspace = true
chrono.workspace = true
```

**Step 2: 创建 src/types.rs**

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// LLM Provider 类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmProvider {
    OpenAI,
    Claude,
    ClaudeRelay,
    NewApi,
}

impl Default for LlmProvider {
    fn default() -> Self {
        Self::OpenAI
    }
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
    Full,
}
```

**Step 3: 创建 src/gateway.rs**

```rust
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
```

**Step 4: 创建 src/lib.rs**

```rust
pub mod gateway;
pub mod types;

pub use gateway::LlmGateway;
pub use types::*;
```

**Step 5: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-ai`
Expected: 编译成功

**Step 6: Commit**

```bash
git add crates/law-eye-ai/
git commit -m "feat(ai): create law-eye-ai crate with LLM gateway"
```

---

## Task 3: 实现分类引擎

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/classify.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-ai/src/lib.rs`

**Step 1: 创建 src/classify.rs**

```rust
use crate::{types::ClassifyResult, LlmGateway};
use law_eye_common::Result;
use tracing::info;

/// 10 板块分类定义
const CATEGORIES: &[(&str, &str, &str)] = &[
    ("legislation", "立法前沿", "法律法规、政策文件、立法动态"),
    ("regulation", "监管动向", "监管机构公告、处罚决定、指导意见"),
    ("enforcement", "执法案例", "行政执法、司法判例、典型案例"),
    ("industry", "业界资讯", "企业动态、行业报告、市场分析"),
    ("compliance", "合规前沿", "合规指南、最佳实践、合规工具"),
    ("data", "数据动态", "数据保护、隐私政策、跨境传输"),
    ("security", "安全前哨", "网络安全、漏洞预警、威胁情报"),
    ("academic", "学术文章", "论文研究、学术观点、专家解读"),
    ("events", "重大事件", "突发事件、重大新闻、热点追踪"),
    ("international", "国际视野", "国际法规、跨境动态、全球趋势"),
];

const CLASSIFY_SYSTEM_PROMPT: &str = r#"你是一个专业的法律资讯分类助手。你需要将给定的文章分类到以下 10 个板块之一：

1. legislation (立法前沿): 法律法规、政策文件、立法动态
2. regulation (监管动向): 监管机构公告、处罚决定、指导意见
3. enforcement (执法案例): 行政执法、司法判例、典型案例
4. industry (业界资讯): 企业动态、行业报告、市场分析
5. compliance (合规前沿): 合规指南、最佳实践、合规工具
6. data (数据动态): 数据保护、隐私政策、跨境传输
7. security (安全前哨): 网络安全、漏洞预警、威胁情报
8. academic (学术文章): 论文研究、学术观点、专家解读
9. events (重大事件): 突发事件、重大新闻、热点追踪
10. international (国际视野): 国际法规、跨境动态、全球趋势

请以 JSON 格式返回分类结果：
{
  "category_slug": "分类slug",
  "confidence": 0.95,
  "sub_categories": ["可能的次级分类"],
  "reasoning": "分类理由"
}

注意：
- confidence 是 0-1 之间的置信度
- 如果文章可能属于多个分类，在 sub_categories 中列出
- reasoning 简要说明分类依据"#;

/// 分类引擎
pub struct Classifier {
    gateway: LlmGateway,
}

impl Classifier {
    pub fn new(gateway: LlmGateway) -> Self {
        Self { gateway }
    }

    /// 对文章进行分类
    pub async fn classify(&self, title: &str, content: &str) -> Result<ClassifyResult> {
        // 先尝试规则匹配
        if let Some(result) = self.rule_classify(title, content) {
            info!("Classified by rule: {}", result.category_slug);
            return Ok(result);
        }

        // 规则匹配失败，使用 LLM
        let user_prompt = format!(
            "请对以下文章进行分类：\n\n标题：{}\n\n内容摘要：{}\n",
            title,
            truncate_content(content, 2000)
        );

        let result: ClassifyResult = self
            .gateway
            .chat_json(CLASSIFY_SYSTEM_PROMPT, &user_prompt)
            .await?;

        info!(
            "Classified by LLM: {} (confidence: {})",
            result.category_slug, result.confidence
        );

        Ok(result)
    }

    /// 规则预分类 (关键词匹配)
    fn rule_classify(&self, title: &str, content: &str) -> Option<ClassifyResult> {
        let text = format!("{} {}", title, content).to_lowercase();

        // 立法前沿
        if contains_any(&text, &["法律", "法规", "条例", "草案", "立法", "修订", "出台"]) {
            return Some(ClassifyResult {
                category_slug: "legislation".to_string(),
                confidence: 0.85,
                sub_categories: vec![],
                reasoning: "包含立法相关关键词".to_string(),
            });
        }

        // 监管动向
        if contains_any(
            &text,
            &["处罚", "监管", "约谈", "整改", "责令", "通报", "警示"],
        ) {
            return Some(ClassifyResult {
                category_slug: "regulation".to_string(),
                confidence: 0.85,
                sub_categories: vec![],
                reasoning: "包含监管相关关键词".to_string(),
            });
        }

        // 执法案例
        if contains_any(&text, &["判决", "裁定", "案例", "起诉", "审判", "判刑"]) {
            return Some(ClassifyResult {
                category_slug: "enforcement".to_string(),
                confidence: 0.85,
                sub_categories: vec![],
                reasoning: "包含执法案例相关关键词".to_string(),
            });
        }

        // 数据动态
        if contains_any(
            &text,
            &["数据安全", "个人信息", "隐私", "数据出境", "跨境传输", "数据保护"],
        ) {
            return Some(ClassifyResult {
                category_slug: "data".to_string(),
                confidence: 0.85,
                sub_categories: vec![],
                reasoning: "包含数据保护相关关键词".to_string(),
            });
        }

        // 安全前哨
        if contains_any(
            &text,
            &["网络安全", "漏洞", "攻击", "黑客", "安全事件", "勒索"],
        ) {
            return Some(ClassifyResult {
                category_slug: "security".to_string(),
                confidence: 0.85,
                sub_categories: vec![],
                reasoning: "包含网络安全相关关键词".to_string(),
            });
        }

        // 国际视野
        if contains_any(
            &text,
            &["gdpr", "欧盟", "美国", "跨境", "国际", "海外", "境外"],
        ) {
            return Some(ClassifyResult {
                category_slug: "international".to_string(),
                confidence: 0.80,
                sub_categories: vec![],
                reasoning: "包含国际相关关键词".to_string(),
            });
        }

        None
    }
}

fn contains_any(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|kw| text.contains(kw))
}

fn truncate_content(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        content.to_string()
    } else {
        format!("{}...", &content[..max_len])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rule_classify_legislation() {
        let gateway = LlmGateway::new("test", None, None);
        let classifier = Classifier::new(gateway);

        let result = classifier
            .rule_classify("新数据安全法草案出台", "关于数据安全法律修订的通知")
            .unwrap();

        assert_eq!(result.category_slug, "legislation");
    }

    #[test]
    fn test_rule_classify_security() {
        let gateway = LlmGateway::new("test", None, None);
        let classifier = Classifier::new(gateway);

        let result = classifier
            .rule_classify("重大网络安全漏洞预警", "发现某系统存在严重漏洞")
            .unwrap();

        assert_eq!(result.category_slug, "security");
    }
}
```

**Step 2: 更新 src/lib.rs**

```rust
pub mod classify;
pub mod gateway;
pub mod types;

pub use classify::Classifier;
pub use gateway::LlmGateway;
pub use types::*;
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo test -p law-eye-ai`
Expected: 测试通过

**Step 4: Commit**

```bash
git add crates/law-eye-ai/
git commit -m "feat(ai): implement classification engine with rule + LLM"
```

---

## Task 4: 实现摘要生成器

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/summarize.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-ai/src/lib.rs`

**Step 1: 创建 src/summarize.rs**

```rust
use crate::{types::SummaryResult, LlmGateway};
use law_eye_common::Result;
use tracing::info;

const SUMMARIZE_SYSTEM_PROMPT: &str = r#"你是一个专业的法律资讯摘要助手。请对给定的文章生成结构化摘要。

请以 JSON 格式返回：
{
  "brief": "一句话摘要（不超过100字）",
  "abstract_text": "详细摘要（不超过300字）",
  "key_points": ["关键要点1", "关键要点2", "关键要点3"],
  "entities": [
    {"name": "实体名称", "entity_type": "organization|regulation|person|date|location|legal_term", "context": "上下文"}
  ]
}

注意：
- brief 应该能让读者快速了解文章核心内容
- abstract_text 应该包含文章的主要观点和结论
- key_points 提取 3-5 个关键要点
- entities 提取文章中出现的重要实体（机构、法规、人物、日期等）"#;

/// 摘要生成器
pub struct Summarizer {
    gateway: LlmGateway,
}

impl Summarizer {
    pub fn new(gateway: LlmGateway) -> Self {
        Self { gateway }
    }

    /// 生成文章摘要
    pub async fn summarize(&self, title: &str, content: &str) -> Result<SummaryResult> {
        let user_prompt = format!(
            "请为以下文章生成摘要：\n\n标题：{}\n\n正文：{}\n",
            title,
            truncate_content(content, 4000)
        );

        let result: SummaryResult = self
            .gateway
            .chat_json(SUMMARIZE_SYSTEM_PROMPT, &user_prompt)
            .await?;

        info!(
            "Generated summary: brief={} chars, {} key points, {} entities",
            result.brief.len(),
            result.key_points.len(),
            result.entities.len()
        );

        Ok(result)
    }
}

fn truncate_content(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        content.to_string()
    } else {
        format!("{}...", &content[..max_len])
    }
}
```

**Step 2: 更新 src/lib.rs 添加导出**

```rust
pub mod classify;
pub mod gateway;
pub mod summarize;
pub mod types;

pub use classify::Classifier;
pub use gateway::LlmGateway;
pub use summarize::Summarizer;
pub use types::*;
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-ai`
Expected: 编译成功

**Step 4: Commit**

```bash
git add crates/law-eye-ai/
git commit -m "feat(ai): implement summarizer for article summaries"
```

---

## Task 5: 实现风险评估模块

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/risk.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-ai/src/lib.rs`

**Step 1: 创建 src/risk.rs**

```rust
use crate::{
    types::{RiskAssessment, RiskDimension, RiskLevel},
    LlmGateway,
};
use law_eye_common::Result;
use tracing::info;

const RISK_SYSTEM_PROMPT: &str = r#"你是一个专业的法律风险评估助手。请对给定的法律资讯进行风险评估。

评估维度：
1. 合规风险 - 对企业合规的潜在影响
2. 处罚风险 - 可能面临的行政/刑事处罚风险
3. 声誉风险 - 对企业声誉的潜在影响
4. 运营风险 - 对业务运营的潜在影响

请以 JSON 格式返回：
{
  "score": 75,
  "level": "low|medium|high|critical",
  "dimensions": [
    {"name": "合规风险", "score": 80, "description": "风险描述"},
    {"name": "处罚风险", "score": 70, "description": "风险描述"}
  ],
  "recommendations": ["建议1", "建议2"]
}

评分标准：
- 0-25: low (低风险)
- 26-50: medium (中等风险)
- 51-75: high (高风险)
- 76-100: critical (严重风险)"#;

/// 风险评估器
pub struct RiskAssessor {
    gateway: LlmGateway,
}

impl RiskAssessor {
    pub fn new(gateway: LlmGateway) -> Self {
        Self { gateway }
    }

    /// 评估文章相关风险
    pub async fn assess(&self, title: &str, content: &str) -> Result<RiskAssessment> {
        // 先进行规则预评估
        let rule_score = self.rule_assess(title, content);

        if rule_score < 20 {
            // 明显低风险，直接返回
            return Ok(RiskAssessment {
                score: rule_score,
                level: RiskLevel::Low,
                dimensions: vec![],
                recommendations: vec![],
            });
        }

        // 使用 LLM 进行详细评估
        let user_prompt = format!(
            "请评估以下法律资讯的风险：\n\n标题：{}\n\n内容：{}\n",
            title,
            truncate_content(content, 3000)
        );

        let result: RiskAssessment = self
            .gateway
            .chat_json(RISK_SYSTEM_PROMPT, &user_prompt)
            .await?;

        info!(
            "Risk assessment: score={}, level={:?}",
            result.score, result.level
        );

        Ok(result)
    }

    /// 规则预评估
    fn rule_assess(&self, title: &str, content: &str) -> u8 {
        let text = format!("{} {}", title, content).to_lowercase();
        let mut score: u8 = 10;

        // 高风险关键词
        let high_risk_keywords = [
            "处罚", "罚款", "违法", "违规", "责令", "整改", "约谈", "警示", "通报批评",
        ];
        for kw in high_risk_keywords {
            if text.contains(kw) {
                score = score.saturating_add(15);
            }
        }

        // 严重风险关键词
        let critical_keywords = ["刑事", "拘留", "逮捕", "起诉", "判刑", "吊销", "关停"];
        for kw in critical_keywords {
            if text.contains(kw) {
                score = score.saturating_add(25);
            }
        }

        // 中等风险关键词
        let medium_keywords = ["整顿", "排查", "专项", "检查", "督查"];
        for kw in medium_keywords {
            if text.contains(kw) {
                score = score.saturating_add(8);
            }
        }

        score.min(100)
    }
}

fn truncate_content(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        content.to_string()
    } else {
        format!("{}...", &content[..max_len])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rule_assess_low_risk() {
        let gateway = LlmGateway::new("test", None, None);
        let assessor = RiskAssessor::new(gateway);

        let score = assessor.rule_assess("新技术发展报告", "介绍最新技术趋势");
        assert!(score < 30);
    }

    #[test]
    fn test_rule_assess_high_risk() {
        let gateway = LlmGateway::new("test", None, None);
        let assessor = RiskAssessor::new(gateway);

        let score = assessor.rule_assess("某公司因违法被罚款", "因违规行为被责令整改并处罚款");
        assert!(score >= 40);
    }
}
```

**Step 2: 更新 src/lib.rs**

```rust
pub mod classify;
pub mod gateway;
pub mod risk;
pub mod summarize;
pub mod types;

pub use classify::Classifier;
pub use gateway::LlmGateway;
pub use risk::RiskAssessor;
pub use summarize::Summarizer;
pub use types::*;
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo test -p law-eye-ai`
Expected: 测试通过

**Step 4: Commit**

```bash
git add crates/law-eye-ai/
git commit -m "feat(ai): implement risk assessment module"
```

---

## Task 6: 实现标签提取和向量嵌入

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/tags.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/embedding.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-ai/src/lib.rs`

**Step 1: 创建 src/tags.rs**

```rust
use crate::{types::TagsResult, LlmGateway};
use law_eye_common::Result;
use tracing::info;

const TAGS_SYSTEM_PROMPT: &str = r#"你是一个专业的法律资讯标签提取助手。请从给定的文章中提取关键标签和关键词。

请以 JSON 格式返回：
{
  "tags": ["标签1", "标签2", "标签3"],
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

注意：
- tags 应该是高层次的主题标签（如：数据安全、个人信息保护、行政处罚）
- keywords 应该是具体的关键词（如：GDPR、网信办、罚款100万）
- 标签数量 3-8 个，关键词数量 5-15 个"#;

/// 标签提取器
pub struct TagExtractor {
    gateway: LlmGateway,
}

impl TagExtractor {
    pub fn new(gateway: LlmGateway) -> Self {
        Self { gateway }
    }

    /// 提取标签和关键词
    pub async fn extract(&self, title: &str, content: &str) -> Result<TagsResult> {
        let user_prompt = format!(
            "请从以下文章中提取标签和关键词：\n\n标题：{}\n\n内容：{}\n",
            title,
            truncate_content(content, 3000)
        );

        let result: TagsResult = self
            .gateway
            .chat_json(TAGS_SYSTEM_PROMPT, &user_prompt)
            .await?;

        info!(
            "Extracted {} tags and {} keywords",
            result.tags.len(),
            result.keywords.len()
        );

        Ok(result)
    }
}

fn truncate_content(content: &str, max_len: usize) -> String {
    if content.len() <= max_len {
        content.to_string()
    } else {
        format!("{}...", &content[..max_len])
    }
}
```

**Step 2: 创建 src/embedding.rs**

```rust
use crate::{types::EmbeddingResult, LlmGateway};
use law_eye_common::Result;
use tracing::info;

/// 向量嵌入器
pub struct Embedder {
    gateway: LlmGateway,
    chunk_size: usize,
    chunk_overlap: usize,
}

impl Embedder {
    pub fn new(gateway: LlmGateway) -> Self {
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
            model: "text-embedding-3-small".to_string(),
            token_count,
        })
    }

    /// 将文本分块并生成嵌入
    pub async fn embed_chunks(&self, text: &str) -> Result<Vec<(String, EmbeddingResult)>> {
        let chunks = self.chunk_text(text);
        let mut results = Vec::new();

        for chunk in chunks {
            let embedding = self.embed(&chunk).await?;
            results.push((chunk, embedding));
        }

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
        let gateway = LlmGateway::new("test", None, None);
        let embedder = Embedder::new(gateway);

        let chunks = embedder.chunk_text("短文本");
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_chunk_text_long() {
        let gateway = LlmGateway::new("test", None, None);
        let embedder = Embedder::new(gateway).with_chunk_size(100).with_overlap(20);

        let long_text = "a".repeat(250);
        let chunks = embedder.chunk_text(&long_text);
        assert!(chunks.len() >= 2);
    }
}
```

**Step 3: 更新 src/lib.rs**

```rust
pub mod classify;
pub mod embedding;
pub mod gateway;
pub mod risk;
pub mod summarize;
pub mod tags;
pub mod types;

pub use classify::Classifier;
pub use embedding::Embedder;
pub use gateway::LlmGateway;
pub use risk::RiskAssessor;
pub use summarize::Summarizer;
pub use tags::TagExtractor;
pub use types::*;
```

**Step 4: 验证**

Run: `cd D:/Desktop/LawSaw && cargo test -p law-eye-ai`
Expected: 测试通过

**Step 5: Commit**

```bash
git add crates/law-eye-ai/
git commit -m "feat(ai): implement tag extraction and embedding modules"
```

---

## Task 7: 添加 AI 配置到 AppConfig

**Files:**
- Modify: `D:/Desktop/LawSaw/crates/law-eye-common/src/config.rs`
- Modify: `D:/Desktop/LawSaw/config/default.toml`
- Modify: `D:/Desktop/LawSaw/.env.example`

**Step 1: 更新 config.rs 添加 AI 配置**

在 `AppConfig` 结构体中添加：

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub ai: AiConfig,  // 新增
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: String,
    pub embedding_model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: None,
            model: "gpt-4o-mini".to_string(),
            embedding_model: "text-embedding-3-small".to_string(),
        }
    }
}
```

更新 `Default for AppConfig`：

```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 3001,
            },
            database: DatabaseConfig {
                url: "postgres://law_eye:your_password@localhost:5435/law_eye".to_string(),
                max_connections: 10,
            },
            redis: RedisConfig {
                url: "redis://localhost:6380".to_string(),
            },
            ai: AiConfig::default(),
        }
    }
}
```

**Step 2: 更新 config/default.toml**

```toml
[server]
host = "0.0.0.0"
port = 3001

[database]
url = "postgres://law_eye:your_password@localhost:5435/law_eye"
max_connections = 10

[redis]
url = "redis://localhost:6380"

[ai]
api_key = ""
model = "gpt-4o-mini"
embedding_model = "text-embedding-3-small"
```

**Step 3: 更新 .env.example**

```bash
# Server
LAW_EYE__SERVER__HOST=0.0.0.0
LAW_EYE__SERVER__PORT=3001

# Database
LAW_EYE__DATABASE__URL=postgres://law_eye:your_password@localhost:5435/law_eye
LAW_EYE__DATABASE__MAX_CONNECTIONS=10

# Redis
LAW_EYE__REDIS__URL=redis://localhost:6380

# AI
LAW_EYE__AI__API_KEY=your_openai_api_key_here
LAW_EYE__AI__BASE_URL=https://api.openai.com/v1
LAW_EYE__AI__MODEL=gpt-4o-mini
LAW_EYE__AI__EMBEDDING_MODEL=text-embedding-3-small

# Logging
RUST_LOG=info,law_eye=debug
```

**Step 4: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-common`
Expected: 编译成功

**Step 5: Commit**

```bash
git add crates/law-eye-common/ config/ .env.example
git commit -m "feat(config): add AI configuration options"
```

---

## Task 8: 添加向量表到数据库

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-db/migrations/002_vectors.sql`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-db/src/models.rs`

**Step 1: 创建迁移文件 002_vectors.sql**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Article chunks for vector search
CREATE TABLE IF NOT EXISTS article_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    token_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(article_id, chunk_index)
);

-- Create HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON article_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for article lookup
CREATE INDEX IF NOT EXISTS idx_chunks_article ON article_chunks(article_id);

-- Add AI metadata columns to articles if not exists
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;
```

**Step 2: 更新 models.rs 添加 ArticleChunk**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArticleChunk {
    pub id: Uuid,
    pub article_id: Uuid,
    pub chunk_index: i32,
    pub content: String,
    #[sqlx(skip)]
    pub embedding: Option<Vec<f32>>,
    pub token_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateArticleChunk {
    pub article_id: Uuid,
    pub chunk_index: i32,
    pub content: String,
    pub embedding: Vec<f32>,
    pub token_count: i32,
}
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-db`
Expected: 编译成功

**Step 4: Commit**

```bash
git add crates/law-eye-db/
git commit -m "feat(db): add vector search tables and article chunks"
```

---

## Task 9: 添加 AI 任务队列类型

**Files:**
- Modify: `D:/Desktop/LawSaw/crates/law-eye-queue/src/lib.rs`

**Step 1: 添加 AiTask 类型**

在 `lib.rs` 末尾添加：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiTask {
    pub article_id: uuid::Uuid,
    pub task_type: AiTaskType,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskType {
    Classify,
    Summarize,
    RiskAssess,
    ExtractTags,
    Embed,
    Full,
}
```

**Step 2: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-queue`
Expected: 编译成功

**Step 3: Commit**

```bash
git add crates/law-eye-queue/
git commit -m "feat(queue): add AI task types"
```

---

## Task 10: 创建 AI 处理服务

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-ai/src/service.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-ai/src/lib.rs`

**Step 1: 创建 src/service.rs**

```rust
use crate::{
    Classifier, Embedder, LlmGateway, RiskAssessor, Summarizer, TagExtractor,
};
use law_eye_common::Result;
use serde_json::json;
use tracing::info;
use uuid::Uuid;

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
        let gateway = LlmGateway::new(api_key, base_url, model);

        Self {
            classifier: Classifier::new(LlmGateway::new(api_key, base_url, model)),
            summarizer: Summarizer::new(LlmGateway::new(api_key, base_url, model)),
            risk_assessor: RiskAssessor::new(LlmGateway::new(api_key, base_url, model)),
            tag_extractor: TagExtractor::new(LlmGateway::new(api_key, base_url, model)),
            embedder: Embedder::new(gateway),
        }
    }

    /// 完整的 AI 处理流程
    pub async fn process_article(
        &self,
        title: &str,
        content: &str,
    ) -> Result<ArticleAiResult> {
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
```

**Step 2: 更新 src/lib.rs**

```rust
pub mod classify;
pub mod embedding;
pub mod gateway;
pub mod risk;
pub mod service;
pub mod summarize;
pub mod tags;
pub mod types;

pub use classify::Classifier;
pub use embedding::Embedder;
pub use gateway::LlmGateway;
pub use risk::RiskAssessor;
pub use service::{AiService, ArticleAiResult};
pub use summarize::Summarizer;
pub use tags::TagExtractor;
pub use types::*;
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-ai`
Expected: 编译成功

**Step 4: Commit**

```bash
git add crates/law-eye-ai/
git commit -m "feat(ai): create unified AiService for article processing"
```

---

## Task 11: 集成 AI 处理到 Worker

**Files:**
- Modify: `D:/Desktop/LawSaw/crates/law-eye-worker/Cargo.toml`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-worker/src/main.rs`

**Step 1: 更新 Worker Cargo.toml 添加依赖**

```toml
[dependencies]
law-eye-ai = { path = "../law-eye-ai" }
```

**Step 2: 更新 Worker main.rs**

在 Worker 结构体中添加 AiService：

```rust
use law_eye_ai::AiService;
use law_eye_queue::{AiTask, AiTaskType, IngestTask, PushTask, TaskQueue};

struct Worker {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    rss_fetcher: RssFetcher,
    web_spider: WebSpider,
    ai_service: Option<AiService>,  // 新增
}

impl Worker {
    fn new(pool: PgPool, task_queue: TaskQueue, ai_service: Option<AiService>) -> Self {
        Self {
            pool,
            task_queue: Arc::new(task_queue),
            rss_fetcher: RssFetcher::new(),
            web_spider: WebSpider::new(),
            ai_service,
        }
    }

    async fn run(&self) -> anyhow::Result<()> {
        info!("Worker started, waiting for tasks...");

        loop {
            // 处理采集任务
            if let Some(task) = self
                .task_queue
                .dequeue::<IngestTask>("queue:ingest", 5)
                .await?
            {
                self.process_ingest_task(task).await;
            }

            // 处理 AI 任务
            if let Some(task) = self
                .task_queue
                .dequeue::<AiTask>("queue:ai", 1)
                .await?
            {
                self.process_ai_task(task).await;
            }

            // 处理推送任务
            if let Some(task) = self
                .task_queue
                .dequeue::<PushTask>("queue:push", 1)
                .await?
            {
                self.process_push_task(task).await;
            }
        }
    }

    async fn process_ai_task(&self, task: AiTask) {
        info!("Processing AI task for article: {}", task.article_id);

        let Some(ai_service) = &self.ai_service else {
            error!("AI service not configured, skipping task");
            return;
        };

        let article_service = ArticleService::new(self.pool.clone());

        let article = match article_service.get_by_id(task.article_id).await {
            Ok(a) => a,
            Err(e) => {
                error!("Failed to get article: {}", e);
                return;
            }
        };

        let content = article.content.as_deref().unwrap_or("");

        match task.task_type {
            AiTaskType::Full => {
                match ai_service.process_article(&article.title, content).await {
                    Ok(result) => {
                        if let Err(e) = self
                            .update_article_with_ai(&article_service, task.article_id, result)
                            .await
                        {
                            error!("Failed to update article with AI result: {}", e);
                        }
                    }
                    Err(e) => {
                        error!("AI processing failed: {}", e);
                    }
                }
            }
            AiTaskType::Classify => {
                match ai_service.classify(&article.title, content).await {
                    Ok(result) => {
                        info!("Classified article {} as {}", task.article_id, result.category_slug);
                        // TODO: Update article category
                    }
                    Err(e) => {
                        error!("Classification failed: {}", e);
                    }
                }
            }
            _ => {
                info!("Task type {:?} not implemented yet", task.task_type);
            }
        }
    }

    async fn update_article_with_ai(
        &self,
        service: &ArticleService,
        article_id: Uuid,
        result: law_eye_ai::ArticleAiResult,
    ) -> anyhow::Result<()> {
        // 更新文章字段
        sqlx::query(
            r#"
            UPDATE articles SET
                summary = $2,
                risk_score = $3,
                sentiment = $4,
                ai_metadata = $5,
                tags = $6,
                keywords = $7,
                ai_processed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(article_id)
        .bind(&result.summary)
        .bind(result.risk_score as i32)
        .bind(&result.risk_level)
        .bind(result.to_metadata())
        .bind(&result.tags)
        .bind(&result.keywords)
        .execute(&self.pool)
        .await?;

        info!("Updated article {} with AI results", article_id);
        Ok(())
    }
}
```

更新 main 函数：

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = AppConfig::load().unwrap_or_default();

    info!("Starting Law Eye Worker...");

    let pool = create_pool(&config.database.url, config.database.max_connections).await?;

    let task_queue = TaskQueue::new(&config.redis.url)?;

    // 初始化 AI 服务 (如果配置了 API key)
    let ai_service = if !config.ai.api_key.is_empty() {
        info!("AI service enabled with model: {}", config.ai.model);
        Some(AiService::new(
            &config.ai.api_key,
            config.ai.base_url.as_deref(),
            Some(&config.ai.model),
        ))
    } else {
        info!("AI service disabled (no API key configured)");
        None
    };

    let worker = Worker::new(pool, task_queue, ai_service);
    worker.run().await
}
```

**Step 3: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-worker`
Expected: 编译成功

**Step 4: Commit**

```bash
git add crates/law-eye-worker/
git commit -m "feat(worker): integrate AI processing pipeline"
```

---

## Task 12: 添加 AI 处理 API 端点

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/ai.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/mod.rs`
- Modify: `D:/Desktop/LawSaw/crates/law-eye-api/Cargo.toml`

**Step 1: 更新 API Cargo.toml**

添加依赖：

```toml
law-eye-ai = { path = "../law-eye-ai" }
```

**Step 2: 创建 src/routes/ai.rs**

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use law_eye_queue::{AiTask, AiTaskType};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/articles/:id/process", post(process_article))
        .route("/articles/:id/classify", post(classify_article))
        .route("/articles/:id/summarize", post(summarize_article))
}

#[derive(Debug, Serialize)]
struct TaskResponse {
    message: String,
    article_id: Uuid,
    task_type: String,
}

/// 触发文章完整 AI 处理
async fn process_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let task = AiTask {
        article_id: id,
        task_type: AiTaskType::Full,
    };

    match state.task_queue.enqueue("queue:ai", &task).await {
        Ok(_) => (
            StatusCode::ACCEPTED,
            Json(TaskResponse {
                message: "AI processing task queued".to_string(),
                article_id: id,
                task_type: "full".to_string(),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(TaskResponse {
                message: format!("Failed to queue task: {}", e),
                article_id: id,
                task_type: "full".to_string(),
            }),
        ),
    }
}

/// 触发文章分类
async fn classify_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let task = AiTask {
        article_id: id,
        task_type: AiTaskType::Classify,
    };

    match state.task_queue.enqueue("queue:ai", &task).await {
        Ok(_) => (
            StatusCode::ACCEPTED,
            Json(TaskResponse {
                message: "Classification task queued".to_string(),
                article_id: id,
                task_type: "classify".to_string(),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(TaskResponse {
                message: format!("Failed to queue task: {}", e),
                article_id: id,
                task_type: "classify".to_string(),
            }),
        ),
    }
}

/// 触发文章摘要生成
async fn summarize_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let task = AiTask {
        article_id: id,
        task_type: AiTaskType::Summarize,
    };

    match state.task_queue.enqueue("queue:ai", &task).await {
        Ok(_) => (
            StatusCode::ACCEPTED,
            Json(TaskResponse {
                message: "Summarization task queued".to_string(),
                article_id: id,
                task_type: "summarize".to_string(),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(TaskResponse {
                message: format!("Failed to queue task: {}", e),
                article_id: id,
                task_type: "summarize".to_string(),
            }),
        ),
    }
}
```

**Step 3: 更新 src/routes/mod.rs**

```rust
pub mod ai;
pub mod articles;
pub mod categories;
pub mod health;
pub mod sources;

use axum::Router;

use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .nest("/health", health::router())
        .nest("/api/v1/articles", articles::router())
        .nest("/api/v1/sources", sources::router())
        .nest("/api/v1/categories", categories::router())
        .nest("/api/v1/ai", ai::router())  // 新增
        .with_state(state)
}
```

**Step 4: 验证**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-api`
Expected: 编译成功

**Step 5: Commit**

```bash
git add crates/law-eye-api/
git commit -m "feat(api): add AI processing endpoints"
```

---

## Task 13: 完整构建和验证

**Step 1: 完整构建**

Run: `cd D:/Desktop/LawSaw && cargo build --workspace`
Expected: 所有 crate 构建成功

**Step 2: 运行测试**

Run: `cd D:/Desktop/LawSaw && cargo test --workspace`
Expected: 所有测试通过

**Step 3: 启动服务验证**

1. 启动 Docker 容器：
```bash
cd D:/Desktop/LawSaw && docker compose up -d
```

2. 运行数据库迁移：
```bash
cd D:/Desktop/LawSaw && cargo run --bin law-eye-api
```
Expected: 服务启动成功，迁移执行成功

3. 测试 AI 端点：
```bash
curl -X POST http://localhost:3001/api/v1/ai/articles/00000000-0000-0000-0000-000000000000/process
```
Expected: 返回 202 Accepted（即使文章不存在也会入队）

**Step 4: Commit**

```bash
git add .
git commit -m "feat: complete Phase 2 AI enhancement implementation"
```

---

## 验证清单

完成后验证以下功能：

- [ ] law-eye-ai crate 编译成功
- [ ] LlmGateway 可以发送请求到 OpenAI API
- [ ] 分类引擎规则匹配测试通过
- [ ] 风险评估规则匹配测试通过
- [ ] 向量嵌入分块测试通过
- [ ] Worker 可以处理 AI 任务队列
- [ ] API 可以触发 AI 处理
- [ ] 数据库迁移成功创建 article_chunks 表
- [ ] 文章更新后包含 AI 生成的字段

---

## 下一步

Phase 2 完成后，可以开始 Phase 3: 完整 CMS（用户系统、权限、管理界面）。
