"use client";

import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { Crown, ThumbsDown, ThumbsUp } from "lucide-react";
import { PanelCard, PanelSelect } from "./panel-card";
import {
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type ReactionInsightWindow,
	assertTopScoreResponse,
	compactNumber,
	shortId,
	type TopReactionEntry,
} from "./types";

interface TopScoreLeaderboardProps {
	window: ReactionInsightWindow;
	onWindowChange: (value: ReactionInsightWindow) => void;
}

export function TopScoreLeaderboard({
	window,
	onWindowChange,
}: TopScoreLeaderboardProps) {
	const t = useT();
	const query = useQuery({
		queryKey: ["admin-reaction-insights", "top-score", "article", window],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: TopReactionEntry[] }>(
				`${REACTION_INSIGHT_BASE}/top-score?target_type=article&window=${window}&limit=10`,
				assertTopScoreResponse,
			);
			return data.items;
		},
	});

	const items = query.data ?? [];

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
			title={t("Top hot articles")}
			subtitle={t("Net like−dislike score, highest first.")}
			icon={Crown}
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
			emptyMessage={t("No reactions in this window yet.")}
			skeletonHeight={320}
			bodyClassName="px-3 pb-4 pt-2"
		>
			<ol className="divide-y" style={{ borderColor: "var(--surface-muted-border)" }}>
				{items.map((row, idx) => (
					<li
						key={`${row.target_type}:${row.target_id}`}
						className="flex items-center gap-3 px-2 py-2.5"
					>
						<span
							className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
							style={{
								backgroundColor:
									idx === 0
										? "color-mix(in srgb, var(--cat-industry) 25%, transparent)"
										: idx <= 2
											? "color-mix(in srgb, var(--cat-legislation) 18%, transparent)"
											: "var(--surface-muted-bg)",
								color:
									idx === 0
										? "var(--cat-industry)"
										: idx <= 2
											? "var(--cat-legislation)"
											: "var(--surface-muted-text)",
							}}
						>
							{idx + 1}
						</span>
						<div className="min-w-0 flex-1">
							<p
								className="truncate text-sm font-medium"
								style={{ color: "var(--field-foreground)" }}
							>
								{row.label ?? shortId(row.target_id)}
							</p>
							<p className="text-[11px]" style={{ color: "var(--surface-muted-text)" }}>
								{shortId(row.target_id)}
							</p>
						</div>
						<div className="flex items-center gap-2.5 text-xs tabular-nums">
							<span
								className="inline-flex items-center gap-1"
								style={{ color: "var(--color-success)" }}
							>
								<ThumbsUp aria-hidden="true" className="h-3 w-3" />
								{compactNumber(row.likes)}
							</span>
							<span
								className="inline-flex items-center gap-1"
								style={{ color: "var(--color-error)" }}
							>
								<ThumbsDown aria-hidden="true" className="h-3 w-3" />
								{compactNumber(row.dislikes)}
							</span>
							<span
								className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
								style={{
									backgroundColor:
										row.score >= 0
											? "color-mix(in srgb, var(--color-success) 15%, transparent)"
											: "color-mix(in srgb, var(--color-error) 15%, transparent)",
									color:
										row.score >= 0
											? "var(--color-success)"
											: "var(--color-error)",
								}}
							>
								{row.score >= 0 ? "+" : ""}
								{compactNumber(row.score)}
							</span>
						</div>
					</li>
				))}
			</ol>
		</PanelCard>
	);
}
