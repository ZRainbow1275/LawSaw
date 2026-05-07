"use client";

import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { useMemo } from "react";
import {
	CartesianGrid,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
	ZAxis,
} from "recharts";
import { PanelCard, PanelSelect } from "./panel-card";
import {
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type ReactionInsightWindow,
	assertControversyResponse,
	compactNumber,
	shortId,
	type TopReactionEntry,
} from "./types";
import { useReactionChartTokens } from "./use-chart-tokens";

interface ControversyHeatmapProps {
	window: ReactionInsightWindow;
	onWindowChange: (value: ReactionInsightWindow) => void;
}

interface BubblePoint {
	likes: number;
	dislikes: number;
	total: number;
	label: string;
	target_id: string;
	dislike_ratio: number;
}

export function ControversyHeatmap({
	window,
	onWindowChange,
}: ControversyHeatmapProps) {
	const t = useT();
	const tokens = useReactionChartTokens();

	const query = useQuery({
		queryKey: ["admin-reaction-insights", "controversy", "article", window],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ items: TopReactionEntry[] }>(
				`${REACTION_INSIGHT_BASE}/controversy?target_type=article&min_threshold=3&window=${window}&limit=40`,
				assertControversyResponse,
			);
			return data.items;
		},
	});

	const points = useMemo<BubblePoint[]>(() => {
		const items = query.data ?? [];
		return items.map((row) => {
			const total = row.likes + row.dislikes;
			const ratio = total === 0 ? 0 : row.dislikes / total;
			return {
				likes: row.likes,
				dislikes: row.dislikes,
				total,
				label: row.label ?? shortId(row.target_id),
				target_id: row.target_id,
				dislike_ratio: ratio,
			};
		});
	}, [query.data]);

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
			title={t("Controversy map")}
			subtitle={t(
				"Targets with both significant likes and dislikes. Larger bubble means more total engagement.",
			)}
			icon={Flame}
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
			isEmpty={!query.isLoading && !query.isError && points.length === 0}
			emptyMessage={t("No controversial targets yet.")}
			skeletonHeight={320}
		>
			<ResponsiveContainer width="100%" height={320}>
				<ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 0 }}>
					<CartesianGrid stroke={tokens.gridColor} strokeDasharray="3 3" />
					<XAxis
						type="number"
						dataKey="likes"
						name={t("Likes")}
						tick={{ fontSize: 11, fill: tokens.axisColor }}
						stroke={tokens.axisColor}
						label={{
							value: t("Likes →"),
							position: "insideBottom",
							offset: -10,
							fontSize: 11,
							fill: tokens.axisColor,
						}}
					/>
					<YAxis
						type="number"
						dataKey="dislikes"
						name={t("Dislikes")}
						tick={{ fontSize: 11, fill: tokens.axisColor }}
						stroke={tokens.axisColor}
						label={{
							value: t("Dislikes ↑"),
							angle: -90,
							position: "insideLeft",
							offset: 16,
							fontSize: 11,
							fill: tokens.axisColor,
						}}
					/>
					<ZAxis type="number" dataKey="total" range={[60, 360]} name={t("Total")} />
					<Tooltip
						cursor={{ stroke: tokens.gridColor, strokeDasharray: "3 3" }}
						contentStyle={{
							backgroundColor: tokens.tooltipBg,
							border: `1px solid ${tokens.tooltipBorder}`,
							color: tokens.tooltipText,
							borderRadius: 8,
							fontSize: 12,
						}}
						formatter={(value: number, name: string) => [
							compactNumber(value),
							name,
						]}
						labelFormatter={() => ""}
						content={({ active, payload }) => {
							if (!active || !payload || payload.length === 0) return null;
							const p = payload[0]?.payload as BubblePoint | undefined;
							if (!p) return null;
							return (
								<div
									style={{
										backgroundColor: tokens.tooltipBg,
										border: `1px solid ${tokens.tooltipBorder}`,
										color: tokens.tooltipText,
										borderRadius: 8,
										padding: "6px 8px",
										fontSize: 12,
										maxWidth: 240,
									}}
								>
									<div style={{ fontWeight: 600, marginBottom: 2 }}>
										{p.label}
									</div>
									<div style={{ opacity: 0.7, fontSize: 11 }}>
										{compactNumber(p.likes)} {t("likes")} ·{" "}
										{compactNumber(p.dislikes)} {t("dislikes")}
									</div>
									<div style={{ opacity: 0.7, fontSize: 11 }}>
										{t("Dislike ratio")}: {(p.dislike_ratio * 100).toFixed(0)}%
									</div>
								</div>
							);
						}}
					/>
					<Scatter
						data={points}
						fill={tokens.dislikeColor}
						fillOpacity={0.55}
						stroke={tokens.dislikeColor}
					/>
				</ScatterChart>
			</ResponsiveContainer>
		</PanelCard>
	);
}
