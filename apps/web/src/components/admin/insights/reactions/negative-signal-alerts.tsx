"use client";

import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo } from "react";
import { PanelCard } from "./panel-card";
import {
	type NegativeSignalEntry,
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	assertNegativeSignalResponse,
	compactNumber,
	shortId,
} from "./types";

export function NegativeSignalAlerts() {
	const t = useT();

	const query = useQuery({
		queryKey: [
			"admin-reaction-insights",
			"negative-signal",
			"article",
			0.5,
			3,
			30,
		],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: NegativeSignalEntry[] }>(
				`${REACTION_INSIGHT_BASE}/negative-signal?target_type=article&dislike_ratio=0.5&min_total=3&limit=30`,
				assertNegativeSignalResponse,
			);
			return data.items;
		},
	});

	const items = useMemo(() => {
		const rows = query.data ?? [];
		return [...rows].sort((a, b) => b.dislike_ratio - a.dislike_ratio);
	}, [query.data]);

	const heaviest = items.length > 0 ? items[0] : null;
	const totalImpacted = items.reduce(
		(acc, row) => acc + row.likes + row.dislikes,
		0,
	);

	return (
		<PanelCard
			title={t("Negative signal alerts")}
			subtitle={t(
				"Targets where dislike ratio ≥ 50% with at least 3 total reactions.",
			)}
			icon={AlertOctagon}
			isLoading={query.isLoading}
			isError={query.isError}
			onRetry={() => query.refetch()}
			isEmpty={!query.isLoading && !query.isError && items.length === 0}
			emptyMessage={t("No targets currently exceed the dislike threshold.")}
			skeletonHeight={300}
			bodyClassName="px-3 pb-4 pt-1"
		>
			<div
				className="mb-3 flex items-center justify-between rounded-lg px-3 py-2"
				style={{
					backgroundColor:
						"color-mix(in srgb, var(--color-error) 12%, transparent)",
					color: "var(--color-error)",
				}}
			>
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide">
						{t("Flagged targets")}
					</p>
					<p className="text-lg font-bold tabular-nums">{items.length}</p>
				</div>
				<div className="text-right">
					<p className="text-xs font-semibold uppercase tracking-wide">
						{t("Reactions impacted")}
					</p>
					<p className="text-lg font-bold tabular-nums">
						{compactNumber(totalImpacted)}
					</p>
				</div>
			</div>

			{heaviest ? (
				<p
					className="mb-2 truncate text-[11px]"
					style={{ color: "var(--surface-muted-text)" }}
				>
					{t("Most negative")}:{" "}
					<span style={{ color: "var(--color-error)" }}>
						{(heaviest.dislike_ratio * 100).toFixed(0)}%
					</span>{" "}
					· {heaviest.label ?? shortId(heaviest.target_id)}
				</p>
			) : null}

			<ul className="divide-y" style={{ borderColor: "var(--surface-muted-border)" }}>
				{items.map((row) => {
					const total = row.likes + row.dislikes;
					return (
						<li
							key={`${row.target_type}:${row.target_id}`}
							className="flex items-center gap-3 px-2 py-2"
						>
							<span
								className="flex h-8 min-w-[3.25rem] shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums"
								style={{
									backgroundColor:
										"color-mix(in srgb, var(--color-error) 16%, transparent)",
									color: "var(--color-error)",
								}}
							>
								{(row.dislike_ratio * 100).toFixed(0)}%
							</span>
							<div className="min-w-0 flex-1">
								<p
									className="truncate text-sm"
									style={{ color: "var(--field-foreground)" }}
								>
									{row.label ?? shortId(row.target_id)}
								</p>
								<p
									className="text-[11px]"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{shortId(row.target_id)}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
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
								<span style={{ color: "var(--surface-muted-text)" }}>
									{compactNumber(total)}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</PanelCard>
	);
}
