//! 全流程集成测试
//! 测试爬虫 -> Pipeline -> 数据结构的完整流程

use law_eye_crawler::{CleaningStage, Pipeline, RssFetcher, SpiderConfig, WebSpider};
use std::collections::HashSet;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    println!("\n╔════════════════════════════════════════════════════════════╗");
    println!("║            LawSaw 全流程集成测试                          ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    let mut all_passed = true;

    // ==============================
    // 测试 1: RSS 爬虫
    // ==============================
    println!("┌──────────────────────────────────────────────────────────┐");
    println!("│ 测试 1: RSS 爬虫                                         │");
    println!("└──────────────────────────────────────────────────────────┘");

    let rss_fetcher = RssFetcher::new()?;
    let rss_sources = vec![
        ("BBC 中文", "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"),
        ("Guardian Law", "https://www.theguardian.com/law/rss"),
        ("NPR News", "https://feeds.npr.org/1001/rss.xml"),
    ];

    let mut rss_total = 0;
    for (name, url) in &rss_sources {
        match rss_fetcher.fetch(url, false).await {
            Ok(articles) => {
                println!("  ✅ {} - {} 篇文章", name, articles.len());
                rss_total += articles.len();
            }
            Err(e) => {
                println!("  ❌ {} - 失败: {}", name, e);
                all_passed = false;
            }
        }
    }
    println!("  📊 RSS 总计: {} 篇文章\n", rss_total);

    // ==============================
    // 测试 2: WebSpider
    // ==============================
    println!("┌──────────────────────────────────────────────────────────┐");
    println!("│ 测试 2: WebSpider                                        │");
    println!("└──────────────────────────────────────────────────────────┘");

    let spider = WebSpider::new()?;
    let hn_config = SpiderConfig {
        list_selector: ".athing".to_string(),
        title_selector: ".titleline > a".to_string(),
        link_selector: ".titleline > a".to_string(),
        content_selector: None,
        date_selector: None,
        delay_ms: None,
        render_mode: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
        encoding: None,
    };

    match spider
        .fetch("https://news.ycombinator.com/", &hn_config, false)
        .await
    {
        Ok(articles) => {
            println!("  ✅ Hacker News - {} 篇文章", articles.len());
        }
        Err(e) => {
            println!("  ❌ Hacker News 失败: {}", e);
            all_passed = false;
        }
    }
    println!();

    // ==============================
    // 测试 3: Pipeline 处理
    // ==============================
    println!("┌──────────────────────────────────────────────────────────┐");
    println!("│ 测试 3: Pipeline 数据处理                                │");
    println!("└──────────────────────────────────────────────────────────┘");

    let pipeline = Pipeline::new().add_stage(CleaningStage);

    // 测试 HTML 清洗
    let test_articles = vec![
        {
            let mut a = law_eye_crawler::RawArticle::new(
                "  测试标题需要Trim  ",
                "https://example.com/test",
            );
            a.content = Some("<p>这是<br/>一段<b>HTML</b>内容</p>".to_string());
            a.author = Some("测试作者".to_string());
            a
        },
        {
            let mut a = law_eye_crawler::RawArticle::new(
                "中文法律法规：《民法典》解读",
                "https://example.com/law",
            );
            a.content = Some("纯文本内容，无需处理".to_string());
            a
        },
    ];

    let processed = pipeline.process_batch(test_articles);
    println!("  📥 输入: 2 篇文章");
    println!("  📤 输出: {} 篇文章", processed.len());

    for article in &processed {
        let is_trimmed = !article.title.starts_with(' ') && !article.title.ends_with(' ');
        let is_html_cleaned = article
            .content
            .as_ref()
            .map(|c| !c.contains('<') && !c.contains('>'))
            .unwrap_or(true);

        if is_trimmed && is_html_cleaned {
            println!(
                "  ✅ 标题: \"{}\" - 已清洗",
                article.title.chars().take(30).collect::<String>()
            );
        } else {
            println!("  ❌ 清洗失败: {}", article.title);
            all_passed = false;
        }
    }
    println!();

    // ==============================
    // 测试 4: 数据完整性
    // ==============================
    println!("┌──────────────────────────────────────────────────────────┐");
    println!("│ 测试 4: 数据完整性检查                                   │");
    println!("└──────────────────────────────────────────────────────────┘");

    // 获取真实数据检验
    match rss_fetcher
        .fetch("https://feeds.bbci.co.uk/zhongwen/simp/rss.xml", false)
        .await
    {
        Ok(articles) => {
            let processed = pipeline.process_batch(articles);

            // 检查必填字段
            let mut missing_fields = 0;
            let mut duplicate_links = HashSet::new();
            let mut duplicates = 0;

            for article in &processed {
                if article.title.is_empty() || article.link.is_empty() {
                    missing_fields += 1;
                }
                if !duplicate_links.insert(&article.link) {
                    duplicates += 1;
                }
            }

            println!("  📊 处理后文章数: {}", processed.len());
            println!("  ✅ 缺失字段数: {}", missing_fields);
            println!("  ✅ 重复链接数: {}", duplicates);

            if missing_fields > 0 || duplicates > 0 {
                all_passed = false;
            }
        }
        Err(e) => {
            println!("  ❌ 无法验证数据完整性: {}", e);
            all_passed = false;
        }
    }
    println!();

    // ==============================
    // 测试总结
    // ==============================
    println!("╔════════════════════════════════════════════════════════════╗");
    if all_passed {
        println!("║  ✅ 所有测试通过!                                         ║");
        println!("║                                                            ║");
        println!("║  系统各组件工作正常:                                       ║");
        println!("║  • RSS 爬虫 ✓                                             ║");
        println!("║  • WebSpider ✓                                            ║");
        println!("║  • Pipeline 处理 ✓                                        ║");
        println!("║  • 数据完整性 ✓                                           ║");
    } else {
        println!("║  ⚠️ 部分测试失败，请检查上方详细日志                      ║");
    }
    println!("╚════════════════════════════════════════════════════════════╝\n");

    Ok(())
}
