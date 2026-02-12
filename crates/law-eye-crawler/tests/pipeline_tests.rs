use law_eye_crawler::{
    CleaningStage, ContentQualityStage, DeduplicationStage, MetadataExtractionStage, Pipeline,
    PipelineStage, RawArticle,
};

fn make_article(title: &str, content: Option<&str>) -> RawArticle {
    let mut a = RawArticle::new(title, "https://example.com/test");
    a.content = content.map(|s| s.to_string());
    a
}

#[test]
fn test_cleaning_stage_removes_html_tags() {
    let stage = CleaningStage;
    let article = make_article(
        "测试文章",
        Some("<p>这是一段<strong>重要</strong>的内容</p>"),
    );

    let result = stage.process(article).unwrap();
    assert!(!result.content.as_ref().unwrap().contains("<"));
    assert!(!result.content.as_ref().unwrap().contains(">"));
    assert!(result.content.as_ref().unwrap().contains("这是一段"));
    assert!(result.content.as_ref().unwrap().contains("重要"));
}

#[test]
fn test_cleaning_stage_converts_br_to_newline() {
    let stage = CleaningStage;
    let article = make_article("测试", Some("第一行<br>第二行<br/>第三行"));

    let result = stage.process(article).unwrap();
    let content = result.content.unwrap();
    assert!(content.contains('\n'));
}

#[test]
fn test_cleaning_stage_trims_title() {
    let stage = CleaningStage;
    let article = make_article("  标题有空格  ", Some("内容"));

    let result = stage.process(article).unwrap();
    assert_eq!(result.title, "标题有空格");
}

#[test]
fn test_cleaning_stage_handles_none_content() {
    let stage = CleaningStage;
    let article = make_article("无内容文章", None);

    let result = stage.process(article).unwrap();
    assert!(result.content.is_none());
}

#[test]
fn test_pipeline_processes_all_stages() {
    struct UppercaseStage;

    impl PipelineStage for UppercaseStage {
        fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
            article.title = article.title.to_uppercase();
            Some(article)
        }
    }

    struct SuffixStage;

    impl PipelineStage for SuffixStage {
        fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
            article.title = format!("{} - processed", article.title);
            Some(article)
        }
    }

    let pipeline = Pipeline::new()
        .add_stage(UppercaseStage)
        .add_stage(SuffixStage);

    let article = make_article("test", None);
    let result = pipeline.process(article).unwrap();

    assert_eq!(result.title, "TEST - processed");
}

#[test]
fn test_pipeline_stops_on_none() {
    struct FilterStage;

    impl PipelineStage for FilterStage {
        fn process(&self, article: RawArticle) -> Option<RawArticle> {
            if article.title.contains("过滤") {
                None
            } else {
                Some(article)
            }
        }
    }

    let pipeline = Pipeline::new().add_stage(FilterStage);

    let article1 = make_article("正常文章", None);
    let article2 = make_article("需要过滤的文章", None);

    assert!(pipeline.process(article1).is_some());
    assert!(pipeline.process(article2).is_none());
}

#[test]
fn test_pipeline_batch_processing() {
    struct FilterShortTitles;

    impl PipelineStage for FilterShortTitles {
        fn process(&self, article: RawArticle) -> Option<RawArticle> {
            // 按字符数过滤（不是字节数）
            if article.title.chars().count() >= 4 {
                Some(article)
            } else {
                None
            }
        }
    }

    let pipeline = Pipeline::new().add_stage(FilterShortTitles);

    let articles = vec![
        make_article("短", None),           // 1 char - 过滤
        make_article("两字", None),         // 2 chars - 过滤
        make_article("三个字", None),       // 3 chars - 过滤
        make_article("这是四个字", None),   // 5 chars - 保留
        make_article("另一个长标题", None), // 6 chars - 保留
    ];

    let results = pipeline.process_batch(articles);
    assert_eq!(results.len(), 2);
}

#[test]
fn test_empty_pipeline_passes_through() {
    let pipeline = Pipeline::new();
    let article = make_article("测试", Some("内容"));

    let result = pipeline.process(article).unwrap();
    assert_eq!(result.title, "测试");
    assert_eq!(result.content.unwrap(), "内容");
}

// ============================================================
// Combination tests: real stages working together
// ============================================================

fn make_full_article(title: &str, link: &str, content: Option<&str>) -> RawArticle {
    let mut a = RawArticle::new(title, link);
    a.content = content.map(|s| s.to_string());
    a
}

#[test]
fn test_standard_pipeline_full_chain() {
    // Standard pipeline: Cleaning -> Quality -> Dedup -> Metadata
    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(ContentQualityStage::new())
        .add_stage(DeduplicationStage::new())
        .add_stage(MetadataExtractionStage);

    let article = make_full_article(
        "  国务院关于印发通知  ",
        "https://gov.cn/article/1",
        Some("<p>国发〔2026〕1号</p><p>各省、自治区、直辖市人民政府，国务院各部委、各直属机构：</p><p>本条例自2026年3月1日起施行。</p>"),
    );

    let result = pipeline.process(article).unwrap();

    // CleaningStage: title trimmed, HTML stripped
    assert_eq!(result.title, "国务院关于印发通知");
    assert!(!result.content.as_ref().unwrap().contains("<p>"));

    // DeduplicationStage: content_hash set
    assert!(result.content_hash.is_some());

    // MetadataExtractionStage: metadata extracted
    assert_eq!(result.extracted_issuer.as_deref(), Some("国务院"));
    assert_eq!(
        result.extracted_doc_number.as_deref(),
        Some("国发〔2026〕1号")
    );
    assert!(result.extracted_effective_date.is_some());
}

#[test]
fn test_standard_pipeline_filters_spam() {
    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(ContentQualityStage::new())
        .add_stage(DeduplicationStage::new())
        .add_stage(MetadataExtractionStage);

    // Article with ad keyword in title -> filtered by ContentQualityStage
    let spam = make_full_article(
        "限时特价！法律教材大促销",
        "https://spam.com/1",
        Some("这是一段足够长的内容用于测试质量检查阶段的最小长度要求确保内容够长"),
    );
    assert!(pipeline.process(spam).is_none());
}

#[test]
fn test_standard_pipeline_filters_short_content() {
    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(ContentQualityStage::new())
        .add_stage(DeduplicationStage::new())
        .add_stage(MetadataExtractionStage);

    // Article with too-short content -> filtered by ContentQualityStage
    let short = make_full_article("正常标题", "https://example.com/2", Some("太短"));
    assert!(pipeline.process(short).is_none());
}

#[test]
fn test_standard_pipeline_batch_dedup() {
    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(ContentQualityStage::new())
        .add_stage(DeduplicationStage::new())
        .add_stage(MetadataExtractionStage);

    let articles = vec![
        make_full_article(
            "北京市人民政府关于加强城市管理的通知",
            "https://gov.cn/1",
            Some("各区人民政府，市政府各委、办、局，各市属机构：为加强城市管理，现通知如下..."),
        ),
        // Duplicate link -> filtered
        make_full_article(
            "另一篇文章",
            "https://gov.cn/1",
            Some("这是另一篇不同内容的文章但链接相同用来测试去重功能是否正常工作"),
        ),
        // Same content -> filtered
        make_full_article(
            "上海市相关通知",
            "https://gov.cn/2",
            Some("各区人民政府，市政府各委、办、局，各市属机构：为加强城市管理，现通知如下..."),
        ),
        // Unique article -> kept
        make_full_article(
            "广东省关于优化营商环境的若干措施",
            "https://gov.cn/3",
            Some("粤府〔2026〕5号 各地级以上市人民政府，省政府各部门、各直属机构..."),
        ),
    ];

    let results = pipeline.process_batch(articles);
    assert_eq!(results.len(), 2);

    // First article: Beijing
    assert_eq!(results[0].extracted_region_code.as_deref(), Some("110000"));

    // Second article (4th input): Guangdong
    assert_eq!(results[1].extracted_region_code.as_deref(), Some("440000"));
}

#[test]
fn test_pipeline_allows_no_content_articles() {
    // Articles without content should pass quality check (content is optional)
    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(ContentQualityStage::new())
        .add_stage(DeduplicationStage::new())
        .add_stage(MetadataExtractionStage);

    let article = make_full_article(
        "最高人民法院关于民事诉讼程序的司法解释",
        "https://court.gov.cn/1",
        None,
    );

    let result = pipeline.process(article).unwrap();
    assert_eq!(result.extracted_issuer.as_deref(), Some("最高人民法院"));
    assert!(result.content_hash.is_none()); // No content -> no hash
}

#[test]
fn test_pipeline_html_cleaning_then_metadata() {
    // Verify that HTML cleaning happens before metadata extraction,
    // so metadata regex works on clean text
    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(MetadataExtractionStage);

    let article = make_full_article(
        "司法部关于发布规定的通知",
        "https://moj.gov.cn/1",
        Some("<div>司发〔2026〕12号</div><p>本规定自2026年6月1日起施行。</p>"),
    );

    let result = pipeline.process(article).unwrap();
    assert_eq!(result.extracted_issuer.as_deref(), Some("司法部"));
    assert!(result.extracted_doc_number.is_some());
    assert!(result.extracted_effective_date.is_some());
}
