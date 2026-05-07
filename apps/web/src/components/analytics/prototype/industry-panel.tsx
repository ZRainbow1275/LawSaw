"use client";

/**
 * IndustryPanel — 行业分析 tab. ECharts pie chart (top 10 domains) + sorted
 * horizontal bar chart underneath.
 */

import { useIndustryStats } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { useMemo } from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

const stackStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 16,
};

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

const PALETTE = [
	"#ff6b35",
	"#3498db",
	"#9b59b6",
	"#27ae60",
	"#f39c12",
	"#e74c3c",
	"#1abc9c",
	"#e91e63",
	"#795548",
	"#2196f3",
];

export function IndustryPanel() {
	const t = useT();
	const { data, isLoading, isError } = useIndustryStats({ includeSub: true });
	const items = useMemo(() => data?.items ?? [], [data]);

	const pieOption = useMemo(() => {
		const top = [...items]
			.sort((a, b) => b.count - a.count)
			.slice(0, 10)
			.map((it, i) => ({
				name: it.label || it.domain_root,
				value: it.count,
				itemStyle: { color: PALETTE[i % PALETTE.length] },
			}));

		return {
			backgroundColor: "transparent",
			textStyle: { fontFamily: "Inter, Noto Sans SC, sans-serif" },
			tooltip: {
				trigger: "item" as const,
				formatter: "{b}<br/>{c} 篇 ({d}%)",
			},
			legend: {
				orient: "vertical" as const,
				right: 16,
				top: "middle",
				textStyle: { color: "var(--surface-card-muted-fg)", fontSize: 12 },
				icon: "circle",
			},
			series: [
				{
					type: "pie",
					radius: ["40%", "68%"],
					center: ["38%", "50%"],
					avoidLabelOverlap: true,
					label: {
						show: true,
						position: "outer" as const,
						formatter: "{b} {d}%",
						color: "var(--surface-card-muted-fg)",
						fontSize: 12,
					},
					labelLine: { length: 8, length2: 6 },
					data: top,
				},
			],
		};
	}, [items]);

	const barOption = useMemo(() => {
		const sorted = [...items].sort((a, b) => a.count - b.count).slice(-12);
		return {
			backgroundColor: "transparent",
			tooltip: {
				trigger: "axis" as const,
				axisPointer: { type: "shadow" as const },
			},
			grid: { top: 16, bottom: 24, left: 100, right: 24, containLabel: true },
			xAxis: {
				type: "value" as const,
				splitLine: { lineStyle: { color: "rgba(0,0,0,0.05)" } },
				axisLabel: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
			},
			yAxis: {
				type: "category" as const,
				data: sorted.map((it) => it.label || it.domain_root),
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: { color: "var(--surface-card-muted-fg)", fontSize: 12 },
			},
			series: [
				{
					type: "bar",
					data: sorted.map((it, i) => ({
						value: it.count,
						itemStyle: {
							color: PALETTE[PALETTE.length - 1 - (i % PALETTE.length)],
							borderRadius: [0, 6, 6, 0],
						},
					})),
					barWidth: 16,
					label: {
						show: true,
						position: "right" as const,
						color: "var(--surface-card-muted-fg)",
						fontSize: 11,
						fontWeight: 600,
					},
				},
			],
		};
	}, [items]);

	if (isLoading) {
		return (
			<div style={cardStyle}>
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
			</div>
		);
	}

	if (isError) {
		return (
			<div style={cardStyle}>
				<div
					style={{
						padding: 32,
						fontSize: 13,
						color: "var(--color-error)",
						textAlign: "center",
					}}
				>
					{t("Failed to load")}
				</div>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div style={cardStyle}>
				<div
					style={{
						padding: 32,
						fontSize: 13,
						color: "var(--surface-card-faint-fg)",
						textAlign: "center",
					}}
				>
					{t("No data")}
				</div>
			</div>
		);
	}

	return (
		<div style={stackStyle}>
			<div style={cardStyle}>
				<div style={sectionTitleStyle}>{t("Domain Distribution")}</div>
				<ReactECharts
					option={pieOption}
					notMerge
					lazyUpdate
					style={{ width: "100%", height: 360 }}
					opts={{ renderer: "canvas" }}
				/>
			</div>
			<div style={cardStyle}>
				<div style={sectionTitleStyle}>{t("Domain Comparison")}</div>
				<ReactECharts
					option={barOption}
					notMerge
					lazyUpdate
					style={{
						width: "100%",
						height: Math.max(280, items.length * 28 + 60),
					}}
					opts={{ renderer: "canvas" }}
				/>
			</div>
		</div>
	);
}
