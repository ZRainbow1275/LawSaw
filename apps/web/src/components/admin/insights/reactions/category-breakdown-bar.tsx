"use client";

import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useMemo } from "react";
import { PanelCard, PanelSelect } from "./panel-card";
import {
	type CategoryReactionEntry,
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type ReactionInsightWindow,
	assertCategoryResponse,
	compactNumber,
} from "./types";
import { useReactionChartTokens } from "./use-chart-tokens";

interface CategoryBreakdownBarProps {
	window: ReactionInsightWindow;
	onWindowChange: (value: ReactionInsightWindow) => void;
}

const SLUG_PALETTE_INDEX: Record<string, number> = {
	legislation: 0,
	regulation: 1,
	enforcement: 2,
	industry: 3,
	compliance: 4,
	"data-trends": 5,
	data: 5,
	security: 6,
	academic: 7,
	"major-events": 8,
	events: 8,
	international: 9,
};

export function CategoryBreakdownBar({
	window,
	onWindowChange,
}: CategoryBreakdownBarProps) {
	const t = useT();
	const tokens = useReactionChartTokens();

	const query = useQuery({
		queryKey: ["admin-reaction-insights", "by-category", window],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: CategoryReactionEntry[] }>(
				`${REACTION_INSIGHT_BASE}/by-category?window=${window}`,
				assertCategoryResponse,
			);
			return data.items;
		},
	});

	const items = useMemo(() => {
		const rows = query.data ?? [];
		return [...rows].sort(
			(a, b) => b.likes + b.dislikes - (a.likes + a.dislikes),
		);
	}, [query.data]);

	const maxTotal = useMemo(() => {
		let max = 0;
		for (const item of items) {
			const total = item.likes + item.dislikes;
			if (total > max) max = total;
		}
		return max;
	}, [items]);

	const windowOptions: ReadonlyArray<{
		value: ReactionInsightWindow;
		label: string;
	}> = [
		{ value: "7d", label: t("7 days") },
		{ value: "30d", label: t("30 days") },
		{ value: "all", label: t("All time") },
	];

	return (
		<PanelCard
			title={t("Category breakdown")}
			subtitle={t(
				"Each row is a category. Bar width = total reactions; green vs red split = like vs dislike share.",
			)}
			icon={Layers}
			actions={
				<PanelSelect
					value={window}
					onChange={onWindowChange}
					options={windowOptions}
					ariaLabel={t("Window")}
				/>
			}
			isLoading={query.isLoading}
			isError={query.isError}
			onRetry={() => query.refetch()}
			isEmpty={!query.isLoading && !query.isError && items.length === 0}
			emptyMessage={t("No category-tagged reactions yet.")}
			skeletonHeight={320}
			bodyClassName="px-5 pb-5 pt-3"
		>
			<div className="space-y-3">
				{items.map((row) => {
					const total = row.likes + row.dislikes;
					const widthPct = maxTotal === 0 ? 0 : (total / maxTotal) * 100;
					const likeShare = total === 0 ? 0 : row.likes / total;
					const slug = row.category_slug ?? "";
					const paletteIdx = SLUG_PALETTE_INDEX[slug] ?? 0;
					const accentColor = tokens.categoryPalette[paletteIdx] ?? tokens.likeColor;
					const displayName =
						row.category_name ?? row.category_slug ?? t("Uncategorized");
					return (
						<div
							key={`${row.category_id ?? row.category_slug ?? displayName}`}
							className="space-y-1"
						>
							<div className="flex items-center justify-between gap-3 text-xs">
								<div className="flex min-w-0 items-center gap-2">
									<span
										aria-hidden
										className="h-2.5 w-2.5 shrink-0 rounded-full"
										style={{ backgroundColor: accentColor }}
									/>
									<span
										className="truncate font-medium"
										style={{ color: "var(--field-foreground)" }}
									>
										{displayName}
									</span>
								</div>
								<div className="flex shrink-0 items-center gap-3 tabular-nums">
									<span style={{ color: "var(--color-success)" }}>
										+{compactNumber(row.likes)}
									</span>
									<span style={{ color: "var(--color-error)" }}>
										−{compactNumber(row.dislikes)}
									</span>
									<span style={{ color: "var(--surface-muted-text)" }}>
										{compactNumber(total)}
									</span>
								</div>
							</div>
							<div
								className="h-3 w-full overflow-hidden rounded-full"
								style={{
									backgroundColor: "var(--surface-muted-bg)",
								}}
							>
								<div
									className="h-full"
									style={{
										width: `${widthPct}%`,
										display: "flex",
									}}
								>
									<div
										style={{
											width: `${likeShare * 100}%`,
											backgroundColor: tokens.likeColor,
										}}
									/>
									<div
										style={{
											width: `${(1 - likeShare) * 100}%`,
											backgroundColor: tokens.dislikeColor,
										}}
									/>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</PanelCard>
	);
}
