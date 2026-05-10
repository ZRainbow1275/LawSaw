"use client";

/**
 * KnowledgePageContent — `prototype/app.html:1426-1547` 1:1 reproduction.
 *
 * 3-column layout (260 / 1fr / 280) with:
 *   - left: search + entity list
 *   - center: ECharts force graph canvas
 *   - right: entity inspector
 *
 * Driven entirely by `useKnowledge*` hooks against the real backend; no
 * mock data is rendered.
 */

import { EntityInspectorPanel } from "@/components/knowledge/prototype/entity-inspector-panel";
import { EntityListPanel } from "@/components/knowledge/prototype/entity-list-panel";
import { KnowledgeCanvasECharts } from "@/components/knowledge/prototype/knowledge-canvas-echarts";
import { useKnowledgeGraphStats } from "@/hooks/use-knowledge";
import {
	useKnowledgeHybridSearch,
	useKnowledgeTopEntities,
} from "@/hooks/use-knowledge";
import { type RoleTier, normalizeRoleTier } from "@/lib/authz";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { Share2 } from "lucide-react";
import { useState } from "react";

export function KnowledgePageContent() {
	const t = useT();
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const roleTier = useAuthStore((state) => state.roleTier);
	const tier: RoleTier = normalizeRoleTier(roleTier);
	const canSeeArticles =
		tier === "verified_user" ||
		tier === "premium_user" ||
		tier === "tenant_admin" ||
		tier === "super_admin";

	const topQuery = useKnowledgeTopEntities(80);
	const searchQuery = useKnowledgeHybridSearch(searchTerm, 40);
	const statsQuery = useKnowledgeGraphStats();

	const mode: "top" | "search" =
		searchTerm.trim().length > 0 ? "search" : "top";
	const entities =
		mode === "search" ? (searchQuery.data ?? []) : (topQuery.data ?? []);
	const isLoading =
		mode === "search" ? searchQuery.isLoading : topQuery.isLoading;
	const isError = mode === "search" ? searchQuery.isError : topQuery.isError;

	const stats = statsQuery.data;
	const formatNumber = (n: number | undefined) =>
		typeof n === "number" ? n.toLocaleString() : "—";

	// Wave 9 hot-fix #6: knowledge page fills the available `<main>` viewport
	// and only the three internal panels (entity list, canvas, inspector)
	// scroll. Outer `<div>` claims `flex-1 min-h-0` so it fits between the
	// route-group `pt-4 / pb-6` strips without producing a doc-level scroll.
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<header className="mb-5 flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1
						className="flex items-center gap-2 text-2xl font-bold tracking-tight"
						style={{ color: "var(--color-foreground)" }}
					>
						<Share2
							aria-hidden="true"
							className="h-6 w-6"
							style={{ color: "var(--color-primary-500)" }}
						/>
						{t("Knowledge Graph")}
					</h1>
					<p
						className="mt-1 text-sm"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{t(
							"Explore relationships among legal entities — drag, search and inspect.",
						)}
					</p>
				</div>
				{stats ? (
					<dl
						className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
						style={{ color: "var(--surface-muted-text)" }}
						data-testid="kg-inline-stats"
					>
						<InlineStat label={t("Entities")} value={formatNumber(stats.entity_count)} />
						<span aria-hidden style={{ color: "var(--surface-card-border-strong)" }}>·</span>
						<InlineStat label={t("Relations")} value={formatNumber(stats.relation_count)} />
						<span aria-hidden style={{ color: "var(--surface-card-border-strong)" }}>·</span>
						<InlineStat label={t("Article links")} value={formatNumber(stats.article_entity_count)} />
						<span aria-hidden style={{ color: "var(--surface-card-border-strong)" }}>·</span>
						<InlineStat label={t("Vector-ready entities")} value={formatNumber(stats.entities_with_embedding)} />
					</dl>
				) : null}
			</header>

			<div className="kg-layout-3col grid min-h-0 flex-1 grid-cols-1 gap-4">
				<EntityListPanel
					entities={entities}
					isLoading={isLoading}
					isError={isError}
					searchTerm={searchTerm}
					onSearchTermChange={setSearchTerm}
					selectedId={selectedId}
					onSelect={(id) => setSelectedId(id)}
				/>

				<KnowledgeCanvasECharts
					entities={entities}
					selectedId={selectedId}
					onSelect={(id) => setSelectedId(id)}
				/>

				<EntityInspectorPanel
					selectedEntityId={selectedId}
					onSelectEntity={(id) => setSelectedId(id)}
					canSeeArticles={canSeeArticles}
					currentTier={tier}
				/>
			</div>
		</div>
	);
}

function InlineStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="inline-flex items-baseline gap-1.5">
			<span style={{ color: "var(--surface-card-faint-fg)" }}>{label}</span>
			<span
				className="text-sm font-semibold tabular-nums"
				style={{ color: "var(--color-foreground)" }}
			>
				{value}
			</span>
		</div>
	);
}
