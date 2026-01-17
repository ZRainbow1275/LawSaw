use crate::{
    types::{RiskAssessment, RiskLevel},
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

fn truncate_content(content: &str, max_chars: usize) -> String {
    let char_count = content.chars().count();
    if char_count <= max_chars {
        content.to_string()
    } else {
        content.chars().take(max_chars).collect::<String>() + "..."
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
