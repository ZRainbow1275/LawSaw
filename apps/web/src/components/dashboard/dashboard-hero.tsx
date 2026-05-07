"use client";

import { DOMAIN_LABELS } from "@/components/statistics/constants";
import { DomainBarChart } from "@/components/statistics/industry/domain-bar-chart";
import { DomainPieChart } from "@/components/statistics/industry/domain-pie-chart";
import { ChinaMap } from "@/components/statistics/regional/china-map";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useArticleTrends, useArticles } from "@/hooks/use-articles";
import {
	useIndustryStats,
	useRegionalStats,
	useStatisticsOverview,
} from "@/hooks/use-statistics";
import type { Article } from "@/lib/api/types";
import { type Locale, formatTimeAgo, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	Activity,
	ArrowRight,
	BarChart3,
	Clock3,
	Globe2,
	LayoutGrid,
	LocateFixed,
	MapPinned,
	PieChart as PieChartIcon,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const TIME_WINDOWS = [7, 30, 90] as const;
type HeroVisualMode = "map" | "industry";
type IndustryChartMode = "ring" | "bar";
const UNKNOWN_REGION_CODE = "000000";
const REGION_ARTICLE_SAMPLE_LIMIT = 120;

const dashboardHeroPanelStyle = {
	backgroundColor: "var(--surface-muted-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const dashboardHeroNestedSurfaceStyle = {
	backgroundColor: "var(--control-hover-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const dashboardHeroHeadingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const dashboardHeroMutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

const dashboardHeroShellStyle = {
	backgroundColor: "var(--surface-card-foreground)",
	backgroundImage:
		"linear-gradient(135deg, color-mix(in srgb, var(--surface-card-foreground) 98%, transparent) 0%, color-mix(in srgb, var(--surface-card-foreground) 95%, transparent) 52%, color-mix(in srgb, var(--surface-card-foreground) 95%, transparent) 76%, color-mix(in srgb, var(--color-primary-500) 86%, var(--surface-card-foreground) 14%) 100%)",
	borderColor: "color-mix(in srgb, var(--surface-card-faint-fg) 24%, transparent)",
	boxShadow:
		"0 24px 80px color-mix(in srgb, var(--surface-card-foreground) 22%, transparent)",
} as const;

const dashboardHeroSelectedPillStyle = {
	backgroundColor: "color-mix(in srgb, white 92%, transparent)",
	boxShadow:
		"0 10px 24px color-mix(in srgb, var(--surface-card-foreground) 22%, transparent)",
} as const;

const dashboardHeroEyebrowTextStyle = {
	color: "color-mix(in srgb, var(--color-primary-200) 80%, transparent)",
} as const;

const dashboardHeroStrongTextStyle = {
	color: "color-mix(in srgb, white 96%, transparent)",
} as const;

const dashboardHeroSoftTextStyle = {
	color: "color-mix(in srgb, var(--surface-card-border-strong) 90%, transparent)",
} as const;

const dashboardHeroInverseTextStyle = {
	color: "var(--surface-card-foreground)",
} as const;

const dashboardHeroPrimaryIconStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-primary-400) 16%, transparent)",
	color: "color-mix(in srgb, var(--color-primary-200) 96%, transparent)",
} as const;

const dashboardHeroSuccessIconStyle = {
	backgroundColor: "color-mix(in srgb, var(--color-success) 16%, transparent)",
	color:
		"color-mix(in srgb, var(--color-success-light) 96%, var(--field-foreground) 4%)",
} as const;

const dashboardHeroCoverageTrackStyle = {
	backgroundColor: "color-mix(in srgb, white 8%, transparent)",
} as const;

const dashboardHeroTrendBarStyle = {
	backgroundImage: "var(--surface-hero-primary-gradient)",
} as const;

const dashboardHeroIndustryBarStyle = {
	backgroundImage: "var(--surface-success-gradient)",
} as const;

const dashboardHeroWarningBannerStyle = {
	backgroundColor: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
	borderColor: "color-mix(in srgb, var(--color-warning) 18%, transparent)",
	color:
		"color-mix(in srgb, var(--color-warning-light) 96%, var(--field-foreground) 4%)",
} as const;

const dashboardHeroAccentIconStyle = {
	color: "color-mix(in srgb, var(--color-primary-200) 96%, transparent)",
} as const;

const dashboardHeroSelectedSurfaceStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-primary-400) 16%, transparent)",
	borderColor: "color-mix(in srgb, var(--color-primary-400) 58%, transparent)",
} as const;

function formatPercent(value: number) {
	return `${Math.round(value * 100)}%`;
}

function formatCoverage(count: number, total: number) {
	if (total <= 0) return "0%";
	return `${Math.round((count / total) * 100)}%`;
}

function buildDateRange(days: number) {
	const end = new Date();
	const start = new Date(end);
	start.setDate(end.getDate() - Math.max(days - 1, 0));
	return {
		dateFrom: start.toISOString().slice(0, 10),
		dateTo: end.toISOString().slice(0, 10),
	};
}

function getKnownRegionalItems(
	items: Array<{
		region_code: string;
		region_name: string;
		count: number;
		percentage: number;
	}>,
) {
	return items.filter((item) => item.region_code !== UNKNOWN_REGION_CODE);
}

function getRegionArticleSample(
	articles: Article[],
	selectedRegionCode: string | null,
) {
	if (!selectedRegionCode) {
		return [];
	}

	return articles
		.filter((article) => article.region_code === selectedRegionCode)
		.slice(0, 4);
}

export function DashboardHero() {
	const locale = useLocale() as Locale;
	const t = useT();
	const [timeWindow, setTimeWindow] =
		useState<(typeof TIME_WINDOWS)[number]>(30);
	const [visualMode, setVisualMode] = useState<HeroVisualMode>("map");
	const [industryChartMode, setIndustryChartMode] =
		useState<IndustryChartMode>("ring");
	const [selectedRegionCode, setSelectedRegionCode] = useState<string | null>(
		null,
	);
	const [hasInitializedRegionSelection, setHasInitializedRegionSelection] =
		useState(false);
	const { dateFrom, dateTo } = useMemo(
		() => buildDateRange(timeWindow),
		[timeWindow],
	);

	const overviewQuery = useStatisticsOverview();
	const regionalQuery = useRegionalStats({ dateFrom, dateTo });
	const industryQuery = useIndustryStats({ includeSub: true });
	const trendsQuery = useArticleTrends(timeWindow);
	const regionArticlesQuery = useArticles({
		limit: REGION_ARTICLE_SAMPLE_LIMIT,
		status: "published",
		enabled: visualMode === "map",
	});

	const overview = overviewQuery.data;
	const regionalAllItems = regionalQuery.data?.items ?? [];
	const knownRegionalItems = useMemo(
		() => getKnownRegionalItems(regionalAllItems),
		[regionalAllItems],
	);
	const regionalItems = knownRegionalItems.slice(0, 5);
	const industryItems = industryQuery.data?.items.slice(0, 5) ?? [];
	const mapData = knownRegionalItems.map((item) => ({
		name: item.region_name,
		value: item.count,
	}));
	const regionalCoverage = regionalQuery.data?.coverage_rate ?? 0;
	const industryCoverage = industryQuery.data?.coverage_rate ?? 0;
	const industryWithSubs =
		industryQuery.data?.items
			.filter((item) => (item.sub_domains?.length ?? 0) > 0)
			.slice(0, 3) ?? [];
	const trendPoints = trendsQuery.data ?? [];
	const trendMax = Math.max(...trendPoints.map((point) => point.count), 1);
	const coverageTotal = overview?.total_articles ?? 0;
	const unknownRegionalBucket =
		regionalAllItems.find((item) => item.region_code === UNKNOWN_REGION_CODE) ??
		null;
	const selectedRegion =
		knownRegionalItems.find(
			(item) => item.region_code === selectedRegionCode,
		) ?? null;
	const selectedRegionArticles = useMemo(
		() =>
			getRegionArticleSample(
				regionArticlesQuery.data?.data ?? [],
				selectedRegionCode,
			),
		[regionArticlesQuery.data?.data, selectedRegionCode],
	);

	useEffect(() => {
		if (knownRegionalItems.length === 0) {
			if (selectedRegionCode !== null) {
				setSelectedRegionCode(null);
			}
			return;
		}

		if (
			selectedRegionCode &&
			knownRegionalItems.some((item) => item.region_code === selectedRegionCode)
		) {
			return;
		}

		if (!hasInitializedRegionSelection || selectedRegionCode !== null) {
			setSelectedRegionCode(knownRegionalItems[0]?.region_code ?? null);
			setHasInitializedRegionSelection(true);
		}
	}, [hasInitializedRegionSelection, knownRegionalItems, selectedRegionCode]);

	const handleRegionSelection = (regionName: string) => {
		const matchedRegion = knownRegionalItems.find(
			(item) => item.region_name === regionName,
		);
		if (matchedRegion) {
			setSelectedRegionCode(matchedRegion.region_code);
		}
	};

	const coverageItems = [
		{
			label: t("Region tagging"),
			count: overview?.with_region ?? 0,
			barStyle: { backgroundImage: "var(--surface-hero-primary-gradient)" },
		},
		{
			label: t("Industry tagging"),
			count: overview?.with_domain ?? 0,
			barStyle: dashboardHeroIndustryBarStyle,
		},
		{
			label: t("Importance scoring"),
			count: overview?.with_importance ?? 0,
			barStyle: { backgroundImage: "var(--surface-hero-amber-gradient)" },
		},
		{
			label: t("Authority scoring"),
			count: overview?.with_authority ?? 0,
			barStyle: { backgroundImage: "var(--surface-hero-violet-gradient)" },
		},
		{
			label: t("Issuer extraction"),
			count: overview?.with_issuer ?? 0,
			barStyle: {
				backgroundImage:
					"linear-gradient(135deg, color-mix(in srgb, var(--color-error) 72%, var(--color-warning) 28%), color-mix(in srgb, var(--color-error) 88%, var(--surface-card-foreground) 12%))",
			},
		},
	];

	const hasHeroError =
		overviewQuery.isError ||
		regionalQuery.isError ||
		industryQuery.isError ||
		trendsQuery.isError;

	return (
		<div className="mb-8 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
			<Card
				className="relative overflow-hidden"
				style={dashboardHeroShellStyle}
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(ellipse at 30% 20%, color-mix(in srgb, var(--color-primary-500) 12%, transparent) 0%, transparent 60%)",
					}}
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full"
					style={{
						background:
							"radial-gradient(circle, color-mix(in srgb, var(--color-primary-400) 14%, transparent) 0%, transparent 70%)",
					}}
				/>
				<CardHeader
					className="relative border-b"
					style={{ borderColor: "var(--surface-muted-border)" }}
				>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-2">
							<div
								className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]"
								style={dashboardHeroEyebrowTextStyle}
							>
								<span
									aria-hidden="true"
									className="h-2 w-2 animate-pulse-live rounded-full"
									style={{ backgroundColor: "var(--color-success)" }}
								/>
								<Sparkles aria-hidden="true" className="h-4 w-4" />
								{t("Dashboard hero")}
							</div>
							<CardTitle
								className="text-2xl font-semibold"
								style={dashboardHeroStrongTextStyle}
							>
								{t("Regulatory coverage pulse")}
							</CardTitle>
							<CardDescription
								className="max-w-2xl text-sm leading-6"
								style={dashboardHeroMutedTextStyle}
							>
								{t(
									"Track how much of the live article corpus has been enriched with region, industry, authority, issuer, and importance signals.",
								)}
							</CardDescription>
						</div>
						<div className="flex flex-wrap gap-2">
							<div
								className="inline-flex rounded-full border p-1"
								style={dashboardHeroNestedSurfaceStyle}
							>
								{TIME_WINDOWS.map((days) => {
									const isActive = timeWindow === days;
									return (
										<button
											key={days}
											type="button"
											className="relative rounded-full px-4 py-2 text-xs font-semibold"
											onClick={() => setTimeWindow(days)}
											data-testid={`dashboard-time-window-${days}`}
										>
											{isActive ? (
												<motion.span
													layoutId="dashboard-time-window-indicator"
													className="absolute inset-0 rounded-full"
													style={dashboardHeroSelectedPillStyle}
													transition={{
														type: "spring",
														stiffness: 320,
														damping: 28,
													}}
												/>
											) : null}
											<span
												className={cn(
													"relative z-10 transition-opacity",
													isActive ? "" : "opacity-90 hover:opacity-100",
												)}
												style={
													isActive
														? dashboardHeroInverseTextStyle
														: dashboardHeroSoftTextStyle
												}
											>
												{t("Last {count} days", { count: days })}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent className="relative grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
					<div className="space-y-6">
						<div className="grid gap-4 sm:grid-cols-2">
							<div
								className="rounded-3xl border p-5 backdrop-blur"
								style={dashboardHeroPanelStyle}
							>
								<div className="flex items-center gap-3">
									<div
										className="flex h-11 w-11 items-center justify-center rounded-2xl"
										style={dashboardHeroPrimaryIconStyle}
									>
										<Activity aria-hidden="true" className="h-5 w-5" />
									</div>
									<div>
										<p
											className="text-xs uppercase tracking-[0.18em]"
											style={dashboardHeroMutedTextStyle}
										>
											{t("Corpus")}
										</p>
										<div className="mt-1" style={dashboardHeroStrongTextStyle}>
											{overviewQuery.isLoading ? (
												<p className="text-3xl font-semibold">…</p>
											) : (
												<AnimatedNumber
													value={coverageTotal}
													duration={1200}
													animateOnView
													numberClassName="text-3xl font-semibold"
												/>
											)}
										</div>
									</div>
								</div>
								<p className="mt-4 text-sm" style={dashboardHeroMutedTextStyle}>
									{t("Articles included in the current analytics snapshot.")}
								</p>
							</div>
							<div
								className="rounded-3xl border p-5 backdrop-blur"
								style={dashboardHeroPanelStyle}
							>
								<div className="flex items-center gap-3">
									<div
										className="flex h-11 w-11 items-center justify-center rounded-2xl"
										style={dashboardHeroSuccessIconStyle}
									>
										<BarChart3 aria-hidden="true" className="h-5 w-5" />
									</div>
									<div>
										<p
											className="text-xs uppercase tracking-[0.18em]"
											style={dashboardHeroMutedTextStyle}
										>
											{t("Trend window")}
										</p>
										<div className="mt-1" style={dashboardHeroStrongTextStyle}>
											<AnimatedNumber
												value={timeWindow}
												duration={800}
												animateOnView
												numberClassName="text-3xl font-semibold"
											/>
										</div>
									</div>
								</div>
								<p className="mt-4 text-sm" style={dashboardHeroMutedTextStyle}>
									{t(
										"The mini trend chart and regional snapshot are aligned to this time filter.",
									)}
								</p>
							</div>
						</div>

						<div
							className="rounded-3xl border p-5 backdrop-blur"
							style={dashboardHeroPanelStyle}
						>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p
										className="text-sm font-semibold"
										style={dashboardHeroStrongTextStyle}
									>
										{t("Signal coverage")}
									</p>
									<p
										className="mt-1 text-xs"
										style={dashboardHeroMutedTextStyle}
									>
										{t(
											"How much of the corpus is enriched by each analytics dimension.",
										)}
									</p>
								</div>
								<Badge
									variant="outline"
									style={{
										...dashboardHeroNestedSurfaceStyle,
										...dashboardHeroStrongTextStyle,
									}}
								>
									{t("Real API")}
								</Badge>
							</div>
							<div className="mt-5 space-y-4">
								{coverageItems.map((item) => {
									const percentage =
										coverageTotal > 0 ? item.count / coverageTotal : 0;
									return (
										<div key={item.label} className="space-y-2">
											<div className="flex items-center justify-between gap-3 text-sm">
												<span style={dashboardHeroHeadingTextStyle}>
													{item.label}
												</span>
												<span
													className="font-medium"
													style={dashboardHeroStrongTextStyle}
												>
													{overviewQuery.isLoading
														? "…"
														: `${item.count} · ${formatCoverage(item.count, coverageTotal)}`}
												</span>
											</div>
											<div
												className="h-2 rounded-full"
												style={dashboardHeroCoverageTrackStyle}
											>
												<motion.div
													className="h-2 rounded-full"
													style={item.barStyle}
													initial={{ width: 0 }}
													animate={{
														width: `${Math.max(percentage * 100, 4)}%`,
													}}
													transition={{ duration: 0.5, ease: "easeOut" }}
												/>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</div>

					<div
						className="rounded-3xl border p-5 backdrop-blur"
						style={dashboardHeroPanelStyle}
					>
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div>
								<p
									className="text-sm font-semibold"
									style={dashboardHeroStrongTextStyle}
								>
									{visualMode === "map"
										? t("Geographic view")
										: t("Industry view")}
								</p>
								<p
									className="mt-1 text-xs leading-5"
									style={dashboardHeroMutedTextStyle}
								>
									{visualMode === "map"
										? t(
												"Use the current time window to inspect province-level hotspots and quickly spot where the corpus is densest.",
											)
										: t(
												"Switch between ring and ranked views to compare domain concentration inside the current analytics snapshot.",
											)}
								</p>
							</div>
							<div
								className="inline-flex rounded-full border p-1"
								style={dashboardHeroNestedSurfaceStyle}
							>
								{[
									{
										key: "map" as const,
										label: t("Map"),
										icon: MapPinned,
										testId: "dashboard-visual-map-tab",
									},
									{
										key: "industry" as const,
										label: t("Industry"),
										icon: Globe2,
										testId: "dashboard-visual-industry-tab",
									},
								].map((tab) => {
									const Icon = tab.icon;
									const isActive = visualMode === tab.key;
									return (
										<button
											key={tab.key}
											type="button"
											className="relative rounded-full px-3 py-2 text-xs font-semibold"
											onClick={() => setVisualMode(tab.key)}
											data-testid={tab.testId}
											aria-pressed={isActive}
										>
											{isActive ? (
												<motion.span
													layoutId="dashboard-visual-tab"
													className="absolute inset-0 rounded-full"
													style={dashboardHeroSelectedPillStyle}
													transition={{
														type: "spring",
														stiffness: 320,
														damping: 28,
													}}
												/>
											) : null}
											<span
												className={cn(
													"relative z-10 flex items-center gap-2 transition-opacity",
													isActive ? "" : "opacity-90 hover:opacity-100",
												)}
												style={
													isActive
														? dashboardHeroInverseTextStyle
														: dashboardHeroSoftTextStyle
												}
											>
												<Icon aria-hidden="true" className="h-4 w-4" />
												{tab.label}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						<div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.92fr)]">
							<div
								className="overflow-hidden rounded-[28px] border"
								style={dashboardHeroNestedSurfaceStyle}
							>
								{visualMode === "map" ? (
									mapData.length === 0 ? (
										<div
											className="flex h-[360px] items-center justify-center px-6 text-center text-sm"
											style={dashboardHeroMutedTextStyle}
										>
											{t(
												"No regional analytics yet. The map will render once live region signals are available.",
											)}
										</div>
									) : (
										<div data-testid="dashboard-map-panel">
											<ChinaMap
												data={mapData}
												height={360}
												onRegionSelect={handleRegionSelection}
												selectedRegionName={selectedRegion?.region_name ?? null}
											/>
										</div>
									)
								) : (
									<div className="p-4" data-testid="dashboard-industry-panel">
										<div className="mb-3 flex justify-end">
											<div
												className="inline-flex rounded-full border p-1"
												style={dashboardHeroNestedSurfaceStyle}
											>
												{[
													{
														key: "ring" as const,
														label: t("Ring"),
														icon: PieChartIcon,
														testId: "dashboard-industry-ring-tab",
													},
													{
														key: "bar" as const,
														label: t("Ranked"),
														icon: LayoutGrid,
														testId: "dashboard-industry-bar-tab",
													},
												].map((tab) => {
													const Icon = tab.icon;
													const isActive = industryChartMode === tab.key;
													return (
														<button
															key={tab.key}
															type="button"
															className="relative rounded-full px-3 py-2 text-xs font-semibold"
															onClick={() => setIndustryChartMode(tab.key)}
															data-testid={tab.testId}
															aria-pressed={isActive}
														>
															{isActive ? (
																<motion.span
																	layoutId="dashboard-industry-chart-tab"
																	className="absolute inset-0 rounded-full"
																	style={dashboardHeroSelectedPillStyle}
																	transition={{
																		type: "spring",
																		stiffness: 320,
																		damping: 28,
																	}}
																/>
															) : null}
															<span
																className={cn(
																	"relative z-10 flex items-center gap-2 transition-opacity",
																	isActive
																		? ""
																		: "opacity-90 hover:opacity-100",
																)}
																style={
																	isActive
																		? dashboardHeroInverseTextStyle
																		: dashboardHeroSoftTextStyle
																}
															>
																<Icon aria-hidden="true" className="h-4 w-4" />
																{tab.label}
															</span>
														</button>
													);
												})}
											</div>
										</div>
										{industryItems.length === 0 ? (
											<div
												className="flex h-[320px] items-center justify-center px-6 text-center text-sm"
												style={dashboardHeroMutedTextStyle}
											>
												{t(
													"No industry analytics yet. Domain distribution appears here after classification completes.",
												)}
											</div>
										) : industryChartMode === "ring" ? (
											<DomainPieChart items={industryQuery.data?.items ?? []} />
										) : (
											<DomainBarChart items={industryQuery.data?.items ?? []} />
										)}
									</div>
								)}
							</div>

							<div className="space-y-4">
								<div
									className="rounded-2xl border px-4 py-4"
									style={dashboardHeroPanelStyle}
								>
									<div className="flex items-center justify-between gap-3">
										<p
											className="text-xs font-semibold uppercase tracking-[0.18em]"
											style={dashboardHeroMutedTextStyle}
										>
											{visualMode === "map"
												? t("Regional hotspots")
												: t("Industry hotspots")}
										</p>
										<Badge
											variant="outline"
											style={{
												...dashboardHeroNestedSurfaceStyle,
												...dashboardHeroStrongTextStyle,
											}}
										>
											{visualMode === "map"
												? formatPercent(regionalCoverage)
												: formatPercent(industryCoverage)}
										</Badge>
									</div>
									<div className="mt-4 space-y-3">
										{visualMode === "map" ? (
											regionalQuery.isLoading ? (
												Array.from(
													{ length: 5 },
													(_, index) => `region-skeleton-${index}`,
												).map((key) => (
													<div
														key={key}
														className="h-9 animate-pulse rounded-2xl"
														style={{
															backgroundColor: "var(--control-hover-bg)",
														}}
													/>
												))
											) : regionalItems.length === 0 ? (
												<p
													className="text-sm"
													style={dashboardHeroMutedTextStyle}
												>
													{t("No regional analytics yet.")}
												</p>
											) : (
												regionalItems.map((item) => (
													<button
														key={item.region_code}
														type="button"
														data-testid={`dashboard-region-hotspot-${item.region_code}`}
														aria-pressed={
															selectedRegionCode === item.region_code
														}
														onClick={() =>
															setSelectedRegionCode(item.region_code)
														}
														className={cn(
															"flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-[transform,filter] hover:brightness-110",
														)}
														style={
															selectedRegionCode === item.region_code
																? dashboardHeroSelectedSurfaceStyle
																: dashboardHeroNestedSurfaceStyle
														}
													>
														<div className="min-w-0">
															<p
																className="truncate text-sm font-medium"
																style={dashboardHeroStrongTextStyle}
															>
																{item.region_name}
															</p>
															<p
																className="mt-1 text-xs"
																style={dashboardHeroMutedTextStyle}
															>
																{formatPercent(item.percentage)}
															</p>
														</div>
														<Badge
															variant="outline"
															style={{
																...dashboardHeroNestedSurfaceStyle,
																...dashboardHeroStrongTextStyle,
															}}
														>
															{item.count}
														</Badge>
													</button>
												))
											)
										) : industryQuery.isLoading ? (
											Array.from(
												{ length: 5 },
												(_, index) => `industry-skeleton-${index}`,
											).map((key) => (
												<div
													key={key}
													className="h-9 animate-pulse rounded-2xl"
													style={{ backgroundColor: "var(--control-hover-bg)" }}
												/>
											))
										) : industryItems.length === 0 ? (
											<p
												className="text-sm"
												style={dashboardHeroMutedTextStyle}
											>
												{t("No industry analytics yet.")}
											</p>
										) : (
											industryItems.map((item) => (
												<div
													key={item.domain_root}
													className="space-y-2 rounded-2xl border px-4 py-3"
													style={dashboardHeroNestedSurfaceStyle}
												>
													<div className="flex items-center justify-between gap-3">
														<p
															className="truncate text-sm font-medium"
															style={dashboardHeroStrongTextStyle}
														>
															{item.label}
														</p>
														<Badge
															variant="outline"
															style={{
																...dashboardHeroNestedSurfaceStyle,
																...dashboardHeroStrongTextStyle,
															}}
														>
															{item.count}
														</Badge>
													</div>
													<div
														className="h-1.5 rounded-full"
														style={{
															backgroundColor: "var(--control-hover-bg)",
														}}
													>
														<div
															className="h-1.5 rounded-full"
															style={{
																...dashboardHeroIndustryBarStyle,
																width: `${Math.max(item.percentage * 100, 6)}%`,
															}}
														/>
													</div>
												</div>
											))
										)}
									</div>
									{visualMode === "map" && unknownRegionalBucket ? (
										<div
											className="mt-4 rounded-2xl border border-dashed px-4 py-3"
											style={dashboardHeroNestedSurfaceStyle}
										>
											<div className="flex items-center justify-between gap-3">
												<div>
													<p
														className="text-[11px] uppercase tracking-[0.16em]"
														style={dashboardHeroMutedTextStyle}
													>
														{t("Unknown region backlog")}
													</p>
													<p
														className="mt-1 text-sm"
														style={dashboardHeroMutedTextStyle}
													>
														{t("Records still waiting for region tagging.")}
													</p>
												</div>
												<Badge
													variant="outline"
													style={{
														...dashboardHeroNestedSurfaceStyle,
														...dashboardHeroStrongTextStyle,
													}}
												>
													{unknownRegionalBucket.count}
												</Badge>
											</div>
										</div>
									) : null}
								</div>

								<div
									className="rounded-2xl border px-4 py-4"
									style={dashboardHeroPanelStyle}
								>
									<p
										className="text-xs font-semibold uppercase tracking-[0.18em]"
										style={dashboardHeroMutedTextStyle}
									>
										{visualMode === "map"
											? t("Current slice")
											: t("Sub-domain highlights")}
									</p>
									{visualMode === "map" ? (
										<div
											className="mt-4 space-y-4"
											data-testid="dashboard-region-detail-panel"
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p
														className="text-lg font-semibold"
														style={dashboardHeroStrongTextStyle}
													>
														{selectedRegion
															? selectedRegion.region_name
															: t("Select a hotspot")}
													</p>
													<p
														className="mt-1 text-xs leading-5"
														style={dashboardHeroMutedTextStyle}
													>
														{selectedRegion
															? t(
																	"Latest published articles tagged to this region.",
																)
															: t(
																	"Select a hotspot to inspect region-tagged article detail.",
																)}
													</p>
												</div>
												{selectedRegion ? (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														data-testid="dashboard-region-reset"
														onClick={() => setSelectedRegionCode(null)}
														className="rounded-full border px-3 hover:brightness-110"
														style={{
															...dashboardHeroNestedSurfaceStyle,
															...dashboardHeroSoftTextStyle,
														}}
													>
														{t("Clear focus")}
													</Button>
												) : null}
											</div>

											<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
												<div
													className="rounded-2xl border px-4 py-3"
													style={dashboardHeroNestedSurfaceStyle}
												>
													<p
														className="text-[11px] uppercase tracking-[0.16em]"
														style={dashboardHeroMutedTextStyle}
													>
														{t("Tagged article share")}
													</p>
													<p
														className="mt-2 text-2xl font-semibold"
														style={dashboardHeroStrongTextStyle}
													>
														{selectedRegion
															? selectedRegion.count
															: (regionalQuery.data?.total ?? 0)}
													</p>
													<p
														className="mt-1 text-xs"
														style={dashboardHeroMutedTextStyle}
													>
														{selectedRegion
															? formatPercent(selectedRegion.percentage)
															: t("Articles with region data")}
													</p>
												</div>
												<div
													className="rounded-2xl border px-4 py-3"
													style={dashboardHeroNestedSurfaceStyle}
												>
													<p
														className="text-[11px] uppercase tracking-[0.16em]"
														style={dashboardHeroMutedTextStyle}
													>
														{t("Live time window")}
													</p>
													<p
														className="mt-2 text-sm font-semibold"
														style={dashboardHeroStrongTextStyle}
													>
														{t("Last {count} days", { count: timeWindow })}
													</p>
													<p
														className="mt-1 text-xs"
														style={dashboardHeroMutedTextStyle}
													>
														{t(
															"Counts are aligned to the current analytics slice.",
														)}
													</p>
												</div>
											</div>

											{!selectedRegion ? (
												<div
													className="rounded-2xl border border-dashed px-4 py-4 text-sm"
													style={{
														...dashboardHeroNestedSurfaceStyle,
														...dashboardHeroMutedTextStyle,
													}}
												>
													<div className="flex items-start gap-3">
														<LocateFixed
															aria-hidden="true"
															className="mt-0.5 h-4 w-4 shrink-0"
															style={dashboardHeroAccentIconStyle}
														/>
														<div>
															<p
																className="font-medium"
																style={dashboardHeroStrongTextStyle}
															>
																{t("Select a hotspot")}
															</p>
															<p
																className="mt-1 leading-6"
																style={dashboardHeroMutedTextStyle}
															>
																{t(
																	"Choose a province from the hotspot list or click the map to inspect tagged article detail.",
																)}
															</p>
														</div>
													</div>
												</div>
											) : regionArticlesQuery.isLoading ? (
												Array.from(
													{ length: 3 },
													(_, index) => `region-article-skeleton-${index}`,
												).map((key) => (
													<div
														key={key}
														className="h-20 animate-pulse rounded-2xl"
														style={{
															backgroundColor: "var(--control-hover-bg)",
														}}
													/>
												))
											) : selectedRegionArticles.length === 0 ? (
												<div
													className="rounded-2xl border border-dashed px-4 py-4 text-sm"
													style={{
														...dashboardHeroNestedSurfaceStyle,
														...dashboardHeroMutedTextStyle,
													}}
												>
													<p
														className="font-medium"
														style={dashboardHeroStrongTextStyle}
													>
														{t(
															"No recent tagged articles were returned in the current sample window.",
														)}
													</p>
													<p
														className="mt-1 leading-6"
														style={dashboardHeroMutedTextStyle}
													>
														{t(
															"Counts still come from the live regional analytics API for the selected time slice.",
														)}
													</p>
												</div>
											) : (
												selectedRegionArticles.map((article) => (
													<Link
														key={article.id}
														href={withLocalePath(
															locale,
															`/articles/${article.id}`,
														)}
														className="group block rounded-2xl border px-4 py-4 transition-[transform,filter] hover:brightness-110"
														style={dashboardHeroNestedSurfaceStyle}
													>
														<div className="flex items-start justify-between gap-3">
															<div className="min-w-0">
																<p
																	className="line-clamp-2 text-sm font-medium transition-opacity opacity-95 group-hover:opacity-100"
																	style={dashboardHeroStrongTextStyle}
																>
																	{article.title}
																</p>
																<div
																	className="mt-3 flex flex-wrap items-center gap-2 text-xs"
																	style={dashboardHeroMutedTextStyle}
																>
																	{article.domain_root ? (
																		<span
																			className="rounded-full border px-2.5 py-1"
																			style={{
																				...dashboardHeroNestedSurfaceStyle,
																				...dashboardHeroSoftTextStyle,
																			}}
																		>
																			{DOMAIN_LABELS[article.domain_root] ??
																				article.domain_root}
																		</span>
																	) : null}
																	{article.published_at ? (
																		<span className="inline-flex items-center gap-1.5">
																			<Clock3
																				aria-hidden="true"
																				className="h-3.5 w-3.5"
																			/>
																			{formatTimeAgo(
																				locale,
																				article.published_at,
																			)}
																		</span>
																	) : null}
																</div>
															</div>
															<ArrowRight
																aria-hidden="true"
																className="mt-0.5 h-4 w-4 shrink-0 transition-opacity opacity-90 group-hover:opacity-100"
																style={dashboardHeroMutedTextStyle}
															/>
														</div>
													</Link>
												))
											)}
										</div>
									) : industryWithSubs.length === 0 ? (
										<p
											className="mt-4 text-sm"
											style={dashboardHeroMutedTextStyle}
										>
											{t(
												"No sub-domain breakdown is available yet for the current dataset.",
											)}
										</p>
									) : (
										<div className="mt-4 space-y-3">
											{industryWithSubs.map((item) => (
												<div
													key={item.domain_root}
													className="rounded-2xl border px-4 py-3"
													style={dashboardHeroNestedSurfaceStyle}
												>
													<div className="flex items-center justify-between gap-3">
														<p
															className="text-sm font-medium"
															style={dashboardHeroStrongTextStyle}
														>
															{item.label}
														</p>
														<span
															className="text-xs"
															style={dashboardHeroMutedTextStyle}
														>
															{item.sub_domains?.length ?? 0} {t("sub-domains")}
														</span>
													</div>
													<div className="mt-3 flex flex-wrap gap-2">
														{item.sub_domains?.slice(0, 3).map((subDomain) => (
															<span
																key={`${item.domain_root}-${subDomain.domain_sub}`}
																className="rounded-full border px-3 py-1 text-xs"
																style={{
																	...dashboardHeroNestedSurfaceStyle,
																	...dashboardHeroSoftTextStyle,
																}}
															>
																{subDomain.domain_sub}: {subDomain.count}
															</span>
														))}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
				<div
					className="border-t px-6 py-4"
					style={{ borderColor: "var(--surface-muted-border)" }}
				>
					<p
						className="mb-3 text-xs uppercase tracking-[0.18em]"
						style={dashboardHeroMutedTextStyle}
					>
						{t("Article activity trend")}
					</p>
					{trendsQuery.isLoading ? (
						<div className="grid h-28 grid-cols-7 gap-2">
							{Array.from(
								{ length: 7 },
								(_, index) => `trend-skeleton-${index}`,
							).map((key) => (
								<div
									key={key}
									className="animate-pulse rounded-t-2xl"
									style={{ backgroundColor: "var(--control-hover-bg)" }}
								/>
							))}
						</div>
					) : trendPoints.length === 0 ? (
						<p className="text-sm" style={dashboardHeroMutedTextStyle}>
							{t("No trend points returned for the current window.")}
						</p>
					) : (
						<div className="grid grid-cols-7 gap-2 sm:grid-cols-10">
							{trendPoints.map((point) => (
								<div
									key={point.date}
									className="flex flex-col items-center gap-2"
								>
									<div
										className="flex h-28 w-full items-end rounded-2xl p-1"
										style={{ backgroundColor: "var(--control-hover-bg)" }}
									>
										<div
											className="w-full rounded-xl"
											style={{
												...dashboardHeroTrendBarStyle,
												height: `${Math.max((point.count / trendMax) * 100, 8)}%`,
											}}
										/>
									</div>
									<div className="text-center">
										<p
											className="text-xs font-medium"
											style={dashboardHeroSoftTextStyle}
										>
											{point.count}
										</p>
										<p
											className="text-[11px]"
											style={dashboardHeroMutedTextStyle}
										>
											{point.date.slice(5)}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
				{hasHeroError ? (
					<div
						className="border-t px-6 py-3 text-sm"
						style={dashboardHeroWarningBannerStyle}
					>
						{t(
							"Some dashboard hero signals are degraded. Existing cards still use live API fallbacks.",
						)}
					</div>
				) : null}
			</Card>
		</div>
	);
}
