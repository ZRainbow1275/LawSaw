use crate::LlmGateway;
use law_eye_common::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub name: String,
    pub entity_type: String,
    pub aliases: Vec<String>,
    pub context: String,
    pub relevance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedRelation {
    pub source: String,
    pub target: String,
    pub relation_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityExtractionResult {
    pub entities: Vec<ExtractedEntity>,
    pub relations: Vec<ExtractedRelation>,
}

pub struct EntityExtractor {
    gateway: Arc<LlmGateway>,
}

impl EntityExtractor {
    pub fn new(gateway: Arc<LlmGateway>) -> Self {
        Self { gateway }
    }

    pub async fn extract(&self, title: &str, content: &str) -> Result<EntityExtractionResult> {
        let system_prompt = r#"你是一位中国法律信息实体提取专家。
请从给定的法律新闻文章中提取实体及其关系。

实体类型:
- person: 个人姓名（官员、律师、法官、当事人等）
- organization: 公司、政府机关、法院、律师事务所、监管机构
- law: 法律、法规、司法解释、规章制度、法律条文
- event: 法律事件、案件、审判、听证会
- location: 地名、管辖区域
- concept: 法律概念、术语、学说

输出JSON格式:
{
  "entities": [
    {
      "name": "实体名称",
      "entity_type": "person|organization|law|event|location|concept",
      "aliases": ["别名或简称"],
      "context": "实体在文章中出现的上下文",
      "relevance": 0.0-1.0
    }
  ],
  "relations": [
    {
      "source": "源实体名称",
      "target": "目标实体名称",
      "relation_type": "mentions|related_to|part_of|affects|prosecutes|represents|regulates|amends|supervises",
      "description": "关系简要描述"
    }
  ]
}

提取要求:
1. 仅提取有法律意义的重要实体
2. 实体名称使用文章中的原始表述
3. 别名包含常用简称（如"最高人民法院"→"最高法"）
4. relevance 反映实体在文章中的重要程度
5. 如未发现实体则返回空数组"#;

        let user_prompt = format!("Title: {}\n\nContent:\n{}", title, content);

        let result: EntityExtractionResult =
            self.gateway.chat_json(system_prompt, &user_prompt).await?;

        info!(
            "Extracted {} entities and {} relations",
            result.entities.len(),
            result.relations.len()
        );

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extraction_result_deserialize() {
        let json = r#"{
            "entities": [
                {
                    "name": "最高人民法院",
                    "entity_type": "organization",
                    "aliases": ["最高法"],
                    "context": "发布司法解释",
                    "relevance": 0.9
                }
            ],
            "relations": []
        }"#;

        let result: EntityExtractionResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.entities.len(), 1);
        assert_eq!(result.entities[0].name, "最高人民法院");
    }
}
