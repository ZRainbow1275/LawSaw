//! Per-user reactions (like / dislike) on articles and sources.
//!
//! Wave-8 Stream C-1. Login-required, three-state (like / dislike / none),
//! one row per (user, target). See `crates/law-eye-db/migrations/083_*.sql`
//! for the schema rationale.
//!
//! Public surface is the `service::ReactionService` trait + `service::PgReactionService`
//! implementation; the `repo` module is internal Postgres SQL.

mod model;
mod repo;
mod service;

pub use model::{
    Reaction, ReactionKind, ReactionSummary, ReactionTarget, TopReactionRow,
    ReactionTrendPoint, CategoryReactionStat, SourceHealthRow, TopReactionUserRow,
    ColdStartTargetRow, NegativeSignalRow, ReactionInsightWindow, ReactionTrendGranularity,
};
pub use repo::{ReactionRepo, PgReactionRepo};
pub use service::{ReactionService, PgReactionService};
