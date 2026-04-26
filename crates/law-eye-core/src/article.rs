use chrono::{DateTime, NaiveDate, Utc};
use law_eye_common::{Error, Result};
use law_eye_db::Article;
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

mod service;

pub const MAX_ARTICLE_TITLE_BYTES: usize = 8 * 1024;
pub const MAX_ARTICLE_SUMMARY_BYTES: usize = 256 * 1024;
pub const MAX_ARTICLE_CONTENT_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_SENTIMENT_RATIONALE_BYTES: usize = 4 * 1024;

/// Allowed values for `articles.sentiment` (migration 065 + analytics summary buckets).
pub const ALLOWED_SENTIMENT_LABELS: &[&str] = &["positive", "neutral", "negative", "mixed"];

/// Allowed values for `articles.sentiment_aspect` (migration 065 CHECK constraint).
pub const ALLOWED_SENTIMENT_ASPECTS: &[&str] = &[
    "compliance",
    "penalty",
    "litigation",
    "policy_change",
    "industry_trend",
    "regulatory_impact",
    "company_reputation",
    "policy_direction",
    "other",
];

fn validate_max_bytes(field: &str, value: &str, max_bytes: usize) -> Result<()> {
    if value.len() > max_bytes {
        return Err(Error::Validation(format!(
            "{field} too large (max {max_bytes} bytes)"
        )));
    }
    Ok(())
}

fn validate_sentiment_label(label: &str) -> Result<()> {
    if !ALLOWED_SENTIMENT_LABELS.contains(&label) {
        return Err(Error::Validation(format!(
            "invalid sentiment label '{label}', expected one of {:?}",
            ALLOWED_SENTIMENT_LABELS
        )));
    }
    Ok(())
}

fn validate_sentiment_score(score: f64) -> Result<()> {
    if score.is_nan() || !(0.0..=1.0).contains(&score) {
        return Err(Error::Validation(format!(
            "sentiment_score must be in [0.0, 1.0], got {score}"
        )));
    }
    Ok(())
}

fn validate_sentiment_aspect(aspect: &str) -> Result<()> {
    if !ALLOWED_SENTIMENT_ASPECTS.contains(&aspect) {
        return Err(Error::Validation(format!(
            "invalid sentiment_aspect '{aspect}', expected one of {:?}",
            ALLOWED_SENTIMENT_ASPECTS
        )));
    }
    Ok(())
}

pub fn truncate_string_to_max_bytes(mut value: String, max_bytes: usize) -> String {
    if max_bytes == 0 {
        value.clear();
        return value;
    }

    if value.len() <= max_bytes {
        return value;
    }

    let mut end = max_bytes.min(value.len());
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }

    value.truncate(end);
    value
}

pub struct ArticleService {
    pool: PgPool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct UpdateArticlePatch<'a> {
    pub title: Option<&'a str>,
    pub content: Option<&'a str>,
    pub summary: Option<&'a str>,
    pub category_id: Option<Uuid>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleStats {
    pub total: i64,
    pub published: i64,
    pub pending: i64,
    pub high_risk: i64,
    pub today: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleDailyTrendPoint {
    pub date: NaiveDate,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleCategoryCount {
    pub category_id: Option<Uuid>,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleSearchHit {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    /// Normalized relevance score in [0, 1].
    pub score: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleStatusCounts {
    pub pending: i64,
    pub processing: i64,
    pub published: i64,
    pub archived: i64,
    pub rejected: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleRiskCounts {
    pub unknown: i64,
    pub low: i64,
    pub medium: i64,
    pub high: i64,
    pub critical: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleSentimentCounts {
    pub unknown: i64,
    pub positive: i64,
    pub neutral: i64,
    pub negative: i64,
    pub mixed: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleAnalyticsSummary {
    pub total: i64,
    pub status: ArticleStatusCounts,
    pub risk: ArticleRiskCounts,
    pub sentiment: ArticleSentimentCounts,
}

#[derive(Debug, sqlx::FromRow)]
struct ArticleAnalyticsSummaryRow {
    total: i64,
    pending: i64,
    processing: i64,
    published: i64,
    archived: i64,
    rejected: i64,
    risk_unknown: i64,
    risk_low: i64,
    risk_medium: i64,
    risk_high: i64,
    risk_critical: i64,
    sentiment_unknown: i64,
    sentiment_positive: i64,
    sentiment_neutral: i64,
    sentiment_negative: i64,
    sentiment_mixed: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct BatchStatusVersionItem {
    pub id: Uuid,
    pub version: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct BatchStatusConflict {
    pub id: Uuid,
    pub expected_version: i64,
    pub current_version: i64,
}

#[derive(Debug, Clone)]
pub struct BatchStatusWithVersionsResult {
    pub updated: i64,
    pub conflicts: Vec<BatchStatusConflict>,
    pub missing_ids: Vec<Uuid>,
}

fn push_article_filters<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    category_id: Option<Uuid>,
    status: Option<&'a str>,
) {
    qb.push(" WHERE deleted_at IS NULL");

    if let Some(category_id) = category_id {
        qb.push(" AND category_id = ");
        qb.push_bind(category_id);
    }

    if let Some(status) = status {
        qb.push(" AND status = ");
        qb.push_bind(status);
    }
}
