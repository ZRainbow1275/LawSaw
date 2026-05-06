"use client";

/**
 * OverviewPanel — Analytics 概览 tab. Mirrors prototype/app.html:1258-1382.
 *
 * Layout:
 *   - 4 stat cards (full width 1x4)
 *   - 2x2 chart grid (risk / sentiment / status / trend)
 *   - Section title "分类统计"
 *   - 5x2 cat-stat-card grid
 */

import {
	useArticleAnalyticsSummary,
	useArticleCategoryCounts,
	useArticleTrends,
} from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSourceStats } from "@/hooks/use-sources";
import { useT } from "@/lib/i18n-client";
import { Loader2 } from "lucide-react";
import type { CSSProperties } from "react";
import { CategoryStatsRow } from "./category-stats-row";
import { OverviewStatCards } from "./overview-stat-cards";
import { RiskBarChart } from "./risk-bar-chart";
import { SentimentBarChart } from "./sentiment-bar-chart";
import { StatusBadgeGrid } from "./status-badge-grid";
import { TrendAreaChart } from "./trend-area-chart";

const grid2x2Style: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	gap: 16,
	marginBottom: 24,
};

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--color-neutral-200)",
	borderRadius: 12,
	padding: 20,
};

const sectionTitleStyle: CSSProperties = {
	fontSize: 14,
	fontWeight: 700,
	color: "var(--color-neutral-800)",
	marginBottom: 16,
};

const placeholderStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	height: 220,
	color: "var(--color-neutral-400)",
};

const fallbackZeros = {
	unknown: 0,
	low: 0,
	medium: 0,
	high: 0,
	critical: 0,
} as const;

const fallbackSentZeros = {
	unknown: 0,
	positive: 0,
	neutral: 0,
	negative: 0,
	mixed: 0,
} as const;

const fallbackStatusZeros = {
	pending: 0,
	processing: 0,
	published: 0,
	archived: 0,
	rejected: 0,
} as const;

export function OverviewPanel() {
	const t = useT();
	const summary = useArticleAnalyticsSummary();
	const sourceStats = useSourceStats();
	const categories = useCategories();
	const trends = useArticleTrends(7);
	const catCounts = useArticleCategoryCounts();

	const totalArticles = summary.data?.total ?? null;
	const activeSources = sourceStats.data?.active_count ?? null;
	const errorSources = sourceStats.data?.error_count ?? null;
	const categoriesCount = categories.data?.length ?? null;

	const riskData = summary.data?.risk ?? fallbackZeros;
	const sentimentData = summary.data?.sentiment ?? fallbackSentZeros;
	const statusData = summary.data?.status ?? fallbackStatusZeros;
	const trendPoints = trends.data ?? [];

	return (
		<div>
			<OverviewStatCards
				totalArticles={totalArticles}
				activeSources={activeSources}
				categoriesCount={categoriesCount}
				errorSources={errorSources}
			/>

			<div style={grid2x2Style}>
				<div style={cardStyle}>
					<div style={sectionTitleStyle}>{t("Risk distribution")}</div>
					{summary.isLoading ? (
						<div style={placeholderStyle}>
							<Loader2 aria-hidden="true" size={20} className="animate-spin" />
						</div>
					) : (
						<RiskBarChart data={riskData} />
					)}
				</div>
				<div style={cardStyle}>
					<div style={sectionTitleStyle}>{t("Sentiment analysis")}</div>
					{summary.isLoading ? (
						<div style={placeholderStyle}>
							<Loader2 aria-hidden="true" size={20} className="animate-spin" />
						</div>
					) : (
						<SentimentBarChart data={sentimentData} />
					)}
				</div>
				<div style={cardStyle}>
					<div style={sectionTitleStyle}>{t("Article status")}</div>
					{summary.isLoading ? (
						<div style={placeholderStyle}>
							<Loader2 aria-hidden="true" size={20} className="animate-spin" />
						</div>
					) : (
						<StatusBadgeGrid data={statusData} />
					)}
				</div>
				<div style={cardStyle}>
					<div style={sectionTitleStyle}>{t("Last 7 days trend")}</div>
					{trends.isLoading ? (
						<div style={placeholderStyle}>
							<Loader2 aria-hidden="true" size={20} className="animate-spin" />
						</div>
					) : trendPoints.length === 0 ? (
						<div
							style={{
								...placeholderStyle,
								fontSize: 13,
								color: "var(--color-neutral-500)",
							}}
						>
							{t("No trend data")}
						</div>
					) : (
						<TrendAreaChart data={trendPoints} />
					)}
				</div>
			</div>

			<div style={{ ...sectionTitleStyle, marginBottom: 12 }}>
				{t("Category statistics")}
			</div>
			<CategoryStatsRow categories={categories.data} counts={catCounts.data} />
		</div>
	);
}
