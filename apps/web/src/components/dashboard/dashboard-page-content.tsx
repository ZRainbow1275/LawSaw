"use client";

import {
	useArticleCategoryCounts,
	useArticleStats,
	useArticles,
} from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSourceStats } from "@/hooks/use-sources";
import { type Article, getArticleRiskLevel } from "@/lib/api/types";
import { formatTimeAgo, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowUpRight,
	BrainCircuit,
	ChevronRight,
	Clock,
	FileText,
	Flame,
	type LucideIcon,
	Rss,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08, delayChildren: 0.05 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 16 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const RECENT_LIMIT = 6;
const FEED_LIMIT = 200;

interface DashboardStat {
	label: string;
	value: number;
	icon: LucideIcon;
	iconBg: string;
	iconColor: string;
	loading: boolean;
}

const TIMEFRAMES = ["day", "week", "month", "year"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

interface CategoryStat {
	id: string;
	name: string;
	slug: string;
	count: number;
	color: string;
}

const CATEGORY_FALLBACK_COLOR: Record<string, string> = {
	legislation: "var(--color-legislation, #3b82f6)",
	regulation: "var(--color-regulation, #8b5cf6)",
	enforcement: "var(--color-enforcement, #ef4444)",
	industry: "var(--color-industry, #f59e0b)",
	compliance: "var(--color-compliance, #10b981)",
	data: "var(--color-data, #06b6d4)",
	security: "var(--color-security, #dc2626)",
	academic: "var(--color-academic, #6366f1)",
	events: "var(--color-events, #f97316)",
	international: "var(--color-international, #14b8a6)",
};

function getCategoryColor(category: { slug: string; color: string | null }) {
	if (category.color) return category.color;
	return CATEGORY_FALLBACK_COLOR[category.slug] ?? "var(--color-primary-500)";
}

function ArticleRow({
	article,
	categoryName,
	categoryColor,
	locale,
}: {
	article: Article;
	categoryName: string;
	categoryColor: string;
	locale: ReturnType<typeof useLocale>;
}) {
	const t = useT();
	const risk = getArticleRiskLevel(article.risk_score);
	const riskMeta =
		risk === "critical"
			? {
					label: t("Critical risk"),
					bg: "var(--risk-critical-bg, #fee2e2)",
					fg: "var(--risk-critical-fg, #b91c1c)",
				}
			: risk === "high"
				? {
						label: t("High risk"),
						bg: "var(--risk-high-bg, #fee2e2)",
						fg: "var(--risk-high-fg, #dc2626)",
					}
				: risk === "medium"
					? {
							label: t("Medium risk"),
							bg: "var(--risk-mid-bg, #fef3c7)",
							fg: "var(--risk-mid-fg, #b45309)",
						}
					: {
							label: t("Low risk"),
							bg: "var(--risk-low-bg, #d1fae5)",
							fg: "var(--risk-low-fg, #047857)",
						};

	return (
		<Link
			href={withLocalePath(locale, `/articles/${article.id}`)}
			className="block rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
			style={{ borderColor: "var(--color-neutral-200)" }}
		>
			<div className="mb-2 flex items-center gap-2 text-xs">
				<span
					className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
					style={{ backgroundColor: riskMeta.bg, color: riskMeta.fg }}
				>
					{riskMeta.label}
				</span>
				<span
					className="inline-flex items-center gap-1 font-medium"
					style={{ color: categoryColor }}
				>
					<span
						aria-hidden="true"
						className="h-1.5 w-1.5 rounded-full"
						style={{ backgroundColor: categoryColor }}
					/>
					{categoryName}
				</span>
			</div>
			<h3
				className="line-clamp-2 text-sm font-semibold leading-snug"
				style={{ color: "var(--color-neutral-900)" }}
			>
				{article.title}
			</h3>
			{article.summary ? (
				<p
					className="mt-1 line-clamp-1 text-xs"
					style={{ color: "var(--color-neutral-500)" }}
				>
					{article.summary}
				</p>
			) : null}
			<div
				className="mt-2 flex items-center gap-3 text-[11px]"
				style={{ color: "var(--color-neutral-400)" }}
			>
				<span className="inline-flex items-center gap-1">
					<Clock aria-hidden="true" className="h-3 w-3" />
					{formatTimeAgo(locale, article.published_at ?? article.created_at)}
				</span>
				{article.issuer ? <span>{article.issuer}</span> : null}
			</div>
		</Link>
	);
}

export function DashboardPageContent() {
	const t = useT();
	const locale = useLocale();
	const permissions = useAuthStore((state) => state.permissions);
	const canReadSources =
		permissions.includes("sources:read") || permissions.includes("*");

	const articleStatsQuery = useArticleStats();
	const sourceStatsQuery = useSourceStats({ enabled: canReadSources });
	const categoryCountsQuery = useArticleCategoryCounts();
	const categoriesQuery = useCategories();
	const recentArticlesQuery = useArticles({
		limit: RECENT_LIMIT,
		status: "published",
	});
	const categoryFeedQuery = useArticles({
		limit: FEED_LIMIT,
		status: "published",
	});

	const stats = articleStatsQuery.data;
	const sourceStats = sourceStatsQuery.data;

	const totalCollected = stats?.total_articles ?? 0;

	const categoryStats: CategoryStat[] = useMemo(() => {
		const categories = categoriesQuery.data ?? [];
		const counts = categoryCountsQuery.data ?? [];
		const countMap = new Map<string, number>();
		for (const entry of counts) {
			if (entry.category_id) countMap.set(entry.category_id, entry.count);
		}
		return categories
			.map((category) => ({
				id: category.id,
				name: category.name,
				slug: category.slug,
				count: countMap.get(category.id) ?? 0,
				color: getCategoryColor(category),
			}))
			.sort((a, b) => b.count - a.count);
	}, [categoriesQuery.data, categoryCountsQuery.data]);

	const uncategorizedCount = useMemo(() => {
		const counts = categoryCountsQuery.data ?? [];
		const sumCategorized = categoryStats.reduce(
			(acc, item) => acc + item.count,
			0,
		);
		const reportedTotal = counts.reduce((acc, entry) => acc + entry.count, 0);
		return Math.max(0, reportedTotal - sumCategorized);
	}, [categoryCountsQuery.data, categoryStats]);

	const categoryNameById = useMemo(() => {
		const map = new Map<string, { name: string; color: string }>();
		for (const category of categoriesQuery.data ?? []) {
			map.set(category.id, {
				name: category.name,
				color: getCategoryColor(category),
			});
		}
		return map;
	}, [categoriesQuery.data]);

	const recentArticles = recentArticlesQuery.data?.data ?? [];

	const [timeframe, setTimeframe] = useState<Timeframe>("week");

	const dashboardStats: DashboardStat[] = [
		{
			label: t("Today's articles"),
			value: stats?.today_count ?? 0,
			icon: FileText,
			iconBg: "var(--color-primary-50)",
			iconColor: "var(--color-primary-500)",
			loading: articleStatsQuery.isPending,
		},
		{
			label: t("Active sources"),
			value: sourceStats?.active_count ?? 0,
			icon: Rss,
			iconBg: "#ede9fe",
			iconColor: "#8b5cf6",
			loading: canReadSources ? sourceStatsQuery.isPending : false,
		},
		{
			label: t("Risk alerts"),
			value: stats?.high_risk_count ?? 0,
			icon: AlertTriangle,
			iconBg: "#fee2e2",
			iconColor: "#ef4444",
			loading: articleStatsQuery.isPending,
		},
		{
			label: t("AI insights"),
			value: stats?.pending_count ?? 0,
			icon: BrainCircuit,
			iconBg: "#ecfdf5",
			iconColor: "#10b981",
			loading: articleStatsQuery.isPending,
		},
	];

	const timeframeLabels: Record<Timeframe, string> = {
		day: t("Day"),
		week: t("Week"),
		month: t("Month"),
		year: t("Year"),
	};

	return (
		<motion.div
			className="space-y-6 p-6"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
						{/* Dashboard hero — prototype/app.html:750-754 (.dashboard-hero header) */}
						<motion.header
							variants={itemVariants}
							className="flex flex-wrap items-center justify-between gap-4"
						>
							<div>
								<h1
									className="flex items-center gap-2.5 text-xl font-bold tracking-tight"
									style={{ color: "var(--color-neutral-900)" }}
								>
									<span
										aria-hidden="true"
										className="inline-block h-2 w-2 animate-pulse rounded-full"
										style={{ backgroundColor: "var(--color-success-500, #10b981)" }}
									/>
									{t("Live signals & system telemetry")}
								</h1>
								<p
									className="mt-1 text-sm"
									style={{ color: "var(--color-neutral-500)" }}
								>
									{t(
										"Track legal regulation updates worldwide across 86 jurisdictions",
									)}
								</p>
							</div>
							{/* time-filters segmented control — prototype 753 */}
							<div
								className="relative inline-flex items-center rounded-lg p-0.5"
								style={{ backgroundColor: "var(--color-neutral-100)" }}
								role="tablist"
								aria-label={t("Timeframe")}
							>
								{TIMEFRAMES.map((tf) => {
									const active = tf === timeframe;
									return (
										<button
											key={tf}
											type="button"
											role="tab"
											aria-selected={active}
											onClick={() => setTimeframe(tf)}
											className="relative z-10 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors"
											style={{
												color: active ? "white" : "var(--color-neutral-500)",
												backgroundColor: active
													? "var(--color-primary-500)"
													: "transparent",
											}}
										>
											{timeframeLabels[tf]}
										</button>
									);
								})}
							</div>
						</motion.header>

						{/* stats-strip — 4 stat-card (prototype/app.html:777-782) */}
						<motion.div
							variants={itemVariants}
							className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
						>
							{dashboardStats.map((stat) => {
								const Icon = stat.icon;
								return (
									<div
										key={stat.label}
										className="flex flex-col gap-2 rounded-2xl border bg-white p-5 transition-shadow hover:shadow-sm"
										style={{ borderColor: "var(--color-neutral-200)" }}
									>
										<div className="flex items-center justify-between">
											<span
												className="text-xs font-medium"
												style={{ color: "var(--color-neutral-500)" }}
											>
												{stat.label}
											</span>
											<span
												className="flex h-8 w-8 items-center justify-center rounded-lg"
												style={{
													backgroundColor: stat.iconBg,
													color: stat.iconColor,
												}}
											>
												<Icon aria-hidden="true" className="h-4 w-4" />
											</span>
										</div>
										<div
											className="text-2xl font-bold tabular-nums"
											style={{ color: "var(--color-neutral-900)" }}
										>
											{stat.loading ? "—" : stat.value.toLocaleString()}
										</div>
									</div>
								);
							})}
						</motion.div>

						{/* Two-column: category overview (left) + recent articles (right) */}
						<motion.div
							variants={itemVariants}
							className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]"
						>
							{/* Category overview panel — mp4 frame 23-31 left 4px accent */}
							<section
								className="relative self-start overflow-hidden rounded-2xl border bg-white p-5"
								style={{ borderColor: "var(--color-neutral-200)" }}
							>
								<span
									aria-hidden="true"
									className="absolute inset-y-0 left-0 w-1"
									style={{ backgroundColor: "var(--color-primary-500)" }}
								/>
								<header className="mb-4 flex items-center gap-2">
									<TrendingUp
										aria-hidden="true"
										className="h-4 w-4"
										style={{ color: "var(--color-primary-500)" }}
									/>
									<h2
										className="text-base font-bold"
										style={{ color: "var(--color-neutral-900)" }}
									>
										{t("Category overview")}
									</h2>
								</header>
								<p
									className="mb-4 text-xs"
									style={{ color: "var(--color-neutral-500)" }}
								>
									{t(
										"Total collected: {total} (including {uncategorized} uncategorized)",
										{
											total: totalCollected,
											uncategorized: uncategorizedCount,
										},
									)}
								</p>
								{categoriesQuery.isPending ? (
									<ul className="space-y-2" aria-busy="true">
										{[0, 1, 2, 3, 4, 5].map((i) => (
											<li
												key={i}
												className="h-9 animate-pulse rounded-lg"
												style={{
													backgroundColor: "var(--color-neutral-100)",
												}}
											/>
										))}
									</ul>
								) : (
									<ul className="space-y-1">
										{categoryStats.map((cat) => (
											<li key={cat.id}>
												<Link
													href={withLocalePath(
														locale,
														`/articles?category=${cat.slug}`,
													)}
													className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-neutral-50"
												>
													<span className="flex items-center gap-2">
														<span
															aria-hidden="true"
															className="h-2 w-2 rounded-full"
															style={{ backgroundColor: cat.color }}
														/>
														<span
															className="font-medium"
															style={{ color: "var(--color-neutral-800)" }}
														>
															{cat.name}
														</span>
													</span>
													<span
														className="text-xs font-semibold tabular-nums"
														style={{ color: "var(--color-neutral-500)" }}
													>
														{cat.count}
													</span>
												</Link>
											</li>
										))}
									</ul>
								)}
							</section>

							{/* Recent articles panel */}
							<section
								className="rounded-2xl border bg-white p-5"
								style={{ borderColor: "var(--color-neutral-200)" }}
							>
								<header className="mb-4 flex items-center justify-between">
									<div className="flex items-center gap-2">
										<Flame
											aria-hidden="true"
											className="h-4 w-4"
											style={{ color: "var(--color-primary-500)" }}
										/>
										<div>
											<h2
												className="text-base font-bold"
												style={{ color: "var(--color-neutral-900)" }}
											>
												{t("Latest articles")}
											</h2>
											<p
												className="text-xs"
												style={{ color: "var(--color-neutral-500)" }}
											>
												{t("Recent legal updates curated for you")}
											</p>
										</div>
									</div>
									<Link
										href={withLocalePath(locale, "/articles")}
										className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-neutral-50"
										style={{
											borderColor: "var(--color-neutral-200)",
											color: "var(--color-neutral-700)",
										}}
									>
										{t("View all")}
										<ChevronRight aria-hidden="true" className="h-3 w-3" />
									</Link>
								</header>

								{recentArticlesQuery.isPending ? (
									<ul className="space-y-3" aria-busy="true">
										{[0, 1, 2, 3].map((i) => (
											<li
												key={i}
												className="h-24 animate-pulse rounded-xl"
												style={{
													backgroundColor: "var(--color-neutral-100)",
												}}
											/>
										))}
									</ul>
								) : recentArticles.length === 0 ? (
									<div
										className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-12 text-center"
										style={{
											borderColor: "var(--color-neutral-200)",
											color: "var(--color-neutral-500)",
										}}
									>
										<ArrowUpRight aria-hidden="true" className="h-5 w-5" />
										<p className="text-sm font-medium">
											{t("No articles have been collected yet.")}
										</p>
									</div>
								) : (
									<ul className="space-y-3">
										{recentArticles.map((article) => {
											const cat = article.category_id
												? categoryNameById.get(article.category_id)
												: null;
											return (
												<li key={article.id}>
													<ArticleRow
														article={article}
														categoryName={cat?.name ?? t("Uncategorized")}
														categoryColor={
															cat?.color ?? "var(--color-neutral-400)"
														}
														locale={locale}
													/>
												</li>
											);
										})}
									</ul>
								)}
							</section>
						</motion.div>

						{/* Pre-warm: feed cache for /articles transition */}
			<span aria-hidden="true" className="hidden">
				{categoryFeedQuery.data?.total ?? 0}
			</span>
		</motion.div>
	);
}
