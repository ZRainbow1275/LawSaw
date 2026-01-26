use crate::{types::ClassifyResult, LlmGateway};
use law_eye_common::Result;
use tracing::info;

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
        if contains_any(
            &text,
            &["法律", "法规", "条例", "草案", "立法", "修订", "出台"],
        ) {
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
            &[
                "数据安全",
                "个人信息",
                "隐私",
                "数据出境",
                "跨境传输",
                "数据保护",
            ],
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
