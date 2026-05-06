"use client";

/**
 * RiskBarChart — ECharts bar chart for the risk distribution panel
 * (prototype/app.html:1270-1299). 5 columns: 未知/低/中/高/严重.
 *
 * Colors: gray / green / orange / red / purple.
 */

import type { ArticleRiskCounts } from "@/lib/api/types";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

interface RiskBarChartProps {
	data: ArticleRiskCounts;
}

const RISK_COLORS = ["#adb5bd", "#4caf50", "#ff9800", "#f44336", "#9c27b0"];
const RISK_LABELS = ["未知", "低", "中", "高", "严重"];

export function RiskBarChart({ data }: RiskBarChartProps) {
	const option = useMemo(() => {
		const values = [
			data.unknown ?? 0,
			data.low ?? 0,
			data.medium ?? 0,
			data.high ?? 0,
			data.critical ?? 0,
		];

		return {
			backgroundColor: "transparent",
			textStyle: { fontFamily: "Inter, Noto Sans SC, sans-serif" },
			tooltip: {
				trigger: "axis" as const,
				axisPointer: { type: "shadow" as const },
				formatter: (params: Array<{ name: string; value: number }>) => {
					const p = params[0];
					return `<b>${p.name}</b><br/>${p.value} 篇`;
				},
			},
			grid: { top: 16, bottom: 32, left: 24, right: 16, containLabel: true },
			xAxis: {
				type: "category" as const,
				data: RISK_LABELS,
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: { color: "var(--color-neutral-500)", fontSize: 11 },
			},
			yAxis: {
				type: "value" as const,
				splitLine: { lineStyle: { color: "rgba(0,0,0,0.05)" } },
				axisLabel: { color: "var(--color-neutral-400)", fontSize: 11 },
			},
			series: [
				{
					type: "bar",
					data: values.map((v, i) => ({
						value: v,
						itemStyle: { color: RISK_COLORS[i], borderRadius: [4, 4, 0, 0] },
					})),
					barWidth: 28,
					label: {
						show: true,
						position: "top" as const,
						color: "var(--color-neutral-800)",
						fontSize: 12,
						fontWeight: 700,
					},
				},
			],
		};
	}, [data]);

	return (
		<ReactECharts
			option={option}
			notMerge
			lazyUpdate
			style={{ width: "100%", height: 220 }}
			opts={{ renderer: "canvas" }}
		/>
	);
}
