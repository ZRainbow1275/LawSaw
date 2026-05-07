"use client";

/**
 * CrossPanel — 交叉分析 tab.
 *   1. ECharts heatmap (rows=10 categories, cols=5 risk levels, color depth=count)
 *   2. ECharts sankey (source → category → risk)
 *
 * Data is aggregated client-side from useArticles + useCategories + useSources.
 */

import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSources } from "@/hooks/use-sources";
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

const RISK_LEVELS = ["unknown", "low", "medium", "high", "critical"] as const;
const RISK_LABELS = ["未知", "低", "中", "高", "严重"];

export function CrossPanel() {
	const t = useT();
	const articlesQuery = useArticles({ limit: 200 });
	const categoriesQuery = useCategories();
	const sourcesQuery = useSources();

	const isLoading =
		articlesQuery.isLoading ||
		categoriesQuery.isLoading ||
		sourcesQuery.isLoading;
	const isError =
		articlesQuery.isError || categoriesQuery.isError || sourcesQuery.isError;

	const articles = articlesQuery.data?.data ?? [];
	const categories = categoriesQuery.data ?? [];
	const sources = sourcesQuery.data?.data ?? [];

	const catNameById = useMemo(() => {
		const m = new Map<string, string>();
		for (const c of categories) m.set(c.id, c.name);
		return m;
	}, [categories]);

	const sourceNameById = useMemo(() => {
		const m = new Map<string, string>();
		for (const s of sources) m.set(s.id, s.name);
		return m;
	}, [sources]);

	// Heatmap data: rows = top 10 categories by article count, cols = 5 risk levels
	const heatmapOption = useMemo(() => {
		const cellByCat = new Map<string, number[]>();
		for (const a of articles) {
			const catName = a.category_id
				? (catNameById.get(a.category_id) ?? "未分类")
				: "未分类";
			const lvl = getArticleRiskLevel(a.risk_score);
			const idx = RISK_LEVELS.indexOf(lvl as (typeof RISK_LEVELS)[number]);
			if (idx < 0) continue;
			const row = cellByCat.get(catName) ?? [0, 0, 0, 0, 0];
			row[idx] += 1;
			cellByCat.set(catName, row);
		}

		// Top 10 by total count
		const rows = Array.from(cellByCat.entries())
			.map(([name, vals]) => ({
				name,
				vals,
				total: vals.reduce((a, b) => a + b, 0),
			}))
			.sort((a, b) => b.total - a.total)
			.slice(0, 10);

		const yAxisData = rows.map((r) => r.name);
		const matrix: number[][] = [];
		for (let r = 0; r < rows.length; r++) {
			for (let c = 0; c < RISK_LEVELS.length; c++) {
				matrix.push([c, r, rows[r].vals[c]]);
			}
		}
		const max = matrix.reduce((m, p) => (p[2] > m ? p[2] : m), 1);

		return {
			backgroundColor: "transparent",
			tooltip: {
				position: "top",
				formatter: (p: { value: [number, number, number] }) => {
					const [c, r, v] = p.value;
					return `<b>${yAxisData[r]}</b><br/>风险 ${RISK_LABELS[c]}: ${v} 篇`;
				},
			},
			grid: { top: 32, bottom: 60, left: 100, right: 24, containLabel: true },
			xAxis: {
				type: "category" as const,
				data: RISK_LABELS,
				splitArea: { show: true },
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: { color: "var(--surface-card-muted-fg)", fontSize: 12 },
			},
			yAxis: {
				type: "category" as const,
				data: yAxisData,
				splitArea: { show: true },
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: { color: "var(--surface-card-muted-fg)", fontSize: 12 },
			},
			visualMap: {
				min: 0,
				max,
				calculable: true,
				orient: "horizontal" as const,
				left: "center",
				bottom: 0,
				inRange: {
					color: [
						"#fff4f1",
						"#ffd9c8",
						"#ffb394",
						"#ff8a66",
						"#ff6b35",
						"#cc4a1f",
					],
				},
				textStyle: { color: "var(--surface-card-faint-fg)", fontSize: 11 },
			},
			series: [
				{
					type: "heatmap",
					data: matrix,
					label: {
						show: true,
						fontSize: 11,
						color: "var(--surface-card-foreground)",
					},
					emphasis: {
						itemStyle: { shadowBlur: 4, shadowColor: "rgba(0,0,0,0.2)" },
					},
				},
			],
		};
	}, [articles, catNameById]);

	// Sankey: source -> category -> risk
	const sankeyOption = useMemo(() => {
		// Aggregate flows
		const srcCat = new Map<string, number>();
		const catRisk = new Map<string, number>();
		const nodeNames = new Set<string>();

		for (const a of articles) {
			const srcName = sourceNameById.get(a.source_id) ?? "未知来源";
			const catName = a.category_id
				? (catNameById.get(a.category_id) ?? "未分类")
				: "未分类";
			const lvl = getArticleRiskLevel(a.risk_score);
			const riskName = `${RISK_LABELS[RISK_LEVELS.indexOf(lvl as (typeof RISK_LEVELS)[number])] ?? "未知"} 风险`;

			nodeNames.add(srcName);
			nodeNames.add(catName);
			nodeNames.add(riskName);

			const k1 = `${srcName}__${catName}`;
			const k2 = `${catName}__${riskName}`;
			srcCat.set(k1, (srcCat.get(k1) ?? 0) + 1);
			catRisk.set(k2, (catRisk.get(k2) ?? 0) + 1);
		}

		const links: Array<{ source: string; target: string; value: number }> = [];
		for (const [k, v] of srcCat) {
			const [s, t] = k.split("__");
			links.push({ source: s, target: t, value: v });
		}
		for (const [k, v] of catRisk) {
			const [s, t] = k.split("__");
			links.push({ source: s, target: t, value: v });
		}

		// Truncate to top sources to avoid clutter (>20 nodes hurts readability)
		const srcCounts = new Map<string, number>();
		for (const a of articles) {
			const s = sourceNameById.get(a.source_id) ?? "未知来源";
			srcCounts.set(s, (srcCounts.get(s) ?? 0) + 1);
		}
		const topSrcSet = new Set(
			Array.from(srcCounts.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 8)
				.map(([n]) => n),
		);
		const filteredLinks = links.filter((l) => {
			// Keep links unless they originate from a non-top source
			if (srcCounts.has(l.source) && !topSrcSet.has(l.source)) return false;
			return true;
		});
		const nodesUsed = new Set<string>();
		for (const l of filteredLinks) {
			nodesUsed.add(l.source);
			nodesUsed.add(l.target);
		}
		const nodes = Array.from(nodesUsed).map((name) => ({ name }));

		return {
			backgroundColor: "transparent",
			tooltip: { trigger: "item" as const, triggerOn: "mousemove" },
			series: [
				{
					type: "sankey",
					data: nodes,
					links: filteredLinks,
					emphasis: { focus: "adjacency" },
					nodeAlign: "left",
					layoutIterations: 32,
					lineStyle: { color: "gradient" as const, curveness: 0.5 },
					label: {
						color: "var(--surface-card-foreground)",
						fontSize: 12,
						fontWeight: 600,
					},
				},
			],
			color: [
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
			],
		};
	}, [articles, sourceNameById, catNameById]);

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
						color: "var(--color-error)",
						fontSize: 13,
						textAlign: "center",
					}}
				>
					{t("Failed to load")}
				</div>
			</div>
		);
	}

	if (articles.length === 0) {
		return (
			<div style={cardStyle}>
				<div
					style={{
						padding: 32,
						color: "var(--surface-card-faint-fg)",
						fontSize: 13,
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
				<div style={sectionTitleStyle}>{t("Cross-Dimensional Analysis")}</div>
				<ReactECharts
					option={heatmapOption}
					notMerge
					lazyUpdate
					style={{ width: "100%", height: 460 }}
					opts={{ renderer: "canvas" }}
				/>
			</div>
			<div style={cardStyle}>
				<div style={sectionTitleStyle}>
					{t("Source")} → {t("Category")} → {t("Risk")}
				</div>
				<ReactECharts
					option={sankeyOption}
					notMerge
					lazyUpdate
					style={{ width: "100%", height: 480 }}
					opts={{ renderer: "canvas" }}
				/>
			</div>
		</div>
	);
}
