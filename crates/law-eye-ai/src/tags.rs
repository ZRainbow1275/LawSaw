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
