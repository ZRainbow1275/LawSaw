use law_eye_crawler::{CleaningStage, Pipeline, PipelineStage, RawArticle};

fn make_article(title: &str, content: Option<&str>) -> RawArticle {
    RawArticle {
        title: title.to_string(),
        link: "https://example.com/test".to_string(),
        content: content.map(|s| s.to_string()),
        author: None,
        published_at: None,
    }
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
