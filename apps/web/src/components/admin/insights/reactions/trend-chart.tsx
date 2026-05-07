"use client";

import { apiClient } from "@/lib/api";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { LineChart as LineChartIcon } from "lucide-react";
import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { PanelCard, PanelSelect } from "./panel-card";
import {
	REACTION_INSIGHT_BASE,
	REACTION_INSIGHT_STALE_MS,
	type ReactionInsightWindow,
	type ReactionTrendGranularity,
	type TrendBucket,
	assertTrendResponse,
	compactNumber,
} from "./types";
import { useReactionChartTokens } from "./use-chart-tokens";

interface TrendChartProps {
	window: ReactionInsightWindow;
	onWindowChange: (value: ReactionInsightWindow) => void;
}

interface TrendPoint {
	bucket: string;
	bucketLabel: string;
	likes: number;
	dislikes: number;
	dislikesNeg: number;
}

export function TrendChart({ window, onWindowChange }: TrendChartProps) {
	const t = useT();
	const locale = useLocale();
	const tokens = useReactionChartTokens();

	const granularity: ReactionTrendGranularity =
		window === "7d" ? "hour" : "day";

	const query = useQuery({
		queryKey: [
			"admin-reaction-insights",
			"trend",
			"article",
			window,
			granularity,
		],
		staleTime: REACTION_INSIGHT_STALE_MS,
		queryFn: async () => {
			const data = await apiClient.get<{ buckets: TrendBucket[] }>(
				`${REACTION_INSIGHT_BASE}/trend?target_type=article&granularity=${granularity}&window=${window}`,
				assertTrendResponse,
			);
			return data.buckets;
		},
	});

	const points = useMemo<TrendPoint[]>(() => {
		const buckets = query.data ?? [];
		return buckets.map((b) => {
			const date = new Date(b.bucket);
			const valid = !Number.isNaN(date.getTime());
			const label = valid
				? formatDateTime(
						locale,
						date,
						granularity === "hour"
							? { month: "2-digit", day: "2-digit", hour: "2-digit" }
							: { month: "2-digit", day: "2-digit" },
					)
				: b.bucket;
			return {
				bucket: b.bucket,
				bucketLabel: label,
				likes: b.likes,
				dislikes: b.dislikes,
				dislikesNeg: -b.dislikes,
			};
		});
	}, [query.data, granularity, locale]);

	const windowOptions: ReadonlyArray<{
		value: ReactionInsightWindow;
		label: string;
	}> = [
		{ value: "7d", label: t("7 days · hourly") },
		{ value: "30d", label: t("30 days · daily") },
		{ value: "all", label: t("All time · daily") },
	];

	return (
		<PanelCard
			title={t("Reaction trend")}
			subtitle={t(
				"Likes plotted upward, dislikes mirrored downward. Hover for exact bucket counts.",
			)}
			icon={LineChartIcon}
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
			emptyMessage={t("No reactions in this window yet.")}
			skeletonHeight={300}
		>
			<ResponsiveContainer width="100%" height={300}>
				<AreaChart data={points} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
					<defs>
						<linearGradient id="reactionLikeFill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={tokens.likeColor} stopOpacity={0.7} />
							<stop offset="100%" stopColor={tokens.likeColor} stopOpacity={0.1} />
						</linearGradient>
						<linearGradient id="reactionDislikeFill" x1="0" y1="1" x2="0" y2="0">
							<stop offset="0%" stopColor={tokens.dislikeColor} stopOpacity={0.7} />
							<stop offset="100%" stopColor={tokens.dislikeColor} stopOpacity={0.1} />
						</linearGradient>
					</defs>
					<CartesianGrid stroke={tokens.gridColor} strokeDasharray="3 3" />
					<XAxis
						dataKey="bucketLabel"
						stroke={tokens.axisColor}
						tick={{ fontSize: 11, fill: tokens.axisColor }}
						tickLine={false}
						axisLine={false}
						minTickGap={20}
					/>
					<YAxis
						stroke={tokens.axisColor}
						tick={{ fontSize: 11, fill: tokens.axisColor }}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value: number) => compactNumber(Math.abs(value))}
					/>
					<ReferenceLine y={0} stroke={tokens.gridColor} strokeDasharray="3 3" />
					<Tooltip
						contentStyle={{
							backgroundColor: tokens.tooltipBg,
							border: `1px solid ${tokens.tooltipBorder}`,
							color: tokens.tooltipText,
							borderRadius: 8,
							fontSize: 12,
						}}
						formatter={(value: number, name: string) => {
							if (name === t("Dislikes")) {
								return [compactNumber(Math.abs(value)), name];
							}
							return [compactNumber(value), name];
						}}
					/>
					<Area
						type="monotone"
						dataKey="likes"
						name={t("Likes")}
						stroke={tokens.likeColor}
						strokeWidth={2}
						fill="url(#reactionLikeFill)"
					/>
					<Area
						type="monotone"
						dataKey="dislikesNeg"
						name={t("Dislikes")}
						stroke={tokens.dislikeColor}
						strokeWidth={2}
						fill="url(#reactionDislikeFill)"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</PanelCard>
	);
}
