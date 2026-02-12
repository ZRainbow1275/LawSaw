"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useCrossDimensional,
	useTimelineByDimension,
} from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { Grid3X3, TrendingUp } from "lucide-react";
import { useState } from "react";
import { DOMAIN_LABELS } from "../constants";
import { CrossHeatmap } from "./cross-heatmap";
import { TimelineChart } from "./timeline-chart";

type DimensionKey = "domain_root" | "importance" | "authority_level" | "region_code";

const DIMENSION_OPTIONS: Array<{
	key: DimensionKey;
	labelKey: string;
}> = [
	{ key: "domain_root", labelKey: "Domain" },
	{ key: "importance", labelKey: "Importance" },
	{ key: "authority_level", labelKey: "Authority" },
	{ key: "region_code", labelKey: "Region" },
];

export function CrossPanel() {
	const t = useT();
	const [dimX, setDimX] = useState<DimensionKey>("domain_root");
	const [dimY, setDimY] = useState<DimensionKey>("importance");
	const [timelineDim, setTimelineDim] = useState<DimensionKey>("domain_root");

	const {
		data: crossData,
		isLoading: crossLoading,
		isError: crossError,
		error: crossErr,
		refetch: refetchCross,
	} = useCrossDimensional(dimX, dimY);

	const {
		data: timelineData,
		isLoading: timelineLoading,
		isError: timelineError,
		error: timelineErr,
		refetch: refetchTimeline,
	} = useTimelineByDimension(timelineDim, "daily", 30, 5);

	const getUniqueValues = (
		cells: Array<{ x_value: string; y_value: string }>,
		axis: "x" | "y",
	): string[] => {
		const values = new Set(
			cells.map((c) => (axis === "x" ? c.x_value : c.y_value)),
		);
		return [...values].sort();
	};

	return (
		<div className="space-y-6">
			{/* Cross-dimensional heatmap */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Grid3X3
							className="h-5 w-5 text-primary-500"
							aria-hidden="true"
						/>
						{t("Cross-Dimensional Analysis")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{/* Dimension selectors */}
					<div className="mb-4 flex flex-wrap items-center gap-4">
						<div className="flex items-center gap-2">
							<span className="text-sm text-neutral-600">
								{t("X Axis")}:
							</span>
							<div className="flex gap-1">
								{DIMENSION_OPTIONS.map(({ key, labelKey }) => (
									<button
										key={key}
										type="button"
										onClick={() => setDimX(key)}
										className={cn(
											"rounded-md px-3 py-1 text-xs font-medium transition-colors",
											dimX === key
												? "bg-primary-500 text-white"
												: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
										)}
									>
										{t(labelKey)}
									</button>
								))}
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-sm text-neutral-600">
								{t("Y Axis")}:
							</span>
							<div className="flex gap-1">
								{DIMENSION_OPTIONS.map(({ key, labelKey }) => (
									<button
										key={key}
										type="button"
										onClick={() => setDimY(key)}
										className={cn(
											"rounded-md px-3 py-1 text-xs font-medium transition-colors",
											dimY === key
												? "bg-primary-500 text-white"
												: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
										)}
									>
										{t(labelKey)}
									</button>
								))}
							</div>
						</div>
					</div>

					{crossLoading ? (
						<div className="flex h-[400px] items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
						</div>
					) : crossError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load cross-dimensional data")}
							description={
								crossErr instanceof Error
									? crossErr.message
									: t("Unknown error")
							}
							action={{
								label: t("Retry"),
								onClick: () => refetchCross(),
							}}
							className="py-10"
						/>
					) : !crossData || crossData.cells.length === 0 ? (
						<EmptyState
							title={t("No cross-dimensional data")}
							description={t(
								"Insufficient data for cross-dimensional analysis.",
							)}
							className="py-10"
						/>
					) : (
						<CrossHeatmap
							cells={crossData.cells}
							xLabels={getUniqueValues(crossData.cells, "x")}
							yLabels={getUniqueValues(crossData.cells, "y")}
							xTitle={t(
								DIMENSION_OPTIONS.find((d) => d.key === dimX)
									?.labelKey ?? dimX,
							)}
							yTitle={t(
								DIMENSION_OPTIONS.find((d) => d.key === dimY)
									?.labelKey ?? dimY,
							)}
						/>
					)}
				</CardContent>
			</Card>

			{/* Timeline by dimension */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<TrendingUp
							className="h-5 w-5 text-primary-500"
							aria-hidden="true"
						/>
						{t("Timeline by Dimension")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{/* Dimension selector */}
					<div className="mb-4 flex items-center gap-2">
						<span className="text-sm text-neutral-600">
							{t("Dimension")}:
						</span>
						<div className="flex gap-1">
							{DIMENSION_OPTIONS.map(({ key, labelKey }) => (
								<button
									key={key}
									type="button"
									onClick={() => setTimelineDim(key)}
									className={cn(
										"rounded-md px-3 py-1 text-xs font-medium transition-colors",
										timelineDim === key
											? "bg-primary-500 text-white"
											: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
									)}
								>
									{t(labelKey)}
								</button>
							))}
						</div>
					</div>

					{timelineLoading ? (
						<div className="flex h-[400px] items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
						</div>
					) : timelineError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load timeline data")}
							description={
								timelineErr instanceof Error
									? timelineErr.message
									: t("Unknown error")
							}
							action={{
								label: t("Retry"),
								onClick: () => refetchTimeline(),
							}}
							className="py-10"
						/>
					) : !timelineData || timelineData.series.length === 0 ? (
						<EmptyState
							title={t("No timeline data")}
							description={t(
								"Insufficient data for timeline analysis.",
							)}
							className="py-10"
						/>
					) : (
						<TimelineChart series={timelineData.series} />
					)}
				</CardContent>
			</Card>
		</div>
	);
}
