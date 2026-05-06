"use client";

import { useArticleStats } from "@/hooks/use-articles";
import { useSourceStats } from "@/hooks/use-sources";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import { AlertTriangle, BrainCircuit, FileText, Rss } from "lucide-react";

// ---- Stat card sub-component ----

interface StatCardProps {
	label: string;
	value: string | number;
	trend?: string;
	trendUp?: boolean;
	iconBg: string;
	iconColor: string;
	icon: typeof FileText;
	delay?: number;
}

function StatCard({
	label,
	value,
	trend,
	trendUp,
	iconBg,
	iconColor,
	icon: Icon,
	delay = 0,
}: StatCardProps) {
	const trendStyle = {
		color:
			trendUp === undefined
				? "var(--surface-muted-text)"
				: trendUp
					? "var(--color-success)"
					: "var(--color-error)",
	} as const;

	return (
		<motion.div
			className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4"
			style={{
				backgroundColor: "var(--color-card)",
				borderColor: "var(--surface-muted-border)",
				boxShadow: "var(--shadow-card)",
			}}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, delay, ease: "easeOut" }}
			whileHover={{ y: -2, boxShadow: "var(--shadow-card-hover)" }}
		>
			{/* Subtle glow */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-40 blur-xl transition-opacity group-hover:opacity-70"
				style={{ backgroundColor: iconColor }}
			/>

			<div className="relative flex items-center justify-between">
				<span
					className="text-xs font-medium"
					style={{ color: "var(--surface-muted-text)" }}
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

			<div className="relative">
				<span
					className="block text-2xl font-bold tabular-nums"
					style={{ color: "var(--field-foreground)" }}
				>
					{value}
				</span>
				{trend && (
					<span
						className="mt-0.5 flex items-center gap-1 text-xs font-medium"
						style={trendStyle}
					>
						{trend}
					</span>
				)}
			</div>
		</motion.div>
	);
}

// ---- Main strip component ----

interface DashboardStatsStripProps {
	/** Query AI insights count from article stats (processed_24h proxy) */
	aiInsightsCount?: number;
}

/**
 * DashboardStatsStrip — 4-card stats row matching prototype `.stats-strip`.
 * Wires to real API via useArticleStats() and useSourceStats().
 * Cards: today collected / sources covered / high-risk alerts / AI insights.
 */
export function DashboardStatsStrip({
	aiInsightsCount,
}: DashboardStatsStripProps) {
	const t = useT();
	const permissions = useAuthStore((state) => state.permissions);
	const canReadSources =
		permissions.includes("sources:read") || permissions.includes("*");

	const { data: stats } = useArticleStats();
	const sourceStatsQuery = useSourceStats({ enabled: canReadSources });

	const todayCount = stats?.today_count ?? "-";
	const sourcesCount = canReadSources
		? (sourceStatsQuery.data?.total ?? "-")
		: "-";
	const highRiskCount = stats?.high_risk_count ?? "-";
	const aiCount = aiInsightsCount ?? "-";

	const cards: StatCardProps[] = [
		{
			label: t("Collected today"),
			value: todayCount,
			iconBg: "var(--surface-accent-icon-bg)",
			iconColor: "var(--color-primary-500)",
			icon: FileText,
			delay: 0,
		},
		{
			label: t("Sources covered"),
			value: sourcesCount,
			iconBg: "#ede9fe",
			iconColor: "#8b5cf6",
			icon: Rss,
			delay: 0.06,
		},
		{
			label: t("High-risk alerts"),
			value: highRiskCount,
			iconBg: "#fee2e2",
			iconColor: "#ef4444",
			icon: AlertTriangle,
			delay: 0.12,
		},
		{
			label: t("AI insights"),
			value: aiCount,
			iconBg: "#ecfdf5",
			iconColor: "#10b981",
			icon: BrainCircuit,
			delay: 0.18,
		},
	];

	return (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{cards.map((card) => (
				<StatCard key={card.label} {...card} />
			))}
		</div>
	);
}
