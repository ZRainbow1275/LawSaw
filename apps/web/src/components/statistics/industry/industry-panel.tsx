"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useIndustryStats } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import { Briefcase, PieChart } from "lucide-react";
import { DOMAIN_LABELS } from "../constants";
import { DomainBarChart } from "./domain-bar-chart";
import { DomainPieChart } from "./domain-pie-chart";

export function IndustryPanel() {
	const t = useT();
	const {
		data,
		isLoading,
		isError,
		error,
		refetch,
	} = useIndustryStats({ includeSub: true });

	if (isLoading) {
		return (
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{[0, 1].map((i) => (
					<Card key={i}>
						<CardContent className="p-6">
							<div className="flex h-[350px] items-center justify-center">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<EmptyState
				variant="error"
				title={t("Failed to load industry data")}
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
				title={t("No industry data")}
				description={t(
					"No articles have domain classification yet. Data will appear after AI analysis.",
				)}
				className="py-10"
			/>
		);
	}

	return (
		<div className="space-y-6">
			{/* Coverage info */}
			<div className="flex items-center gap-4 rounded-lg bg-primary-50 px-4 py-2">
				<Briefcase
					className="h-5 w-5 text-primary-500"
					aria-hidden="true"
				/>
				<div className="text-sm">
					<span className="font-medium text-primary-700">
						{t("Domain coverage")}: {(data.coverage_rate * 100).toFixed(1)}%
					</span>
					<span className="ml-2 text-primary-600">
						({data.total} {t("articles classified")})
					</span>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Pie chart */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<PieChart
								className="h-5 w-5 text-primary-500"
								aria-hidden="true"
							/>
							{t("Domain Distribution")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<DomainPieChart items={data.items} />
					</CardContent>
				</Card>

				{/* Bar chart */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Briefcase
								className="h-5 w-5 text-primary-500"
								aria-hidden="true"
							/>
							{t("Domain Comparison")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<DomainBarChart items={data.items} />
					</CardContent>
				</Card>
			</div>

			{/* Sub-domain drilldown */}
			{data.items.some(
				(item) => item.sub_domains && item.sub_domains.length > 0,
			) && (
				<Card>
					<CardHeader>
						<CardTitle>{t("Sub-domain Details")}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{data.items
								.filter(
									(item) =>
										item.sub_domains && item.sub_domains.length > 0,
								)
								.map((item) => (
									<div
										key={item.domain_root}
										className="rounded-lg border border-neutral-100 p-4"
									>
										<h5 className="mb-3 text-sm font-semibold text-neutral-800">
											{DOMAIN_LABELS[item.domain_root] ?? item.label}
										</h5>
										<div className="space-y-2">
											{item.sub_domains?.map((sub) => (
												<div
													key={sub.domain_sub}
													className="flex items-center justify-between text-sm"
												>
													<span className="text-neutral-600">
														{sub.label}
													</span>
													<span className="font-medium text-neutral-800">
														{sub.count}
													</span>
												</div>
											))}
										</div>
									</div>
								))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
