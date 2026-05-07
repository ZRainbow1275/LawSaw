"use client";

/**
 * ImportancePanel — 重要性分析 tab. ECharts scatter plot:
 *   x = published_at (timestamp)
 *   y = importance score
 *   size = authority_level
 *   color = risk_level (low/medium/high/critical/unknown)
 * Tooltip shows article title.
 */

import { useArticles } from "@/hooks/use-articles";
import { getArticleRiskLevel } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useMemo } from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 12,
	padding: 20,
};

const sectionTitleStyle: CSSProperties = {
	fontSize: 14,
	fontWeight: 700,
	color: "var(--surface-card-foreground)",
	marginBottom: 16,
};

const RISK_COLOR: Record<string, string> = {
	unknown: "#adb5bd",
	low: "#4caf50",
	medium: "#ff9800",
	high: "#f44336",
	critical: "#9c27b0",
};

const RISK_LABEL: Record<string, string> = {
	unknown: "未知",
	low: "低",
	medium: "中",
	high: "高",
	critical: "严重",
};

export function ImportancePanel() {
	const t = useT();
	const { data, isLoading, isError } = useArticles({
		limit: 200,
		status: "published",
	});

	const points = useMemo(() => {
		const arts = data?.data ?? [];
		const grouped: Record<string, Array<[number, number, number, string]>> = {
			unknown: [],
			low: [],
			medium: [],
			high: [],
			critical: [],
		};
		for (const a of arts) {
			if (a.importance == null) continue;
			const ts = a.published_at
				? new Date(a.published_at).getTime()
				: new Date(a.created_at).getTime();
			if (!Number.isFinite(ts)) continue;
			const auth = a.authority_level ?? 1;
			const level = getArticleRiskLevel(a.risk_score);
			grouped[level].push([ts, a.importance, auth, a.title]);
		}
		return grouped;
	}, [data]);

	const option = useMemo(() => {
		const series = (Object.keys(points) as Array<keyof typeof points>).map(
			(level) => ({
				name: RISK_LABEL[level],
				type: "scatter" as const,
				data: points[level],
				symbolSize: (val: number[]) => {
					const auth = val[2] ?? 1;
					return Math.max(6, Math.min(28, 6 + auth * 4));
				},
				itemStyle: { color: RISK_COLOR[level], opacity: 0.78 },
				emphasis: { focus: "series" as const, scale: 1.2 },
			}),
		);

		return {
			backgroundColor: "transparent",
			textStyle: { fontFamily: "Inter, Noto Sans SC, sans-serif" },
			tooltip: {
				trigger: "item" as const,
				formatter: (p: {
					value: [number, number, number, string];
					seriesName: string;
				}) => {
					const [ts, imp, auth, title] = p.value;
					const date = new Date(ts).toISOString().slice(0, 10);
					return `<div style="font-weight:600;max-width:260px;white-space:normal;">${title}</div>
<div style="margin-top:6px;font-size:11px;color:#6c757d;">
${date} · 重要度 ${imp} · 权威 ${auth} · 风险 ${p.seriesName}
</div>`;
				},
			},
			legend: {
				top: 0,
				right: 16,
				icon: "circle",
				textStyle: { color: "var(--surface-card-muted-fg)", fontSize: 12 },
				data: Object.values(RISK_LABEL),
			},
			grid: { top: 36, bottom: 36, left: 36, right: 16, containLabel: true },
			xAxis: {
				type: "time" as const,
				axisLine: { lineStyle: { color: "var(--surface-card-border-strong)" } },
				axisLabel: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
				splitLine: { show: false },
			},
			yAxis: {
				type: "value" as const,
				name: t("Importance"),
				nameTextStyle: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
				axisLine: { lineStyle: { color: "var(--surface-card-border-strong)" } },
				axisLabel: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
				splitLine: { lineStyle: { color: "rgba(0,0,0,0.05)" } },
			},
			series,
		};
	}, [points, t]);

	const totalPts =
		points.unknown.length +
		points.low.length +
		points.medium.length +
		points.high.length +
		points.critical.length;

	return (
		<div style={cardStyle}>
			<div style={sectionTitleStyle}>{t("Importance Distribution")}</div>
			{isLoading ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 80,
						color: "var(--surface-card-faint-fg)",
					}}
				>
					<Loader2 aria-hidden="true" size={20} className="animate-spin" />
				</div>
			) : isError ? (
				<div
					style={{
						padding: 32,
						color: "var(--color-error)",
						fontSize: 13,
						textAlign: "center",
					}}
				>
					{t("Failed to load")}
				</div>
			) : totalPts === 0 ? (
				<div
					style={{
						padding: 32,
						color: "var(--surface-card-faint-fg)",
						fontSize: 13,
						textAlign: "center",
					}}
				>
					{t("No importance data")}
				</div>
			) : (
				<ReactECharts
					option={option}
					notMerge
					lazyUpdate
					style={{ width: "100%", height: 460 }}
					opts={{ renderer: "canvas" }}
				/>
			)}
		</div>
	);
}
