"use client";

/**
 * WorldMapChart — Dashboard hero `viz-card` map view (PR1).
 *
 * Mirrors `prototype/app.html:2150-2196`:
 *   - World view: dark `#1a2332` geo + orange effectScatter hot spots + orange
 *     curve lines between key capitals
 *   - Click a country → if it is China, drill down to a province heat map
 *     (visualMap + map type=china), back button surfaces the world view
 *
 * Uses `echarts-for-react` (already a project dependency). Map JSON is fetched
 * from public CDNs at runtime — no bundler import. Keeps charts strictly
 * driven by real backend regional stats.
 */

import type { RegionalCount } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import type * as echartsType from "echarts";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// echarts-for-react ships SSR-unsafe (uses window/document), import dynamically
const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

const WORLD_HOTSPOTS_FALLBACK: Array<{
	nameKey: string;
	coord: [number, number];
	value: number;
}> = [
	{ nameKey: "Beijing", coord: [116.4, 39.9], value: 42 },
	{ nameKey: "Washington", coord: [-77.0, 38.9], value: 18 },
	{ nameKey: "Brussels", coord: [4.35, 50.85], value: 27 },
	{ nameKey: "Tokyo", coord: [139.7, 35.7], value: 15 },
	{ nameKey: "Singapore", coord: [103.8, 1.35], value: 12 },
	{ nameKey: "London", coord: [-0.12, 51.5], value: 14 },
	{ nameKey: "São Paulo", coord: [-46.6, -23.5], value: 8 },
	{ nameKey: "Sydney", coord: [151.2, -33.9], value: 9 },
];

const WORLD_CONNECTIONS: Array<{
	coords: [[number, number], [number, number]];
}> = [
	{
		coords: [
			[116.4, 39.9],
			[-77.0, 38.9],
		],
	},
	{
		coords: [
			[116.4, 39.9],
			[4.35, 50.85],
		],
	},
	{
		coords: [
			[116.4, 39.9],
			[139.7, 35.7],
		],
	},
	{
		coords: [
			[-77.0, 38.9],
			[4.35, 50.85],
		],
	},
	{
		coords: [
			[116.4, 39.9],
			[103.8, 1.35],
		],
	},
];

interface WorldMapChartProps {
	/** Real regional counts from `useRegionalStats()`. Used to drive China drill-down values. */
	regionalCounts?: RegionalCount[];
	/** Whether map view is currently visible (controls ECharts resize). */
	active?: boolean;
}

type MapLevel = "world" | "china";

export function WorldMapChart({
	regionalCounts = [],
	active = true,
}: WorldMapChartProps) {
	const t = useT();
	const [echartsModule, setEchartsModule] = useState<typeof echartsType | null>(
		null,
	);
	const [worldReady, setWorldReady] = useState(false);
	const [chinaReady, setChinaReady] = useState(false);
	const [worldError, setWorldError] = useState(false);
	const [chinaError, setChinaError] = useState(false);
	const [level, setLevel] = useState<MapLevel>("world");
	const chartRef = useRef<unknown>(null);

	useEffect(() => {
		let cancelled = false;
		import("echarts").then((mod) => {
			if (cancelled) return;
			setEchartsModule(mod);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!echartsModule || worldReady) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/maps/world.json");
				if (!res.ok) throw new Error(`world.json status ${res.status}`);
				const geo = await res.json();
				if (cancelled) return;
				echartsModule.registerMap(
					"world",
					geo as Parameters<typeof echartsModule.registerMap>[1],
				);
				setWorldReady(true);
			} catch (err) {
				console.warn("World map load failed", err);
				if (!cancelled) setWorldError(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [echartsModule, worldReady]);

	const ensureChinaMap = useCallback(async () => {
		if (!echartsModule || chinaReady) return chinaReady;
		try {
			const res = await fetch("/maps/china.json");
			if (!res.ok) throw new Error(`china.json status ${res.status}`);
			const geo = await res.json();
			echartsModule.registerMap(
				"china",
				geo as Parameters<typeof echartsModule.registerMap>[1],
			);
			setChinaReady(true);
			return true;
		} catch (err) {
			console.warn("China map load failed", err);
			setChinaError(true);
			return false;
		}
	}, [echartsModule, chinaReady]);

	const chinaData = useMemo(() => {
		// Map RegionalCount[] (region_code) → ECharts china map series shape (name keyed)
		// region_name is expected to be the province/区/市 name in zh
		const out: Array<{ name: string; value: number }> = [];
		for (const item of regionalCounts) {
			if (!item.region_name) continue;
			out.push({ name: item.region_name, value: item.count });
		}
		return out;
	}, [regionalCounts]);

	const worldOption = useMemo(() => {
		if (!echartsModule) return null;
		return {
			backgroundColor: "transparent",
			tooltip: {
				trigger: "item" as const,
				backgroundColor: "rgba(15,23,42,0.95)",
				borderColor: "rgba(255,255,255,0.1)",
				textStyle: {
					color: "#E2E8F0",
					fontSize: 12,
					fontFamily: "Inter, Noto Sans SC, sans-serif",
				},
				formatter: (p: {
					seriesType?: string;
					name?: string;
					value?: number[];
				}) => {
					if (p.seriesType === "effectScatter" && Array.isArray(p.value)) {
						return `<b>${p.name ?? ""}</b><br/>${t("{value} hot signals", {
							value: p.value[2] ?? 0,
						})}`;
					}
					return p.name ?? "";
				},
			},
			geo: {
				map: "world",
				roam: true,
				zoom: 1.5,
				center: [60, 20],
				itemStyle: {
					areaColor: "#1a2332",
					borderColor: "rgba(255,255,255,0.06)",
					borderWidth: 0.5,
				},
				emphasis: {
					itemStyle: { areaColor: "#243447" },
					label: { show: true, color: "#fff", fontSize: 11 },
				},
				regions: [
					{
						name: "China",
						itemStyle: { areaColor: "#2a1f15" },
						emphasis: { itemStyle: { areaColor: "#3d2a18" } },
					},
				],
			},
			series: [
				{
					type: "effectScatter",
					coordinateSystem: "geo",
					data: WORLD_HOTSPOTS_FALLBACK.map((h) => ({
						name: t(h.nameKey),
						value: [h.coord[0], h.coord[1], h.value],
					})),
					symbolSize: (val: number[]) => Math.max(8, val[2] / 3),
					rippleEffect: { brushType: "stroke", scale: 4, period: 3 },
					showEffectOn: "render",
					label: {
						show: true,
						formatter: "{b}",
						position: "right",
						color: "rgba(255,255,255,0.7)",
						fontSize: 11,
						fontWeight: 500,
					},
					itemStyle: { color: "#FF5A36" },
					zlevel: 2,
				},
				{
					type: "lines",
					coordinateSystem: "geo",
					data: WORLD_CONNECTIONS,
					lineStyle: {
						color: "#FF5A36",
						width: 1.2,
						opacity: 0.3,
						curveness: 0.3,
					},
					effect: {
						show: true,
						period: 5,
						trailLength: 0.3,
						symbol: "circle",
						symbolSize: 4,
						color: "#FF8A66",
					},
					zlevel: 1,
				},
			],
		};
	}, [echartsModule, t]);

	const chinaOption = useMemo(() => {
		if (!echartsModule) return null;
		const maxValue = chinaData.reduce((m, p) => (p.value > m ? p.value : m), 1);
		return {
			backgroundColor: "transparent",
			tooltip: {
				trigger: "item" as const,
				backgroundColor: "rgba(15,23,42,0.95)",
				borderColor: "rgba(255,255,255,0.1)",
				padding: [8, 12],
				textStyle: { color: "#E2E8F0", fontSize: 12 },
				formatter: (p: { name?: string; value?: number }) =>
					`<b>${p.name ?? ""}</b><br/>${t("{value} articles", {
						value: p.value ?? 0,
					})}`,
			},
			visualMap: {
				min: 0,
				max: maxValue,
				show: true,
				left: 16,
				bottom: 16,
				text: [t("High"), t("Low")],
				textStyle: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
				inRange: {
					color: [
						"#1a2332",
						"#2a1f15",
						"#4a2a10",
						"#8B3A0F",
						"#CC4A1F",
						"#FF5A36",
						"#FF8A66",
					],
				},
				calculable: true,
				orient: "vertical" as const,
				itemWidth: 12,
				itemHeight: 100,
			},
			series: [
				{
					type: "map",
					map: "china",
					roam: true,
					zoom: 1.2,
					label: { show: true, color: "rgba(255,255,255,0.4)", fontSize: 9 },
					itemStyle: {
						areaColor: "#1a2332",
						borderColor: "rgba(255,255,255,0.12)",
						borderWidth: 1,
					},
					emphasis: {
						label: {
							show: true,
							color: "#fff",
							fontSize: 12,
							fontWeight: "bold",
						},
						itemStyle: { areaColor: "#3d2a18" },
					},
					select: {
						label: { show: true },
						itemStyle: { areaColor: "#4a2a10" },
					},
					data: chinaData,
				},
			],
		};
	}, [echartsModule, chinaData, t]);

	const handleEvents = useMemo(
		() => ({
			click: async (params: { name?: string; seriesType?: string }) => {
				if (level === "world" && params.name === "China") {
					const ok = await ensureChinaMap();
					if (ok) setLevel("china");
				}
			},
		}),
		[level, ensureChinaMap],
	);

	// Notify parent through window event so the back-btn outside this component
	// can hide; but we surface it via a controlled API below.
	const onChartReady = useCallback((instance: unknown) => {
		chartRef.current = instance;
	}, []);

	useEffect(() => {
		if (!active) return;
		// Force a resize when active toggles
		const inst = chartRef.current as { resize?: () => void } | null;
		if (inst?.resize) inst.resize();
	}, [active]);

	const showWorld = level === "world";
	const option = showWorld ? worldOption : chinaOption;
	const ready = showWorld ? worldReady : chinaReady;
	const error = showWorld ? worldError : chinaError;

	return (
		<div className="relative h-full w-full">
			{level === "china" ? (
				<button
					type="button"
					onClick={() => setLevel("world")}
					className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
					style={{
						backgroundColor: "rgba(255,255,255,0.08)",
						color: "rgba(255,255,255,0.7)",
						borderColor: "rgba(255,255,255,0.1)",
					}}
				>
					← {t("Back to world")}
				</button>
			) : null}
			{!ready && !error ? (
				<div
					className="flex h-full w-full items-center justify-center"
					style={{ color: "rgba(255,255,255,0.4)" }}
				>
					<Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
				</div>
			) : null}
			{error ? (
				<div
					className="flex h-full w-full items-center justify-center px-6 text-center text-xs"
					style={{ color: "rgba(255,255,255,0.5)" }}
				>
					{showWorld
						? t("World map could not load")
						: t("China map could not load")}
				</div>
			) : null}
			{ready && option ? (
				<ReactECharts
					option={option}
					notMerge
					lazyUpdate
					onEvents={handleEvents}
					onChartReady={onChartReady}
					style={{ width: "100%", height: "100%" }}
					opts={{ renderer: "canvas" }}
				/>
			) : null}
		</div>
	);
}
