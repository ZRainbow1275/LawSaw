use once_cell::sync::Lazy;
use regex::Regex;
use tracing::trace;

use crate::pipeline::{PipelineStage, RawArticle};

/// HTML cleaning and text normalization stage.
///
/// - Converts block-level HTML tags to newlines
/// - Strips remaining HTML tags
/// - Decodes common HTML entities
/// - Normalizes whitespace (collapses runs, trims)
/// - Normalizes Chinese punctuation variants
pub struct CleaningStage;

static HTML_TAG_RE: Lazy<Option<Regex>> = Lazy::new(|| Regex::new(r"<[^>]+>").ok());

/// Matches HTML entities: named (&amp; &lt; etc.) and numeric (&#123; &#x1F; etc.)
static HTML_ENTITY_RE: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r"&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);").ok());

/// Matches consecutive whitespace (excluding newlines) for collapsing.
static MULTI_SPACE_RE: Lazy<Option<Regex>> = Lazy::new(|| Regex::new(r"[^\S\n]+").ok());

/// Matches 3+ consecutive newlines for collapsing.
static MULTI_NEWLINE_RE: Lazy<Option<Regex>> = Lazy::new(|| Regex::new(r"\n{3,}").ok());

impl PipelineStage for CleaningStage {
    fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        // 1. Trim and normalize title
        article.title = normalize_whitespace(article.title.trim());

        // 2. Clean content if present
        if let Some(content) = &article.content {
            let cleaned = clean_html_content(content);
            article.content = if cleaned.is_empty() {
                None
            } else {
                Some(cleaned)
            };
        }

        trace!(title = %article.title, "CleaningStage processed");
        Some(article)
    }
}

fn clean_html_content(raw: &str) -> String {
    // Step 1: Convert block-level tags to newlines (preserving structure).
    let mut text = raw.to_string();

    // Headings: preserve as uppercase lines
    for tag in ["h1", "h2", "h3", "h4", "h5", "h6"] {
        let open = format!("<{tag}");
        let close = format!("</{tag}>");
        // Handle <h1>, <h1 class="...">, etc.
        text = replace_tag_with_newline(&text, &open, &close);
    }

    // Block-level tags -> newlines
    for tag in ["p", "div", "li", "tr", "blockquote", "section", "article"] {
        let open = format!("<{tag}");
        let close = format!("</{tag}>");
        text = replace_tag_with_newline(&text, &open, &close);
    }

    // <br> variants (all forms)
    text = text.replace("<br>", "\n");
    text = text.replace("<br/>", "\n");
    text = text.replace("<br />", "\n");
    text = text.replace("<BR>", "\n");
    text = text.replace("<BR/>", "\n");
    text = text.replace("<BR />", "\n");

    // Table cells -> space separator
    text = text.replace("</td>", " ");
    text = text.replace("</th>", " ");

    // Step 2: Strip all remaining HTML tags
    if let Some(re) = HTML_TAG_RE.as_ref() {
        text = re.replace_all(&text, "").to_string();
    }

    // Step 3: Decode HTML entities
    text = decode_html_entities(&text);

    // Step 4: Normalize Chinese punctuation variants
    text = normalize_chinese_punctuation(&text);

    // Step 5: Normalize whitespace
    text = normalize_whitespace(&text);

    text
}

/// Replace opening and closing tags with newlines.
/// Handles tags with attributes (e.g. `<p class="x">`).
fn replace_tag_with_newline(text: &str, open_prefix: &str, close_tag: &str) -> String {
    let lower = text.to_lowercase();
    let open_lower = open_prefix.to_lowercase();
    let close_lower = close_tag.to_lowercase();

    let mut result = String::with_capacity(text.len());
    let mut pos = 0;

    while pos < text.len() {
        // Ensure we're at a char boundary
        if !text.is_char_boundary(pos) {
            pos += 1;
            continue;
        }

        // Check for closing tag first
        if lower[pos..].starts_with(&close_lower) {
            result.push('\n');
            pos += close_tag.len();
            continue;
        }

        // Check for opening tag (may have attributes)
        if lower[pos..].starts_with(&open_lower) {
            // Find the closing '>'
            if let Some(end) = text[pos..].find('>') {
                result.push('\n');
                pos += end + 1;
                continue;
            }
        }

        // Advance one full UTF-8 character
        let ch = &text[pos..];
        if let Some(c) = ch.chars().next() {
            result.push(c);
            pos += c.len_utf8();
        } else {
            pos += 1;
        }
    }

    result
}

/// Decode common HTML entities.
fn decode_html_entities(text: &str) -> String {
    let entity_re = match HTML_ENTITY_RE.as_ref() {
        Some(re) => re,
        None => return text.to_string(),
    };

    entity_re
        .replace_all(text, |caps: &regex::Captures| {
            let entity = &caps[0];
            match entity {
                "&amp;" => "&".to_string(),
                "&lt;" => "<".to_string(),
                "&gt;" => ">".to_string(),
                "&quot;" => "\"".to_string(),
                "&apos;" => "'".to_string(),
                "&nbsp;" => " ".to_string(),
                "&mdash;" => "\u{2014}".to_string(),
                "&ndash;" => "\u{2013}".to_string(),
                "&laquo;" => "\u{00AB}".to_string(),
                "&raquo;" => "\u{00BB}".to_string(),
                "&hellip;" => "\u{2026}".to_string(),
                "&bull;" => "\u{2022}".to_string(),
                "&copy;" => "\u{00A9}".to_string(),
                "&reg;" => "\u{00AE}".to_string(),
                "&trade;" => "\u{2122}".to_string(),
                _ => {
                    // Try numeric entities: &#123; or &#x1F;
                    if let Some(rest) = entity.strip_prefix("&#x").or_else(|| entity.strip_prefix("&#X")) {
                        if let Some(hex) = rest.strip_suffix(';') {
                            if let Ok(code) = u32::from_str_radix(hex, 16) {
                                if let Some(ch) = char::from_u32(code) {
                                    return ch.to_string();
                                }
                            }
                        }
                    } else if let Some(rest) = entity.strip_prefix("&#") {
                        if let Some(num) = rest.strip_suffix(';') {
                            if let Ok(code) = num.parse::<u32>() {
                                if let Some(ch) = char::from_u32(code) {
                                    return ch.to_string();
                                }
                            }
                        }
                    }
                    entity.to_string()
                }
            }
        })
        .to_string()
}

/// Normalize Chinese punctuation variants to standard forms.
fn normalize_chinese_punctuation(text: &str) -> String {
    text.replace('（', "(")
        .replace('）', ")")
        .replace('【', "[")
        .replace('】', "]")
        .replace('　', " ") // Fullwidth space -> ASCII space
}

/// Collapse multiple spaces into one, multiple newlines into two, and trim.
fn normalize_whitespace(text: &str) -> String {
    let mut result = text.to_string();

    // Collapse horizontal whitespace (tabs, multiple spaces) into single space
    if let Some(re) = MULTI_SPACE_RE.as_ref() {
        result = re.replace_all(&result, " ").to_string();
    }

    // Collapse 3+ newlines into 2 (preserving paragraph breaks)
    if let Some(re) = MULTI_NEWLINE_RE.as_ref() {
        result = re.replace_all(&result, "\n\n").to_string();
    }

    // Trim each line and the whole string
    result
        .lines()
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
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
    fn trims_title() {
        let result = CleaningStage.process(make("  标题  ", None)).unwrap();
        assert_eq!(result.title, "标题");
    }

    #[test]
    fn strips_html_tags() {
        let result = CleaningStage
            .process(make("t", Some("<p>这是<strong>重要</strong>内容</p>")))
            .unwrap();
        let c = result.content.unwrap();
        assert!(!c.contains('<'));
        assert!(c.contains("这是"));
        assert!(c.contains("重要"));
    }

    #[test]
    fn converts_all_br_variants() {
        let result = CleaningStage
            .process(make("t", Some("a<br>b<br/>c<br />d<BR>e")))
            .unwrap();
        let c = result.content.unwrap();
        assert_eq!(c.lines().count(), 5);
    }

    #[test]
    fn decodes_html_entities() {
        let result = CleaningStage
            .process(make("t", Some("A &amp; B &lt; C &gt; D &quot;E&quot;")))
            .unwrap();
        let c = result.content.unwrap();
        assert!(c.contains("A & B < C > D \"E\""));
    }

    #[test]
    fn decodes_numeric_entities() {
        let result = CleaningStage
            .process(make("t", Some("&#169; &#x2764;")))
            .unwrap();
        let c = result.content.unwrap();
        assert!(c.contains('\u{00A9}')); // ©
        assert!(c.contains('\u{2764}')); // ❤
    }

    #[test]
    fn normalizes_chinese_punctuation() {
        let result = CleaningStage
            .process(make("t", Some("国务院（2026）第1号")))
            .unwrap();
        let c = result.content.unwrap();
        assert!(c.contains("(2026)"));
    }

    #[test]
    fn collapses_whitespace() {
        let result = CleaningStage
            .process(make("t", Some("a  b\n\n\n\n\nc")))
            .unwrap();
        let c = result.content.unwrap();
        assert!(!c.contains("  ")); // no double spaces
        assert!(!c.contains("\n\n\n")); // max 2 newlines
    }

    #[test]
    fn preserves_heading_structure() {
        let result = CleaningStage
            .process(make("t", Some("<h2>标题</h2><p>正文段落</p>")))
            .unwrap();
        let c = result.content.unwrap();
        assert!(c.contains("标题"));
        assert!(c.contains("正文段落"));
        // Both should be on separate lines
        assert!(c.lines().count() >= 2);
    }

    #[test]
    fn none_content_stays_none() {
        let result = CleaningStage.process(make("t", None)).unwrap();
        assert!(result.content.is_none());
    }

    #[test]
    fn empty_content_becomes_none() {
        let result = CleaningStage
            .process(make("t", Some("<p>  </p>")))
            .unwrap();
        assert!(result.content.is_none());
    }
}
