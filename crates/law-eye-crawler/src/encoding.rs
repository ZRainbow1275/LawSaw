//! Multi-level character encoding detection and conversion.
//!
//! Chinese government websites commonly use GBK/GB2312/GB18030 encodings.
//! This module implements a three-level detection strategy:
//!
//! 1. HTTP `Content-Type` header charset parameter
//! 2. HTML `<meta>` charset declaration
//! 3. Byte-level encoding sniffing via `encoding_rs`
//!
//! Fallback: UTF-8 with replacement characters.

use encoding_rs::Encoding;
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::debug;

/// Regex to extract `charset=XXX` from HTTP Content-Type header.
static CHARSET_FROM_HEADER_RE: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r"(?i)charset\s*=\s*([^\s;]+)").ok());

/// Regex to extract charset from `<meta charset="XXX">`.
static META_CHARSET_RE: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r#"(?i)<meta[^>]+charset\s*=\s*"?([^"\s;>]+)"?"#).ok());

/// Regex to extract charset from `<meta http-equiv="Content-Type" content="text/html; charset=XXX">`.
static META_HTTP_EQUIV_RE: Lazy<Option<Regex>> =
    Lazy::new(|| Regex::new(r#"(?i)<meta[^>]+content\s*=\s*"[^"]*charset\s*=\s*([^"\s;>]+)"#).ok());

/// Detect encoding and decode raw bytes into a UTF-8 string.
///
/// Uses a three-level detection strategy with graceful fallback.
///
/// # Arguments
/// * `bytes` - Raw response body bytes
/// * `content_type` - Optional HTTP `Content-Type` header value
/// * `encoding_hint` - Optional encoding override from source configuration
///
/// # Returns
/// Decoded UTF-8 string. Never fails; worst case uses lossy UTF-8 conversion.
pub fn detect_and_decode(
    bytes: &[u8],
    content_type: Option<&str>,
    encoding_hint: Option<&str>,
) -> String {
    // Level 0: Explicit encoding hint from source configuration
    if let Some(hint) = encoding_hint {
        if let Some(text) = try_decode_with_label(bytes, hint) {
            debug!(
                encoding = hint,
                level = "hint",
                "decoded with source encoding hint"
            );
            return text;
        }
    }

    // Level 1: HTTP Content-Type header charset
    if let Some(charset) = charset_from_content_type(content_type) {
        if let Some(text) = try_decode_with_label(bytes, &charset) {
            debug!(
                encoding = %charset,
                level = "http_header",
                "decoded with HTTP Content-Type charset"
            );
            return text;
        }
    }

    // Level 2: HTML meta charset (only scan first 2048 bytes for performance)
    let scan_len = bytes.len().min(2048);
    let partial = String::from_utf8_lossy(&bytes[..scan_len]);
    if let Some(charset) = charset_from_html_meta(&partial) {
        if let Some(text) = try_decode_with_label(bytes, &charset) {
            debug!(
                encoding = %charset,
                level = "html_meta",
                "decoded with HTML meta charset"
            );
            return text;
        }
    }

    // Level 3: Byte-level sniffing via encoding_rs BOM detection
    if let (Some(encoding), true) = detect_bom(bytes) {
        let (decoded, _, had_errors) = encoding.decode(bytes);
        if !had_errors {
            debug!(
                encoding = encoding.name(),
                level = "bom",
                "decoded with BOM detection"
            );
            return decoded.into_owned();
        }
    }

    // Level 4: Try common Chinese encodings heuristically
    if let Some(text) = try_chinese_encodings(bytes) {
        return text;
    }

    // Fallback: UTF-8 with replacement
    debug!(level = "fallback", "falling back to lossy UTF-8");
    String::from_utf8_lossy(bytes).into_owned()
}

/// Extract charset from HTTP Content-Type header value.
///
/// Example: `"text/html; charset=gbk"` → `Some("gbk")`
fn charset_from_content_type(content_type: Option<&str>) -> Option<String> {
    let ct = content_type?;
    let re = CHARSET_FROM_HEADER_RE.as_ref()?;
    let caps = re.captures(ct)?;
    Some(caps.get(1)?.as_str().trim().to_lowercase())
}

/// Extract charset from HTML `<meta>` tags.
///
/// Supports both formats:
/// - `<meta charset="utf-8">`
/// - `<meta http-equiv="Content-Type" content="text/html; charset=gbk">`
fn charset_from_html_meta(html_prefix: &str) -> Option<String> {
    // Try <meta charset="..."> first
    if let Some(re) = META_CHARSET_RE.as_ref() {
        if let Some(caps) = re.captures(html_prefix) {
            return Some(caps.get(1)?.as_str().trim().to_lowercase());
        }
    }

    // Try <meta http-equiv="Content-Type" content="...charset=...">
    if let Some(re) = META_HTTP_EQUIV_RE.as_ref() {
        if let Some(caps) = re.captures(html_prefix) {
            return Some(caps.get(1)?.as_str().trim().to_lowercase());
        }
    }

    None
}

/// Try to decode bytes using a named encoding label.
///
/// Returns `None` if the label is unrecognized or decoding produces errors.
fn try_decode_with_label(bytes: &[u8], label: &str) -> Option<String> {
    let encoding = Encoding::for_label(label.as_bytes())?;

    // If the resolved encoding is UTF-8, just validate directly
    if encoding == encoding_rs::UTF_8 {
        return String::from_utf8(bytes.to_vec()).ok();
    }

    let (decoded, _encoding_used, had_errors) = encoding.decode(bytes);
    if had_errors {
        None
    } else {
        Some(decoded.into_owned())
    }
}

/// Detect BOM (Byte Order Mark) at the start of the byte stream.
fn detect_bom(bytes: &[u8]) -> (Option<&'static Encoding>, bool) {
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        return (Some(encoding_rs::UTF_8), true);
    }
    if bytes.len() >= 2 {
        if bytes[0] == 0xFF && bytes[1] == 0xFE {
            return (Some(encoding_rs::UTF_16LE), true);
        }
        if bytes[0] == 0xFE && bytes[1] == 0xFF {
            return (Some(encoding_rs::UTF_16BE), true);
        }
    }
    (None, false)
}

/// Try common Chinese encodings (GBK, GB18030) heuristically.
///
/// GBK/GB2312 are subsets of GB18030. We try GBK first (most common for
/// Chinese government sites), then GB18030 as a superset fallback.
fn try_chinese_encodings(bytes: &[u8]) -> Option<String> {
    // Quick check: if it's valid UTF-8, use that directly
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Some(text.to_string());
    }

    // Try GBK (covers GB2312 as well, most common for Chinese gov sites)
    let (decoded, _, had_errors) = encoding_rs::GBK.decode(bytes);
    if !had_errors {
        debug!(
            encoding = "gbk",
            level = "heuristic",
            "decoded with GBK heuristic"
        );
        return Some(decoded.into_owned());
    }

    // Try GB18030 (superset of GBK, handles more characters)
    let (decoded, _, had_errors) = encoding_rs::GB18030.decode(bytes);
    if !had_errors {
        debug!(
            encoding = "gb18030",
            level = "heuristic",
            "decoded with GB18030 heuristic"
        );
        return Some(decoded.into_owned());
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_bytes_decoded_correctly() {
        let text = "Hello, 世界！法律法规";
        let bytes = text.as_bytes();
        let result = detect_and_decode(bytes, None, None);
        assert_eq!(result, text);
    }

    #[test]
    fn gbk_bytes_with_header_charset() {
        // "法律" in GBK encoding
        let text = "法律";
        let (encoded, _, _) = encoding_rs::GBK.encode(text);
        let result = detect_and_decode(&encoded, Some("text/html; charset=gbk"), None);
        assert_eq!(result, text);
    }

    #[test]
    fn gbk_bytes_with_meta_charset() {
        let text = "法律法规数据库";
        let html = format!(
            r#"<html><head><meta charset="gbk"><title>{}</title></head></html>"#,
            text
        );
        let (encoded, _, _) = encoding_rs::GBK.encode(&html);
        let result = detect_and_decode(&encoded, None, None);
        assert!(
            result.contains(text),
            "Expected '{}' in result: {}",
            text,
            result
        );
    }

    #[test]
    fn gbk_bytes_with_meta_http_equiv() {
        let text = "人民银行公告";
        let html = format!(
            r#"<html><head><meta http-equiv="Content-Type" content="text/html; charset=gbk"><title>{}</title></head></html>"#,
            text
        );
        let (encoded, _, _) = encoding_rs::GBK.encode(&html);
        let result = detect_and_decode(&encoded, None, None);
        assert!(
            result.contains(text),
            "Expected '{}' in result: {}",
            text,
            result
        );
    }

    #[test]
    fn encoding_hint_overrides_everything() {
        let text = "证监会行政处罚";
        let (encoded, _, _) = encoding_rs::GBK.encode(text);
        // Even without any header/meta, the hint should work
        let result = detect_and_decode(&encoded, None, Some("gbk"));
        assert_eq!(result, text);
    }

    #[test]
    fn gb2312_detected_as_gbk_subset() {
        // GB2312 is a subset of GBK; encoding_rs maps "gb2312" to GBK
        let text = "国家法律法规";
        let (encoded, _, _) = encoding_rs::GBK.encode(text);
        let result = detect_and_decode(&encoded, Some("text/html; charset=gb2312"), None);
        assert_eq!(result, text);
    }

    #[test]
    fn gb18030_decoded_correctly() {
        let text = "中华人民共和国宪法";
        let (encoded, _, _) = encoding_rs::GB18030.encode(text);
        let result = detect_and_decode(&encoded, Some("text/html; charset=gb18030"), None);
        assert_eq!(result, text);
    }

    #[test]
    fn utf8_bom_detected() {
        let text = "带BOM的UTF-8文本";
        let mut bytes = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM
        bytes.extend_from_slice(text.as_bytes());
        let result = detect_and_decode(&bytes, None, None);
        // BOM is typically stripped by encoding_rs
        assert!(result.contains("UTF-8文本"));
    }

    #[test]
    fn empty_bytes_return_empty_string() {
        let result = detect_and_decode(&[], None, None);
        assert_eq!(result, "");
    }

    #[test]
    fn charset_from_content_type_extracts_correctly() {
        assert_eq!(
            charset_from_content_type(Some("text/html; charset=gbk")),
            Some("gbk".to_string())
        );
        assert_eq!(
            charset_from_content_type(Some("text/html; charset=UTF-8")),
            Some("utf-8".to_string())
        );
        assert_eq!(
            charset_from_content_type(Some("text/html; charset = GB2312")),
            Some("gb2312".to_string())
        );
        assert_eq!(charset_from_content_type(Some("text/html")), None);
        assert_eq!(charset_from_content_type(None), None);
    }

    #[test]
    fn charset_from_html_meta_extracts_both_formats() {
        assert_eq!(
            charset_from_html_meta(r#"<meta charset="gbk">"#),
            Some("gbk".to_string())
        );
        assert_eq!(
            charset_from_html_meta(
                r#"<meta http-equiv="Content-Type" content="text/html; charset=gb2312">"#
            ),
            Some("gb2312".to_string())
        );
        assert_eq!(charset_from_html_meta("<html><head></head>"), None);
    }

    #[test]
    fn gbk_heuristic_fallback_works() {
        // GBK bytes without any charset declaration
        let text = "行政处罚决定书";
        let (encoded, _, _) = encoding_rs::GBK.encode(text);
        // No content_type, no hint, no meta in content
        let result = detect_and_decode(&encoded, None, None);
        assert_eq!(result, text);
    }
}
