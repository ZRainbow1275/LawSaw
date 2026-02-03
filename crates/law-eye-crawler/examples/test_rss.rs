//! RSS 爬虫测试
//! 测试多个公开法律相关 RSS 源

use law_eye_crawler::{CleaningStage, Pipeline, RssFetcher};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let fetcher = RssFetcher::new();
    let pipeline = Pipeline::new().add_stage(CleaningStage);

    // 公开可用的新闻/法律 RSS 源 (已验证可用)
    let rss_sources = vec![
        // BBC 中文
        ("BBC 中文", "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"),
        // CNN 国际新闻
        ("CNN Top Stories", "http://rss.cnn.com/rss/edition.rss"),
        // NPR 新闻
        ("NPR News", "https://feeds.npr.org/1001/rss.xml"),
        // 纽约时报世界新闻
        (
            "NYT World",
            "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        ),
        // The Guardian 法律版块
        ("Guardian Law", "https://www.theguardian.com/law/rss"),
        // Hacker News
        ("Hacker News", "https://hnrss.org/frontpage"),
    ];

    println!("\n========================================");
    println!("  LawSaw RSS 爬虫功能测试");
    println!("========================================\n");

    let mut total_articles = 0;
    let mut successful_sources = 0;
    let mut failed_sources = Vec::new();

    for (name, url) in rss_sources {
        println!("📡 正在抓取: {} ({})", name, url);

        match fetcher.fetch(url, false).await {
            Ok(articles) => {
                let processed = pipeline.process_batch(articles);
                println!("   ✅ 成功获取 {} 篇文章", processed.len());

                // 显示前 3 篇文章标题
                for (i, article) in processed.iter().take(3).enumerate() {
                    let title_preview: String = article.title.chars().take(50).collect();
                    println!(
                        "      {}. {}{}",
                        i + 1,
                        title_preview,
                        if article.title.chars().count() > 50 {
                            "..."
                        } else {
                            ""
                        }
                    );
                }

                total_articles += processed.len();
                successful_sources += 1;
            }
            Err(e) => {
                println!("   ❌ 抓取失败: {}", e);
                failed_sources.push((name, e.to_string()));
            }
        }
        println!();
    }

    println!("========================================");
    println!("  测试结果汇总");
    println!("========================================");
    println!("✅ 成功源数量: {}", successful_sources);
    println!("❌ 失败源数量: {}", failed_sources.len());
    println!("📄 总文章数量: {}", total_articles);

    if !failed_sources.is_empty() {
        println!("\n失败详情:");
        for (name, err) in &failed_sources {
            println!("   - {}: {}", name, err);
        }
    }

    if successful_sources > 0 {
        println!("\n🎉 RSS 爬虫功能正常!");
    } else {
        println!("\n⚠️ 所有 RSS 源都失败，请检查网络连接");
    }

    Ok(())
}
