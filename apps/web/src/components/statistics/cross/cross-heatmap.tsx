"use client";

import type { CrossDimensionalCell } from "@/hooks/use-statistics";
import { useCallback, useEffect, useRef } from "react";

interface CrossHeatmapProps {
	cells: CrossDimensionalCell[];
	xLabels: string[];
	yLabels: string[];
	xTitle: string;
	yTitle: string;
}

export function CrossHeatmap({
	cells,
	xLabels,
	yLabels,
}: CrossHeatmapProps) {
	const chartRef = useRef<HTMLDivElement>(null);
	const chartInstanceRef = useRef<unknown>(null);

	const renderChart = useCallback(async () => {
		if (!chartRef.current) return;

		const echarts = await import("echarts");

		if (chartInstanceRef.current) {
			(chartInstanceRef.current as { dispose: () => void }).dispose();
		}

		const chart = echarts.init(chartRef.current);
		chartInstanceRef.current = chart;

		const heatmapData = cells.map((cell) => [
			xLabels.indexOf(cell.x_value),
			yLabels.indexOf(cell.y_value),
			cell.count,
		]);

		const maxValue = Math.max(...cells.map((c) => c.count), 1);

		const tooltipFormatter = (params: Record<string, unknown>) => {
			const data = (params as { data?: number[] }).data;
			if (!data) return "";
			return `${xLabels[data[0]]} x ${yLabels[data[1]]}: ${data[2]}`;
		};

		chart.setOption({
			tooltip: {
				position: "top" as const,
				formatter: tooltipFormatter as unknown as string,
			},
			grid: {
				top: "5%",
				left: "15%",
				right: "12%",
				bottom: "20%",
			},
			xAxis: {
				type: "category",
				data: xLabels,
				axisLabel: { rotate: 30, fontSize: 11 },
				splitArea: { show: true },
			},
			yAxis: {
				type: "category",
				data: yLabels,
				axisLabel: { fontSize: 11 },
				splitArea: { show: true },
			},
			visualMap: {
				min: 0,
				max: maxValue,
				calculable: true,
				orient: "horizontal",
				left: "center",
				bottom: "2%",
				inRange: {
					color: [
						"#f0f9ff",
						"#bfdbfe",
						"#60a5fa",
						"#2563eb",
						"#1e40af",
					],
				},
			},
			series: [
				{
					type: "heatmap",
					data: heatmapData,
					label: {
						show: true,
						fontSize: 11,
					},
					emphasis: {
						itemStyle: {
							shadowBlur: 10,
							shadowColor: "rgba(0, 0, 0, 0.5)",
						},
					},
				},
			],
		});

		const handleResize = () => chart.resize();
		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
			chart.dispose();
		};
	}, [cells, xLabels, yLabels]);

	useEffect(() => {
		const cleanup = renderChart();
		return () => {
			cleanup?.then((fn) => fn?.());
		};
	}, [renderChart]);

	return <div ref={chartRef} style={{ height: "400px", width: "100%" }} />;
}
