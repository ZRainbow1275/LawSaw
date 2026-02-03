//! WebSpider 爬虫测试
//! 测试使用 CSS 选择器爬取公开网页

use law_eye_crawler::{SpiderConfig, WebSpider};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let spider = WebSpider::new()?;

    println!("\n========================================");
    println!("  LawSaw WebSpider 爬虫功能测试");
    println!("========================================\n");

    // 测试 1: Hacker News (简单公开页面)
    println!("📡 测试 1: Hacker News 首页");
    let hn_config = SpiderConfig {
        list_selector: ".athing".to_string(),
        title_selector: ".titleline > a".to_string(),
        link_selector: ".titleline > a".to_string(),
        content_selector: None,
        date_selector: None,
        delay_ms: None,
    };

    match spider
        .fetch("https://news.ycombinator.com/", &hn_config, false)
        .await
    {
        Ok(articles) => {
            println!("   ✅ 成功获取 {} 篇文章", articles.len());
            for (i, article) in articles.iter().take(5).enumerate() {
                let title_preview: String = article.title.chars().take(60).collect();
                println!(
                    "      {}. {}{}",
                    i + 1,
                    title_preview,
                    if article.title.chars().count() > 60 {
                        "..."
                    } else {
                        ""
                    }
                );
            }
        }
        Err(e) => println!("   ❌ 爬取失败: {}", e),
    }
    println!();

    // 测试 2: GitHub Trending
    println!("📡 测试 2: GitHub Trending (Rust)");
    let gh_config = SpiderConfig {
        list_selector: "article.Box-row".to_string(),
        title_selector: "h2 a".to_string(),
        link_selector: "h2 a".to_string(),
        content_selector: Some("p.col-9".to_string()),
        date_selector: None,
        delay_ms: None,
    };

    match spider
        .fetch("https://github.com/trending/rust?since=daily", &gh_config, false)
        .await
    {
        Ok(articles) => {
            println!("   ✅ 成功获取 {} 个项目", articles.len());
            for (i, article) in articles.iter().take(5).enumerate() {
                let title_preview: String = article.title.chars().take(60).collect();
                println!("      {}. {}", i + 1, title_preview.trim());
            }
        }
        Err(e) => println!("   ❌ 爬取失败: {}", e),
    }
    println!();

    // 测试 3: 中国法律信息网 (公开)
    println!("📡 测试 3: 中华人民共和国司法部");
    let moj_config = SpiderConfig {
        list_selector: ".main-l-list li".to_string(),
        title_selector: "a".to_string(),
        link_selector: "a".to_string(),
        content_selector: None,
        date_selector: Some("span".to_string()),
        delay_ms: None,
    };

    match spider
        .fetch(
            "https://www.moj.gov.cn/pub/sfbgw/ywdt/ywdt.html",
            &moj_config,
            false,
        )
        .await
    {
        Ok(articles) => {
            if articles.is_empty() {
                println!("   ⚠️ 未匹配到文章 (可能需要调整选择器)");
            } else {
                println!("   ✅ 成功获取 {} 篇文章", articles.len());
                for (i, article) in articles.iter().take(5).enumerate() {
                    let title_preview: String = article.title.chars().take(50).collect();
                    println!("      {}. {}", i + 1, title_preview);
                }
            }
        }
        Err(e) => println!("   ❌ 爬取失败: {}", e),
    }
    println!();

    println!("========================================");
    println!("  WebSpider 测试完成");
    println!("========================================\n");

    Ok(())
}
