//! Reaction domain types — kept transport-neutral so the API/admin layers can
//! reshape them without leaking sqlx types upstream.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Type;
use std::str::FromStr;
use uuid::Uuid;

/// Polymorphic target of a reaction (matches the `reaction_target` Postgres
/// enum from migration 083). The string repr is the lowercase tag exposed
/// over the wire and stored in the database.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[sqlx(type_name = "reaction_target", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ReactionTarget {
    Article,
    Source,
}

impl ReactionTarget {
    pub fn as_str(self) -> &'static str {
        match self {
            ReactionTarget::Article => "article",
            ReactionTarget::Source => "source",
        }
    }
}

impl FromStr for ReactionTarget {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "article" => Ok(ReactionTarget::Article),
            "source" => Ok(ReactionTarget::Source),
            other => Err(format!("invalid reaction target: {other}")),
        }
    }
}

/// Reaction polarity — `none` is the absence of a row, so this enum only
/// carries the two persisted variants. The service layer accepts
/// `Option<ReactionKind>` from callers, where `None` => DELETE.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[sqlx(type_name = "reaction_kind", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ReactionKind {
    Like,
    Dislike,
}

impl ReactionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ReactionKind::Like => "like",
            ReactionKind::Dislike => "dislike",
        }
    }
}

impl FromStr for ReactionKind {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "like" => Ok(ReactionKind::Like),
            "dislike" => Ok(ReactionKind::Dislike),
            other => Err(format!("invalid reaction kind: {other}")),
        }
    }
}

/// A single persisted reaction row.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Reaction {
    pub id: i64,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub target_type: ReactionTarget,
    pub target_id: Uuid,
    pub kind: ReactionKind,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Aggregated reaction snapshot returned by the public summary endpoints and
/// embedded into ArticleDetail / SourceDetail responses.
///
/// `score = likes - dislikes`. `my_kind` is `None` either because the viewer
/// is not authenticated (the service layer treats anonymous as a viewer-less
/// summary fetch) or because the viewer has not reacted on this target.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReactionSummary {
    pub likes: i64,
    pub dislikes: i64,
    pub score: i64,
    pub my_kind: Option<ReactionKind>,
}

impl ReactionSummary {
    pub fn new(likes: i64, dislikes: i64, my_kind: Option<ReactionKind>) -> Self {
        Self {
            likes,
            dislikes,
            score: likes - dislikes,
            my_kind,
        }
    }
}

// ---- Admin insight rows -----------------------------------------------------

/// Insight window selector — the admin endpoints accept either an explicit
/// 7-day / 30-day cutoff or `all` for no time filter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReactionInsightWindow {
    Last7Days,
    Last30Days,
    All,
}

impl ReactionInsightWindow {
    /// Returns the inclusive lower bound for `created_at` filters, or `None`
    /// when the window is unbounded (`All`).
    pub fn cutoff(self) -> Option<DateTime<Utc>> {
        match self {
            ReactionInsightWindow::Last7Days => Some(Utc::now() - chrono::Duration::days(7)),
            ReactionInsightWindow::Last30Days => Some(Utc::now() - chrono::Duration::days(30)),
            ReactionInsightWindow::All => None,
        }
    }
}

impl FromStr for ReactionInsightWindow {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "7d" | "last_7_days" | "last7days" => Ok(ReactionInsightWindow::Last7Days),
            "30d" | "last_30_days" | "last30days" => Ok(ReactionInsightWindow::Last30Days),
            "all" => Ok(ReactionInsightWindow::All),
            other => Err(format!("invalid reaction window: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReactionTrendGranularity {
    Hour,
    Day,
}

impl FromStr for ReactionTrendGranularity {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "hour" => Ok(ReactionTrendGranularity::Hour),
            "day" => Ok(ReactionTrendGranularity::Day),
            other => Err(format!("invalid trend granularity: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopReactionRow {
    pub target_type: ReactionTarget,
    pub target_id: Uuid,
    pub likes: i64,
    pub dislikes: i64,
    pub score: i64,
    /// Optional human-readable label resolved from the target table (article
    /// title or source name); the service layer fills this in via a JOIN.
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionTrendPoint {
    pub bucket: DateTime<Utc>,
    pub likes: i64,
    pub dislikes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryReactionStat {
    pub category_id: Option<Uuid>,
    pub category_slug: Option<String>,
    pub category_name: Option<String>,
    pub likes: i64,
    pub dislikes: i64,
    pub score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceHealthRow {
    pub source_id: Uuid,
    pub source_name: String,
    pub likes: i64,
    pub dislikes: i64,
    pub like_dislike_ratio: f64,
    /// Number of channel subscriptions whose channel_filter routes to this
    /// source. Joined from `channel_subscriptions` (best-effort — the join
    /// is left-outer so sources with no subscriptions still appear).
    pub subscriber_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopReactionUserRow {
    pub user_id: Uuid,
    pub display_name: Option<String>,
    pub likes_given: i64,
    pub dislikes_given: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColdStartTargetRow {
    pub target_type: ReactionTarget,
    pub target_id: Uuid,
    pub label: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NegativeSignalRow {
    pub target_type: ReactionTarget,
    pub target_id: Uuid,
    pub label: Option<String>,
    pub likes: i64,
    pub dislikes: i64,
    pub dislike_ratio: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaction_target_roundtrip() {
        assert_eq!(
            ReactionTarget::from_str("article").unwrap(),
            ReactionTarget::Article
        );
        assert_eq!(
            ReactionTarget::from_str("SOURCE").unwrap(),
            ReactionTarget::Source
        );
        assert!(ReactionTarget::from_str("comment").is_err());
        assert_eq!(ReactionTarget::Article.as_str(), "article");
    }

    #[test]
    fn reaction_kind_roundtrip() {
        assert_eq!(ReactionKind::from_str("like").unwrap(), ReactionKind::Like);
        assert_eq!(
            ReactionKind::from_str("Dislike").unwrap(),
            ReactionKind::Dislike
        );
        assert!(ReactionKind::from_str("meh").is_err());
    }

    #[test]
    fn summary_score_is_likes_minus_dislikes() {
        let summary = ReactionSummary::new(7, 3, Some(ReactionKind::Like));
        assert_eq!(summary.score, 4);
        assert_eq!(summary.likes, 7);
        assert_eq!(summary.dislikes, 3);
        assert_eq!(summary.my_kind, Some(ReactionKind::Like));
    }

    #[test]
    fn insight_window_parses_aliases() {
        for v in ["7d", "Last_7_Days", "last7days"] {
            assert_eq!(
                ReactionInsightWindow::from_str(v).unwrap(),
                ReactionInsightWindow::Last7Days
            );
        }
        assert_eq!(
            ReactionInsightWindow::from_str("ALL").unwrap(),
            ReactionInsightWindow::All
        );
        assert!(ReactionInsightWindow::All.cutoff().is_none());
        assert!(ReactionInsightWindow::Last7Days.cutoff().is_some());
    }

    #[test]
    fn trend_granularity_parses() {
        assert_eq!(
            ReactionTrendGranularity::from_str("hour").unwrap(),
            ReactionTrendGranularity::Hour
        );
        assert_eq!(
            ReactionTrendGranularity::from_str("DAY").unwrap(),
            ReactionTrendGranularity::Day
        );
        assert!(ReactionTrendGranularity::from_str("week").is_err());
    }
}
