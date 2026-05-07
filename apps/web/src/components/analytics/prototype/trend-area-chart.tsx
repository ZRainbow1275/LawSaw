"use client";

/**
 * TrendAreaChart — 7 day trend area chart with gradient fill
 * (prototype/app.html:1346-1364). Orange line + dotted markers.
 */

import type { ArticleTrendPoint } from "@/lib/api/types";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

interface TrendAreaChartProps {
	data: ArticleTrendPoint[];
}

const ZH_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function TrendAreaChart({ data }: TrendAreaChartProps) {
	const option = useMemo(() => {
		// Take last 7 points; if backend returned ascending dates, the last 7 are
		// the most recent week.
		const pts = data.slice(-7);
		const xLabels = pts.map((p) => {
			const d = new Date(p.date);
			if (Number.isNaN(d.getTime())) return p.date.slice(5);
			return ZH_DAYS[d.getDay()];
		});
		const values = pts.map((p) => p.count);

		return {
			backgroundColor: "transparent",
			textStyle: { fontFamily: "Inter, Noto Sans SC, sans-serif" },
			tooltip: {
				trigger: "axis" as const,
				formatter: (params: Array<{ name: string; value: number }>) => {
					const p = params[0];
					return `<b>${p.name}</b><br/>${p.value} 篇`;
				},
			},
			grid: { top: 16, bottom: 32, left: 24, right: 16, containLabel: true },
			xAxis: {
				type: "category" as const,
				data: xLabels,
				boundaryGap: false,
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
					type: "line",
					smooth: true,
					data: values,
					symbol: "circle",
					symbolSize: 6,
					lineStyle: { color: "#ff6b35", width: 2.5 },
					itemStyle: { color: "#ff6b35" },
					areaStyle: {
						color: {
							type: "linear",
							x: 0,
							y: 0,
							x2: 0,
							y2: 1,
							colorStops: [
								{ offset: 0, color: "rgba(255,107,53,0.3)" },
								{ offset: 1, color: "rgba(255,107,53,0)" },
							],
						},
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
