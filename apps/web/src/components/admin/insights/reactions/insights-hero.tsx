"use client";

import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { Sigma, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { useMemo } from "react";
import {
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type TopReactionUserEntry,
	type TrendBucket,
	assertTopUsersResponse,
	assertTrendResponse,
	compactNumber,
} from "./types";

export function InsightsHero() {
	const t = useT();

	// Aggregate totals from the all-time trend (one query).
	const trendQuery = useQuery({
		queryKey: ["admin-reaction-insights", "hero", "trend", "all"],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ buckets: TrendBucket[] }>(
				`${REACTION_INSIGHT_BASE}/trend?target_type=article&granularity=day&window=all`,
				assertTrendResponse,
			);
			return data.buckets;
		},
	});

	// Active reactor count proxy — top-users with a wide limit.
	// Backend caps at 200 so we surface that in the caption.
	const usersQuery = useQuery({
		queryKey: ["admin-reaction-insights", "hero", "top-users", 200],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: TopReactionUserEntry[] }>(
				`${REACTION_INSIGHT_BASE}/users/top?limit=200`,
				assertTopUsersResponse,
			);
			return data.items;
		},
	});

	const totals = useMemo(() => {
		const buckets = trendQuery.data ?? [];
		let likes = 0;
		let dislikes = 0;
		for (const b of buckets) {
			likes += b.likes;
			dislikes += b.dislikes;
		}
		return { likes, dislikes, score: likes - dislikes };
	}, [trendQuery.data]);

	const userCount = usersQuery.data?.length ?? 0;
	const isLoading = trendQuery.isLoading || usersQuery.isLoading;
	const hasError = trendQuery.isError || usersQuery.isError;

	const captionAvg = isLoading
		? t("Loading")
		: hasError
			? t("Live aggregate unavailable")
			: t("Across all-time, article targets");

	return (
		<KpiCardGrid columns={4}>
			<KpiCard
				tone="success"
				label={t("Total likes")}
				value={isLoading ? "—" : compactNumber(totals.likes)}
				icon={ThumbsUp}
				subtitle={captionAvg}
			/>
			<KpiCard
				tone="error"
				label={t("Total dislikes")}
				value={isLoading ? "—" : compactNumber(totals.dislikes)}
				icon={ThumbsDown}
				subtitle={captionAvg}
			/>
			<KpiCard
				tone={totals.score >= 0 ? "info" : "error"}
				label={t("Net score")}
				value={isLoading ? "—" : `${totals.score >= 0 ? "+" : ""}${compactNumber(totals.score)}`}
				icon={Sigma}
				trend={
					!isLoading && (totals.likes + totals.dislikes) > 0
						? `${((totals.likes / (totals.likes + totals.dislikes)) * 100).toFixed(0)}%`
						: undefined
				}
				trendUp={totals.score >= 0}
				subtitle={t("Likes minus dislikes")}
			/>
			<KpiCard
				tone="warning"
				label={t("Active reactors")}
				value={isLoading ? "—" : compactNumber(userCount)}
				icon={Users}
				subtitle={t("Top {n} users (rank-capped)", { n: 200 })}
			/>
		</KpiCardGrid>
	);
}

