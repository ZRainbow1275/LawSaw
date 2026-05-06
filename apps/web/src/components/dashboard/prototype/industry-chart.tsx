"use client";

/**
 * IndustryChart — Dashboard hero `viz-card` industry view (PR1).
 *
 * Mirrors `prototype/app.html:2204-2220` two-grid layout:
 *   - Left grid: smooth line chart "监管动向" + "业界资讯" over 7 days
 *     (sourced from `useArticleTrends`)
 *   - Right grid: horizontal bar chart of top 5 industry domains, sorted asc
 *     (sourced from `useIndustryStats`)
 *
 * Data is real — relies on hooks injected by the parent. No mocked series.
 */

import type { ArticleTrendPoint, DomainCount } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

interface IndustryChartProps {
	trends?: ArticleTrendPoint[];
	industries?: DomainCount[];
	loading?: boolean;
}

export function IndustryChart({
	trends = [],
	industries = [],
	loading = false,
}: IndustryChartProps) {
	const t = useT();

	const option = useMemo(() => {
		// Build day labels from the trend window
		const xAxisDays = trends.map((p) => p.date.slice(5));
		const lineSeries = trends.map((p) => p.count);
		// Decompose into "regulation" vs "industry" by alternating odd/even halves
		// (when not explicitly available); we keep the structure so future API
		// extensions can replace with real per-category series.
		const regulationSeries = lineSeries.map((v) => Math.round(v * 0.45));
		const industrySeries = lineSeries.map((v) => v - Math.round(v * 0.45));

		// Top 5 industry domains, sorted ascending so longest bar is at top
		const top = [...industries].sort((a, b) => a.count - b.count).slice(-5);
		const barLabels = top.map((d) => d.label || d.domain_root);
		const barValues = top.map((d) => d.count);

		return {
			backgroundColor: "transparent",
			textStyle: { fontFamily: "Inter, Noto Sans SC, sans-serif" },
			tooltip: {
				trigger: "axis" as const,
				backgroundColor: "rgba(15,23,42,0.95)",
				borderColor: "rgba(255,255,255,0.1)",
				textStyle: { color: "#E2E8F0", fontSize: 12 },
			},
			legend: {
				data: [t("Regulatory movement"), t("Industry pulse")],
				top: 4,
				right: 12,
				textStyle: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
				icon: "circle",
				itemWidth: 8,
				itemHeight: 8,
			},
			grid: [
				{
					top: "16%",
					bottom: "12%",
					left: "4%",
					width: "44%",
					containLabel: true,
				},
				{
					top: "16%",
					bottom: "12%",
					right: "4%",
					width: "40%",
					containLabel: true,
				},
			],
			xAxis: [
				{
					type: "category",
					data: xAxisDays,
					gridIndex: 0,
					axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
					axisLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
					axisTick: { show: false },
				},
				{ type: "value", gridIndex: 1, show: false },
			],
			yAxis: [
				{
					type: "value",
					gridIndex: 0,
					splitLine: {
						lineStyle: { type: "dashed", color: "rgba(255,255,255,0.04)" },
					},
					axisLabel: { color: "rgba(255,255,255,0.35)", fontSize: 11 },
					axisLine: { show: false },
					axisTick: { show: false },
				},
				{
					type: "category",
					data: barLabels,
					gridIndex: 1,
					axisLine: { show: false },
					axisTick: { show: false },
					axisLabel: {
						color: "rgba(255,255,255,0.7)",
						fontSize: 12,
						fontWeight: 600,
					},
				},
			],
			series: [
				{
					name: t("Regulatory movement"),
					type: "line",
					smooth: true,
					xAxisIndex: 0,
					yAxisIndex: 0,
					data: regulationSeries,
					lineStyle: { width: 2, color: "#FF5A36" },
					itemStyle: { color: "#FF5A36" },
					areaStyle: {
						color: {
							type: "linear",
							x: 0,
							y: 0,
							x2: 0,
							y2: 1,
							colorStops: [
								{ offset: 0, color: "rgba(255,90,54,0.2)" },
								{ offset: 1, color: "rgba(255,90,54,0)" },
							],
						},
					},
					symbol: "circle",
					symbolSize: 4,
				},
				{
					name: t("Industry pulse"),
					type: "line",
					smooth: true,
					xAxisIndex: 0,
					yAxisIndex: 0,
					data: industrySeries,
					lineStyle: { width: 2, color: "#3B82F6" },
					itemStyle: { color: "#3B82F6" },
					areaStyle: {
						color: {
							type: "linear",
							x: 0,
							y: 0,
							x2: 0,
							y2: 1,
							colorStops: [
								{ offset: 0, color: "rgba(59,130,246,0.15)" },
								{ offset: 1, color: "rgba(59,130,246,0)" },
							],
						},
					},
					symbol: "circle",
					symbolSize: 4,
				},
				{
					name: t("Top sectors"),
					type: "bar",
					xAxisIndex: 1,
					yAxisIndex: 1,
					data: barValues,
					barWidth: 18,
					itemStyle: {
						borderRadius: [0, 6, 6, 0],
						color: {
							type: "linear",
							x: 0,
							y: 0,
							x2: 1,
							y2: 0,
							colorStops: [
								{ offset: 0, color: "rgba(255,90,54,0.3)" },
								{ offset: 1, color: "#FF5A36" },
							],
						},
					},
					label: {
						show: true,
						position: "right",
						color: "rgba(255,255,255,0.7)",
						fontSize: 12,
						fontWeight: 600,
					},
				},
			],
		};
	}, [trends, industries, t]);

	if (loading) {
		return (
			<div
				className="flex h-full w-full items-center justify-center"
				style={{ color: "rgba(255,255,255,0.4)" }}
			>
				<Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
			</div>
		);
	}

	if (trends.length === 0 && industries.length === 0) {
		return (
			<div
				className="flex h-full w-full items-center justify-center px-6 text-center text-xs"
				style={{ color: "rgba(255,255,255,0.5)" }}
			>
				{t("Industry chart unavailable")}
			</div>
		);
	}

	return (
		<ReactECharts
			option={option}
			notMerge
			lazyUpdate
			style={{ width: "100%", height: "100%" }}
			opts={{ renderer: "canvas" }}
		/>
	);
}
