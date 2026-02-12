use chrono::NaiveDate;
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::trace;

use crate::pipeline::{PipelineStage, RawArticle};

/// Metadata extraction stage for Chinese legal documents.
///
/// Extracts structured metadata from article title and content:
/// - Issuing authority (发布机构)
/// - Document number (文号)
/// - Effective date (生效日期)
/// - Administrative region code (行政区划码)
pub struct MetadataExtractionStage;

// ---- Regex patterns (compiled once) ----

/// Matches Chinese legal document numbers.
/// Examples: 国发〔2026〕1号, 国办发[2025]第3号, 京政发(2026)12号
static DOC_NUMBER_RE: Lazy<Option<Regex>> = Lazy::new(|| {
    Regex::new(
        r"[\u4e00-\u9fa5]{1,8}[发办函令告批复定议案规章][\s]*[〔\[\(（][\s]*\d{4}[\s]*[〕\]\)）][\s]*(?:第[\s]*)?\d{1,5}[\s]*号"
    )
    .ok()
});

/// Matches effective date patterns in Chinese text.
/// Examples: 自2026年1月1日起施行, 自2026年3月1日起生效, 于2025年12月31日发布
static EFFECTIVE_DATE_RE: Lazy<Option<Regex>> = Lazy::new(|| {
    Regex::new(r"(?:自|于)[\s]*(\d{4})[\s]*年[\s]*(\d{1,2})[\s]*月[\s]*(\d{1,2})[\s]*日[\s]*(?:起[\s]*)?(?:施行|生效|执行|实施|发布|公布)")
        .ok()
});

/// Fallback date extraction: just year-month-day in Chinese format.
static CN_DATE_RE: Lazy<Option<Regex>> = Lazy::new(|| {
    Regex::new(r"(\d{4})[\s]*年[\s]*(\d{1,2})[\s]*月[\s]*(\d{1,2})[\s]*日").ok()
});

/// Known issuing authorities and their canonical names.
/// Order matters: more specific entries first.
const ISSUERS: &[(&str, &str)] = &[
    // Central
    ("全国人民代表大会常务委员会", "全国人大常委会"),
    ("全国人民代表大会", "全国人大"),
    ("中华人民共和国国务院", "国务院"),
    ("国务院办公厅", "国务院办公厅"),
    ("国务院", "国务院"),
    ("最高人民法院", "最高人民法院"),
    ("最高人民检察院", "最高人民检察院"),
    ("中央纪委国家监委", "中央纪委国家监委"),
    ("中央网信办", "中央网信办"),
    ("司法部", "司法部"),
    ("公安部", "公安部"),
    ("财政部", "财政部"),
    ("人力资源和社会保障部", "人力资源社会保障部"),
    ("自然资源部", "自然资源部"),
    ("生态环境部", "生态环境部"),
    ("住房和城乡建设部", "住房城乡建设部"),
    ("交通运输部", "交通运输部"),
    ("农业农村部", "农业农村部"),
    ("商务部", "商务部"),
    ("文化和旅游部", "文化和旅游部"),
    ("国家卫生健康委员会", "国家卫健委"),
    ("国家卫健委", "国家卫健委"),
    ("应急管理部", "应急管理部"),
    ("中国人民银行", "中国人民银行"),
    ("国家税务总局", "国家税务总局"),
    ("国家市场监督管理总局", "国家市场监管总局"),
    ("国家市场监管总局", "国家市场监管总局"),
    ("国家金融监督管理总局", "国家金融监管总局"),
    ("中国证券监督管理委员会", "证监会"),
    ("证监会", "证监会"),
    ("教育部", "教育部"),
    ("科技部", "科技部"),
    ("工业和信息化部", "工信部"),
    ("工信部", "工信部"),
    ("民政部", "民政部"),
    ("国防部", "国防部"),
    ("外交部", "外交部"),
    ("国家发展和改革委员会", "国家发改委"),
    ("国家发改委", "国家发改委"),
    ("发展改革委", "国家发改委"),
];

/// Province/region mappings to administrative codes.
const REGIONS: &[(&str, &str)] = &[
    ("北京", "110000"),
    ("天津", "120000"),
    ("河北", "130000"),
    ("山西", "140000"),
    ("内蒙古", "150000"),
    ("辽宁", "210000"),
    ("吉林", "220000"),
    ("黑龙江", "230000"),
    ("上海", "310000"),
    ("江苏", "320000"),
    ("浙江", "330000"),
    ("安徽", "340000"),
    ("福建", "350000"),
    ("江西", "360000"),
    ("山东", "370000"),
    ("河南", "410000"),
    ("湖北", "420000"),
    ("湖南", "430000"),
    ("广东", "440000"),
    ("广西", "450000"),
    ("海南", "460000"),
    ("重庆", "500000"),
    ("四川", "510000"),
    ("贵州", "520000"),
    ("云南", "530000"),
    ("西藏", "540000"),
    ("陕西", "610000"),
    ("甘肃", "620000"),
    ("青海", "630000"),
    ("宁夏", "640000"),
    ("新疆", "650000"),
];

impl PipelineStage for MetadataExtractionStage {
    fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        let combined = build_search_text(&article);

        // 1. Extract issuer
        if article.extracted_issuer.is_none() {
            article.extracted_issuer = extract_issuer(&combined);
        }

        // 2. Extract document number
        if article.extracted_doc_number.is_none() {
            article.extracted_doc_number = extract_doc_number(&combined);
        }

        // 3. Extract effective date
        if article.extracted_effective_date.is_none() {
            article.extracted_effective_date = extract_effective_date(&combined);
        }

        // 4. Extract region code
        if article.extracted_region_code.is_none() {
            article.extracted_region_code = extract_region_code(&combined);
        }

        trace!(
            title = %article.title,
            issuer = ?article.extracted_issuer,
            doc_number = ?article.extracted_doc_number,
            effective_date = ?article.extracted_effective_date,
            region_code = ?article.extracted_region_code,
            "MetadataExtractionStage processed"
        );

        Some(article) // Never filters
    }
}

/// Build a combined text for searching (title + first 2000 chars of content).
fn build_search_text(article: &RawArticle) -> String {
    let mut text = article.title.clone();
    if let Some(content) = &article.content {
        text.push(' ');
        let prefix: String = content.chars().take(2000).collect();
        text.push_str(&prefix);
    }
    text
}

fn extract_issuer(text: &str) -> Option<String> {
    for &(pattern, canonical) in ISSUERS {
        if text.contains(pattern) {
            return Some(canonical.to_string());
        }
    }
    None
}

fn extract_doc_number(text: &str) -> Option<String> {
    DOC_NUMBER_RE
        .as_ref()?
        .find(text)
        .map(|m| m.as_str().to_string())
}

fn extract_effective_date(text: &str) -> Option<NaiveDate> {
    // Try the specific "自...施行" pattern first
    if let Some(re) = EFFECTIVE_DATE_RE.as_ref() {
        if let Some(caps) = re.captures(text) {
            if let Some(date) = parse_ymd_captures(&caps, 1, 2, 3) {
                return Some(date);
            }
        }
    }

    // Fallback: any Chinese date in the text (take last one, usually the effective date)
    if let Some(re) = CN_DATE_RE.as_ref() {
        let mut last_date = None;
        for caps in re.captures_iter(text) {
            if let Some(date) = parse_ymd_captures(&caps, 1, 2, 3) {
                last_date = Some(date);
            }
        }
        return last_date;
    }

    None
}

fn parse_ymd_captures(
    caps: &regex::Captures,
    y_idx: usize,
    m_idx: usize,
    d_idx: usize,
) -> Option<NaiveDate> {
    let year: i32 = caps.get(y_idx)?.as_str().parse().ok()?;
    let month: u32 = caps.get(m_idx)?.as_str().parse().ok()?;
    let day: u32 = caps.get(d_idx)?.as_str().parse().ok()?;

    if !(1900..=2100).contains(&year) || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    NaiveDate::from_ymd_opt(year, month, day)
}

fn extract_region_code(text: &str) -> Option<String> {
    // Check title first (more reliable), then content
    for &(name, code) in REGIONS {
        if text.contains(name) {
            return Some(code.to_string());
        }
    }
    None
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
    fn extracts_issuer_from_title() {
        let stage = MetadataExtractionStage;
        let a = make("国务院关于加强法治建设的若干意见", None);
        let result = stage.process(a).unwrap();
        assert_eq!(result.extracted_issuer.as_deref(), Some("国务院"));
    }

    #[test]
    fn extracts_issuer_canonical_form() {
        let stage = MetadataExtractionStage;
        let a = make("全国人民代表大会常务委员会关于修改《公司法》的决定", None);
        let result = stage.process(a).unwrap();
        assert_eq!(result.extracted_issuer.as_deref(), Some("全国人大常委会"));
    }

    #[test]
    fn extracts_doc_number() {
        let stage = MetadataExtractionStage;
        let a = make("国务院关于印发通知", Some("国发〔2026〕1号 各省、自治区..."));
        let result = stage.process(a).unwrap();
        assert_eq!(
            result.extracted_doc_number.as_deref(),
            Some("国发〔2026〕1号")
        );
    }

    #[test]
    fn extracts_doc_number_bracket_variants() {
        let stage = MetadataExtractionStage;
        let a = make("通知", Some("京政发[2025]第3号 北京市人民政府..."));
        let result = stage.process(a).unwrap();
        assert!(result.extracted_doc_number.is_some());
        assert!(result
            .extracted_doc_number
            .as_ref()
            .unwrap()
            .contains("2025"));
    }

    #[test]
    fn extracts_effective_date() {
        let stage = MetadataExtractionStage;
        let a = make(
            "新法规",
            Some("本条例自2026年3月1日起施行。此前相关规定同时废止。"),
        );
        let result = stage.process(a).unwrap();
        assert_eq!(
            result.extracted_effective_date,
            Some(NaiveDate::from_ymd_opt(2026, 3, 1).unwrap())
        );
    }

    #[test]
    fn extracts_effective_date_publish() {
        let stage = MetadataExtractionStage;
        let a = make("通告", Some("于2025年12月31日发布"));
        let result = stage.process(a).unwrap();
        assert_eq!(
            result.extracted_effective_date,
            Some(NaiveDate::from_ymd_opt(2025, 12, 31).unwrap())
        );
    }

    #[test]
    fn extracts_region_code() {
        let stage = MetadataExtractionStage;
        let a = make("北京市关于加强城市管理的通知", None);
        let result = stage.process(a).unwrap();
        assert_eq!(result.extracted_region_code.as_deref(), Some("110000"));
    }

    #[test]
    fn extracts_region_from_content() {
        let stage = MetadataExtractionStage;
        let a = make("关于加强管理的通知", Some("上海市人民政府令第42号..."));
        let result = stage.process(a).unwrap();
        assert_eq!(result.extracted_region_code.as_deref(), Some("310000"));
    }

    #[test]
    fn no_metadata_when_absent() {
        let stage = MetadataExtractionStage;
        let a = make("Hello World", Some("This is English content with no legal info."));
        let result = stage.process(a).unwrap();
        assert!(result.extracted_issuer.is_none());
        assert!(result.extracted_doc_number.is_none());
        assert!(result.extracted_effective_date.is_none());
        assert!(result.extracted_region_code.is_none());
    }

    #[test]
    fn never_filters_articles() {
        let stage = MetadataExtractionStage;
        let a = make("", Some(""));
        assert!(stage.process(a).is_some()); // Never returns None
    }

    #[test]
    fn does_not_overwrite_existing_metadata() {
        let stage = MetadataExtractionStage;
        let mut a = make("国务院关于加强法治建设的意见", None);
        a.extracted_issuer = Some("手动设置的机构".to_string());
        let result = stage.process(a).unwrap();
        assert_eq!(result.extracted_issuer.as_deref(), Some("手动设置的机构"));
    }
}
