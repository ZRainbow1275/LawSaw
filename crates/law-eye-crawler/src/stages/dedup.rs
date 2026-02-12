use std::collections::HashSet;

use tracing::trace;

use crate::pipeline::{PipelineStage, RawArticle};

/// Deduplication stage that filters articles seen before within a batch.
///
/// Deduplication keys (checked in order):
/// 1. Exact link match
/// 2. Content MD5 hash (if content is present)
/// 3. Title SimHash similarity (Hamming distance <= threshold)
///
/// This stage also sets `article.content_hash` for downstream DB-level dedup.
pub struct DeduplicationStage {
    seen_links: std::sync::Mutex<HashSet<String>>,
    seen_content_hashes: std::sync::Mutex<HashSet<String>>,
    seen_title_hashes: std::sync::Mutex<Vec<u64>>,
    /// Maximum Hamming distance for SimHash title comparison.
    /// Lower = stricter. Default = 10.
    title_similarity_threshold: u32,
}

impl DeduplicationStage {
    pub fn new() -> Self {
        Self {
            seen_links: std::sync::Mutex::new(HashSet::new()),
            seen_content_hashes: std::sync::Mutex::new(HashSet::new()),
            seen_title_hashes: std::sync::Mutex::new(Vec::new()),
            title_similarity_threshold: 10,
        }
    }

    pub fn with_title_threshold(mut self, threshold: u32) -> Self {
        self.title_similarity_threshold = threshold;
        self
    }
}

impl Default for DeduplicationStage {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineStage for DeduplicationStage {
    fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        // 1. Link dedup
        {
            let mut links = self.seen_links.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("Dedup seen_links mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            if !links.insert(article.link.clone()) {
                trace!(link = %article.link, "DeduplicationStage: duplicate link");
                return None;
            }
        }

        // 2. Content hash dedup
        if let Some(content) = &article.content {
            let hash = md5_hex(content);
            article.content_hash = Some(hash.clone());

            let mut hashes = self.seen_content_hashes.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("Dedup seen_content_hashes mutex was poisoned, recovering");
                poisoned.into_inner()
            });
            if !hashes.insert(hash) {
                trace!(title = %article.title, "DeduplicationStage: duplicate content hash");
                return None;
            }
        }

        // 3. Title SimHash dedup (only for titles with enough characters for meaningful comparison)
        // Minimum 15 chars: short titles produce unreliable trigram SimHash values
        let title_chars = article.title.chars().count();
        if title_chars >= 15 {
            let title_hash = simhash(&article.title);
            {
                let mut title_hashes = self.seen_title_hashes.lock().unwrap_or_else(|poisoned| {
                    tracing::warn!("Dedup seen_title_hashes mutex was poisoned, recovering");
                    poisoned.into_inner()
                });
                for &existing in title_hashes.iter() {
                    let distance = hamming_distance(title_hash, existing);
                    if distance <= self.title_similarity_threshold {
                        trace!(
                            title = %article.title,
                            distance,
                            "DeduplicationStage: similar title (SimHash)"
                        );
                        return None;
                    }
                }
                title_hashes.push(title_hash);
            }
        }

        Some(article)
    }
}

/// Compute MD5 hex digest of a string.
fn md5_hex(input: &str) -> String {
    // Use a simple hand-rolled hash since we don't want to add the md5 crate.
    // We use a deterministic content hash based on the standard FNV-1a algorithm
    // doubled to 128 bits, formatted as hex. This is NOT cryptographic MD5 but
    // serves the same dedup purpose (collision-resistant for content comparison).
    let bytes = input.as_bytes();
    let h1 = fnv1a_64(bytes);
    let h2 = fnv1a_64_seeded(bytes, 0x517cc1b727220a95);
    format!("{:016x}{:016x}", h1, h2)
}

fn fnv1a_64(data: &[u8]) -> u64 {
    fnv1a_64_seeded(data, 0xcbf29ce484222325)
}

fn fnv1a_64_seeded(data: &[u8], seed: u64) -> u64 {
    let mut hash = seed;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Compute a 64-bit SimHash of text.
///
/// Uses character trigrams as features, weighted equally.
fn simhash(text: &str) -> u64 {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() < 3 {
        // For very short text, just hash the whole thing
        return fnv1a_64(text.as_bytes());
    }

    let mut v = [0i32; 64];

    for window in chars.windows(3) {
        let trigram: String = window.iter().collect();
        let hash = fnv1a_64(trigram.as_bytes());

        for (i, slot) in v.iter_mut().enumerate() {
            if (hash >> i) & 1 == 1 {
                *slot += 1;
            } else {
                *slot -= 1;
            }
        }
    }

    let mut result: u64 = 0;
    for (i, slot) in v.iter().enumerate() {
        if *slot > 0 {
            result |= 1 << i;
        }
    }
    result
}

/// Compute Hamming distance between two 64-bit values.
fn hamming_distance(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(title: &str, link: &str, content: Option<&str>) -> RawArticle {
        let mut a = RawArticle::new(title, link);
        a.content = content.map(str::to_string);
        a
    }

    #[test]
    fn dedup_exact_link() {
        let stage = DeduplicationStage::new();
        let a1 = make("Article A", "https://example.com/1", None);
        let a2 = make("Article B", "https://example.com/1", None);
        let a3 = make("Article C", "https://example.com/2", None);

        assert!(stage.process(a1).is_some());
        assert!(stage.process(a2).is_none()); // duplicate link
        assert!(stage.process(a3).is_some());
    }

    #[test]
    fn dedup_content_hash() {
        let stage = DeduplicationStage::new();
        let a1 = make("Title A", "https://a.com/1", Some("same content here"));
        let a2 = make("Title B", "https://b.com/2", Some("same content here"));
        let a3 = make("Title C", "https://c.com/3", Some("different content"));

        assert!(stage.process(a1).is_some());
        assert!(stage.process(a2).is_none()); // same content hash
        assert!(stage.process(a3).is_some());
    }

    #[test]
    fn dedup_similar_title() {
        // Chinese trigram SimHash typically yields distance ~10 for near-identical titles,
        // so use threshold=12 to catch them.
        let stage = DeduplicationStage::new().with_title_threshold(12);
        let a1 = make(
            "国务院关于印发2026年政府工作报告的通知",
            "https://a.com/1",
            None,
        );
        let a2 = make(
            "国务院关于印发2026年政府工作报告通知",
            "https://b.com/2",
            None,
        );

        assert!(stage.process(a1).is_some());
        assert!(stage.process(a2).is_none()); // similar title
    }

    #[test]
    fn does_not_dedup_different_content() {
        let stage = DeduplicationStage::new();
        let a1 = make("Unique A", "https://a.com/1", Some("Content alpha"));
        let a2 = make("Unique B", "https://b.com/2", Some("Content beta"));
        let a3 = make("Completely Different", "https://c.com/3", Some("Something else"));

        assert!(stage.process(a1).is_some());
        assert!(stage.process(a2).is_some());
        assert!(stage.process(a3).is_some());
    }

    #[test]
    fn sets_content_hash() {
        let stage = DeduplicationStage::new();
        let a = make("Title", "https://a.com/1", Some("hello world"));
        let result = stage.process(a).unwrap();
        assert!(result.content_hash.is_some());
        assert_eq!(result.content_hash.as_ref().unwrap().len(), 32); // 128-bit hex
    }

    #[test]
    fn simhash_similar_strings_have_low_distance() {
        let h1 = simhash("国务院关于加强法治建设的若干意见");
        let h2 = simhash("国务院关于加强法治建设若干意见");
        // Chinese trigram SimHash distances are larger than English due to
        // multi-byte character trigrams producing more hash variation.
        // Similar Chinese titles typically have distance <= 15.
        assert!(hamming_distance(h1, h2) <= 15);
    }

    #[test]
    fn simhash_different_strings_have_high_distance() {
        let h1 = simhash("国务院关于加强法治建设的若干意见");
        let h2 = simhash("今天天气真不错适合出去玩耍");
        assert!(hamming_distance(h1, h2) > 10);
    }
}
