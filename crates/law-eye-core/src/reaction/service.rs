//! ReactionService — orchestrates the repo with viewer-aware summary
//! resolution and target-existence checks. Built around a `ReactionRepo`
//! trait so the service is unit-testable with an in-memory mock.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use law_eye_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

use super::model::{
    CategoryReactionStat, ColdStartTargetRow, NegativeSignalRow, Reaction, ReactionInsightWindow,
    ReactionKind, ReactionSummary, ReactionTarget, ReactionTrendGranularity, ReactionTrendPoint,
    SourceHealthRow, TopReactionRow, TopReactionUserRow,
};
use super::repo::{PgReactionRepo, ReactionRepo};

/// Domain-level reaction operations exposed to the API and worker layers.
#[async_trait]
pub trait ReactionService: Send + Sync {
    /// Set or clear the calling user's reaction on a target. `kind = None`
    /// removes the row (returns the new viewer-aware summary regardless).
    async fn set_reaction(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
        kind: Option<ReactionKind>,
    ) -> Result<ReactionSummary>;

    async fn get_summary(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
        viewer: Option<Uuid>,
    ) -> Result<ReactionSummary>;

    async fn get_summaries_batch(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_ids: &[Uuid],
        viewer: Option<Uuid>,
    ) -> Result<HashMap<Uuid, ReactionSummary>>;

    async fn list_user_reactions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        since: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<Reaction>>;

    // Admin insights ---------------------------------------------------------
    async fn top_score(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>>;

    async fn controversy(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        min_likes: i64,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>>;

    async fn trend(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        granularity: ReactionTrendGranularity,
        window: ReactionInsightWindow,
    ) -> Result<Vec<ReactionTrendPoint>>;

    async fn by_category(
        &self,
        tenant_id: Uuid,
        window: ReactionInsightWindow,
    ) -> Result<Vec<CategoryReactionStat>>;

    async fn source_health(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<SourceHealthRow>>;

    async fn top_users(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<TopReactionUserRow>>;

    async fn cold_start(
        &self,
        tenant_id: Uuid,
        days: i32,
        target_type: ReactionTarget,
        limit: i64,
    ) -> Result<Vec<ColdStartTargetRow>>;

    async fn negative_signal(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        dislike_ratio: f64,
        min_total: i64,
        limit: i64,
    ) -> Result<Vec<NegativeSignalRow>>;
}

#[derive(Clone)]
pub struct PgReactionService {
    repo: Arc<dyn ReactionRepo>,
}

impl PgReactionService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            repo: Arc::new(PgReactionRepo::new(pool)),
        }
    }

    /// Build the service over a custom `ReactionRepo`. Useful for unit tests
    /// where the repo is replaced with an in-memory mock.
    pub fn with_repo(repo: Arc<dyn ReactionRepo>) -> Self {
        Self { repo }
    }
}

#[async_trait]
impl ReactionService for PgReactionService {
    async fn set_reaction(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
        kind: Option<ReactionKind>,
    ) -> Result<ReactionSummary> {
        // Reject reactions on missing/deleted targets up front so a cleared
        // viewer state never trickles through the rest of the pipeline.
        self.repo
            .ensure_target_exists(tenant_id, target_type, target_id)
            .await?;

        match kind {
            Some(kind) => {
                self.repo
                    .upsert_reaction(tenant_id, user_id, target_type, target_id, kind)
                    .await?;
            }
            None => {
                self.repo
                    .delete_reaction(tenant_id, user_id, target_type, target_id)
                    .await?;
            }
        }

        self.get_summary(tenant_id, target_type, target_id, Some(user_id))
            .await
    }

    async fn get_summary(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_id: Uuid,
        viewer: Option<Uuid>,
    ) -> Result<ReactionSummary> {
        let aggregate = self
            .repo
            .get_aggregate(tenant_id, target_type, target_id)
            .await?;
        let my_kind = if let Some(viewer_id) = viewer {
            self.repo
                .get_viewer_kinds_batch(tenant_id, viewer_id, target_type, &[target_id])
                .await?
                .get(&target_id)
                .copied()
        } else {
            None
        };
        Ok(ReactionSummary::new(
            aggregate.likes,
            aggregate.dislikes,
            my_kind,
        ))
    }

    async fn get_summaries_batch(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        target_ids: &[Uuid],
        viewer: Option<Uuid>,
    ) -> Result<HashMap<Uuid, ReactionSummary>> {
        if target_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let aggregates = self
            .repo
            .get_aggregates_batch(tenant_id, target_type, target_ids)
            .await?;
        let viewer_kinds = if let Some(viewer_id) = viewer {
            self.repo
                .get_viewer_kinds_batch(tenant_id, viewer_id, target_type, target_ids)
                .await?
        } else {
            HashMap::new()
        };

        let mut out = HashMap::with_capacity(target_ids.len());
        for &target_id in target_ids {
            let agg = aggregates.get(&target_id).copied().unwrap_or_default_zero();
            let my = viewer_kinds.get(&target_id).copied();
            out.insert(target_id, ReactionSummary::new(agg.likes, agg.dislikes, my));
        }
        Ok(out)
    }

    async fn list_user_reactions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        since: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<Reaction>> {
        self.repo
            .list_user_reactions(tenant_id, user_id, since, limit)
            .await
    }

    async fn top_score(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>> {
        self.repo
            .top_score(tenant_id, target_type, window, limit)
            .await
    }

    async fn controversy(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        window: ReactionInsightWindow,
        min_likes: i64,
        limit: i64,
    ) -> Result<Vec<TopReactionRow>> {
        self.repo
            .controversy(tenant_id, target_type, window, min_likes, limit)
            .await
    }

    async fn trend(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        granularity: ReactionTrendGranularity,
        window: ReactionInsightWindow,
    ) -> Result<Vec<ReactionTrendPoint>> {
        self.repo
            .trend(tenant_id, target_type, granularity, window)
            .await
    }

    async fn by_category(
        &self,
        tenant_id: Uuid,
        window: ReactionInsightWindow,
    ) -> Result<Vec<CategoryReactionStat>> {
        self.repo.by_category(tenant_id, window).await
    }

    async fn source_health(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<SourceHealthRow>> {
        self.repo.source_health(tenant_id, limit).await
    }

    async fn top_users(&self, tenant_id: Uuid, limit: i64) -> Result<Vec<TopReactionUserRow>> {
        self.repo.top_users(tenant_id, limit).await
    }

    async fn cold_start(
        &self,
        tenant_id: Uuid,
        days: i32,
        target_type: ReactionTarget,
        limit: i64,
    ) -> Result<Vec<ColdStartTargetRow>> {
        self.repo
            .cold_start(tenant_id, days, target_type, limit)
            .await
    }

    async fn negative_signal(
        &self,
        tenant_id: Uuid,
        target_type: ReactionTarget,
        dislike_ratio: f64,
        min_total: i64,
        limit: i64,
    ) -> Result<Vec<NegativeSignalRow>> {
        self.repo
            .negative_signal(
                tenant_id,
                target_type,
                dislike_ratio,
                min_total,
                limit,
            )
            .await
    }
}

// Local helper for "Option<AggregateRow>::unwrap_or_default" without
// requiring AggregateRow itself to derive Default (it sits in repo.rs and
// only carries primitive counts).
trait AggregateRowOptExt {
    fn unwrap_or_default_zero(self) -> super::repo::AggregateRow;
}

impl AggregateRowOptExt for Option<super::repo::AggregateRow> {
    fn unwrap_or_default_zero(self) -> super::repo::AggregateRow {
        self.unwrap_or(super::repo::AggregateRow {
            likes: 0,
            dislikes: 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use law_eye_common::Error;
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// In-memory mock — sufficient for exercising the service's set/clear/
    /// summary contract without touching Postgres.
    #[derive(Default)]
    struct MockRepo {
        rows: Mutex<Vec<Reaction>>,
        existing_targets: Mutex<Vec<(ReactionTarget, Uuid)>>,
    }

    impl MockRepo {
        fn with_target(target: ReactionTarget, id: Uuid) -> Self {
            let me = Self::default();
            me.existing_targets.lock().unwrap().push((target, id));
            me
        }
    }

    #[async_trait]
    impl ReactionRepo for MockRepo {
        async fn upsert_reaction(
            &self,
            tenant_id: Uuid,
            user_id: Uuid,
            target_type: ReactionTarget,
            target_id: Uuid,
            kind: ReactionKind,
        ) -> Result<Reaction> {
            let mut rows = self.rows.lock().unwrap();
            let now = chrono::Utc::now();
            if let Some(existing) = rows.iter_mut().find(|r| {
                r.tenant_id == tenant_id
                    && r.user_id == user_id
                    && r.target_type == target_type
                    && r.target_id == target_id
            }) {
                existing.kind = kind;
                existing.updated_at = now;
                return Ok(existing.clone());
            }
            let row = Reaction {
                id: rows.len() as i64 + 1,
                tenant_id,
                user_id,
                target_type,
                target_id,
                kind,
                created_at: now,
                updated_at: now,
            };
            rows.push(row.clone());
            Ok(row)
        }

        async fn delete_reaction(
            &self,
            tenant_id: Uuid,
            user_id: Uuid,
            target_type: ReactionTarget,
            target_id: Uuid,
        ) -> Result<u64> {
            let mut rows = self.rows.lock().unwrap();
            let before = rows.len();
            rows.retain(|r| {
                !(r.tenant_id == tenant_id
                    && r.user_id == user_id
                    && r.target_type == target_type
                    && r.target_id == target_id)
            });
            Ok((before - rows.len()) as u64)
        }

        async fn get_aggregate(
            &self,
            tenant_id: Uuid,
            target_type: ReactionTarget,
            target_id: Uuid,
        ) -> Result<super::super::repo::AggregateRow> {
            let rows = self.rows.lock().unwrap();
            let mut likes = 0;
            let mut dislikes = 0;
            for r in rows.iter().filter(|r| {
                r.tenant_id == tenant_id
                    && r.target_type == target_type
                    && r.target_id == target_id
            }) {
                match r.kind {
                    ReactionKind::Like => likes += 1,
                    ReactionKind::Dislike => dislikes += 1,
                }
            }
            Ok(super::super::repo::AggregateRow { likes, dislikes })
        }

        async fn get_aggregates_batch(
            &self,
            tenant_id: Uuid,
            target_type: ReactionTarget,
            target_ids: &[Uuid],
        ) -> Result<HashMap<Uuid, super::super::repo::AggregateRow>> {
            let mut out: HashMap<Uuid, super::super::repo::AggregateRow> = HashMap::new();
            for id in target_ids {
                let agg = self.get_aggregate(tenant_id, target_type, *id).await?;
                if agg.likes != 0 || agg.dislikes != 0 {
                    out.insert(*id, agg);
                }
            }
            Ok(out)
        }

        async fn get_viewer_kinds_batch(
            &self,
            tenant_id: Uuid,
            viewer_id: Uuid,
            target_type: ReactionTarget,
            target_ids: &[Uuid],
        ) -> Result<HashMap<Uuid, ReactionKind>> {
            let rows = self.rows.lock().unwrap();
            let mut out = HashMap::new();
            for r in rows.iter().filter(|r| {
                r.tenant_id == tenant_id
                    && r.user_id == viewer_id
                    && r.target_type == target_type
                    && target_ids.contains(&r.target_id)
            }) {
                out.insert(r.target_id, r.kind);
            }
            Ok(out)
        }

        async fn list_user_reactions(
            &self,
            tenant_id: Uuid,
            user_id: Uuid,
            since: Option<DateTime<Utc>>,
            limit: i64,
        ) -> Result<Vec<Reaction>> {
            let rows = self.rows.lock().unwrap();
            let mut out: Vec<Reaction> = rows
                .iter()
                .filter(|r| {
                    r.tenant_id == tenant_id
                        && r.user_id == user_id
                        && since.map(|c| r.created_at >= c).unwrap_or(true)
                })
                .cloned()
                .collect();
            out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
            out.truncate(limit.max(0) as usize);
            Ok(out)
        }

        async fn ensure_target_exists(
            &self,
            _tenant_id: Uuid,
            target_type: ReactionTarget,
            target_id: Uuid,
        ) -> Result<()> {
            let known = self.existing_targets.lock().unwrap();
            if known.iter().any(|(t, id)| *t == target_type && *id == target_id) {
                Ok(())
            } else {
                Err(Error::NotFound(format!(
                    "{} {} not found",
                    target_type.as_str(),
                    target_id
                )))
            }
        }

        async fn top_score(
            &self,
            _tenant_id: Uuid,
            _target_type: ReactionTarget,
            _window: ReactionInsightWindow,
            _limit: i64,
        ) -> Result<Vec<TopReactionRow>> {
            Ok(Vec::new())
        }

        async fn controversy(
            &self,
            _tenant_id: Uuid,
            _target_type: ReactionTarget,
            _window: ReactionInsightWindow,
            _min_likes: i64,
            _limit: i64,
        ) -> Result<Vec<TopReactionRow>> {
            Ok(Vec::new())
        }

        async fn trend(
            &self,
            _tenant_id: Uuid,
            _target_type: ReactionTarget,
            _granularity: ReactionTrendGranularity,
            _window: ReactionInsightWindow,
        ) -> Result<Vec<ReactionTrendPoint>> {
            Ok(Vec::new())
        }

        async fn by_category(
            &self,
            _tenant_id: Uuid,
            _window: ReactionInsightWindow,
        ) -> Result<Vec<CategoryReactionStat>> {
            Ok(Vec::new())
        }

        async fn source_health(
            &self,
            _tenant_id: Uuid,
            _limit: i64,
        ) -> Result<Vec<SourceHealthRow>> {
            Ok(Vec::new())
        }

        async fn top_users(
            &self,
            _tenant_id: Uuid,
            _limit: i64,
        ) -> Result<Vec<TopReactionUserRow>> {
            Ok(Vec::new())
        }

        async fn cold_start(
            &self,
            _tenant_id: Uuid,
            _days: i32,
            _target_type: ReactionTarget,
            _limit: i64,
        ) -> Result<Vec<ColdStartTargetRow>> {
            Ok(Vec::new())
        }

        async fn negative_signal(
            &self,
            _tenant_id: Uuid,
            _target_type: ReactionTarget,
            _dislike_ratio: f64,
            _min_total: i64,
            _limit: i64,
        ) -> Result<Vec<NegativeSignalRow>> {
            Ok(Vec::new())
        }
    }

    fn svc_with_target(target_type: ReactionTarget, id: Uuid) -> PgReactionService {
        PgReactionService::with_repo(Arc::new(MockRepo::with_target(target_type, id)))
    }

    #[tokio::test]
    async fn set_like_then_dislike_flips_kind_and_updates_summary() {
        let tenant = Uuid::new_v4();
        let user = Uuid::new_v4();
        let article = Uuid::new_v4();
        let svc = svc_with_target(ReactionTarget::Article, article);

        let summary = svc
            .set_reaction(
                tenant,
                user,
                ReactionTarget::Article,
                article,
                Some(ReactionKind::Like),
            )
            .await
            .unwrap();
        assert_eq!(summary.likes, 1);
        assert_eq!(summary.dislikes, 0);
        assert_eq!(summary.score, 1);
        assert_eq!(summary.my_kind, Some(ReactionKind::Like));

        let summary = svc
            .set_reaction(
                tenant,
                user,
                ReactionTarget::Article,
                article,
                Some(ReactionKind::Dislike),
            )
            .await
            .unwrap();
        assert_eq!(summary.likes, 0);
        assert_eq!(summary.dislikes, 1);
        assert_eq!(summary.score, -1);
        assert_eq!(summary.my_kind, Some(ReactionKind::Dislike));
    }

    #[tokio::test]
    async fn set_kind_none_clears_existing_reaction() {
        let tenant = Uuid::new_v4();
        let user = Uuid::new_v4();
        let article = Uuid::new_v4();
        let svc = svc_with_target(ReactionTarget::Article, article);

        svc.set_reaction(
            tenant,
            user,
            ReactionTarget::Article,
            article,
            Some(ReactionKind::Like),
        )
        .await
        .unwrap();

        let summary = svc
            .set_reaction(tenant, user, ReactionTarget::Article, article, None)
            .await
            .unwrap();

        assert_eq!(summary.likes, 0);
        assert_eq!(summary.dislikes, 0);
        assert_eq!(summary.score, 0);
        assert!(summary.my_kind.is_none());
    }

    #[tokio::test]
    async fn missing_target_yields_not_found_error() {
        let tenant = Uuid::new_v4();
        let user = Uuid::new_v4();
        let svc = svc_with_target(ReactionTarget::Source, Uuid::new_v4());
        let err = svc
            .set_reaction(
                tenant,
                user,
                ReactionTarget::Article,
                Uuid::new_v4(),
                Some(ReactionKind::Like),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, Error::NotFound(_)));
    }

    #[tokio::test]
    async fn batch_summary_returns_zero_for_unreacted_targets() {
        let tenant = Uuid::new_v4();
        let user = Uuid::new_v4();
        let article_a = Uuid::new_v4();
        let article_b = Uuid::new_v4();
        let svc = svc_with_target(ReactionTarget::Article, article_a);

        svc.set_reaction(
            tenant,
            user,
            ReactionTarget::Article,
            article_a,
            Some(ReactionKind::Like),
        )
        .await
        .unwrap();

        let map = svc
            .get_summaries_batch(
                tenant,
                ReactionTarget::Article,
                &[article_a, article_b],
                Some(user),
            )
            .await
            .unwrap();

        let a = map.get(&article_a).unwrap();
        assert_eq!(a.likes, 1);
        assert_eq!(a.my_kind, Some(ReactionKind::Like));

        let b = map.get(&article_b).unwrap();
        assert_eq!(b.likes, 0);
        assert_eq!(b.dislikes, 0);
        assert!(b.my_kind.is_none());
    }

    #[tokio::test]
    async fn anonymous_summary_omits_my_kind_even_with_existing_row() {
        let tenant = Uuid::new_v4();
        let user = Uuid::new_v4();
        let article = Uuid::new_v4();
        let svc = svc_with_target(ReactionTarget::Article, article);

        svc.set_reaction(
            tenant,
            user,
            ReactionTarget::Article,
            article,
            Some(ReactionKind::Dislike),
        )
        .await
        .unwrap();

        let summary = svc
            .get_summary(tenant, ReactionTarget::Article, article, None)
            .await
            .unwrap();
        assert_eq!(summary.dislikes, 1);
        assert!(summary.my_kind.is_none());
    }
}
