"use client";

/**
 * KnowledgeCanvasECharts — `prototype/app.html:1475-1522` central panel.
 *
 * Renders a real force-directed graph via ECharts (already a project dep)
 * driven by `useKnowledgeTopEntities` + `useKnowledgeCooccurrenceNetwork`.
 * Selected entity gets an orange border; click→onSelect surfaces detail.
 *
 * Visual conventions match the prototype:
 *   - dot grid background (`radial-gradient`)
 *   - dashed light-grey edges (stroke-dasharray)
 *   - node colour by entity_type (organization/concept/law/person/event/standard)
 *   - zoom controls (+ / − / reset) anchored top-right
 */

import {
	useKnowledgeCooccurrenceNetwork,
	useKnowledgeRelatedEntities,
	useKnowledgeTopEntities,
} from "@/hooks/use-knowledge";
import type { KnowledgeEntity } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { Loader2, Maximize2, Minus, Plus, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { getEntityTypeStyle } from "./entity-list-panel";

const ReactECharts = dynamic(
	() => import("echarts-for-react").then((mod) => mod.default),
	{ ssr: false },
);

interface KnowledgeCanvasECharts {
	entities: KnowledgeEntity[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}

interface ECInstance {
	resize?: () => void;
	getOption?: () => unknown;
	setOption?: (opt: unknown, notMerge?: boolean) => void;
	dispatchAction?: (payload: Record<string, unknown>) => void;
}

export function KnowledgeCanvasECharts({
	entities,
	selectedId,
	onSelect,
}: KnowledgeCanvasECharts) {
	const t = useT();
	const chartRef = useRef<ECInstance | null>(null);

	const cooccurrenceQuery = useKnowledgeCooccurrenceNetwork(2, 200, true);
	// Always-on related-entities query for the selected node, so we can splice
	// any missing edges that the cooccurrence endpoint did not surface yet.
	const relatedQuery = useKnowledgeRelatedEntities(selectedId, 30);

	const knownIds = useMemo(
		() => new Set(entities.map((e) => e.id)),
		[entities],
	);

	const links = useMemo(() => {
		const seen = new Set<string>();
		const out: Array<{
			source: string;
			target: string;
			lineStyle: Record<string, unknown>;
		}> = [];
		const cooccur = cooccurrenceQuery.data ?? [];
		for (const edge of cooccur) {
			if (!knownIds.has(edge.entity1_id) || !knownIds.has(edge.entity2_id))
				continue;
			const key = [edge.entity1_id, edge.entity2_id].sort().join("|");
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({
				source: edge.entity1_id,
				target: edge.entity2_id,
				lineStyle: {
					type: "dashed",
					width: Math.min(3, 1 + Math.log10(edge.cooccurrence_count + 1)),
					color: "#cbd5e1",
					curveness: 0.1,
				},
			});
		}
		// Splice in selected-entity related edges (covers AI-extracted relations
		// not represented by cooccurrence).
		if (selectedId) {
			for (const rel of relatedQuery.data ?? []) {
				if (!knownIds.has(rel.entity.id)) continue;
				const a = selectedId;
				const b = rel.entity.id;
				const key = [a, b].sort().join("|");
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({
					source: rel.direction === "outgoing" ? a : b,
					target: rel.direction === "outgoing" ? b : a,
					lineStyle: {
						type: "dashed",
						width: 1.5,
						color: "var(--color-primary-500)",
						opacity: 0.6,
						curveness: 0.15,
					},
				});
			}
		}
		return out;
	}, [cooccurrenceQuery.data, knownIds, relatedQuery.data, selectedId]);

	const option = useMemo(() => {
		const data = entities.map((entity) => {
			const style = getEntityTypeStyle(entity.entity_type);
			const isSelected = entity.id === selectedId;
			return {
				id: entity.id,
				name: entity.name,
				value: entity.mention_count,
				symbolSize: Math.min(60, 20 + entity.mention_count * 1.6),
				category: entity.entity_type,
				itemStyle: {
					color: style.bg,
					borderColor: isSelected ? "var(--color-primary-500)" : style.fg,
					borderWidth: isSelected ? 3 : 1.5,
					shadowBlur: isSelected ? 16 : 0,
					shadowColor: isSelected
						? "color-mix(in srgb, var(--color-primary-500) 60%, transparent)"
						: "transparent",
				},
				label: {
					color: isSelected ? "var(--color-primary-700)" : style.fg,
					fontWeight: isSelected ? 700 : 500,
				},
			};
		});

		const categories = [
			{ name: "organization" },
			{ name: "concept" },
			{ name: "law" },
			{ name: "person" },
			{ name: "event" },
			{ name: "standard" },
		];

		return {
			tooltip: {
				show: true,
				backgroundColor: "rgba(15,23,42,0.95)",
				borderColor: "transparent",
				textStyle: { color: "#fff", fontSize: 12 },
				formatter: (p: { data?: { name?: string; value?: number } }) =>
					`<b>${p.data?.name ?? ""}</b><br/>${t("Mentioned {count} times", { count: p.data?.value ?? 0 })}`,
			},
			animationDuration: 800,
			animationEasingUpdate: "quinticInOut" as const,
			series: [
				{
					type: "graph" as const,
					layout: "force" as const,
					data,
					links,
					categories,
					roam: true,
					draggable: true,
					focusNodeAdjacency: true,
					force: {
						repulsion: 320,
						edgeLength: [80, 180],
						gravity: 0.08,
					},
					label: {
						show: true,
						position: "right" as const,
						fontSize: 12,
						fontFamily: "Inter, Noto Sans SC, sans-serif",
					},
					emphasis: {
						focus: "adjacency" as const,
						lineStyle: { width: 2 },
					},
					lineStyle: {
						color: "#cbd5e1",
						type: "dashed" as const,
						width: 1.5,
						curveness: 0.1,
					},
				},
			],
		};
	}, [entities, links, selectedId, t]);

	useEffect(() => {
		const inst = chartRef.current;
		if (inst?.resize) inst.resize();
	}, []);

	const handleZoomIn = () => {
		chartRef.current?.dispatchAction?.({
			type: "graphRoam",
			zoom: 1.25,
			originX: 0.5,
			originY: 0.5,
		});
	};
	const handleZoomOut = () => {
		chartRef.current?.dispatchAction?.({
			type: "graphRoam",
			zoom: 0.8,
			originX: 0.5,
			originY: 0.5,
		});
	};
	const handleReset = () => {
		chartRef.current?.dispatchAction?.({
			type: "restore",
		});
	};

	const onEvents = useMemo(
		() => ({
			click: (params: {
				dataType?: string;
				data?: { id?: string };
			}) => {
				if (params.dataType === "node" && params.data?.id) {
					onSelect(params.data.id);
				}
			},
		}),
		[onSelect],
	);

	const isReady = entities.length > 0;

	return (
		<section
			className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm"
			style={{ borderColor: "var(--surface-card-border)" }}
			data-testid="kg-canvas"
		>
			<header
				className="flex items-center justify-between border-b px-4 py-3"
				style={{ borderColor: "var(--surface-card-border)" }}
			>
				<div className="flex items-center gap-2">
					<Share2
						aria-hidden="true"
						className="h-4 w-4"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<div
						className="text-sm font-bold"
						style={{ color: "var(--surface-card-foreground)" }}
					>
						{t("Knowledge graph canvas")}
					</div>
					<div
						className="hidden text-xs sm:block"
						style={{ color: "var(--surface-card-faint-fg)" }}
					>
						· {t("Drag nodes, scroll to zoom")}
					</div>
				</div>
				<div
					className="flex items-center gap-1 rounded-lg border bg-white p-1"
					style={{ borderColor: "var(--surface-card-border-strong)" }}
				>
					<button
						type="button"
						onClick={handleZoomOut}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-neutral-100"
						style={{ color: "var(--surface-card-muted-fg)" }}
						title={t("Zoom out")}
					>
						<Minus aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={handleReset}
						className="inline-flex h-7 items-center px-2 text-[11px] font-mono"
						style={{ color: "var(--surface-card-muted-fg)" }}
						title={t("Reset zoom")}
					>
						<Maximize2 aria-hidden="true" className="mr-1 h-3 w-3" />
						100%
					</button>
					<button
						type="button"
						onClick={handleZoomIn}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-neutral-100"
						style={{ color: "var(--surface-card-muted-fg)" }}
						title={t("Zoom in")}
					>
						<Plus aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
				</div>
			</header>

			<div
				className="relative flex-1"
				style={{
					backgroundImage:
						"radial-gradient(circle, var(--surface-card-border-strong) 1px, transparent 1px)",
					backgroundSize: "24px 24px",
				}}
			>
				{!isReady ? (
					<div className="absolute inset-0 flex items-center justify-center">
						<Loader2
							aria-hidden="true"
							className="h-6 w-6 animate-spin"
							style={{ color: "var(--surface-card-faint-fg)" }}
						/>
					</div>
				) : (
					<ReactECharts
						option={option}
						notMerge
						lazyUpdate={false}
						onEvents={onEvents}
						onChartReady={(inst) => {
							chartRef.current = inst as unknown as ECInstance;
						}}
						style={{ width: "100%", height: "100%" }}
						opts={{ renderer: "canvas" }}
					/>
				)}
			</div>
		</section>
	);
}
