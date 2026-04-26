"use client";

import { UpgradeCta } from "@/components/analytics/upgrade-cta";
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
import { CategoryStatsGrid } from "@/components/statistics/overview/category-stats-grid";
import { RiskDistributionChart } from "@/components/statistics/overview/risk-distribution-chart";
import { SentimentChart } from "@/components/statistics/overview/sentiment-chart";
import { TrendChart } from "@/components/statistics/overview/trend-chart";
import { RegionalPanel } from "@/components/statistics/regional/regional-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ChartPanelSkeleton,
	Skeleton,
	StatCardSkeleton,
} from "@/components/ui/skeleton";
import {
	useArticleAnalyticsSummary,
	useArticleCategoryCounts,
	useArticleTrends,
} from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSourceStats } from "@/hooks/use-sources";
import { type RoleTier, normalizeRoleTier } from "@/lib/authz";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	Activity,
	AlertTriangle,
	BarChart3,
	Briefcase,
	CheckCircle,
	FileText,
	Globe2,
	type LucideIcon,
	PieChart,
	Rss,
	ShieldCheck,
	TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

// Category icon mapping is encapsulated inside CategoryStatsGrid

type AnalyticsTabIntroConfig = {
	Icon: LucideIcon;
	titleKey: string;
	descriptionKey: string;
	chipKeys: [string, string, string];
	containerClassName: string;
	iconColor: string;
};

const ANALYTICS_TAB_INTROS: Record<AnalyticsTab, AnalyticsTabIntroConfig> = {
	overview: {
		Icon: Activity,
		titleKey: "Overview",
		descriptionKey:
			"Review article volume, source health, risk posture, workflow status, and category density from the latest synced dataset.",
		chipKeys: ["Total articles", "Active sources", "Risk distribution"],
		containerClassName: "",
		iconColor: "var(--surface-accent-strong)",
	},
	regional: {
		Icon: Globe2,
		titleKey: "Regional Analysis",
		descriptionKey:
			"Compare policy activity by province, validate coverage with the heatmap, and inspect the most active regions before drilling into ranking details.",
		chipKeys: ["Regional Heatmap", "Region coverage", "Top Regions"],
		containerClassName: "",
		iconColor: "#0f766e",
	},
	industry: {
		Icon: Briefcase,
		titleKey: "Industry Analysis",
		descriptionKey:
			"Review domain distribution, compare category balance, and drill into sub-domains to see where regulatory attention is clustering.",
		chipKeys: [
			"Domain Distribution",
			"Domain Comparison",
			"Sub-domain Details",
		],
		containerClassName: "",
		iconColor: "#b45309",
	},
	importance: {
		Icon: ShieldCheck,
		titleKey: "Importance & Authority",
		descriptionKey:
			"Prioritize downstream review by combining importance scores, authority levels, and issuer concentration in one operational view.",
		chipKeys: [
			"Importance Distribution",
			"Authority Level Distribution",
			"Top Issuers",
		],
		containerClassName: "",
		iconColor: "#6d28d9",
	},
	cross: {
		Icon: TrendingUp,
		titleKey: "Cross Analysis",
		descriptionKey:
			"Correlate domain, region, importance, and authority signals to uncover compound compliance patterns and timeline shifts.",
		chipKeys: [
			"Cross-Dimensional Analysis",
			"Timeline by Dimension",
			"Dimension",
		],
		containerClassName: "",
		iconColor: "#047857",
	},
};

// ---------------------------------------------------------------------------
// Tier gating + framer-motion variants (D.4)
// ---------------------------------------------------------------------------

/**
 * Maps each non-overview tab to the minimum tier required to view it.
 * Admin tiers (tenant_admin / super_admin) implicitly inherit premium.
 */
const TAB_TIER_REQUIREMENT: Record<
	Exclude<AnalyticsTab, "overview">,
	"verified_user" | "premium_user"
> = {
	regional: "verified_user",
	industry: "verified_user",
	importance: "premium_user",
	cross: "premium_user",
};

function isTierAtLeast(
	current: RoleTier,
	required: "verified_user" | "premium_user",
): boolean {
	if (current === "super_admin" || current === "tenant_admin") return true;
	if (required === "verified_user") {
		return (
			current === "verified_user" ||
			current === "premium_user"
		);
	}
	return current === "premium_user";
}

function computeLockedTabs(tier: RoleTier): Set<AnalyticsTab> {
	const locked = new Set<AnalyticsTab>();
	for (const tab of Object.keys(TAB_TIER_REQUIREMENT) as Array<
		Exclude<AnalyticsTab, "overview">
	>) {
		if (!isTierAtLeast(tier, TAB_TIER_REQUIREMENT[tab])) {
			locked.add(tab);
		}
	}
	return locked;
}

const tabContainerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08, delayChildren: 0.04 },
	},
};

const tabItemVariants = {
	hidden: { opacity: 0, y: 16 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.36, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

const analyticsHeadingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const analyticsMutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

const analyticsPrimaryAccentStyle = {
	color: "var(--surface-accent-strong)",
} as const;

const analyticsCardBorderStyle = {
	borderColor: "var(--surface-muted-border)",
} as const;

const analyticsErrorSurfaceStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-error-light) 84%, transparent)",
	borderColor: "color-mix(in srgb, var(--color-error) 22%, transparent)",
} as const;

const analyticsErrorTextStyle = {
	color:
		"color-mix(in srgb, var(--color-error) 78%, var(--field-foreground) 22%)",
} as const;

const analyticsWarningSurfaceStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-warning-light) 84%, transparent)",
	borderColor: "color-mix(in srgb, var(--color-warning) 22%, transparent)",
} as const;

const analyticsWarningTextStyle = {
	color:
		"color-mix(in srgb, var(--color-warning) 76%, var(--field-foreground) 24%)",
} as const;

function AnalyticsTabIntro({ activeTab }: { activeTab: AnalyticsTab }) {
	const t = useT();
	const intro = ANALYTICS_TAB_INTROS[activeTab];
	const heroGradient =
		activeTab === "regional"
			? "var(--surface-hero-cyan-gradient)"
			: activeTab === "industry"
				? "var(--surface-hero-amber-gradient)"
				: activeTab === "importance"
					? "var(--surface-hero-violet-gradient)"
					: activeTab === "cross"
						? "var(--surface-hero-emerald-gradient)"
						: "var(--surface-hero-primary-gradient)";

	return (
		<Card
			className={`mb-6 overflow-hidden border shadow-sm ${intro.containerClassName}`}
			data-testid={`analytics-intro-${activeTab}`}
			style={{
				backgroundImage: heroGradient,
				borderColor: "var(--surface-accent-border)",
			}}
		>
			<CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
				<div className="flex items-start gap-4">
					<div
						className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
						style={{
							backgroundColor: "var(--surface-accent-icon-bg)",
							color: intro.iconColor,
						}}
					>
						<intro.Icon aria-hidden="true" className="h-5 w-5" />
					</div>
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								variant="outline"
								className=""
								style={{
									backgroundColor: "var(--surface-muted-bg)",
									borderColor: "var(--surface-muted-border)",
									color: "var(--surface-accent-strong)",
								}}
							>
								{t("Analytics")}
							</Badge>
							<h2
								className="text-lg font-semibold"
								style={analyticsHeadingTextStyle}
							>
								{t(intro.titleKey)}
							</h2>
						</div>
						<p
							className="max-w-3xl text-sm leading-6"
							style={analyticsMutedTextStyle}
						>
							{t(intro.descriptionKey)}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
					{intro.chipKeys.map((chipKey) => (
						<Badge
							key={chipKey}
							variant="secondary"
							className=""
							style={{
								backgroundColor: "var(--surface-muted-bg)",
								color: "var(--surface-muted-text)",
							}}
						>
							{t(chipKey)}
						</Badge>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function OverviewStatusSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-4">
			{Array.from(
				{ length: 6 },
				(_, index) => `overview-status-skeleton-${index}`,
			).map((key) => (
				<div
					key={key}
					className="rounded-lg border p-3"
					style={{
						backgroundColor: "var(--control-hover-bg)",
						borderColor: "var(--surface-muted-border)",
					}}
				>
					<div className="flex items-center justify-between gap-3">
						<Skeleton variant="rectangular" width={92} height={24} />
						<Skeleton variant="text" width={36} height={28} />
					</div>
				</div>
			))}
		</div>
	);
}

export default function AnalyticsPage() {
	const t = useT();
	const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
	const roleTier = useAuthStore((state) => state.roleTier);
	const tier = normalizeRoleTier(roleTier);

	const lockedTabs = useMemo(() => computeLockedTabs(tier), [tier]);

	const renderTabBody = () => {
		if (activeTab !== "overview" && lockedTabs.has(activeTab)) {
			const required = TAB_TIER_REQUIREMENT[activeTab];
			return (
				<UpgradeCta
					tabKey={activeTab}
					currentTier={tier}
					requiredTier={required}
				/>
			);
		}
		switch (activeTab) {
			case "overview":
				return <OverviewTab />;
			case "regional":
				return <RegionalPanel />;
			case "industry":
				return <IndustryPanel />;
			case "importance":
				return <ImportancePanel />;
			case "cross":
				return <CrossPanel />;
		}
	};

	return (
		<ProtectedRoute>
			<div
				className="flex min-h-screen"
				style={{ backgroundColor: "var(--color-background)" }}
			>
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6">
							<h1
								className="text-2xl font-bold"
								style={analyticsHeadingTextStyle}
							>
								{t("Analytics")}
							</h1>
							<p className="text-sm" style={analyticsMutedTextStyle}>
								{t("Data statistics and trend analysis")}
							</p>
						</div>

						{/* Tab Navigation */}
						<AnalyticsTabs
							activeTab={activeTab}
							onTabChange={setActiveTab}
							lockedTabs={lockedTabs}
						/>

						{/* Active tab semantic intro */}
						<AnalyticsTabIntro activeTab={activeTab} />

						{/* Tab Content with framer-motion staggered transition */}
						<AnimatePresence mode="wait">
							<motion.div
								key={`${activeTab}-${
									activeTab !== "overview" && lockedTabs.has(activeTab)
										? "locked"
										: "open"
								}`}
								variants={tabContainerVariants}
								initial="hidden"
								animate="visible"
								exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
							>
								{renderTabBody()}
							</motion.div>
						</AnimatePresence>
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

	const activeSources =
		sourceStats && !sourceStatsLoading && !sourceStatsError
			? sourceStats.active_count
			: null;
	const errorSources =
		sourceStats && !sourceStatsLoading && !sourceStatsError
			? sourceStats.error_count
			: null;
	const overviewSummaryLoading =
		analyticsSummaryLoading || categoriesLoading || sourceStatsLoading;

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
			<motion.div
				variants={tabItemVariants}
				className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
			>
				{overviewSummaryLoading ? (
					<>
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
						<StatCardSkeleton />
					</>
				) : (
					<>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div
										className="flex h-10 w-10 items-center justify-center rounded-lg"
										style={{ backgroundColor: "var(--surface-accent-icon-bg)" }}
									>
										<FileText
											aria-hidden="true"
											className="h-5 w-5"
											style={analyticsPrimaryAccentStyle}
										/>
									</div>
									<div>
										<p className="text-2xl font-bold">
											{totalArticles ?? "\u2014"}
										</p>
										<p className="text-sm" style={analyticsMutedTextStyle}>
											{t("Total articles")}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div
										className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light"
										style={{ backgroundColor: "var(--surface-accent-icon-bg)" }}
									>
										<Rss aria-hidden="true" className="h-5 w-5 text-success" />
									</div>
									<div>
										<p className="text-2xl font-bold">
											{activeSources ?? "\u2014"}
										</p>
										<p className="text-sm" style={analyticsMutedTextStyle}>
											{t("Active sources")}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div
										className="flex h-10 w-10 items-center justify-center rounded-lg"
										style={{ backgroundColor: "var(--surface-accent-icon-bg)" }}
									>
										<Activity
											aria-hidden="true"
											className="h-5 w-5"
											style={analyticsWarningTextStyle}
										/>
									</div>
									<div>
										<p className="text-2xl font-bold">
											{categoriesCount ?? "\u2014"}
										</p>
										<p className="text-sm" style={analyticsMutedTextStyle}>
											{t("Categories")}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div
										className="flex h-10 w-10 items-center justify-center rounded-lg"
										style={{ backgroundColor: "var(--surface-accent-icon-bg)" }}
									>
										<AlertTriangle
											aria-hidden="true"
											className="h-5 w-5"
											style={analyticsErrorTextStyle}
										/>
									</div>
									<div>
										<p className="text-2xl font-bold">
											{errorSources ?? "\u2014"}
										</p>
										<p className="text-sm" style={analyticsMutedTextStyle}>
											{t("Sources with errors")}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</>
				)}
			</motion.div>

			{hasInfraError ? (
				<div
					className="mb-6 flex items-center justify-between rounded-lg border px-3 py-2"
					style={analyticsErrorSurfaceStyle}
				>
					<p className="text-xs" style={analyticsErrorTextStyle}>
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

			<motion.div
				variants={tabItemVariants}
				className="grid grid-cols-1 gap-6 lg:grid-cols-2"
			>
				{/* Risk distribution — upgraded to recharts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<PieChart
								aria-hidden="true"
								className="h-5 w-5"
								style={analyticsPrimaryAccentStyle}
							/>
							{t("Risk distribution")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{analyticsSummaryLoading ? (
							<ChartPanelSkeleton height={260} />
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
								className="h-5 w-5"
								style={analyticsPrimaryAccentStyle}
							/>
							{t("Sentiment analysis")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{analyticsSummaryLoading ? (
							<ChartPanelSkeleton height={260} />
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
								className="h-5 w-5"
								style={analyticsPrimaryAccentStyle}
							/>
							{t("Article status")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{analyticsSummaryLoading ? (
							<OverviewStatusSkeleton />
						) : (
							<div className="grid grid-cols-2 gap-4">
								{statusRows.map(({ key, labelKey, variant }) => (
									<div
										key={key}
										className="flex items-center justify-between rounded-lg border p-3"
										style={analyticsCardBorderStyle}
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
						)}
					</CardContent>
				</Card>

				{/* Last 7 days trend — upgraded to recharts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TrendingUp
								aria-hidden="true"
								className="h-5 w-5"
								style={analyticsPrimaryAccentStyle}
							/>
							{t("Last 7 days trend")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{trendsLoading ? (
							<ChartPanelSkeleton height={260} />
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
			</motion.div>

			{/* Category statistics — extracted CategoryStatsGrid */}
			<motion.div variants={tabItemVariants}>
			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3
							aria-hidden="true"
							className="h-5 w-5"
							style={analyticsPrimaryAccentStyle}
						/>
						{t("Category statistics")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<CategoryStatsGrid
						categories={categories}
						categoryCounts={categoryCountRows}
						isLoading={categoryCountsLoading || categoriesLoading}
						isError={categoriesError}
						hasCountsError={categoryCountsError}
						errorMessage={
							categoriesErrorDetail instanceof Error
								? categoriesErrorDetail.message
								: undefined
						}
						onRetry={() => {
							refetchCategories();
							refetchCategoryCounts();
						}}
					/>
				</CardContent>
			</Card>
			</motion.div>
		</>
	);
}
