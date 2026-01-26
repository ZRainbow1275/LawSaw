use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DigestArticle {
    pub title: String,
    pub link: String,
    pub summary: Option<String>,
    pub category_name: String,
    pub category_icon: String,
    pub category_color: String,
    pub risk_score: Option<i32>,
    pub importance: Option<i32>,
    pub published_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyDigest {
    pub date: String,
    pub total_count: usize,
    pub categories: Vec<CategorySection>,
    pub highlights: Vec<DigestArticle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySection {
    pub name: String,
    pub icon: String,
    pub color: String,
    pub articles: Vec<DigestArticle>,
}

pub trait EmailTemplate {
    fn render(&self) -> String;
}

pub struct EmailTemplateEngine;

impl EmailTemplateEngine {
    pub fn render_daily_digest(digest: &DailyDigest) -> String {
        let mut html = String::new();

        html.push_str(&Self::render_header(&digest.date, digest.total_count));
        html.push_str(&Self::render_highlights(&digest.highlights));

        for category in &digest.categories {
            html.push_str(&Self::render_category_section(category));
        }

        html.push_str(&Self::render_footer());

        Self::wrap_in_layout(&html)
    }

    fn wrap_in_layout(content: &str) -> String {
        format!(
            r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>法眼日报</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 680px;
            margin: 0 auto;
            background: #fff;
        }}
        .header {{
            background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
            color: #fff;
            padding: 32px 24px;
            text-align: center;
        }}
        .header h1 {{
            font-size: 28px;
            margin-bottom: 8px;
        }}
        .header .subtitle {{
            font-size: 14px;
            opacity: 0.9;
        }}
        .stats {{
            display: flex;
            justify-content: center;
            gap: 32px;
            margin-top: 16px;
            font-size: 13px;
        }}
        .content {{
            padding: 24px;
        }}
        .section {{
            margin-bottom: 32px;
        }}
        .section-title {{
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .article {{
            padding: 16px;
            margin-bottom: 12px;
            background: #f8fafc;
            border-radius: 8px;
            border-left: 4px solid #3182ce;
        }}
        .article-title {{
            font-size: 16px;
            font-weight: 600;
            color: #1a365d;
            text-decoration: none;
            display: block;
            margin-bottom: 8px;
        }}
        .article-title:hover {{
            color: #3182ce;
        }}
        .article-meta {{
            font-size: 12px;
            color: #718096;
            display: flex;
            gap: 16px;
            margin-bottom: 8px;
        }}
        .article-summary {{
            font-size: 14px;
            color: #4a5568;
        }}
        .category-badge {{
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }}
        .risk-high {{
            color: #c53030;
            background: #fed7d7;
        }}
        .risk-medium {{
            color: #c05621;
            background: #feebc8;
        }}
        .risk-low {{
            color: #2f855a;
            background: #c6f6d5;
        }}
        .highlight {{
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
            border-left-color: #d69e2e;
        }}
        .footer {{
            background: #1a365d;
            color: #fff;
            padding: 24px;
            text-align: center;
            font-size: 12px;
        }}
        .footer a {{
            color: #90cdf4;
        }}
    </style>
</head>
<body>
    <div class="container">
        {content}
    </div>
</body>
</html>"#,
            content = content
        )
    }

    fn render_header(date: &str, total_count: usize) -> String {
        format!(
            r#"<div class="header">
    <h1>法眼日报</h1>
    <div class="subtitle">{date}</div>
    <div class="stats">
        <span>今日资讯: {total_count} 篇</span>
    </div>
</div>"#,
            date = date,
            total_count = total_count
        )
    }

    fn render_highlights(articles: &[DigestArticle]) -> String {
        if articles.is_empty() {
            return String::new();
        }

        let mut html = String::from(
            r#"<div class="content">
    <div class="section">
        <div class="section-title">🔥 今日要闻</div>"#,
        );

        for article in articles {
            html.push_str(&Self::render_article(article, true));
        }

        html.push_str("    </div>\n</div>");
        html
    }

    fn render_category_section(category: &CategorySection) -> String {
        if category.articles.is_empty() {
            return String::new();
        }

        let mut html = format!(
            r#"<div class="content">
    <div class="section">
        <div class="section-title">{icon} {name}</div>"#,
            icon = category.icon,
            name = category.name
        );

        for article in &category.articles {
            html.push_str(&Self::render_article(article, false));
        }

        html.push_str("    </div>\n</div>");
        html
    }

    fn render_article(article: &DigestArticle, is_highlight: bool) -> String {
        let highlight_class = if is_highlight { " highlight" } else { "" };
        let risk_badge = Self::render_risk_badge(article.risk_score);
        let summary = article
            .summary
            .as_ref()
            .map(|s| format!(r#"<div class="article-summary">{}</div>"#, s))
            .unwrap_or_default();

        format!(
            r#"
        <div class="article{highlight_class}">
            <a href="{link}" class="article-title" target="_blank">{title}</a>
            <div class="article-meta">
                <span class="category-badge" style="background: {color}20; color: {color};">
                    {icon} {category}
                </span>
                {risk_badge}
            </div>
            {summary}
        </div>"#,
            highlight_class = highlight_class,
            link = article.link,
            title = article.title,
            color = article.category_color,
            icon = article.category_icon,
            category = article.category_name,
            risk_badge = risk_badge,
            summary = summary
        )
    }

    fn render_risk_badge(risk_score: Option<i32>) -> String {
        match risk_score {
            Some(score) if score >= 70 => {
                format!(
                    r#"<span class="category-badge risk-high">风险: {}</span>"#,
                    score
                )
            }
            Some(score) if score >= 40 => {
                format!(
                    r#"<span class="category-badge risk-medium">风险: {}</span>"#,
                    score
                )
            }
            Some(score) if score > 0 => {
                format!(
                    r#"<span class="category-badge risk-low">风险: {}</span>"#,
                    score
                )
            }
            _ => String::new(),
        }
    }

    fn render_footer() -> String {
        String::from(
            r#"<div class="footer">
    <p>法眼 (Law Eye) - 您的法律资讯助手</p>
    <p style="margin-top: 8px;">
        <a href="{{unsubscribe_url}}">退订</a> |
        <a href="{{preferences_url}}">偏好设置</a> |
        <a href="{{web_version_url}}">网页版</a>
    </p>
    <p style="margin-top: 16px; opacity: 0.7;">
        本邮件由系统自动发送，如有问题请联系 support@laweye.com
    </p>
</div>"#,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_daily_digest() {
        let digest = DailyDigest {
            date: "2025年1月17日".to_string(),
            total_count: 5,
            categories: vec![CategorySection {
                name: "立法前沿".to_string(),
                icon: "📜".to_string(),
                color: "#3498DB".to_string(),
                articles: vec![DigestArticle {
                    title: "数据安全法实施细则发布".to_string(),
                    link: "https://example.com/1".to_string(),
                    summary: Some("关于数据安全法的最新解读".to_string()),
                    category_name: "立法前沿".to_string(),
                    category_icon: "📜".to_string(),
                    category_color: "#3498DB".to_string(),
                    risk_score: Some(45),
                    importance: Some(4),
                    published_at: None,
                }],
            }],
            highlights: vec![DigestArticle {
                title: "重要：个人信息保护法修订草案".to_string(),
                link: "https://example.com/2".to_string(),
                summary: Some("个保法迎来重大修订".to_string()),
                category_name: "立法前沿".to_string(),
                category_icon: "📜".to_string(),
                category_color: "#3498DB".to_string(),
                risk_score: Some(75),
                importance: Some(5),
                published_at: None,
            }],
        };

        let html = EmailTemplateEngine::render_daily_digest(&digest);

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("法眼日报"));
        assert!(html.contains("2025年1月17日"));
        assert!(html.contains("数据安全法实施细则发布"));
        assert!(html.contains("个人信息保护法修订草案"));
        assert!(html.contains("今日要闻"));
    }

    #[test]
    fn test_render_risk_badge() {
        assert!(EmailTemplateEngine::render_risk_badge(Some(80)).contains("risk-high"));
        assert!(EmailTemplateEngine::render_risk_badge(Some(50)).contains("risk-medium"));
        assert!(EmailTemplateEngine::render_risk_badge(Some(20)).contains("risk-low"));
        assert!(EmailTemplateEngine::render_risk_badge(None).is_empty());
    }

    #[test]
    fn test_empty_highlights() {
        let html = EmailTemplateEngine::render_highlights(&[]);
        assert!(html.is_empty());
    }

    #[test]
    fn test_empty_category() {
        let category = CategorySection {
            name: "空分类".to_string(),
            icon: "📋".to_string(),
            color: "#999".to_string(),
            articles: vec![],
        };
        let html = EmailTemplateEngine::render_category_section(&category);
        assert!(html.is_empty());
    }
}
