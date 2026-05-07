"use client";

import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { useMemo } from "react";
import { PanelCard } from "./panel-card";
import {
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type TopReactionUserEntry,
	assertTopUsersResponse,
	compactNumber,
	shortId,
} from "./types";
import { useReactionChartTokens } from "./use-chart-tokens";

type Lean = "positive" | "negative" | "balanced";

interface ScoredUser extends TopReactionUserEntry {
	likeShare: number;
	lean: Lean;
}

function leanFor(likes: number, dislikes: number): Lean {
	const total = likes + dislikes;
	if (total === 0) return "balanced";
	const ratio = likes / total;
	if (ratio >= 0.65) return "positive";
	if (ratio <= 0.35) return "negative";
	return "balanced";
}

export function TopReactiveUsers() {
	const t = useT();
	const tokens = useReactionChartTokens();

	const query = useQuery({
		queryKey: ["admin-reaction-insights", "top-users", 20],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: TopReactionUserEntry[] }>(
				`${REACTION_INSIGHT_BASE}/users/top?limit=20`,
				assertTopUsersResponse,
			);
			return data.items;
		},
	});

	const items = useMemo<ScoredUser[]>(() => {
		const rows = query.data ?? [];
		return rows.map((row) => {
			const total = row.likes_given + row.dislikes_given;
			const likeShare = total === 0 ? 0 : row.likes_given / total;
			return {
				...row,
				likeShare,
				lean: leanFor(row.likes_given, row.dislikes_given),
			};
		});
	}, [query.data]);

	const leanLabel: Record<Lean, string> = {
		positive: t("Positive"),
		negative: t("Negative"),
		balanced: t("Balanced"),
	};

	const leanColor: Record<Lean, string> = {
		positive: "var(--color-success)",
		negative: "var(--color-error)",
		balanced: tokens.axisColor,
	};

	return (
		<PanelCard
			title={t("Top reactive users")}
			subtitle={t(
				"Most-active reactors with their like vs dislike lean.",
			)}
			icon={UserCheck}
			isLoading={query.isLoading}
			isError={query.isError}
			onRetry={() => query.refetch()}
			isEmpty={!query.isLoading && !query.isError && items.length === 0}
			emptyMessage={t("No reactive users yet.")}
			skeletonHeight={320}
			bodyClassName="px-2 pb-4 pt-1"
		>
			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr
							className="text-left uppercase tracking-wide"
							style={{ color: "var(--surface-muted-text)" }}
						>
							<th className="px-3 py-2 font-medium">{t("User")}</th>
							<th className="px-3 py-2 text-right font-medium">{t("Total")}</th>
							<th className="px-3 py-2 text-right font-medium">{t("Like ratio")}</th>
							<th className="px-3 py-2 font-medium">{t("Lean")}</th>
						</tr>
					</thead>
					<tbody>
						{items.map((row, idx) => {
							const initial = (row.display_name?.charAt(0) ?? "U").toUpperCase();
							return (
								<tr
									key={row.user_id}
									className="border-t"
									style={{ borderColor: "var(--surface-muted-border)" }}
								>
									<td className="px-3 py-2.5">
										<div className="flex items-center gap-2">
											<span
												className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
												style={{
													backgroundColor:
														"color-mix(in srgb, var(--color-primary-500) 18%, transparent)",
													color: "var(--color-primary-600)",
												}}
											>
												{initial}
											</span>
											<div className="min-w-0">
												<p
													className="truncate text-sm"
													style={{ color: "var(--field-foreground)" }}
												>
													{row.display_name?.trim() || shortId(row.user_id)}
												</p>
												<p className="text-[10px]" style={{ color: "var(--surface-muted-text)" }}>
													#{idx + 1} · {shortId(row.user_id)}
												</p>
											</div>
										</div>
									</td>
									<td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--field-foreground)" }}>
										{compactNumber(row.total)}
									</td>
									<td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--surface-muted-text)" }}>
										{(row.likeShare * 100).toFixed(0)}%
									</td>
									<td className="px-3 py-2.5">
										<div className="flex items-center gap-2">
											<div
												className="h-1.5 w-20 overflow-hidden rounded-full"
												style={{ backgroundColor: "var(--surface-muted-bg)" }}
											>
												<div
													className="h-full"
													style={{
														width: `${row.likeShare * 100}%`,
														backgroundColor: tokens.likeColor,
													}}
												/>
											</div>
											<span
												className="text-[11px] font-medium"
												style={{ color: leanColor[row.lean] }}
											>
												{leanLabel[row.lean]}
											</span>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</PanelCard>
	);
}
