"use client";

import {
	ArticleCard,
	ArticleCardSkeleton,
} from "@/components/article/article-card";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { AnimatedList } from "@/components/ui/animated-list";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoDataState, NoSearchResultState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import {
	SwipeHint,
	SwipeableCard,
	swipeActionPresets,
} from "@/components/ui/swipeable-card";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSources } from "@/hooks/use-sources";
import { isRoleTierAtLeast } from "@/lib/authz";
import { useT } from "@/lib/i18n-client";
import { fadeVariants, staggerContainerVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useReadingStore } from "@/stores/reading-store";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	BarChart3,
	Briefcase,
	Building2,
	Calendar,
	ChevronLeft,
	ChevronRight,
	FileText,
	Filter,
	Flame,
	Globe2,
	GraduationCap,
	LayoutGrid,
	List,
	Lock,
	type LucideIcon,
	Newspaper,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
	SlidersHorizontal,
	TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

// ============================================
// Constants
// ============================================

const PAGE_SIZE = 20;

/**
 * Mirror of `BASIC_VISIBLE_CATEGORY_SLUGS` in
 * `crates/law-eye-core/src/role_tier.rs`. Basic-tier readers may only see these
 * three categories. Verified+/admin tiers see every published category.
 */
const BASIC_VISIBLE_CATEGORY_SLUGS = [
	"legislation",
	"regulation",
	"enforcement",
] as const;

const VIEW_MODE_STORAGE_KEY = "lawsaw.articles.view";

const importanceOptions = [
	{ value: "all", labelKey: "All importance", min: null as number | null },
	{ value: "high", labelKey: "High importance (>= 70)", min: 70 },
	{ value: "medium", labelKey: "Medium importance (>= 40)", min: 40 },
	{ value: "low", labelKey: "Low importance (< 40)", min: 0 },
] as const;

type ImportanceFilter = (typeof importanceOptions)[number]["value"];

const statusOptions = [
	{ value: "all", labelKey: "All statuses" },
	{ value: "pending", labelKey: "Pending" },
	{ value: "processing", labelKey: "Processing" },
	{ value: "published", labelKey: "Published" },
	{ value: "archived", labelKey: "Archived" },
	{ value: "rejected", labelKey: "Rejected" },
] as const;

type StatusFilter = (typeof statusOptions)[number]["value"];

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

// ============================================
// View mode
// ============================================

type ViewMode = "list" | "grid";

// ============================================
// Main
// ============================================

export default function ArticlesPage() {
	const t = useT();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const authLoading = useAuthStore((s) => s.isLoading);
	const roleTier = useAuthStore((s) => s.roleTier);
	const isVerifiedOrAbove = isRoleTierAtLeast(roleTier, "verified_user");
	const [page, setPage] = useState(0);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("list");
	const [showMobileHint, setShowMobileHint] = useState(true);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [dateFrom, setDateFrom] = useState<string>("");
	const [dateTo, setDateTo] = useState<string>("");
	const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
	const [importanceFilter, setImportanceFilter] =
		useState<ImportanceFilter>("all");

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
			if (raw === "grid" || raw === "list") {
				setViewMode(raw);
			}
		} catch {
			// localStorage may be unavailable (SSR-safe via guard above; private mode);
			// default state is fine.
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
		} catch {
			// Persist best-effort only.
		}
	}, [viewMode]);

	const canLoadContent = isAuthenticated && !authLoading;

	const { success: showSuccess } = useToast();
	const bookmarks = useReadingStore((s) => s.bookmarks);
	const toggleBookmark = useReadingStore((s) => s.toggleBookmark);

	// Pull a large window so client-side date/source/importance filters can
	// run without re-fetching per page. Category + status still flow to the
	// backend because they are cheap server-side filters and align with tier
	// gating.
	const {
		data: articlesData,
		isLoading: articlesLoading,
		isError: articlesIsError,
		error: articlesError,
		refetch: refetchArticles,
	} = useArticles({
		limit: 200,
		offset: 0,
		category_id: selectedCategory ?? undefined,
		status: statusFilter === "all" ? undefined : statusFilter,
		enabled: canLoadContent,
	});

	const {
		data: categories,
		isError: categoriesIsError,
		error: categoriesError,
		refetch: refetchCategories,
	} = useCategories({ enabled: canLoadContent });

	const { data: sourcesResponse } = useSources({ limit: 100 });
	const sources = sourcesResponse?.data ?? [];

	/**
	 * Tier-aware category gate: backend only ships visible categories to the
	 * caller, but we mirror the slug allow-list here so that the user-facing
	 * pill bar still behaves predictably even when an upstream category list is
	 * cached / pre-fetched at a higher tier.
	 */
	const visibleCategories = useMemo(() => {
		if (!categories) return [];
		if (isVerifiedOrAbove) return categories;
		const allow = new Set<string>(BASIC_VISIBLE_CATEGORY_SLUGS);
		return categories.filter((category) => allow.has(category.slug));
	}, [categories, isVerifiedOrAbove]);

	const sourceById = useMemo(
		() => new Map(sources.map((source) => [source.id, source.name])),
		[sources],
	);

	const importanceMin = useMemo(() => {
		const option = importanceOptions.find(
			(opt) => opt.value === importanceFilter,
		);
		return option?.min ?? null;
	}, [importanceFilter]);

	const dateFromMs = useMemo(() => {
		if (!dateFrom) return null;
		const ms = new Date(`${dateFrom}T00:00:00`).getTime();
		return Number.isFinite(ms) ? ms : null;
	}, [dateFrom]);

	const dateToMs = useMemo(() => {
		if (!dateTo) return null;
		const ms = new Date(`${dateTo}T23:59:59`).getTime();
		return Number.isFinite(ms) ? ms : null;
	}, [dateTo]);

	const allArticles = articlesData?.data ?? [];

	/**
	 * Backend honours tier + status + category filters; the rest (date / source /
	 * importance) is filtered client-side per task spec because the article
	 * endpoint does not yet expose those query params. Importance filtering is
	 * gated to verified+ tiers.
	 */
	const articles = useMemo(() => {
		return allArticles.filter((article) => {
			if (selectedSourceIds.length > 0) {
				if (!selectedSourceIds.includes(article.source_id)) return false;
			}
			if (dateFromMs != null || dateToMs != null) {
				const publishedAt = article.published_at
					? new Date(article.published_at).getTime()
					: null;
				if (publishedAt == null || !Number.isFinite(publishedAt)) return false;
				if (dateFromMs != null && publishedAt < dateFromMs) return false;
				if (dateToMs != null && publishedAt > dateToMs) return false;
			}
			if (isVerifiedOrAbove && importanceMin != null) {
				if (article.importance == null) return false;
				if (article.importance < importanceMin) return false;
			}
			return true;
		});
	}, [
		allArticles,
		selectedSourceIds,
		dateFromMs,
		dateToMs,
		isVerifiedOrAbove,
		importanceMin,
	]);

	const total = articles.length;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const pagedArticles = useMemo(
		() => articles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
		[articles, page],
	);
	const activeFilterCount =
		(statusFilter === "all" ? 0 : 1) +
		(dateFrom || dateTo ? 1 : 0) +
		(selectedSourceIds.length > 0 ? 1 : 0) +
		(importanceFilter === "all" ? 0 : 1);

	const handleResetFilters = useCallback(() => {
		setStatusFilter("all");
		setDateFrom("");
		setDateTo("");
		setSelectedSourceIds([]);
		setImportanceFilter("all");
		setPage(0);
	}, []);

	const toggleSourceId = useCallback((sourceId: string) => {
		setSelectedSourceIds((prev) =>
			prev.includes(sourceId)
				? prev.filter((id) => id !== sourceId)
				: [...prev, sourceId],
		);
		setPage(0);
	}, []);
	const showArticlesLoading = authLoading || (canLoadContent && articlesLoading);
	const listLoadError =
		(articlesError instanceof Error ? articlesError.message : null) ??
		(categoriesError instanceof Error ? categoriesError.message : null);
	const activeStatusKey =
		statusOptions.find((option) => option.value === statusFilter)?.labelKey ??
		"All statuses";

	const getCategoryInfo = useCallback(
		(categoryId: string | null) => {
			if (!categoryId || !categories)
				return { name: undefined, icon: undefined };
			const cat = categories.find((c) => c.id === categoryId);
			return { name: cat?.name, icon: cat?.icon };
		},
		[categories],
	);

	// Bookmark
	const handleBookmark = useCallback(
		(articleId: string) => {
			const newState = toggleBookmark(articleId);
			showSuccess(
				newState ? t("Added to bookmarks") : t("Removed from bookmarks"),
				newState
					? t("Article added to bookmarks")
					: t("Article removed from bookmarks"),
			);
		},
		[t, toggleBookmark, showSuccess],
	);

	// Share
	const handleShare = useCallback(
		(articleId: string) => {
			const url = `${window.location.origin}/articles/${articleId}`;
			navigator.clipboard.writeText(url);
			showSuccess(t("Link copied"), t("Article link copied to clipboard"));
		},
		[t, showSuccess],
	);

	// Render a card (swipe actions on mobile only)
	const renderArticleCard = useCallback(
		(article: (typeof articles)[0], index: number) => {
			const { name, icon } = getCategoryInfo(article.category_id);
			const isBookmarked = bookmarks.includes(article.id);

			const card = (
				<ArticleCard
					article={article}
					categoryName={name ?? undefined}
					categoryIcon={icon ?? undefined}
					variant={viewMode === "grid" ? "compact" : "default"}
					showSummary={viewMode === "list"}
					isBookmarked={isBookmarked}
					onBookmark={handleBookmark}
					animationDelay={index * 0.03}
				/>
			);

			// Mobile: swipe actions
			return (
				<div key={article.id} className="md:contents">
					{/* Mobile */}
					<div className="md:hidden">
						<SwipeableCard
							rightActions={[
								swipeActionPresets.bookmark(
									() => handleBookmark(article.id),
									isBookmarked,
								),
								swipeActionPresets.share(() => handleShare(article.id)),
							]}
							onSwipeStart={() => setShowMobileHint(false)}
						>
							{card}
						</SwipeableCard>
					</div>
					{/* Desktop */}
					<div className="hidden md:block">{card}</div>
				</div>
			);
		},
		[getCategoryInfo, viewMode, bookmarks, handleBookmark, handleShare],
	);

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<motion.div
						variants={fadeVariants}
						initial="hidden"
						animate="visible"
						className="p-6"
					>
						{/* Title */}
						<div className="mb-6 flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-neutral-900">
									{t("Articles list")}
								</h1>
								<p className="text-sm text-neutral-500">
									{t("Total")}{" "}
									<AnimatedNumber
										value={total}
										duration={800}
										numberClassName="font-semibold text-neutral-700"
									/>{" "}
									{t("articles")}
								</p>
							</div>
							<div className="flex items-center gap-2">
								{/* View */}
								<div className="hidden sm:flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
									<Button
										variant={viewMode === "list" ? "secondary" : "ghost"}
										size="icon"
										className="h-8 w-8"
										onClick={() => setViewMode("list")}
									>
										<List aria-hidden="true" className="h-4 w-4" />
									</Button>
									<Button
										variant={viewMode === "grid" ? "secondary" : "ghost"}
										size="icon"
										className="h-8 w-8"
										onClick={() => setViewMode("grid")}
									>
										<LayoutGrid aria-hidden="true" className="h-4 w-4" />
									</Button>
								</div>
								<Button
									variant="outline"
									size="sm"
									aria-expanded={filtersOpen}
									aria-controls="articles-filters"
									onClick={() => setFiltersOpen(true)}
									data-testid="articles-filter-button"
								>
									<SlidersHorizontal
										aria-hidden="true"
										className="mr-2 h-4 w-4"
									/>
									{t("Filter")}
									{activeFilterCount > 0 ? (
										<Badge
											variant="default"
											className="ml-2 h-5 min-w-[20px] px-1.5 text-[10px]"
										>
											{activeFilterCount}
										</Badge>
									) : null}
								</Button>
							</div>
						</div>

						{/* Categories */}
						<motion.div
							variants={staggerContainerVariants}
							initial="hidden"
							animate="visible"
							className="mb-6 flex flex-wrap gap-2"
							data-testid="articles-category-pills"
						>
							<motion.div variants={fadeVariants}>
								<Badge
									variant={selectedCategory === null ? "default" : "outline"}
									className="cursor-pointer transition-all hover:scale-105"
									onClick={() => {
										setSelectedCategory(null);
										setPage(0);
									}}
								>
									{t("All")}
								</Badge>
							</motion.div>
							{visibleCategories.map((category) => {
								const iconInfo = categoryIconMap[category.slug];
								const IconComponent = iconInfo?.Icon;
								return (
									<motion.div key={category.id} variants={fadeVariants}>
										<Badge
											variant={
												selectedCategory === category.id ? "default" : "outline"
											}
											className="cursor-pointer transition-all hover:scale-105 flex items-center gap-1.5"
											onClick={() => {
												setSelectedCategory(category.id);
												setPage(0);
											}}
										>
											{IconComponent && (
												<IconComponent
													className={cn("h-3.5 w-3.5", iconInfo.color)}
												/>
											)}
											{category.name}
										</Badge>
									</motion.div>
								);
							})}
							{!isVerifiedOrAbove && (categories?.length ?? 0) > visibleCategories.length ? (
								<motion.div variants={fadeVariants}>
									<Badge
										variant="outline"
										className="flex items-center gap-1.5 opacity-70"
										title={t(
											"Upgrade to verified or premium to access more categories.",
										)}
										data-testid="articles-categories-locked"
									>
										<Lock aria-hidden="true" className="h-3 w-3" />
										{t("More categories — Verified+")}
									</Badge>
								</motion.div>
							) : null}
						</motion.div>

						{/* Mobile swipe hint */}
						<AnimatePresence>
							{showMobileHint && articles.length > 0 && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									className="md:hidden mb-4"
								>
									<SwipeHint direction="left" />
								</motion.div>
							)}
						</AnimatePresence>

						{/* List */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<FileText
										aria-hidden="true"
										className="h-5 w-5 text-primary-500"
									/>
									{t("Articles list")}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{showArticlesLoading ? (
									// Loading skeleton
									<div
										className={cn(
											viewMode === "grid"
												? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
												: "space-y-4",
										)}
									>
										{Array.from(
											{ length: 6 },
											(_, idx) => `article-skel-${idx}`,
										).map((key) => (
											<ArticleCardSkeleton
												key={key}
												variant={viewMode === "grid" ? "compact" : "default"}
											/>
										))}
									</div>
								) : articlesIsError || categoriesIsError ? (
									<div className="rounded-xl border border-error/20 bg-error-light/30 p-8 text-center">
										<AlertTriangle className="mx-auto mb-3 h-8 w-8 text-error" />
										<p className="font-medium text-neutral-900">
											{t("Failed to load articles. Please retry.")}
										</p>
										{process.env.NODE_ENV !== "production" && listLoadError ? (
											<p className="mt-2 break-words text-xs text-neutral-500">
												{listLoadError}
											</p>
										) : null}
										<div className="mt-4">
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													void refetchCategories();
													void refetchArticles();
												}}
											>
												{t("Retry")}
											</Button>
										</div>
									</div>
								) : articles.length === 0 ? (
									// Empty state
									selectedCategory ? (
										<NoSearchResultState
											title={t("No articles in this category")}
											description={t(
												"Try selecting another category or view all articles.",
											)}
											actionLabel={t("View all")}
											onAction={() => setSelectedCategory(null)}
										/>
									) : (
										<NoDataState
											title={t("No articles")}
											description={t("No articles have been ingested yet.")}
										/>
									)
								) : (
									// Items
									<div
										className={cn(
											viewMode === "grid"
												? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
												: "space-y-4",
										)}
									>
										<AnimatedList
											staggerDelay={0.04}
											direction="up"
											gap={viewMode === "grid" ? "gap-4" : "space-y-4"}
											className={
												viewMode === "grid"
													? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
													: ""
											}
										>
											{pagedArticles.map((article, index) =>
												renderArticleCard(article, index),
											)}
										</AnimatedList>
									</div>
								)}

								{/* Pagination */}
								{totalPages > 1 && (
									<motion.div
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.3 }}
										className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4"
									>
										<p className="text-sm text-neutral-500">
											{t("Page {current} / {total}", {
												current: page + 1,
												total: totalPages,
											})}
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPage((p) => Math.max(0, p - 1))}
												disabled={page === 0}
											>
												<ChevronLeft aria-hidden="true" className="h-4 w-4" />
												{t("Previous")}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setPage((p) => Math.min(totalPages - 1, p + 1))
												}
												disabled={page >= totalPages - 1}
											>
												{t("Next")}
												<ChevronRight aria-hidden="true" className="h-4 w-4" />
											</Button>
										</div>
									</motion.div>
								)}
							</CardContent>
						</Card>
					</motion.div>
				</MainContent>
			</div>

			<Modal
				isOpen={filtersOpen}
				onClose={() => setFiltersOpen(false)}
				size="lg"
			>
				<div
					className="space-y-5 p-6"
					data-testid="articles-filter-drawer"
					id="articles-filters"
				>
					<header className="flex items-start gap-3">
						<span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
							<Filter aria-hidden="true" className="h-5 w-5" />
						</span>
						<div className="min-w-0 flex-1">
							<h2 className="text-lg font-semibold text-neutral-900">
								{t("Refine articles")}
							</h2>
							<p className="text-sm text-neutral-500">
								{t(
									"Combine status, date range, sources, and importance to scope the feed.",
								)}
							</p>
						</div>
					</header>

					<section className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
							{t("Status")}
						</h3>
						<div className="flex flex-wrap gap-2">
							{statusOptions.map((option) => (
								<Badge
									key={option.value}
									variant={
										statusFilter === option.value ? "default" : "outline"
									}
									className="cursor-pointer transition-all hover:scale-105"
									onClick={() => {
										setStatusFilter(option.value);
										setPage(0);
									}}
								>
									{t(option.labelKey)}
								</Badge>
							))}
						</div>
						<p className="text-xs text-neutral-500">
							{t("Current: {status}", { status: t(activeStatusKey) })}
						</p>
					</section>

					<section className="space-y-2">
						<h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
							<Calendar aria-hidden="true" className="h-3.5 w-3.5" />
							{t("Published date range")}
						</h3>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<label className="space-y-1 text-xs text-neutral-500">
								<span>{t("From")}</span>
								<input
									type="date"
									value={dateFrom}
									onChange={(event) => {
										setDateFrom(event.target.value);
										setPage(0);
									}}
									className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-300"
								/>
							</label>
							<label className="space-y-1 text-xs text-neutral-500">
								<span>{t("To")}</span>
								<input
									type="date"
									value={dateTo}
									onChange={(event) => {
										setDateTo(event.target.value);
										setPage(0);
									}}
									className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-300"
								/>
							</label>
						</div>
					</section>

					<section className="space-y-2">
						<h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
							<Newspaper aria-hidden="true" className="h-3.5 w-3.5" />
							{t("Sources")}
						</h3>
						{sources.length === 0 ? (
							<p className="text-xs text-neutral-500">
								{t("No sources available.")}
							</p>
						) : (
							<div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
								{sources.map((source) => {
									const active = selectedSourceIds.includes(source.id);
									return (
										<Badge
											key={source.id}
											variant={active ? "default" : "outline"}
											className="cursor-pointer transition-all hover:scale-105"
											onClick={() => toggleSourceId(source.id)}
										>
											{source.name}
										</Badge>
									);
								})}
							</div>
						)}
						{selectedSourceIds.length > 0 ? (
							<p className="text-xs text-neutral-500">
								{t("{count} sources selected", {
									count: selectedSourceIds.length,
								})}
							</p>
						) : null}
					</section>

					<section className="space-y-2">
						<h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
							<TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
							{t("Importance")}
							{!isVerifiedOrAbove ? (
								<Lock
									aria-hidden="true"
									className="h-3 w-3 text-neutral-400"
								/>
							) : null}
						</h3>
						{!isVerifiedOrAbove ? (
							<p className="text-xs text-neutral-500">
								{t(
									"Importance scoring is gated to verified and premium readers.",
								)}
							</p>
						) : (
							<div className="flex flex-wrap gap-2">
								{importanceOptions.map((option) => (
									<Badge
										key={option.value}
										variant={
											importanceFilter === option.value ? "default" : "outline"
										}
										className="cursor-pointer transition-all hover:scale-105"
										onClick={() => {
											setImportanceFilter(option.value);
											setPage(0);
										}}
									>
										{t(option.labelKey)}
									</Badge>
								))}
							</div>
						)}
					</section>

					<footer className="flex items-center justify-between border-t border-neutral-100 pt-4">
						<p className="text-xs text-neutral-500">
							{activeFilterCount > 0
								? t("{count} active filters", { count: activeFilterCount })
								: t("No filters applied")}
						</p>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleResetFilters}
								disabled={activeFilterCount === 0}
							>
								{t("Reset")}
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => setFiltersOpen(false)}
							>
								{t("Apply")}
							</Button>
						</div>
					</footer>
				</div>
			</Modal>
		</ProtectedRoute>
	);
}
