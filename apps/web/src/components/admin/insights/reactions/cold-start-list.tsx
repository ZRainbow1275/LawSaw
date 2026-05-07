"use client";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { formatDateTime, formatTimeAgo } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { Snowflake } from "lucide-react";
import { PanelCard } from "./panel-card";
import {
	type ColdStartEntry,
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	assertColdStartResponse,
	shortId,
} from "./types";

export function ColdStartList() {
	const t = useT();
	const locale = useLocale();

	const query = useQuery({
		queryKey: ["admin-reaction-insights", "cold-start", "article", 30, 30],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: ColdStartEntry[] }>(
				`${REACTION_INSIGHT_BASE}/cold-start?target_type=article&days=30&limit=30`,
				assertColdStartResponse,
			);
			return data.items;
		},
	});

	const items = query.data ?? [];

	return (
		<PanelCard
			title={t("Cold-start alerts")}
			subtitle={t(
				"Articles published in the last 30 days that received zero reactions.",
			)}
			icon={Snowflake}
			isLoading={query.isLoading}
			isError={query.isError}
			onRetry={() => query.refetch()}
			isEmpty={!query.isLoading && !query.isError && items.length === 0}
			emptyMessage={t("All recent articles have at least one reaction.")}
			skeletonHeight={300}
			bodyClassName="px-3 pb-4 pt-1"
		>
			<ul className="divide-y" style={{ borderColor: "var(--surface-muted-border)" }}>
				{items.map((row) => {
					const created = new Date(row.created_at);
					const valid = !Number.isNaN(created.getTime());
					const absolute = valid
						? formatDateTime(locale, created, {
								year: "numeric",
								month: "2-digit",
								day: "2-digit",
							})
						: row.created_at;
					const relative = valid ? formatTimeAgo(locale, row.created_at) : "";
					return (
						<li
							key={`${row.target_type}:${row.target_id}`}
							className="flex flex-col gap-1.5 px-2 py-2.5 sm:flex-row sm:items-center sm:gap-3"
						>
							<div className="min-w-0 flex-1">
								<p
									className="truncate text-sm font-medium"
									style={{ color: "var(--field-foreground)" }}
								>
									{row.label ?? shortId(row.target_id)}
								</p>
								<p
									className="text-[11px]"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{absolute} · {relative} · {shortId(row.target_id)}
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled
								title={t("Recommendation boost will arrive in a follow-up wave.")}
							>
								{t("Boost exposure")}
							</Button>
						</li>
					);
				})}
			</ul>
		</PanelCard>
	);
}
