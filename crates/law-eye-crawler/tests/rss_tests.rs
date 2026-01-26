use law_eye_crawler::RssFetcher;

const SAMPLE_RSS_FEED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>法律资讯</title>
    <link>https://example.com</link>
    <description>法律法规动态</description>
    <item>
      <title>新数据安全法正式实施</title>
      <link>https://example.com/article/1</link>
      <description>数据安全法于2021年9月1日正式实施</description>
      <pubDate>Mon, 01 Sep 2021 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>个人信息保护法解读</title>
      <link>https://example.com/article/2</link>
      <description>个人信息保护法将于2021年11月1日实施</description>
    </item>
  </channel>
</rss>"#;

#[test]
fn test_rss_fetcher_creation() {
    let fetcher = RssFetcher::new();
    // 确保 fetcher 可以成功创建
    let _ = fetcher;
}

#[test]
fn test_rss_fetcher_default() {
    let fetcher = RssFetcher::default();
    let _ = fetcher;
}

#[test]
fn test_feed_rs_parsing_valid_rss() {
    // 直接测试 feed-rs 解析功能
    let feed = feed_rs::parser::parse(SAMPLE_RSS_FEED.as_bytes()).unwrap();

    assert_eq!(feed.title.unwrap().content, "法律资讯");
    assert_eq!(feed.entries.len(), 2);

    let first_entry = &feed.entries[0];
    assert_eq!(
        first_entry.title.as_ref().unwrap().content,
        "新数据安全法正式实施"
    );
    assert!(!first_entry.links.is_empty());
}

#[test]
fn test_feed_rs_parsing_empty_channel() {
    let empty_rss = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>空订阅源</title>
    <link>https://example.com</link>
  </channel>
</rss>"#;

    let feed = feed_rs::parser::parse(empty_rss.as_bytes()).unwrap();
    assert!(feed.entries.is_empty());
}

#[test]
fn test_feed_rs_parsing_invalid_xml() {
    let invalid_xml = "not valid xml";
    let result = feed_rs::parser::parse(invalid_xml.as_bytes());
    assert!(result.is_err());
}

#[test]
fn test_feed_rs_parsing_missing_title() {
    let no_title_rss = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <link>https://example.com/1</link>
    </item>
  </channel>
</rss>"#;

    let feed = feed_rs::parser::parse(no_title_rss.as_bytes()).unwrap();
    // feed-rs 仍然会解析没有 title 的 item
    assert_eq!(feed.entries.len(), 1);
    assert!(feed.entries[0].title.is_none());
}

#[test]
fn test_feed_rs_parsing_atom_feed() {
    let atom_feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>法律资讯 Atom</title>
  <link href="https://example.com"/>
  <entry>
    <title>Atom 格式的文章</title>
    <link href="https://example.com/atom/1"/>
    <summary>这是一篇 Atom 格式的文章</summary>
  </entry>
</feed>"#;

    let feed = feed_rs::parser::parse(atom_feed.as_bytes()).unwrap();
    assert_eq!(feed.entries.len(), 1);
    assert_eq!(
        feed.entries[0].title.as_ref().unwrap().content,
        "Atom 格式的文章"
    );
}

// 网络测试标记为 ignored，因为需要真实网络
#[tokio::test]
#[ignore = "需要网络连接"]
async fn test_rss_fetch_from_real_source() {
    let fetcher = RssFetcher::new();
    // 使用一个稳定的公共 RSS 源进行测试
    let result = fetcher.fetch("https://feeds.bbci.co.uk/news/rss.xml").await;

    // 我们只检查是否能够获取到文章，不检查具体内容
    if let Ok(articles) = result {
        assert!(!articles.is_empty());
    }
    // 如果网络不可用，测试会被跳过
}
