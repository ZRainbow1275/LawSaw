use crate::LlmGateway;
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;

/// 情感分析的标签枚举（含 mixed 兼容 articles.sentiment / analytics_summary）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SentimentLabel {
    Positive,
    Neutral,
    Negative,
    Mixed,
}

impl SentimentLabel {
    /// 返回小写字符串形式（与 articles.sentiment / analytics 桶一致）。
    pub fn as_db_str(self) -> &'static str {
        match self {
            Self::Positive => "positive",
            Self::Neutral => "neutral",
            Self::Negative => "negative",
            Self::Mixed => "mixed",
        }
    }
}

/// 情感分析子方面（aspect-level 情感分解）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentAspect {
    pub name: String,
    pub label: SentimentLabel,
    /// 该 aspect 的强度分数，归一化到 [0.0, 1.0]，与主 score 同语义。
    pub score: f32,
}

/// 文章主体情感分析结果。
///
/// `score` 落在 `[0.0, 1.0]`，与 articles.sentiment_score 列的 CHECK 约束（0..=1）保持一致。
/// 正负方向由 `sentiment` 字段表达，不再用有符号 score。
///
/// `aspects` 是可选的子方面分解（公司声誉 / 政策影响 / 合规进展 等），上游可选填。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentResult {
    pub sentiment: SentimentLabel,
    pub score: f32,
    pub rationale: String,
    /// 单一首要 aspect（落 articles.sentiment_aspect 列），可空。
    #[serde(default)]
    pub aspect: Option<String>,
    /// 可选的多 aspect 细分（不入 articles.sentiment_aspect，可写 ai_metadata）。
    #[serde(default)]
    pub aspects: Vec<SentimentAspect>,
}

const SENTIMENT_SYSTEM_PROMPT: &str = r#"你是法律新闻语境下的中文情感分析助手。任务：判断文段对其主要"主体"（公司/机构/法规/事件）的情感倾向，并以严格 JSON 输出结果。

═══════ 输出 JSON Schema（严格） ═══════
你必须返回单个 JSON 对象，且只能包含下列字段：
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "score": 0.0-1.0,
  "rationale": "≤100 字中文简短解释，说明判定依据",
  "aspect": "compliance" | "penalty" | "litigation" | "policy_change" | "industry_trend" | "regulatory_impact" | "company_reputation" | "policy_direction" | "other",
  "aspects": [
    {"name": "<细分 aspect 名称>", "label": "positive|negative|neutral|mixed", "score": 0.0-1.0}
  ]
}

═══════ 标签判定标准 ═══════
- positive: 正面（合规升级、获得许可、案件胜诉、政策利好）
- negative: 负面（被处罚、被起诉、违规曝光、政策收紧）
- neutral:  纯客观陈述、立法草案征求意见、行业现状描述（无明显褒贬）
- mixed:    一段中既有处罚又有整改成效；或对一方正面对另一方负面

═══════ score 评分规则 ═══════
- score 表示该 sentiment 的强度 / 置信度（0.0-1.0），同 articles.sentiment_score 列语义。
- 不要为 neutral 评 0.9（neutral 本身意味着无强度，建议 ≤ 0.6）。
- 立场鲜明的正/负面建议 0.85-1.0。

═══════ aspect 选择 ═══════
- "penalty"            → 涉及罚款 / 吊销 / 拘留 / 通报批评
- "litigation"         → 起诉 / 判决 / 和解
- "compliance"         → 合规整改 / 获得资质 / 审计通过
- "policy_change"      → 法规出台 / 修订
- "industry_trend"     → 行业层面的趋势叙述
- "regulatory_impact"  → 监管影响（对企业经营约束）
- "company_reputation" → 企业声誉（媒体评价 / 公众信任）
- "policy_direction"   → 政策方向 / 顶层设计
- "other"              → 兜底

═══════ aspects（可选） ═══════
- 当文段涉及多维度情感时输出 1-3 项 aspect 细分；否则可返回空数组 []。
- 每个 aspect.name 用中文短语（≤ 12 字），label 与 score 与主字段同义。

═══════ 失败兜底 ═══════
若文段长度 < 30 字符 / 全文非中文 / 内容与法律合规无关：
直接返回 {"sentiment": "neutral", "score": 0.0, "rationale": "输入不足以判定情感", "aspect": "other", "aspects": []}。

只输出 JSON，不要任何 markdown 围栏、前后解释或多余空白。"#;

/// 用于截断正文的上限（字符）— 超过会被截断后再喂给模型。
const SENTIMENT_BODY_MAX_CHARS: usize = 6000;

/// 情感分析器：基于 Qwen3-8B chat_json 输出的细粒度情感判定。
pub struct SentimentClassifier {
    gateway: Arc<LlmGateway>,
}

impl SentimentClassifier {
    pub fn new(gateway: Arc<LlmGateway>) -> Self {
        Self { gateway }
    }

    /// 对单篇文章做情感分析。
    ///
    /// 失败时不阻塞下游：调用方可捕获 `Err` 并继续主流程（参见 `AiService::process_article_with_metadata`）。
    pub async fn classify(&self, title: &str, body: &str) -> Result<SentimentResult> {
        let user_prompt = format!(
            "请对以下法律新闻文段进行情感分析，输出严格 JSON。\n\n【上下文标题】{}\n【文段】\n{}\n",
            title,
            truncate_chars(body, SENTIMENT_BODY_MAX_CHARS)
        );

        let mut result: SentimentResult = self
            .gateway
            .chat_json(SENTIMENT_SYSTEM_PROMPT, &user_prompt)
            .await?;

        // 防御性收紧：score / aspect.score 必须落在 [0.0, 1.0]，否则 clamp。
        result.score = clamp_unit(result.score);
        for aspect in &mut result.aspects {
            aspect.score = clamp_unit(aspect.score);
        }

        // rationale 不超过 200 字符（中文按 char 数）。
        if result.rationale.chars().count() > 200 {
            result.rationale = result.rationale.chars().take(200).collect();
        }

        info!(
            sentiment = ?result.sentiment,
            score = result.score,
            aspect = ?result.aspect,
            aspects = result.aspects.len(),
            "Sentiment analysis completed"
        );

        Ok(result)
    }
}

/// 暴露 prompt 文本，方便测试 / 灰度调参。
pub fn sentiment_system_prompt() -> &'static str {
    SENTIMENT_SYSTEM_PROMPT
}

fn truncate_chars(content: &str, max_chars: usize) -> String {
    let count = content.chars().count();
    if count <= max_chars {
        content.to_string()
    } else {
        content.chars().take(max_chars).collect::<String>() + "..."
    }
}

fn clamp_unit(value: f32) -> f32 {
    if value.is_nan() {
        0.0
    } else {
        value.clamp(0.0, 1.0)
    }
}

/// 提供给上层调用方的解析 helper：从已经存在的 LLM 原始响应字符串里提取
/// `SentimentResult`，便于 worker / crawler 在并行链路中复用。
pub fn parse_sentiment_payload(raw: &str) -> Result<SentimentResult> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(Error::Internal(
            "empty sentiment payload from LLM".to_string(),
        ));
    }

    let mut result: SentimentResult = serde_json::from_str(trimmed)
        .map_err(|err| Error::Internal(format!("failed to parse sentiment JSON: {err}")))?;
    result.score = clamp_unit(result.score);
    for aspect in &mut result.aspects {
        aspect.score = clamp_unit(aspect.score);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal_payload() {
        let raw = r#"{
            "sentiment": "negative",
            "score": 0.92,
            "rationale": "公司因虚增利润被证监会顶格处罚，立场明确为负面。",
            "aspect": "penalty",
            "aspects": [
                {"name": "公司声誉", "label": "negative", "score": 0.9}
            ]
        }"#;

        let result = parse_sentiment_payload(raw).expect("payload must parse");
        assert_eq!(result.sentiment, SentimentLabel::Negative);
        assert!((result.score - 0.92).abs() < f32::EPSILON);
        assert_eq!(result.aspect.as_deref(), Some("penalty"));
        assert_eq!(result.aspects.len(), 1);
        assert_eq!(result.aspects[0].label, SentimentLabel::Negative);
    }

    #[test]
    fn clamp_score_out_of_range() {
        let raw = r#"{
            "sentiment": "positive",
            "score": 1.7,
            "rationale": "积极信号",
            "aspect": "compliance",
            "aspects": [
                {"name": "合规", "label": "positive", "score": -0.4}
            ]
        }"#;

        let result = parse_sentiment_payload(raw).expect("payload must parse");
        assert!((result.score - 1.0).abs() < f32::EPSILON);
        assert_eq!(result.aspects[0].score, 0.0);
    }

    #[test]
    fn parse_failsafe_payload() {
        let raw = r#"{
            "sentiment": "neutral",
            "score": 0.0,
            "rationale": "输入不足以判定情感",
            "aspect": "other",
            "aspects": []
        }"#;

        let result = parse_sentiment_payload(raw).expect("failsafe payload must parse");
        assert_eq!(result.sentiment, SentimentLabel::Neutral);
        assert_eq!(result.score, 0.0);
        assert!(result.aspects.is_empty());
    }

    #[test]
    fn label_db_str_round_trip() {
        assert_eq!(SentimentLabel::Positive.as_db_str(), "positive");
        assert_eq!(SentimentLabel::Neutral.as_db_str(), "neutral");
        assert_eq!(SentimentLabel::Negative.as_db_str(), "negative");
        assert_eq!(SentimentLabel::Mixed.as_db_str(), "mixed");
    }

    #[test]
    fn truncate_respects_chars_not_bytes() {
        let cn = "一二三四五六七八九十";
        let truncated = truncate_chars(cn, 5);
        // "..." appended
        assert!(truncated.ends_with("..."));
        let prefix: String = truncated.chars().take_while(|c| *c != '.').collect();
        assert_eq!(prefix.chars().count(), 5);
    }

    #[test]
    fn system_prompt_contains_json_keyword() {
        // SiliconFlow JSON 模式要求 prompt 中必须含 "JSON" 字样。
        assert!(sentiment_system_prompt().contains("JSON"));
    }
}
