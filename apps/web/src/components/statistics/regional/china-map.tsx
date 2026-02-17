"use client";

import { useT } from "@/lib/i18n-client";
import { useCallback, useEffect, useRef, useState } from "react";

interface ChinaMapProps {
	data: Array<{ name: string; value: number }>;
}

// Store the echarts module after dynamic import
type EChartsModule = typeof import("echarts");

export function ChinaMap({ data }: ChinaMapProps) {
	const t = useT();
	const chartRef = useRef<HTMLDivElement>(null);
	const [mapReady, setMapReady] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const echartsRef = useRef<EChartsModule | null>(null);

	const initChart = useCallback(async () => {
		if (!chartRef.current) return;

		try {
			const echarts = await import("echarts");
			echartsRef.current = echarts;

			// Fetch China GeoJSON
			const response = await fetch(
				"https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
			);
			if (!response.ok) {
				throw new Error(`Failed to load map data: ${response.status}`);
			}
			const geoJson = await response.json();
			echarts.registerMap(
				"china",
				geoJson as Parameters<typeof echarts.registerMap>[1],
			);
			setMapReady(true);
		} catch (error) {
			console.error("China map initialization failed", error);
			setLoadError(true);
		}
	}, []);

	useEffect(() => {
		initChart();
	}, [initChart]);

	useEffect(() => {
		if (!mapReady || !chartRef.current || !echartsRef.current) return;

		const echarts = echartsRef.current;
		const chart = echarts.init(chartRef.current);

		const maxValue = Math.max(...data.map((d) => d.value), 1);

		const tooltipFormatter = (params: { name?: string; value?: number }) => {
			const name = String(params?.name ?? "");
			const value = Number(params?.value ?? 0);
			return `${name}: ${value} ${t("articles")}`;
		};

		chart.setOption({
			tooltip: {
				trigger: "item",
				formatter: tooltipFormatter as unknown as string,
			},
			visualMap: {
				min: 0,
				max: maxValue,
				left: "left",
				top: "bottom",
				text: [t("High"), t("Low")],
				inRange: {
					color: ["#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"],
				},
				calculable: true,
			},
			series: [
				{
					name: t("Article count"),
					type: "map",
					map: "china",
					roam: true,
					label: {
						show: true,
						fontSize: 8,
						color: "#666",
					},
					data: data,
					emphasis: {
						label: {
							show: true,
							fontSize: 12,
							fontWeight: "bold",
						},
						itemStyle: { areaColor: "#ffd700" },
					},
					itemStyle: {
						borderColor: "#fff",
						borderWidth: 0.5,
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
	}, [mapReady, data, t]);

	if (loadError) {
		return (
			<div className="flex h-[500px] items-center justify-center text-sm text-neutral-500">
				{t("Failed to load map data. Please check your network connection.")}
			</div>
		);
	}

	if (!mapReady) {
		return (
			<div className="flex h-[500px] items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
			</div>
		);
	}

	return <div ref={chartRef} style={{ height: "500px", width: "100%" }} />;
}
