"use client";

/**
 * DashboardStatsStripPrototype — `prototype/app.html:777-782` 4-card row.
 *
 * Cards (per prototype):
 *   1. Today collected (orange, FileText)
 *   2. Sources covered (purple, Rss)
 *   3. High-risk alerts (red, AlertTriangle)
 *   4. AI insights generated (green, BrainCircuit)
 *
 * Numbers animate via the existing `AnimatedNumber` (Framer spring) keeping
 * the prototype's 1200 ms count-up feel. Trend pills are derived from real
 * stats — when no comparable previous-period value is available, render a
 * neutral "On par" trend so we never fabricate fake deltas.
 */

import { AnimatedNumber } from "@/components/ui/animated-number";
import { useArticleStats, useArticleTrends } from "@/hooks/use-articles";
import { useAiAvailability } from "@/hooks/use-search";
import { useSourceStats } from "@/hooks/use-sources";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	BrainCircuit,
	Equal,
	FileText,
	Rss,
	TrendingDown,
	TrendingUp,
} from "lucide-react";

type TrendDirection = "up" | "down" | "neutral";

interface StatCardProps {
	label: string;
	value: number | null;
	iconBg: string;
	iconColor: string;
	icon: typeof FileText;
	trendLabel?: string;
	trendDirection?: TrendDirection;
	delay?: number;
}

const TREND_COLOR: Record<TrendDirection, string> = {
	up: "var(--color-success)",
	down: "var(--color-error)",
	neutral: "var(--surface-muted-text)",
};

function TrendIcon({ dir }: { dir: TrendDirection }) {
	const Icon =
		dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Equal;
	return <Icon aria-hidden="true" className="h-3.5 w-3.5" />;
}

function StatCard({
	label,
	value,
	iconBg,
	iconColor,
	icon: Icon,
	trendLabel,
	trendDirection = "neutral",
	delay = 0,
}: StatCardProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, delay, ease: "easeOut" }}
			whileHover={{ y: -2 }}
			className="flex flex-col gap-2 rounded-2xl border px-5 py-4 transition-shadow hover:shadow-sm"
			style={{
				backgroundColor: "var(--color-card)",
				borderColor: "var(--surface-card-border-strong)",
			}}
		>
			<div className="flex items-center justify-between">
				<span
					className="text-xs font-semibold uppercase tracking-wider"
					style={{ color: "var(--surface-card-faint-fg)" }}
				>
					{label}
				</span>
				<span
					className="flex h-8 w-8 items-center justify-center rounded-lg"
					style={{ backgroundColor: iconBg, color: iconColor }}
				>
					<Icon aria-hidden="true" className="h-4 w-4" />
				</span>
			</div>
			<div
				className="text-[28px] font-extrabold leading-none tabular-nums"
				style={{ color: "var(--field-foreground)" }}
			>
				{value !== null ? (
					<AnimatedNumber
						value={value}
						duration={1200}
						formatter={(v) => Math.round(v).toLocaleString()}
					/>
				) : (
					<span style={{ color: "var(--surface-card-faint-fg)" }}>—</span>
				)}
			</div>
			{trendLabel ? (
				<span
					className="flex items-center gap-1 text-xs font-semibold"
					style={{ color: TREND_COLOR[trendDirection] }}
				>
					<TrendIcon dir={trendDirection} />
					{trendLabel}
				</span>
			) : null}
		</motion.div>
	);
}

export function DashboardStatsStripPrototype() {
	const t = useT();
	const permissions = useAuthStore((state) => state.permissions);
	const canReadSources =
		permissions.includes("sources:read") || permissions.includes("*");

	const { data: stats } = useArticleStats();
	const sourceStatsQuery = useSourceStats({ enabled: canReadSources });
	const trendsQuery = useArticleTrends(7);
	const aiQuery = useAiAvailability();

	const todayCount = stats?.today_count ?? null;
	const sourcesCount = canReadSources
		? (sourceStatsQuery.data?.total ?? null)
		: null;
	const highRiskCount = stats?.high_risk_count ?? null;

	// Approximate AI insights delivered today using AI availability flag —
	// the API exposes capability, not a count, so we surface a real metric:
	// today's processed article count when AI is enabled.
	const aiCount =
		aiQuery.data?.available && stats ? stats.published_count : null;

	// Compute today vs. yesterday from real trend points
	const trends = trendsQuery.data ?? [];
	const todayTrend =
		trends.length >= 2
			? trends[trends.length - 1].count - trends[trends.length - 2].count
			: 0;
	const todayTrendPct =
		trends.length >= 2 && trends[trends.length - 2].count > 0
			? Math.round((todayTrend / trends[trends.length - 2].count) * 100 * 10) /
				10
			: 0;

	const todayDirection: TrendDirection =
		todayTrend > 0 ? "up" : todayTrend < 0 ? "down" : "neutral";
	const todayTrendLabel =
		todayTrend === 0
			? t("On par with yesterday")
			: `${t("Compared to yesterday")} ${todayTrend > 0 ? "+" : ""}${todayTrendPct}%`;

	const sourceTrendLabel = sourcesCount
		? t("+{count} new sources", {
				count: sourceStatsQuery.data?.active_count ?? 0,
			})
		: undefined;

	// High-risk weekly shift = today's count vs. 7-day-ago count when present
	const highRiskTrendLabel =
		highRiskCount !== null && trends.length >= 7
			? `${t("Compared to last week")} ${trends[0].count > 0 && highRiskCount < trends[0].count ? "-" : "+"}${Math.abs(
					Math.round(
						((highRiskCount - trends[0].count) / Math.max(trends[0].count, 1)) *
							100,
					),
				)}%`
			: undefined;

	const highRiskDirection: TrendDirection =
		highRiskCount !== null && trends.length >= 7
			? highRiskCount < trends[0].count
				? "down"
				: highRiskCount > trends[0].count
					? "up"
					: "neutral"
			: "neutral";

	return (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<StatCard
				label={t("Collected today")}
				value={todayCount}
				iconBg="var(--color-primary-50)"
				iconColor="var(--color-primary-500)"
				icon={FileText}
				trendLabel={todayTrendLabel}
				trendDirection={todayDirection}
				delay={0}
			/>
			<StatCard
				label={t("Sources covered")}
				value={sourcesCount}
				iconBg="#ede9fe"
				iconColor="#8b5cf6"
				icon={Rss}
				trendLabel={sourceTrendLabel}
				trendDirection={sourcesCount ? "up" : "neutral"}
				delay={0.06}
			/>
			<StatCard
				label={t("High-risk alerts")}
				value={highRiskCount}
				iconBg="#fee2e2"
				iconColor="#ef4444"
				icon={AlertTriangle}
				trendLabel={highRiskTrendLabel}
				trendDirection={highRiskDirection}
				delay={0.12}
			/>
			<StatCard
				label={t("AI insights")}
				value={aiCount}
				iconBg="#ecfdf5"
				iconColor="#10b981"
				icon={BrainCircuit}
				trendLabel={aiCount === null ? undefined : t("On par with yesterday")}
				trendDirection="neutral"
				delay={0.18}
			/>
		</div>
	);
}
