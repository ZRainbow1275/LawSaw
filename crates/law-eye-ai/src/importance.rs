/// ImportanceAssessor -- rule-based importance scoring (1-5).
///
/// Scores are derived from three weighted factors:
///   - authority_level (if already known)
///   - title keyword analysis (scope indicators)
///   - issuer significance
const AUTHORITY_WEIGHT: f32 = 0.30;
const SCOPE_WEIGHT: f32 = 0.25;
const ENFORCEMENT_WEIGHT: f32 = 0.15;

pub struct ImportanceAssessor;

impl ImportanceAssessor {
    /// Compute importance score (1-5) from article metadata.
    pub fn rule_assess(
        &self,
        title: &str,
        authority_level: Option<i32>,
        issuer: Option<&str>,
    ) -> u8 {
        let mut score: f32 = 0.0;

        // 1. Authority level factor
        if let Some(auth) = authority_level {
            let auth_score = match auth {
                1 => 5.0,
                2 => 4.5,
                3 => 4.0,
                4 => 3.5,
                5..=6 => 3.0,
                7..=8 => 2.0,
                _ => 1.0,
            };
            score += auth_score * AUTHORITY_WEIGHT;
        }

        // 2. Title keywords -> scope factor
        let title_lower = title.to_lowercase();
        let high_scope_keywords = [
            "\u{5168}\u{56fd}",                 // 全国
            "\u{5168}\u{9762}",                 // 全面
            "\u{91cd}\u{5927}",                 // 重大
            "\u{6539}\u{9769}",                 // 改革
            "\u{4fee}\u{8ba2}",                 // 修订
            "\u{65b0}\u{6cd5}",                 // 新法
            "\u{751f}\u{6548}",                 // 生效
            "\u{65bd}\u{884c}",                 // 施行
            "\u{5e9f}\u{6b62}",                 // 废止
            "\u{56fd}\u{52a1}\u{9662}",         // 国务院
            "\u{5168}\u{56fd}\u{4eba}\u{5927}", // 全国人大
        ];
        let medium_scope_keywords = [
            "\u{884c}\u{4e1a}", // 行业
            "\u{9886}\u{57df}", // 领域
            "\u{89c4}\u{8303}", // 规范
            "\u{6807}\u{51c6}", // 标准
            "\u{6307}\u{5357}", // 指南
            "\u{901a}\u{77e5}", // 通知
        ];

        let scope_score = if high_scope_keywords.iter().any(|k| title_lower.contains(k)) {
            4.5
        } else if medium_scope_keywords
            .iter()
            .any(|k| title_lower.contains(k))
        {
            3.0
        } else {
            1.5
        };
        score += scope_score * SCOPE_WEIGHT;

        // 3. Issuer significance factor
        if let Some(iss) = issuer {
            let issuer_score = if iss.contains("\u{4eba}\u{5927}\u{5e38}\u{59d4}\u{4f1a}")
                || iss == "\u{56fd}\u{52a1}\u{9662}"
            {
                // 人大常委会, 国务院
                5.0
            } else if iss.contains("\u{6700}\u{9ad8}\u{4eba}\u{6c11}\u{6cd5}\u{9662}")
                || iss.contains("\u{6700}\u{9ad8}\u{4eba}\u{6c11}\u{68c0}\u{5bdf}\u{9662}")
            {
                // 最高人民法院, 最高人民检察院
                4.5
            } else if iss.contains("\u{7f51}\u{4fe1}\u{529e}")
                || iss.contains("\u{5de5}\u{4fe1}\u{90e8}")
                || iss.contains("\u{4eba}\u{6c11}\u{94f6}\u{884c}")
                || iss.contains("\u{8bc1}\u{76d1}\u{4f1a}")
                || iss.contains("\u{94f6}\u{4fdd}\u{76d1}\u{4f1a}")
            {
                // 网信办, 工信部, 人民银行, 证监会, 银保监会
                4.0
            } else if iss.contains('\u{90e8}') || iss.contains('\u{59d4}') {
                // 部, 委
                3.5
            } else if iss.contains('\u{5c40}') || iss.contains('\u{529e}') {
                // 局, 办
                3.0
            } else {
                2.0
            };
            score += issuer_score * ENFORCEMENT_WEIGHT;
        }

        // Normalize to 1-5
        let normalized = ((score / 5.0) * 4.0 + 1.0).round().clamp(1.0, 5.0);
        normalized as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_importance_generic_article() {
        let assessor = ImportanceAssessor;
        let score = assessor.rule_assess("企业内部培训通知", None, None);
        assert!((1..=5).contains(&score));
        assert!(score <= 3);
    }

    #[test]
    fn high_importance_national_legislation() {
        let assessor = ImportanceAssessor;
        let score = assessor.rule_assess("全国人大通过新法修订", Some(2), Some("全国人大常委会"));
        assert!((1..=5).contains(&score));
        assert!(score >= 3);
    }
}
