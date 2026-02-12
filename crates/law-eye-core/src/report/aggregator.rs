// crates/law-eye-core/src/report/aggregator.rs
// ReportDataAggregator — 数据聚合，复用 StatisticsService 的查询模式

use chrono::NaiveDate;
use law_eye_common::{Error, Result};
use sqlx::PgPool;
use uuid::Uuid;

use super::types::{
    DomainBreakdown, RegionBreakdown, ReportAggregatedData, ReportArticleSummary,
    ReportCalendarEvent, ReportOverview, ReportRiskItem,
};
use crate::statistics::{domain_root_label, region_code_to_name};

/// 报告数据聚合器，从数据库收集报告期间的各维度数据。
pub struct ReportDataAggregator {
    pool: PgPool,
}

impl ReportDataAggregator {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// 聚合指定时间范围内的全部报告数据
    pub async fn aggregate(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<ReportAggregatedData> {
        let overview = self
            .aggregate_overview(tenant_id, period_start, period_end)
            .await?;
        let highlights = self
            .aggregate_highlights(tenant_id, period_start, period_end, 10)
            .await?;
        let risk_items = self
            .aggregate_risk_items(tenant_id, period_start, period_end)
            .await?;
        let calendar_events = self
            .aggregate_calendar_events(tenant_id, period_start, period_end)
            .await?;

        Ok(ReportAggregatedData {
            overview,
            highlights,
            risk_items,
            charts: Vec::new(), // 图表由 ChartRenderer 后续填充
            calendar_events,
        })
    }

    /// 聚合概览数据
    async fn aggregate_overview(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<ReportOverview> {
        let stats: (i64, i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*)::bigint AS total_articles,
                COUNT(*) FILTER (WHERE importance >= 4)::bigint AS high_importance_count,
                COUNT(*) FILTER (WHERE risk_score >= 70)::bigint AS high_risk_count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND created_at >= $2::date::timestamptz
              AND created_at < ($3::date + 1)::timestamptz
            "#,
        )
        .bind(tenant_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        // 域分布
        let domain_rows: Vec<(String, i64)> = sqlx::query_as(
            r#"
            SELECT domain_root, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND domain_root IS NOT NULL
              AND created_at >= $2::date::timestamptz
              AND created_at < ($3::date + 1)::timestamptz
            GROUP BY domain_root
            ORDER BY count DESC
            LIMIT 10
            "#,
        )
        .bind(tenant_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let domain_breakdown = domain_rows
            .into_iter()
            .map(|(domain, count)| {
                let label = domain_root_label(&domain).to_string();
                DomainBreakdown {
                    domain,
                    label,
                    count,
                }
            })
            .collect();

        // 地区分布
        let region_rows: Vec<(String, i64)> = sqlx::query_as(
            r#"
            SELECT region_code, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND region_code IS NOT NULL
              AND created_at >= $2::date::timestamptz
              AND created_at < ($3::date + 1)::timestamptz
            GROUP BY region_code
            ORDER BY count DESC
            LIMIT 10
            "#,
        )
        .bind(tenant_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let region_breakdown = region_rows
            .into_iter()
            .map(|(code, count)| RegionBreakdown {
                region_name: region_code_to_name(&code).to_string(),
                region_code: code,
                count,
            })
            .collect();

        Ok(ReportOverview {
            total_articles: stats.0,
            high_importance_count: stats.1,
            high_risk_count: stats.2,
            ai_summary: None, // 由 AI 生成阶段填充
            domain_breakdown,
            region_breakdown,
        })
    }

    /// 聚合重点文章（按重要度和风险排序）
    async fn aggregate_highlights(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
        max_items: i64,
    ) -> Result<Vec<ReportArticleSummary>> {
        #[allow(clippy::type_complexity)]
        let rows: Vec<(Uuid, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<i32>, Option<i32>, String)> = sqlx::query_as(
            r#"
            SELECT
                id, title, summary, domain_root, issuer,
                TO_CHAR(published_at, 'YYYY-MM-DD') AS published_at_str,
                importance, risk_score, link
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND created_at >= $2::date::timestamptz
              AND created_at < ($3::date + 1)::timestamptz
            ORDER BY
                COALESCE(importance, 0) DESC,
                COALESCE(risk_score, 0) DESC,
                created_at DESC
            LIMIT $4
            "#,
        )
        .bind(tenant_id)
        .bind(period_start)
        .bind(period_end)
        .bind(max_items)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let highlights = rows
            .into_iter()
            .map(|(id, title, summary, domain_root, issuer, published_at, importance, risk_score, link)| {
                let domain_label = domain_root
                    .as_deref()
                    .map(domain_root_label)
                    .unwrap_or("其他")
                    .to_string();
                ReportArticleSummary {
                    id,
                    title,
                    summary,
                    domain_label,
                    issuer,
                    published_at,
                    importance,
                    risk_score,
                    link,
                }
            })
            .collect();

        Ok(highlights)
    }

    /// 聚合风险项
    async fn aggregate_risk_items(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<Vec<ReportRiskItem>> {
        let rows: Vec<(Uuid, String, Option<String>, Option<i32>)> = sqlx::query_as(
            r#"
            SELECT id, title, summary, risk_score
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND risk_score IS NOT NULL
              AND risk_score >= 50
              AND created_at >= $2::date::timestamptz
              AND created_at < ($3::date + 1)::timestamptz
            ORDER BY risk_score DESC
            LIMIT 20
            "#,
        )
        .bind(tenant_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let risk_items = rows
            .into_iter()
            .map(|(article_id, title, summary, risk_score)| {
                let score = risk_score.unwrap_or(0);
                let (level, level_label) = if score >= 80 {
                    ("high", "高风险")
                } else if score >= 60 {
                    ("medium", "中风险")
                } else {
                    ("low", "低风险")
                };
                ReportRiskItem {
                    title,
                    description: summary.unwrap_or_default(),
                    level: level.to_string(),
                    level_label: level_label.to_string(),
                    article_id: Some(article_id),
                }
            })
            .collect();

        Ok(risk_items)
    }

    /// 聚合合规日历事件（即将生效的法规）
    async fn aggregate_calendar_events(
        &self,
        tenant_id: Uuid,
        period_start: NaiveDate,
        period_end: NaiveDate,
    ) -> Result<Vec<ReportCalendarEvent>> {
        let rows: Vec<(chrono::NaiveDate, String, Option<String>)> = sqlx::query_as(
            r#"
            SELECT effective_date, title, domain_root
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND effective_date IS NOT NULL
              AND effective_date >= $2
              AND effective_date <= ($3::date + INTERVAL '30 day')::date
            ORDER BY effective_date ASC
            LIMIT 50
            "#,
        )
        .bind(tenant_id)
        .bind(period_start)
        .bind(period_end)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let events = rows
            .into_iter()
            .map(|(date, title, domain_root)| {
                let event_type = domain_root
                    .as_deref()
                    .map(domain_root_label)
                    .unwrap_or("法规生效")
                    .to_string();
                ReportCalendarEvent {
                    date: date.to_string(),
                    title,
                    event_type,
                }
            })
            .collect();

        Ok(events)
    }
}