"use client";

import { apiClient } from "@/lib/api";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { Activity, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { PanelCard } from "./panel-card";
import {
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type SourceHealthEntry,
	assertSourceHealthResponse,
	compactNumber,
} from "./types";

type HealthBand = "good" | "warn" | "bad";

interface ScoredSourceHealth extends SourceHealthEntry {
	total: number;
	score: number;
	band: HealthBand;
}

function classifyBand(likes: number, dislikes: number): {
	score: number;
	band: HealthBand;
} {
	const total = likes + dislikes;
	if (total === 0) return { score: 0, band: "warn" };
	const positive = likes / total;
	const score = Math.round(positive * 100);
	if (positive >= 0.66) return { score, band: "good" };
	if (positive >= 0.4) return { score, band: "warn" };
	return { score, band: "bad" };
}

const BAND_TOKENS: Record<HealthBand, { color: string; bg: string }> = {
	good: {
		color: "var(--color-success)",
		bg: "color-mix(in srgb, var(--color-success) 14%, transparent)",
	},
	warn: {
		color: "var(--cat-industry)",
		bg: "color-mix(in srgb, var(--cat-industry) 16%, transparent)",
	},
	bad: {
		color: "var(--color-error)",
		bg: "color-mix(in srgb, var(--color-error) 16%, transparent)",
	},
};

export function SourceHealthGrid() {
	const t = useT();
	const locale = useLocale();

	const query = useQuery({
		queryKey: ["admin-reaction-insights", "source-health", 30],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: SourceHealthEntry[] }>(
				`${REACTION_INSIGHT_BASE}/source-health?limit=30`,
				assertSourceHealthResponse,
			);
			return data.items;
		},
	});

	const items = useMemo<ScoredSourceHealth[]>(() => {
		const rows = query.data ?? [];
		return rows
			.map((row) => {
				const total = row.likes + row.dislikes;
				const { score, band } = classifyBand(row.likes, row.dislikes);
				return { ...row, total, score, band };
			})
			.sort((a, b) => b.total - a.total);
	}, [query.data]);

	return (
		<PanelCard
			title={t("Source health")}
			subtitle={t(
				"Per-source like/dislike split and engaged-user count. Color band reflects positive ratio.",
			)}
			icon={Activity}
			isLoading={query.isLoading}
			isError={query.isError}
			onRetry={() => query.refetch()}
			isEmpty={!query.isLoading && !query.isError && items.length === 0}
			emptyMessage={t("No source-level reactions yet.")}
			skeletonHeight={300}
		>
			<div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
				{items.map((row) => {
					const tone = BAND_TOKENS[row.band];
					return (
						<Link
							key={row.source_id}
							href={withLocalePath(locale, `/admin/sources?source_id=${row.source_id}`)}
							className="group rounded-xl border p-3 transition-shadow hover:shadow-card-hover"
							style={{
								backgroundColor: "var(--color-card)",
								borderColor: "var(--surface-muted-border)",
							}}
						>
							<div className="flex items-start justify-between gap-2">
								<p
									className="truncate text-sm font-medium"
									style={{ color: "var(--field-foreground)" }}
									title={row.source_name}
								>
									{row.source_name}
								</p>
								<span
									className="shrink-0 rounded px-2 py-0.5 text-[11px] font-bold tabular-nums"
									style={{
										color: tone.color,
										backgroundColor: tone.bg,
									}}
								>
									{row.score}
								</span>
							</div>
							<div className="mt-2 flex items-center justify-between text-[11px] tabular-nums">
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
									className="inline-flex items-center gap-1"
									style={{ color: "var(--surface-muted-text)" }}
									title={t("Distinct users who reacted on this source")}
								>
									<Users aria-hidden="true" className="h-3 w-3" />
									{compactNumber(row.subscriber_count)}
								</span>
							</div>
							<div
								className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
								style={{ backgroundColor: "var(--surface-muted-bg)" }}
							>
								<div
									className="h-full"
									style={{
										width: `${row.score}%`,
										backgroundColor: tone.color,
									}}
								/>
							</div>
						</Link>
					);
				})}
			</div>
		</PanelCard>
	);
}
