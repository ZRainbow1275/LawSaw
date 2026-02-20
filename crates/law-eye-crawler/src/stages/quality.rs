use tracing::trace;

use crate::pipeline::{PipelineStage, RawArticle};

/// Content quality filtering stage.
///
/// Filters out articles that fail quality checks:
/// - Empty or too-short content
/// - Title matches spam/ad keyword blacklist
/// - Content matches spam/ad keyword blacklist
pub struct ContentQualityStage {
    /// Minimum content length in characters. Default: 20.
    min_content_length: usize,
    /// Minimum title length in characters. Default: 2.
    min_title_length: usize,
    /// Additional blacklist keywords (merged with built-in list).
    extra_blacklist: Vec<String>,
}

impl ContentQualityStage {
    pub fn new() -> Self {
        Self {
            min_content_length: 20,
            min_title_length: 2,
            extra_blacklist: Vec::new(),
        }
    }

    pub fn with_min_content_length(mut self, len: usize) -> Self {
        self.min_content_length = len;
        self
    }

    pub fn with_min_title_length(mut self, len: usize) -> Self {
        self.min_title_length = len;
        self
    }

    pub fn with_extra_blacklist(mut self, keywords: Vec<String>) -> Self {
        self.extra_blacklist = keywords;
        self
    }
}

impl Default for ContentQualityStage {
    fn default() -> Self {
        Self::new()
    }
}

/// Built-in blacklist for common spam/ad/irrelevant keywords in Chinese legal context.
const BLACKLIST_KEYWORDS: &[&str] = &[
    // Advertising
    "点击下载",
    "立即购买",
    "免费领取",
    "扫码关注",
    "加微信",
    "加QQ",
    "优惠券",
    "限时特价",
    "拼团",
    "秒杀",
    // Spam / clickbait
    "震惊！",
    "速看！",
    "不转不是",
    "99%的人不知道",
    "赶紧收藏",
    "必看",
    // Navigation / UI noise
    "返回首页",
    "返回顶部",
    "上一篇",
    "下一篇",
    "版权声明",
    "免责声明",
    "ICP备",
    "京公网安备",
];

impl PipelineStage for ContentQualityStage {
    fn process(&self, article: RawArticle) -> Option<RawArticle> {
        // 1. Title length check
        let title_chars = article.title.chars().count();
        if title_chars < self.min_title_length {
            trace!(
                title = %article.title,
                title_chars,
                min = self.min_title_length,
                "ContentQualityStage: title too short"
            );
            return None;
        }

        // 2. Content length check (if content is required)
        if let Some(content) = &article.content {
            let content_chars = content.chars().count();
            if content_chars < self.min_content_length {
                trace!(
                    title = %article.title,
                    content_chars,
                    min = self.min_content_length,
                    "ContentQualityStage: content too short"
                );
                return None;
            }
        }

        // 3. Title blacklist check
        let title_lower = article.title.to_lowercase();
        if self.matches_blacklist(&title_lower) {
            trace!(
                title = %article.title,
                "ContentQualityStage: title matches blacklist"
            );
            return None;
        }

        // 4. Content blacklist check (check first 500 chars for efficiency)
        if let Some(content) = &article.content {
            let content_prefix: String = content.chars().take(500).collect();
            let content_lower = content_prefix.to_lowercase();
            if self.matches_blacklist(&content_lower) {
                trace!(
                    title = %article.title,
                    "ContentQualityStage: content matches blacklist"
                );
                return None;
            }
        }

        Some(article)
    }
}

impl ContentQualityStage {
    fn matches_blacklist(&self, text: &str) -> bool {
        for keyword in BLACKLIST_KEYWORDS {
            if text.contains(keyword) {
                return true;
            }
        }
        for keyword in &self.extra_blacklist {
            if text.contains(keyword.as_str()) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(title: &str, content: Option<&str>) -> RawArticle {
        let mut a = RawArticle::new(title, "https://example.com");
        a.content = content.map(str::to_string);
        a
    }

    #[test]
    fn passes_normal_article() {
        let stage = ContentQualityStage::new();
        let a = make(
            "国务院关于加强法治建设的通知",
            Some("各省、自治区、直辖市人民政府，国务院各部委、各直属机构..."),
        );
        assert!(stage.process(a).is_some());
    }

    #[test]
    fn filters_empty_content() {
        let stage = ContentQualityStage::new();
        let a = make("标题", Some("短"));
        assert!(stage.process(a).is_none()); // content too short (1 char < 20)
    }

    #[test]
    fn filters_short_title() {
        let stage = ContentQualityStage::new();
        let a = make(
            "短",
            Some("这是一段足够长的内容用于测试质量检查阶段的最小长度要求"),
        );
        assert!(stage.process(a).is_none()); // title 1 char < 2
    }

    #[test]
    fn filters_ad_keyword_in_title() {
        let stage = ContentQualityStage::new();
        let a = make(
            "限时特价！法律教材大促销",
            Some("这是一段足够长的内容用于测试质量检查阶段的最小长度要求"),
        );
        assert!(stage.process(a).is_none());
    }

    #[test]
    fn filters_ad_keyword_in_content() {
        let stage = ContentQualityStage::new();
        let a = make(
            "正常的法律标题",
            Some("这段内容包含广告信息，请点击下载APP获取更多法律资讯"),
        );
        assert!(stage.process(a).is_none());
    }

    #[test]
    fn custom_blacklist() {
        let stage = ContentQualityStage::new().with_extra_blacklist(vec!["测试屏蔽".to_string()]);
        let a = make(
            "标题含测试屏蔽词",
            Some("这是一段足够长的内容用于测试质量检查阶段的最小长度要求"),
        );
        assert!(stage.process(a).is_none());
    }

    #[test]
    fn allows_article_without_content() {
        let stage = ContentQualityStage::new();
        let a = make("国务院关于加强法治建设的通知", None);
        assert!(stage.process(a).is_some()); // No content -> skip content checks
    }

    #[test]
    fn configurable_min_lengths() {
        let stage = ContentQualityStage::new()
            .with_min_content_length(5)
            .with_min_title_length(1);
        let a = make("标", Some("五个字够了"));
        assert!(stage.process(a).is_some());
    }
}
