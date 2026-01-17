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
        let system_prompt = r#"You are a legal information entity extraction expert.
Extract entities and their relationships from the given legal news article.

Entity types:
- person: Names of individuals (officials, lawyers, judges, etc.)
- organization: Companies, government agencies, courts, law firms
- law: Laws, regulations, legal provisions
- event: Legal events, cases, trials
- location: Places, jurisdictions
- concept: Legal concepts, terms

Output JSON format:
{
  "entities": [
    {
      "name": "Entity name",
      "entity_type": "person|organization|law|event|location|concept",
      "aliases": ["Alternative names"],
      "context": "Brief context of mention",
      "relevance": 0.0-1.0
    }
  ],
  "relations": [
    {
      "source": "Source entity name",
      "target": "Target entity name",
      "relation_type": "mentions|related_to|part_of|affects|prosecutes|represents|regulates",
      "description": "Brief description"
    }
  ]
}

Extract only significant entities. Focus on legal relevance. Return empty arrays if no entities found."#;

        let user_prompt = format!("Title: {}\n\nContent:\n{}", title, content);

        let result: EntityExtractionResult = self
            .gateway
            .chat_json(system_prompt, &user_prompt)
            .await
            .unwrap_or_else(|_| EntityExtractionResult {
                entities: vec![],
                relations: vec![],
            });

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
