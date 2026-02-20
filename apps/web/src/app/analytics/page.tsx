"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import {
	type AnalyticsTab,
	AnalyticsTabs,
} from "@/components/statistics/analytics-tabs";
import { CrossPanel } from "@/components/statistics/cross/cross-panel";
import { ImportancePanel } from "@/components/statistics/importance/importance-panel";
import { IndustryPanel } from "@/components/statistics/industry/industry-panel";
import { RiskDistributionChart } from "@/components/statistics/overview/risk-distribution-chart";
import { SentimentChart } from "@/components/statistics/overview/sentiment-chart";
import { TrendChart } from "@/components/statistics/overview/trend-chart";
import { RegionalPanel } from "@/components/statistics/regional/regional-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useArticleAnalyticsSummary,
	useArticleCategoryCounts,
	useArticleTrends,
} from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSourceStats } from "@/hooks/use-sources";
import { useT } from "@/lib/i18n-client";
import {
	Activity,
	AlertTriangle,
	BarChart3,
	Briefcase,
	Building2,
	CheckCircle,
	FileText,
	Flame,
	Globe2,
	GraduationCap,
	type LucideIcon,
	PieChart,
	Rss,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";

// Category icon mapping (replaces emoji)
const categoryIconMap: Record<string, { Icon: LucideIcon; color: string }> = {
	legislation: { Icon: ScrollText, color: "text-blue-500" },
	regulation: { Icon: Building2, color: "text-purple-500" },
	enforcement: { Icon: Scale, color: "text-rose-500" },
	industry: { Icon: Briefcase, color: "text-amber-500" },
	compliance: { Icon: ShieldCheck, color: "text-emerald-500" },
	data: { Icon: BarChart3, color: "text-cyan-500" },
	security: { Icon: Shield, color: "text-red-500" },
	academic: { Icon: GraduationCap, color: "text-indigo-500" },
	events: { Icon: Flame, color: "text-orange-500" },
	international: { Icon: Globe2, color: "text-teal-500" },
};

export default function AnalyticsPage() {
	const t = useT();
	const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6">
							<h1 className="text-2xl font-bold text-neutral-900">
								{t("Analytics")}
							</h1>
							<p className="text-sm text-neutral-500">
								{t("Data statistics and trend analysis")}
							</p>
						</div>

						{/* Tab Navigation */}
						<AnalyticsTabs activeTab={activeTab} onTabChange={setActiveTab} />

						{/* Tab Content */}
						{activeTab === "overview" && <OverviewTab />}
						{activeTab === "regional" && <RegionalPanel />}
						{activeTab === "industry" && <IndustryPanel />}
						{activeTab === "importance" && <ImportancePanel />}
						{activeTab === "cross" && <CrossPanel />}
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}

// ---------------------------------------------------------------------------
// Overview Tab — preserves existing content, upgrades CSS charts to recharts
// ---------------------------------------------------------------------------

function OverviewTab() {
	const t = useT();

	const {
		data: analyticsSummary,
		isLoading: analyticsSummaryLoading,
		isError: analyticsSummaryError,
	} = useArticleAnalyticsSummary();
	const {
		data: categories,
		isLoading: categoriesLoading,
		isError: categoriesError,
		error: categoriesErrorDetail,
		refetch: refetchCategories,
	} = useCategories();
	const {
		data: sourceStats,
		isLoading: sourceStatsLoading,
		isError: sourceStatsError,
		refetch: refetchSourceStats,
	} = useSourceStats();
	const {
		data: trendPoints,
		isLoading: trendsLoading,
		isError: trendsError,
		error: trendsErrorDetail,
		refetch: refetchTrends,
	} = useArticleTrends(7);
	const {
		data: categoryCountRows,
		isLoading: categoryCountsLoading,
		isError: categoryCountsError,
		refetch: refetchCategoryCounts,
	} = useArticleCategoryCounts();

	const infraErrors: string[] = [];
	if (sourceStatsError) infraErrors.push("Source stats");
	if (categoriesError) infraErrors.push("Categories");
	const hasInfraError = infraErrors.length > 0;

	const categoriesCount =
		categories && !categoriesLoading && !categoriesError
			? categories.length
			: null;

	const analyticsReady =
		!!analyticsSummary && !analyticsSummaryLoading && !analyticsSummaryError;
	const totalArticles = analyticsReady
		? (analyticsSummary?.total ?? null)
		: null;

	const categoryCountsById = new Map<string, number>();
	let uncategorizedCount = 0;
	for (const row of categoryCountRows ?? []) {
		if (!row.category_id) {
			uncategorizedCount = row.count;
			continue;
		}
		categoryCountsById.set(row.category_id, row.count);
	}

	const activeSources =
		sourceStats && !sourceStatsLoading && !sourceStatsError
			? sourceStats.active_count
			: null;
	const errorSources =
		sourceStats && !sourceStatsLoading && !sourceStatsError
			? sourceStats.error_count
			: null;

	const statusRows = [
		{
			key: "pending",
			labelKey: "Pending",
			variant: "outline" as const,
		},
		{
			key: "processing",
			labelKey: "Processing",
			variant: "warning" as const,
		},
		{
			key: "published",
			labelKey: "Published",
			variant: "success" as const,
		},
		{
			key: "archived",
			labelKey: "Archived",
			variant: "outline" as const,
		},
		{
			key: "rejected",
			labelKey: "Rejected",
			variant: "destructive" as const,
		},
	] as const;

	return (
		<>
			{/* Overview Stats */}
			<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
								<FileText
									aria-hidden="true"
									className="h-5 w-5 text-primary-600"
								/>
							</div>
							<div>
								<p className="text-2xl font-bold">
									{totalArticles ?? "\u2014"}
								</p>
								<p className="text-sm text-neutral-500">
									{t("Total articles")}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
								<Rss aria-hidden="true" className="h-5 w-5 text-success" />
							</div>
							<div>
								<p className="text-2xl font-bold">
									{activeSources ?? "\u2014"}
								</p>
								<p className="text-sm text-neutral-500">
									{t("Active sources")}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
								<Activity aria-hidden="true" className="h-5 w-5 text-warning" />
							</div>
							<div>
								<p className="text-2xl font-bold">
									{categoriesCount ?? "\u2014"}
								</p>
								<p className="text-sm text-neutral-500">{t("Categories")}</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
								<AlertTriangle
									aria-hidden="true"
									className="h-5 w-5 text-destructive"
								/>
							</div>
							<div>
								<p className="text-2xl font-bold">{errorSources ?? "\u2014"}</p>
								<p className="text-sm text-neutral-500">
									{t("Sources with errors")}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{hasInfraError ? (
				<div className="mb-6 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
					<p className="text-xs text-red-700">
						{t("Failed to load base data: {items}", {
							items: infraErrors.map((key) => t(key)).join(" / "),
						})}{" "}
						{t("(Unreliable values are hidden.)")}
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							refetchSourceStats();
							refetchCategories();
						}}
					>
						{t("Retry")}
					</Button>
				</div>
			) : null}

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Risk distribution — upgraded to recharts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<PieChart
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("Risk distribution")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{analyticsSummaryLoading ? (
							<div className="flex h-[260px] items-center justify-center">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
							</div>
						) : analyticsReady && analyticsSummary?.risk ? (
							<RiskDistributionChart data={analyticsSummary.risk} />
						) : (
							<EmptyState title={t("No risk data")} className="py-10" />
						)}
					</CardContent>
				</Card>

				{/* Sentiment analysis — upgraded to recharts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BarChart3
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("Sentiment analysis")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{analyticsSummaryLoading ? (
							<div className="flex h-[260px] items-center justify-center">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
							</div>
						) : analyticsReady && analyticsSummary?.sentiment ? (
							<SentimentChart data={analyticsSummary.sentiment} />
						) : (
							<EmptyState title={t("No sentiment data")} className="py-10" />
						)}
					</CardContent>
				</Card>

				{/* Status distribution — keep as badge grid */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<CheckCircle
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("Article status")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 gap-4">
							{statusRows.map(({ key, labelKey, variant }) => (
								<div
									key={key}
									className="flex items-center justify-between rounded-lg border border-neutral-100 p-3"
								>
									<Badge variant={variant}>{t(labelKey)}</Badge>
									<span className="text-lg font-semibold">
										{analyticsReady
											? (analyticsSummary?.status?.[key] ?? 0)
											: "\u2014"}
									</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Last 7 days trend — upgraded to recharts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TrendingUp
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("Last 7 days trend")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{trendsLoading ? (
							<div className="flex h-[260px] items-center justify-center">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
							</div>
						) : trendsError ? (
							<EmptyState
								variant="error"
								title={t("Failed to load trend data")}
								description={
									trendsErrorDetail instanceof Error
										? trendsErrorDetail.message
										: t("Unknown error")
								}
								action={{
									label: t("Retry"),
									onClick: () => refetchTrends(),
								}}
								className="py-10"
							/>
						) : !trendPoints || trendPoints.length === 0 ? (
							<EmptyState
								title={t("No trend data")}
								description={t("No data to display for the last 7 days")}
								className="py-10"
							/>
						) : (
							<TrendChart data={trendPoints} />
						)}
					</CardContent>
				</Card>
			</div>

			{/* Category statistics — keep as icon grid */}
			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3
							aria-hidden="true"
							className="h-5 w-5 text-primary-500"
						/>
						{t("Category statistics")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{categoriesError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load category data")}
							description={
								categoriesErrorDetail instanceof Error
									? categoriesErrorDetail.message
									: t("Unknown error")
							}
							action={{
								label: t("Retry"),
								onClick: () => {
									refetchCategories();
									refetchCategoryCounts();
								},
							}}
							className="py-10"
						/>
					) : categoryCountsLoading || categoriesLoading ? (
						<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
							{Array.from(
								{ length: Math.min(10, categories?.length ?? 10) },
								(_, idx) => `cat-stats-skel-${idx}`,
							).map((key) => (
								<div
									key={key}
									className="h-[124px] rounded-lg border border-neutral-100 bg-neutral-50 animate-pulse"
								/>
							))}
						</div>
					) : (
						<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
							{categoryCountsError ? (
								<div className="col-span-2 flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 sm:col-span-3 lg:col-span-5">
									<p className="text-xs text-amber-800">
										{t(
											"Failed to load category stats (unreliable values are hidden.)",
										)}
									</p>
									<Button
										variant="outline"
										size="sm"
										onClick={() => refetchCategoryCounts()}
									>
										{t("Retry")}
									</Button>
								</div>
							) : null}
							{uncategorizedCount > 0 && (
								<div className="flex flex-col items-center rounded-lg border border-neutral-100 p-4 text-center">
									<FileText
										aria-hidden="true"
										className="h-6 w-6 text-neutral-500"
									/>
									<span className="mt-2 text-sm font-medium">
										{t("Uncategorized")}
									</span>
									<span className="mt-1 text-2xl font-bold text-primary-600">
										{categoryCountsError ? "\u2014" : uncategorizedCount}
									</span>
								</div>
							)}
							{categories?.map((category) => {
								const iconInfo = categoryIconMap[category.slug];
								const IconComponent = iconInfo?.Icon;
								const count = categoryCountsById.get(category.id) ?? 0;
								return (
									<div
										key={category.id}
										className="flex flex-col items-center rounded-lg border border-neutral-100 p-4 text-center"
									>
										{IconComponent ? (
											<IconComponent className={`h-6 w-6 ${iconInfo.color}`} />
										) : (
											<BarChart3
												aria-hidden="true"
												className="h-6 w-6 text-neutral-400"
											/>
										)}
										<span className="mt-2 text-sm font-medium">
											{category.name}
										</span>
										<span className="mt-1 text-2xl font-bold text-primary-600">
											{categoryCountsError ? "\u2014" : count}
										</span>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</>
	);
}
