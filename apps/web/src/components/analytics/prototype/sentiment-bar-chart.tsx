"use client";

/**
 * SentimentBarChart — ECharts bar chart for sentiment distribution
 * (prototype/app.html:1303-1320). 3 columns: 积极/中性/消极.
 *
 * Colors: green / neutral-400 / red.
 */

import type { ArticleSentimentCounts } from "@/lib/api/types";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

interface SentimentBarChartProps {
	data: ArticleSentimentCounts;
}

const SENT_COLORS = ["#4caf50", "#adb5bd", "#f44336"];
const SENT_LABELS = ["积极", "中性", "消极"];

export function SentimentBarChart({ data }: SentimentBarChartProps) {
	const option = useMemo(() => {
		const values = [
			data.positive ?? 0,
			(data.neutral ?? 0) + (data.mixed ?? 0) + (data.unknown ?? 0),
			data.negative ?? 0,
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
				data: SENT_LABELS,
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
			},
			yAxis: {
				type: "value" as const,
				splitLine: { lineStyle: { color: "rgba(0,0,0,0.05)" } },
				axisLabel: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
			},
			series: [
				{
					type: "bar",
					data: values.map((v, i) => ({
						value: v,
						itemStyle: { color: SENT_COLORS[i], borderRadius: [4, 4, 0, 0] },
					})),
					barWidth: 36,
					label: {
						show: true,
						position: "top" as const,
						color: "var(--surface-card-foreground)",
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
