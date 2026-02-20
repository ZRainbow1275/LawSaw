"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useRegionalStats } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import { Globe2, Map as MapIcon } from "lucide-react";
import { ChinaMap } from "./china-map";
import { RegionRankingTable } from "./region-ranking-table";

export function RegionalPanel() {
	const t = useT();
	const { data, isLoading, isError, error, refetch } = useRegionalStats();

	if (isLoading) {
		return (
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardContent className="p-6">
						<div className="flex h-[500px] items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-6">
						<div className="space-y-4">
							{Array.from({ length: 8 }, (_, i) => `rank-skel-${i}`).map(
								(key) => (
									<div
										key={key}
										className="h-8 animate-pulse rounded bg-neutral-100"
									/>
								),
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (isError) {
		return (
			<EmptyState
				variant="error"
				title={t("Failed to load regional data")}
				description={
					error instanceof Error ? error.message : t("Unknown error")
				}
				action={{ label: t("Retry"), onClick: () => refetch() }}
				className="py-10"
			/>
		);
	}

	if (!data || data.items.length === 0) {
		return (
			<EmptyState
				title={t("No regional data")}
				description={t(
					"No articles have region information yet. Data will appear after AI analysis.",
				)}
				className="py-10"
			/>
		);
	}

	const mapData = data.items.map((item) => ({
		name: item.region_name,
		value: item.count,
	}));

	return (
		<div className="space-y-6">
			{/* Coverage info */}
			<div className="flex items-center gap-4 rounded-lg bg-primary-50 px-4 py-2">
				<Globe2 className="h-5 w-5 text-primary-500" aria-hidden="true" />
				<div className="text-sm">
					<span className="font-medium text-primary-700">
						{t("Region coverage")}: {(data.coverage_rate * 100).toFixed(1)}%
					</span>
					<span className="ml-2 text-primary-600">
						({data.total} {t("articles with region data")})
					</span>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				{/* Map */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MapIcon
								className="h-5 w-5 text-primary-500"
								aria-hidden="true"
							/>
							{t("Regional Heatmap")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ChinaMap data={mapData} />
					</CardContent>
				</Card>

				{/* Ranking */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Globe2 className="h-5 w-5 text-primary-500" aria-hidden="true" />
							{t("Top Regions")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<RegionRankingTable items={data.items.slice(0, 15)} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
