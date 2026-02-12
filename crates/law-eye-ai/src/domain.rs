/// DomainClassifier -- maps articles to domain_root and domain_sub.
///
/// Uses the existing category_slug to determine domain_root, and
/// keyword analysis of the title for domain_sub.
pub struct DomainClassifier;

pub struct DomainClassification {
    pub domain_root: String,
    pub domain_sub: Option<String>,
}

impl DomainClassifier {
    /// Classify an article into domain_root (and optionally domain_sub).
    pub fn classify(
        &self,
        category_slug: &str,
        title: &str,
    ) -> DomainClassification {
        let domain_root = Self::category_to_domain(category_slug).to_string();
        let domain_sub = Self::detect_sub_domain(&domain_root, title);
        DomainClassification {
            domain_root,
            domain_sub,
        }
    }

    fn category_to_domain(slug: &str) -> &str {
        match slug {
            "legislation" => "legislation",
            "regulation" => "regulation",
            "enforcement" => "enforcement",
            "industry" => "industry",
            "compliance" => "compliance",
            "data" | "security" => "technology",
            "academic" => "academic",
            "international" => "international",
            "events" => "enforcement",
            _ => "industry",
        }
    }

    fn detect_sub_domain(domain_root: &str, title: &str) -> Option<String> {
        let t = title.to_lowercase();
        match domain_root {
            "legislation" => {
                if t.contains("\u{53f8}\u{6cd5}\u{89e3}\u{91ca}") {
                    // 司法解释
                    Some("judicial_interpretation".into())
                } else if t.contains("\u{5730}\u{65b9}") {
                    // 地方
                    Some("local_regulation".into())
                } else if t.contains("\u{884c}\u{653f}\u{6cd5}\u{89c4}") {
                    // 行政法规
                    Some("administrative_regulation".into())
                } else {
                    Some("law".into())
                }
            }
            "regulation" => {
                if t.contains("\u{91d1}\u{878d}") || t.contains("\u{94f6}\u{884c}")
                    || t.contains("\u{8bc1}\u{5238}")
                {
                    // 金融, 银行, 证券
                    Some("financial".into())
                } else if t.contains("\u{6570}\u{636e}") || t.contains("\u{4fe1}\u{606f}") {
                    // 数据, 信息
                    Some("data_protection".into())
                } else if t.contains("\u{53cd}\u{5783}\u{65ad}") || t.contains("\u{7ade}\u{4e89}") {
                    // 反垄断, 竞争
                    Some("antitrust".into())
                } else if t.contains("\u{73af}\u{5883}") || t.contains("\u{73af}\u{4fdd}") {
                    // 环境, 环保
                    Some("environmental".into())
                } else {
                    None
                }
            }
            "enforcement" => {
                if t.contains("\u{5211}\u{4e8b}") {
                    // 刑事
                    Some("criminal_case".into())
                } else if t.contains("\u{884c}\u{653f}\u{5904}\u{7f5a}") {
                    // 行政处罚
                    Some("administrative_penalty".into())
                } else if t.contains("\u{6c11}\u{4e8b}") {
                    // 民事
                    Some("civil_case".into())
                } else if t.contains("\u{4ef2}\u{88c1}") {
                    // 仲裁
                    Some("arbitration".into())
                } else {
                    None
                }
            }
            "industry" => {
                if t.contains("\u{79d1}\u{6280}") || t.contains("fintech") {
                    // 科技
                    Some("fintech".into())
                } else if t.contains("\u{533b}\u{7597}") || t.contains("\u{5065}\u{5eb7}") {
                    // 医疗, 健康
                    Some("healthcare".into())
                } else if t.contains("\u{623f}\u{5730}\u{4ea7}") {
                    // 房地产
                    Some("real_estate".into())
                } else if t.contains("\u{6559}\u{80b2}") {
                    // 教育
                    Some("education".into())
                } else if t.contains("\u{80fd}\u{6e90}") {
                    // 能源
                    Some("energy".into())
                } else {
                    None
                }
            }
            "compliance" => {
                if t.contains("\u{5185}\u{5ba1}") || t.contains("\u{5ba1}\u{8ba1}") {
                    // 内审, 审计
                    Some("internal_audit".into())
                } else if t.contains("\u{98ce}\u{9669}\u{7ba1}\u{7406}") {
                    // 风险管理
                    Some("risk_management".into())
                } else if t.contains("\u{5c3d}\u{8c03}") || t.contains("\u{5c3d}\u{804c}\u{8c03}\u{67e5}") {
                    // 尽调, 尽职调查
                    Some("due_diligence".into())
                } else if t.contains("\u{53cd}\u{6d17}\u{94b1}") || t.contains("aml") || t.contains("kyc") {
                    // 反洗钱
                    Some("aml_kyc".into())
                } else {
                    None
                }
            }
            "technology" => {
                if t.contains("\u{7f51}\u{7edc}\u{5b89}\u{5168}") || t.contains("\u{4fe1}\u{606f}\u{5b89}\u{5168}") {
                    // 网络安全, 信息安全
                    Some("cybersecurity".into())
                } else if t.contains("\u{4eba}\u{5de5}\u{667a}\u{80fd}") || t.contains("ai") {
                    // 人工智能
                    Some("ai_regulation".into())
                } else if t.contains("\u{6570}\u{636e}\u{6cbb}\u{7406}") {
                    // 数据治理
                    Some("data_governance".into())
                } else if t.contains("\u{533a}\u{5757}\u{94fe}") {
                    // 区块链
                    Some("blockchain".into())
                } else {
                    None
                }
            }
            "academic" => {
                if t.contains("\u{7814}\u{7a76}") || t.contains("\u{8bba}\u{6587}") {
                    // 研究, 论文
                    Some("research_paper".into())
                } else if t.contains("\u{6848}\u{4f8b}") {
                    // 案例
                    Some("case_study".into())
                } else if t.contains("\u{8bc4}\u{8bba}") || t.contains("\u{89e3}\u{8bfb}") {
                    // 评论, 解读
                    Some("commentary".into())
                } else {
                    None
                }
            }
            "international" => {
                if t.contains("\u{6761}\u{7ea6}") || t.contains("\u{534f}\u{5b9a}") {
                    // 条约, 协定
                    Some("treaty".into())
                } else if t.contains("\u{8de8}\u{5883}") {
                    // 跨境
                    Some("cross_border".into())
                } else if t.contains("\u{5236}\u{88c1}") {
                    // 制裁
                    Some("sanctions".into())
                } else if t.contains("\u{8d38}\u{6613}") {
                    // 贸易
                    Some("trade_compliance".into())
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legislation_category_maps_correctly() {
        let classifier = DomainClassifier;
        let result = classifier.classify("legislation", "全国人大通过新法");
        assert_eq!(result.domain_root, "legislation");
        assert_eq!(result.domain_sub.as_deref(), Some("law"));
    }

    #[test]
    fn data_category_maps_to_technology() {
        let classifier = DomainClassifier;
        let result = classifier.classify("data", "网络安全法实施细则");
        assert_eq!(result.domain_root, "technology");
        assert_eq!(result.domain_sub.as_deref(), Some("cybersecurity"));
    }

    #[test]
    fn unknown_category_defaults_to_industry() {
        let classifier = DomainClassifier;
        let result = classifier.classify("unknown_thing", "一般新闻");
        assert_eq!(result.domain_root, "industry");
    }
}
