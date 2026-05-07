"use client";

/**
 * RegionPanel — 区域分析 tab. ECharts China map (visualMap heat) + top 10
 * region ranking with horizontal bar fills. Real data from useRegionalStats.
 */

import { useRegionalStats } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import type * as echartsType from "echarts";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

const layoutStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "1fr 360px",
	gap: 16,
};

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 12,
	padding: 20,
	minHeight: 480,
};

const sectionTitleStyle: CSSProperties = {
	fontSize: 14,
	fontWeight: 700,
	color: "var(--surface-card-foreground)",
	marginBottom: 16,
};

const rowStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "28px 1fr 60px",
	gap: 10,
	alignItems: "center",
	padding: "8px 0",
	borderBottom: "1px solid var(--surface-card-tint-bg)",
};

const rankStyle: CSSProperties = {
	fontSize: 12,
	fontWeight: 700,
	color: "var(--surface-card-faint-fg)",
	width: 24,
	height: 24,
	borderRadius: 6,
	background: "var(--surface-card-tint-bg)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
};

const nameStyle: CSSProperties = {
	fontSize: 13,
	fontWeight: 600,
	color: "var(--surface-card-foreground)",
	display: "flex",
	flexDirection: "column",
	gap: 4,
};

const barTrackStyle: CSSProperties = {
	height: 6,
	width: "100%",
	background: "var(--surface-card-tint-bg)",
	borderRadius: 4,
	overflow: "hidden",
};

const countStyle: CSSProperties = {
	fontSize: 13,
	fontWeight: 700,
	color: "var(--surface-card-foreground)",
	textAlign: "right",
};

export function RegionPanel() {
	const t = useT();
	const { data, isLoading, isError } = useRegionalStats();
	const items = useMemo(() => data?.items ?? [], [data]);

	const [echartsModule, setEchartsModule] = useState<typeof echartsType | null>(
		null,
	);
	const [chinaReady, setChinaReady] = useState(false);
	const [chinaError, setChinaError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		import("echarts").then((mod) => {
			if (!cancelled) setEchartsModule(mod);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const ensureChina = useCallback(async () => {
		if (!echartsModule || chinaReady) return;
		try {
			const res = await fetch(
				"https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
			);
			if (!res.ok) throw new Error(`china.json status ${res.status}`);
			const geo = await res.json();
			echartsModule.registerMap(
				"china",
				geo as Parameters<typeof echartsModule.registerMap>[1],
			);
			setChinaReady(true);
		} catch (err) {
			console.warn("China map load failed", err);
			setChinaError(true);
		}
	}, [echartsModule, chinaReady]);

	useEffect(() => {
		void ensureChina();
	}, [ensureChina]);

	const chinaData = useMemo(() => {
		return items
			.filter((it) => !!it.region_name)
			.map((it) => ({ name: it.region_name, value: it.count }));
	}, [items]);

	const top10 = useMemo(() => {
		return [...items].sort((a, b) => b.count - a.count).slice(0, 10);
	}, [items]);

	const maxCount = top10[0]?.count ?? 1;

	const option = useMemo(() => {
		if (!echartsModule || !chinaReady) return null;
		const max = chinaData.reduce((m, p) => (p.value > m ? p.value : m), 1) || 1;
		return {
			backgroundColor: "transparent",
			tooltip: {
				trigger: "item" as const,
				formatter: (p: { name?: string; value?: number }) =>
					`<b>${p.name ?? ""}</b><br/>${p.value ?? 0} 篇`,
			},
			visualMap: {
				min: 0,
				max,
				show: true,
				left: 16,
				bottom: 16,
				text: ["高", "低"],
				textStyle: { fontSize: 11, color: "var(--surface-card-faint-fg)" },
				inRange: {
					color: [
						"#fff4f1",
						"#ffe6dc",
						"#ffccb8",
						"#ffb394",
						"#ff9970",
						"#ff6b35",
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
					label: { show: false },
					itemStyle: {
						areaColor: "#f8f9fa",
						borderColor: "#dee2e6",
					},
					emphasis: {
						label: { show: true, fontSize: 12, fontWeight: "bold" },
						itemStyle: { areaColor: "#ffe6dc" },
					},
					data: chinaData,
				},
			],
		};
	}, [echartsModule, chinaReady, chinaData]);

	return (
		<div style={layoutStyle}>
			<div style={cardStyle}>
				<div style={sectionTitleStyle}>{t("Regional Heatmap")}</div>
				<div style={{ height: 420, position: "relative" }}>
					{!chinaReady && !chinaError ? (
						<div
							style={{
								position: "absolute",
								inset: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--surface-card-faint-fg)",
							}}
						>
							<Loader2 aria-hidden="true" size={20} className="animate-spin" />
						</div>
					) : null}
					{chinaError ? (
						<div
							style={{
								position: "absolute",
								inset: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--surface-card-faint-fg)",
								fontSize: 12,
							}}
						>
							{t("China map could not load")}
						</div>
					) : null}
					{option ? (
						<ReactECharts
							option={option}
							notMerge
							lazyUpdate
							style={{ width: "100%", height: "100%" }}
							opts={{ renderer: "canvas" }}
						/>
					) : null}
				</div>
			</div>
			<div style={cardStyle}>
				<div style={sectionTitleStyle}>{t("Top Regions")}</div>
				{isLoading ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: 32,
							color: "var(--surface-card-faint-fg)",
						}}
					>
						<Loader2 aria-hidden="true" size={18} className="animate-spin" />
					</div>
				) : isError ? (
					<div
						style={{
							padding: 16,
							fontSize: 12,
							color: "var(--color-error)",
						}}
					>
						{t("Failed to load")}
					</div>
				) : top10.length === 0 ? (
					<div
						style={{
							padding: 32,
							fontSize: 12,
							color: "var(--surface-card-faint-fg)",
							textAlign: "center",
						}}
					>
						{t("No data")}
					</div>
				) : (
					<div>
						{top10.map((it, idx) => {
							const pct = Math.round((it.count / maxCount) * 100);
							return (
								<div key={it.region_code || it.region_name} style={rowStyle}>
									<span style={rankStyle}>{idx + 1}</span>
									<div style={nameStyle}>
										<span>{it.region_name}</span>
										<div style={barTrackStyle}>
											<div
												style={{
													height: "100%",
													width: `${pct}%`,
													background:
														"linear-gradient(90deg, var(--color-primary-300), var(--color-primary-500))",
													borderRadius: 4,
												}}
											/>
										</div>
									</div>
									<span style={countStyle}>{it.count}</span>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
