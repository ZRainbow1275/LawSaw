/// AuthorityDetector -- detects legal authority level (1-10) based on
/// issuer name and title keyword matching.
///
/// Hierarchy:
///   1=宪法, 2=法律, 3=行政法规, 4=部门规章, 5=地方性法规,
///   6=地方政府规章, 7=司法解释, 8=规范性文件, 9=行业标准, 10=非正式
pub struct AuthorityDetector;

/// (level, label, keywords)
const AUTHORITY_LEVELS: &[(u8, &str, &[&str])] = &[
    (
        1,
        "\u{5baa}\u{6cd5}",
        &["\u{5baa}\u{6cd5}", "\u{4fee}\u{6b63}\u{6848}"],
    ),
    // 宪法, 修正案
    (
        2,
        "\u{6cd5}\u{5f8b}",
        &[
            "\u{4e2d}\u{534e}\u{4eba}\u{6c11}\u{5171}\u{548c}\u{56fd}",
            "\u{4eba}\u{6c11}\u{4ee3}\u{8868}\u{5927}\u{4f1a}",
        ],
    ),
    // 中华人民共和国, 人民代表大会
    (
        3,
        "\u{884c}\u{653f}\u{6cd5}\u{89c4}",
        &[
            "\u{56fd}\u{52a1}\u{9662}",
            "\u{6761}\u{4f8b}",
            "\u{6682}\u{884c}\u{6761}\u{4f8b}",
        ],
    ),
    // 国务院, 条例, 暂行条例
    (
        4,
        "\u{90e8}\u{95e8}\u{89c4}\u{7ae0}",
        &[
            "\u{90e8}\u{4ee4}",
            "\u{90e8}\u{95e8}\u{89c4}\u{7ae0}",
            "\u{529e}\u{6cd5}",
        ],
    ),
    // 部令, 部门规章, 办法
    (
        5,
        "\u{5730}\u{65b9}\u{6027}\u{6cd5}\u{89c4}",
        &["\u{7701}", "\u{81ea}\u{6cbb}\u{533a}"],
    ),
    // 省, 自治区
    (
        6,
        "\u{5730}\u{65b9}\u{653f}\u{5e9c}\u{89c4}\u{7ae0}",
        &["\u{5e02}\u{653f}\u{5e9c}", "\u{7701}\u{653f}\u{5e9c}"],
    ),
    // 市政府, 省政府
    (
        7,
        "\u{53f8}\u{6cd5}\u{89e3}\u{91ca}",
        &[
            "\u{6700}\u{9ad8}\u{4eba}\u{6c11}\u{6cd5}\u{9662}",
            "\u{6700}\u{9ad8}\u{4eba}\u{6c11}\u{68c0}\u{5bdf}\u{9662}",
            "\u{89e3}\u{91ca}",
        ],
    ),
    // 最高人民法院, 最高人民检察院, 解释
    (
        8,
        "\u{89c4}\u{8303}\u{6027}\u{6587}\u{4ef6}",
        &[
            "\u{901a}\u{77e5}",
            "\u{610f}\u{89c1}",
            "\u{6307}\u{5bfc}",
            "\u{6307}\u{5357}",
        ],
    ),
    // 通知, 意见, 指导, 指南
    (
        9,
        "\u{884c}\u{4e1a}\u{6807}\u{51c6}",
        &["\u{6807}\u{51c6}", "GB", "\u{884c}\u{4e1a}"],
    ),
    // 标准, GB, 行业
    (
        10,
        "\u{975e}\u{6b63}\u{5f0f}",
        &[
            "\u{7814}\u{7a76}",
            "\u{8bc4}\u{8bba}",
            "\u{5206}\u{6790}",
            "\u{62a5}\u{544a}",
        ],
    ),
    // 研究, 评论, 分析, 报告
];

impl AuthorityDetector {
    /// Detect authority level from issuer and title. Returns 1-10.
    pub fn detect(&self, title: &str, issuer: Option<&str>) -> Option<u8> {
        // 1. Issuer-based fast path
        if let Some(iss) = issuer {
            if iss.contains("\u{4eba}\u{5927}") {
                // 人大
                return Some(2);
            }
            if iss == "\u{56fd}\u{52a1}\u{9662}" {
                // 国务院
                return Some(3);
            }
            if iss.contains("\u{90e8}") || iss.contains("\u{59d4}") {
                // 部, 委
                return Some(4);
            }
            if iss.contains("\u{7701}") || iss.contains("\u{5e02}") {
                // 省, 市
                return Some(5);
            }
            if iss.contains("\u{6cd5}\u{9662}") || iss.contains("\u{68c0}\u{5bdf}\u{9662}") {
                // 法院, 检察院
                return Some(7);
            }
        }

        // 2. Title keyword matching (iterate from highest to lowest authority)
        for (level, _label, keywords) in AUTHORITY_LEVELS {
            if keywords.iter().any(|k| title.contains(k)) {
                return Some(*level);
            }
        }

        // 3. Default to normative document level
        Some(8)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_npc_law() {
        let detector = AuthorityDetector;
        assert_eq!(
            detector.detect("中华人民共和国数据安全法", Some("全国人大常委会")),
            Some(2)
        );
    }

    #[test]
    fn detect_state_council_regulation() {
        let detector = AuthorityDetector;
        assert_eq!(detector.detect("某某条例", Some("国务院")), Some(3));
    }

    #[test]
    fn detect_normative_document_by_keyword() {
        let detector = AuthorityDetector;
        assert_eq!(detector.detect("关于加强数据安全管理的通知", None), Some(8));
    }

    #[test]
    fn defaults_to_normative_when_no_match() {
        let detector = AuthorityDetector;
        assert_eq!(detector.detect("今日新闻概览", None), Some(8));
    }
}
