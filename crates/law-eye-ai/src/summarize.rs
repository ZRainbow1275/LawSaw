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
