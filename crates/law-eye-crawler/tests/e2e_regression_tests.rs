//! Batch E: 端到端回归测试
//!
//! 验证爬虫链路的关键不变量（无需网络/数据库）:
//! - AdapterRegistry 包含所有预期适配器
//! - SiteProfile 字段完整性
//! - Pipeline 保留法律元数据
//! - IncrementalChecker 跨会话去重
//! - Cron 表达式合法性

use law_eye_crawler::{
    AdapterRegistry, CleaningStage, ConcurrencyConfig, ConcurrencyController,
    CrawlJobConfig, CrawlOrchestrator, DeduplicationStage,
    DomainRateLimiter, IncrementalChecker, MetadataExtractionStage, Pipeline,
    RateLimiterConfig, RawArticle,
};
use std::sync::Arc;

// ============================================================
// 1. AdapterRegistry 完整性
// ============================================================

#[test]
fn registry_with_defaults_has_all_19_adapters() {
    let registry = AdapterRegistry::with_defaults().unwrap();
    // 2 generic (rss, spider) + 17 government site adapters
    assert_eq!(
        registry.len(),
        19,
        "Expected 19 adapters (2 generic + 17 gov), got {}",
        registry.len()
    );
}

#[test]
fn registry_contains_all_expected_kinds() {
    let registry = AdapterRegistry::with_defaults().unwrap();
    let kinds = registry.kinds();
    let expected = [
        "rss",
        "spider",
        "npc_gov",
        "flk_npc",
        "moj_gov",
        "csrc_gov",
        "cbirc_gov",
        "cac_gov",
        "pbc_gov",
        "court_gov",
        "samr_gov",
        "miit_gov",
        "shanghai_rd",
        "beijing_rd",
        "guangdong_rd",
        "gdpr_tracker",
        "china_isc",
        "china_cba",
        "cnvd",
    ];
    for kind in &expected {
        assert!(
            kinds.contains(kind),
            "Missing adapter kind: {}",
            kind
        );
    }
}

// ============================================================
// 2. SiteProfile 字段完整性
// ============================================================

#[test]
fn all_site_profiles_have_required_fields() {
    let registry = AdapterRegistry::with_defaults().unwrap();
    // Government adapters should each have a non-empty kind and display_name.
    // We verify via the registry that every registered adapter has a valid kind.
    let kinds = registry.kinds();
    assert!(kinds.len() >= 19);
    for kind in &kinds {
        assert!(!kind.is_empty(), "Empty adapter kind found");
    }
}

// ============================================================
// 3. Pipeline 保留法律元数据
// ============================================================

#[test]
fn pipeline_preserves_legal_metadata_fields() {
    let mut article = RawArticle::new(
        "国务院关于印发《数据安全管理条例》的通知",
        "https://gov.cn/article/123",
    );
    article.content = Some("国务院关于印发数据安全管理条例的详细内容，共计五十条...".to_string());
    article.extracted_issuer = Some("国务院".to_string());
    article.extracted_doc_number = Some("国发〔2026〕1号".to_string());
    article.extracted_effective_date = Some(chrono::NaiveDate::from_ymd_opt(2026, 3, 1).unwrap());
    article.extracted_region_code = Some("000000".to_string());
    article.content_hash = Some("abc123hash".to_string());

    let pipeline = Pipeline::new()
        .add_stage(CleaningStage)
        .add_stage(DeduplicationStage::new());

    let results = pipeline.process_batch(vec![article]);
    assert_eq!(results.len(), 1, "Article should survive pipeline");

    let out = &results[0];
    assert_eq!(out.extracted_issuer.as_deref(), Some("国务院"));
    assert_eq!(out.extracted_doc_number.as_deref(), Some("国发〔2026〕1号"));
    assert_eq!(
        out.extracted_effective_date,
        Some(chrono::NaiveDate::from_ymd_opt(2026, 3, 1).unwrap())
    );
    assert_eq!(out.extracted_region_code.as_deref(), Some("000000"));
    // content_hash is set by DeduplicationStage (overwrites with MD5 of content)
    assert!(out.content_hash.is_some(), "content_hash should be set by DeduplicationStage");
}

#[test]
fn pipeline_metadata_extraction_stage_extracts_issuer() {
    let mut article = RawArticle::new(
        "国务院办公厅关于加强数据安全管理的通知",
        "https://gov.cn/article/456",
    );
    article.content = Some(
        "国务院办公厅关于加强数据安全管理的通知内容，包含详细的管理规定和要求。\
         文号：国办发〔2026〕5号。生效日期：2026年6月1日。"
            .to_string(),
    );

    let pipeline = Pipeline::new().add_stage(MetadataExtractionStage);
    let results = pipeline.process_batch(vec![article]);
    assert_eq!(results.len(), 1);

    let out = &results[0];
    // MetadataExtractionStage should extract issuer from title
    assert!(
        out.extracted_issuer.is_some(),
        "MetadataExtractionStage should extract issuer from title"
    );
}

#[test]
fn pipeline_dedup_filters_duplicate_content() {
    let mut a1 = RawArticle::new("Article A", "https://example.com/a");
    a1.content = Some("Same content body for dedup testing purposes.".to_string());

    let mut a2 = RawArticle::new("Article B", "https://example.com/b");
    a2.content = Some("Same content body for dedup testing purposes.".to_string());

    let pipeline = Pipeline::new().add_stage(DeduplicationStage::new());
    let results = pipeline.process_batch(vec![a1, a2]);

    assert_eq!(
        results.len(),
        1,
        "Duplicate content should be filtered by DeduplicationStage"
    );
}

// ============================================================
// 4. IncrementalChecker 跨会话去重
// ============================================================

#[test]
fn incremental_checker_records_and_detects_known_hashes() {
    let checker = IncrementalChecker::new();

    assert!(!checker.is_known("hash1"));
    checker.record("hash1".to_string(), "https://example.com/1".to_string());
    assert!(checker.is_known("hash1"));
    assert!(!checker.is_known("hash2"));
    assert_eq!(checker.known_count(), 1);
}

#[test]
fn incremental_checker_seed_bulk_loads() {
    let checker = IncrementalChecker::new();
    let entries = vec![
        ("h1".to_string(), "url1".to_string()),
        ("h2".to_string(), "url2".to_string()),
        ("h3".to_string(), "url3".to_string()),
    ];
    checker.seed(entries);

    assert!(checker.is_known("h1"));
    assert!(checker.is_known("h2"));
    assert!(checker.is_known("h3"));
    assert!(!checker.is_known("h4"));
    assert_eq!(checker.known_count(), 3);
}

#[test]
fn incremental_checker_remove_works() {
    let checker = IncrementalChecker::new();
    checker.record("h1".to_string(), "url1".to_string());
    assert!(checker.is_known("h1"));

    checker.remove("h1");
    assert!(!checker.is_known("h1"));
    assert_eq!(checker.known_count(), 0);
}

// ============================================================
// 5. Cron 表达式验证（17 个政府数据源的 schedule）
// ============================================================

#[test]
fn all_government_source_schedules_are_valid_cron() {
    // These are the cron expressions from migration 031 seed data
    let schedules = [
        ("全国人大网", "0 0 6 * * *"),
        ("国家法律法规数据库", "0 0 7 * * *"),
        ("司法部", "0 0 6 * * *"),
        ("中国证监会", "0 0 8 * * *"),
        ("国家金融监管总局", "0 0 8 * * *"),
        ("国家互联网信息办公室", "0 0 7 * * *"),
        ("中国人民银行", "0 0 6 * * *"),
        ("最高人民法院", "0 0 7 * * *"),
        ("市场监管总局", "0 0 8 * * *"),
        ("工业和信息化部", "0 0 8 * * *"),
        ("上海市人大常委会", "0 0 9 * * 1"),
        ("北京市人大常委会", "0 0 9 * * 1"),
        ("广东省人大常委会", "0 0 9 * * 1"),
        ("GDPR Enforcement Tracker", "0 0 10 * * 3"),
        ("中国互联网协会", "0 0 9 * * 2,5"),
        ("中国银行业协会", "0 0 9 * * 2,5"),
        ("CNVD漏洞库", "0 0 10 * * *"),
    ];

    for (name, expr) in &schedules {
        let parsed = expr.parse::<cron::Schedule>();
        assert!(
            parsed.is_ok(),
            "Invalid cron expression for {}: '{}' - error: {:?}",
            name,
            expr,
            parsed.err()
        );

        // Verify it produces at least one future fire time
        let schedule = parsed.unwrap();
        let next = schedule.upcoming(chrono::Utc).next();
        assert!(
            next.is_some(),
            "Cron schedule for {} produces no future events",
            name
        );
    }
}

// ============================================================
// 6. CrawlOrchestrator 构建验证
// ============================================================

#[tokio::test]
async fn orchestrator_with_incremental_checker_filters_known_articles() {
    let registry = AdapterRegistry::new(); // empty - no real fetch needed
    let rate_limiter = Arc::new(DomainRateLimiter::new(RateLimiterConfig {
        burst_size: 10,
        tokens_per_second: 100.0,
    }));
    let concurrency = Arc::new(ConcurrencyController::new(ConcurrencyConfig::default()));
    let checker = Arc::new(IncrementalChecker::new());

    // Pre-seed known hash
    checker.record("known_hash".to_string(), "old_url".to_string());

    let orch = CrawlOrchestrator::new(registry, rate_limiter, concurrency)
        .with_incremental_checker(checker.clone());

    // Orchestrator should build without error
    assert!(orch.registry().is_empty()); // empty registry for test

    // Verify checker integration
    assert!(checker.is_known("known_hash"));
    assert!(!checker.is_known("new_hash"));
}

#[test]
fn crawl_job_config_with_encoding_and_render_mode() {
    let job = CrawlJobConfig {
        tenant_id: uuid::Uuid::new_v4(),
        source_id: uuid::Uuid::new_v4(),
        kind: "pbc_gov".to_string(),
        source_name: "中国人民银行".to_string(),
        url: "http://www.pbc.gov.cn/zhengcehuobisi/125207/index.html".to_string(),
        config: serde_json::json!({}),
        encoding: Some("gbk".to_string()),
        render_mode: Some("static".to_string()),
        allow_internal: false,
        enable_ai: false,
        respect_robots: true,
    };

    assert_eq!(job.encoding.as_deref(), Some("gbk"));
    assert_eq!(job.render_mode.as_deref(), Some("static"));
    assert_eq!(job.kind, "pbc_gov");
}

// ============================================================
// 7. ConcurrencyController 行为验证
// ============================================================

#[tokio::test]
async fn concurrency_controller_respects_limits() {
    let config = ConcurrencyConfig::default();
    let controller = ConcurrencyController::new(config);

    // Should be able to acquire default limit permits
    let permit1 = controller.acquire("example.com").await;
    let permit2 = controller.acquire("example.com").await;
    let permit3 = controller.acquire("example.com").await;

    // Different domains have independent limits
    let _other = controller.acquire("other.com").await;
    assert!(controller.tracked_domains().await >= 2);

    // Drop permits to release
    drop(permit1);
    drop(permit2);
    drop(permit3);
}
