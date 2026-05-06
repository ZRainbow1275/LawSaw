"use client";

/**
 * `/articles` list page — 1:1 port of prototype/app.html lines 922-1033.
 *
 * Layout:
 *   1. page-header           — "全部资讯" + count-badge "共 N 篇文章"
 *   2. toolbar               — list/grid switch + filter button + search box
 *   3. cat-filter-row        — "All" pill + per-category dot pill
 *   4. content-card (rows)   — risk-pill + status-badge + title + summary + meta
 *   5. pagination            — < page X / Y >
 *
 * URL state syncs `page`, `category`, `search` via `useSearchParams` so deep
 * links work. Data is fetched live via `useArticles` and `useCategories`. No
 * mock data — empty states render when the backend returns nothing.
 */

import { UserShell } from "@/components/layout/user-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Filter,
	LayoutGrid,
	List,
	Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 20;

type RiskBucket = "high" | "mid" | "low" | "unknown";

function bucketRisk(score: number | null | undefined): RiskBucket {
	if (score == null || !Number.isFinite(score)) return "unknown";
	if (score >= 70) return "high";
	if (score >= 40) return "mid";
	return "low";
}

const riskPillStyles: Record<
	RiskBucket,
	{ bg: string; color: string; labelKey: string }
> = {
	high: { bg: "#fee2e2", color: "#b91c1c", labelKey: "High" },
	mid: { bg: "#fef3c7", color: "#b45309", labelKey: "Mid" },
	low: { bg: "#dcfce7", color: "#15803d", labelKey: "Low" },
	unknown: { bg: "#f1f5f9", color: "#475569", labelKey: "Unrated" },
};

const statusBadgeStyles: Record<
	string,
	{ bg: string; color: string; labelKey: string }
> = {
	published: { bg: "#dcfce7", color: "#15803d", labelKey: "Published" },
	pending: { bg: "#fef3c7", color: "#b45309", labelKey: "Pending" },
	processing: { bg: "#dbeafe", color: "#1d4ed8", labelKey: "Processing" },
	archived: { bg: "#f1f5f9", color: "#475569", labelKey: "Archived" },
	rejected: { bg: "#fee2e2", color: "#b91c1c", labelKey: "Rejected" },
};

const categoryAccent: Record<string, string> = {
	legislation: "#3b82f6",
	regulation: "#8b5cf6",
	enforcement: "#ef4444",
	industry: "#f59e0b",
	compliance: "#10b981",
	data: "#06b6d4",
	security: "#dc2626",
	academic: "#6366f1",
	events: "#fb923c",
	international: "#0ea5e9",
};

function formatRelativeTime(
	value: string | null | undefined,
	t: ReturnType<typeof useT>,
): string {
	if (!value) return "";
	const created = new Date(value).getTime();
	if (!Number.isFinite(created)) return "";
	const diff = Date.now() - created;
	if (diff < 60_000) return t("Just now");
	if (diff < 3_600_000)
		return t("{count} minutes ago", {
			count: String(Math.floor(diff / 60_000)),
		});
	if (diff < 86_400_000)
		return t("{count} hours ago", {
			count: String(Math.floor(diff / 3_600_000)),
		});
	if (diff < 7 * 86_400_000)
		return t("{count} days ago", {
			count: String(Math.floor(diff / 86_400_000)),
		});
	return value.slice(0, 10);
}

type ViewMode = "list" | "grid";

export function ArticlesPagePrototype() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();

	const pageParam = Number(searchParams.get("page") ?? "1");
	const initialPage =
		Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
	const initialCategory = searchParams.get("category");
	const initialSearch = searchParams.get("q") ?? "";

	const [page, setPage] = useState(initialPage);
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		initialCategory,
	);
	const [search, setSearch] = useState(initialSearch);
	const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
	const [viewMode, setViewMode] = useState<ViewMode>("list");

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(search);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [search]);

	const updateUrl = useCallback(
		(next: { page?: number; category?: string | null; q?: string }) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next.page != null) {
				if (next.page === 1) params.delete("page");
				else params.set("page", String(next.page));
			}
			if (next.category !== undefined) {
				if (next.category) params.set("category", next.category);
				else params.delete("category");
			}
			if (next.q !== undefined) {
				if (next.q) params.set("q", next.q);
				else params.delete("q");
			}
			const query = params.toString();
			router.replace(query ? `?${query}` : "?", { scroll: false });
		},
		[router, searchParams],
	);

	const offset = (page - 1) * PAGE_SIZE;
	const articlesQuery = useArticles({
		limit: PAGE_SIZE,
		offset,
		category_id: selectedCategoryId ?? undefined,
	});
	const categoriesQuery = useCategories();

	const totalCount = articlesQuery.data?.total ?? 0;
	const allArticles = articlesQuery.data?.data ?? [];
	const trimmedSearch = debouncedSearch.trim();
	const isSearching = trimmedSearch.length > 0;
	const filteredArticles = useMemo(() => {
		if (!isSearching) return allArticles;
		const lower = trimmedSearch.toLowerCase();
		return allArticles.filter((article) => {
			const haystack =
				`${article.title} ${article.summary ?? ""}`.toLowerCase();
			return haystack.includes(lower);
		});
	}, [allArticles, isSearching, trimmedSearch]);
	// Search filters the current page only — hide pagination when active so the
	// "Page 1/3" UI never disagrees with the filtered count the user sees.
	const totalPages = isSearching
		? 1
		: Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

	const categories = categoriesQuery.data ?? [];
	const categoryById = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	);

	return (
		<UserShell widthVariant="wide">
			<motion.div
				className="mx-auto max-w-[1200px] space-y-5 p-2"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3 }}
			>
				{/* page-header */}
				<header className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-bold text-neutral-900">
						{t("All articles")}
					</h1>
					<span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
						{t("Total {count} articles", { count: String(totalCount) })}
					</span>
				</header>

				{/* toolbar */}
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setViewMode("list")}
							aria-pressed={viewMode === "list"}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
								viewMode === "list"
									? "border-primary-500 bg-primary-50 text-primary-700"
									: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300",
							)}
						>
							<List aria-hidden="true" className="h-4 w-4" />
							{t("List view")}
						</button>
						<button
							type="button"
							onClick={() => setViewMode("grid")}
							aria-pressed={viewMode === "grid"}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
								viewMode === "grid"
									? "border-primary-500 bg-primary-50 text-primary-700"
									: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300",
							)}
						>
							<LayoutGrid aria-hidden="true" className="h-4 w-4" />
							{t("Grid view")}
						</button>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-300"
						>
							<Filter aria-hidden="true" className="h-4 w-4" />
							{t("Filter")}
						</button>
					</div>
					<label className="relative flex w-full max-w-xs items-center">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute left-3 h-4 w-4 text-neutral-400"
						/>
						<input
							type="search"
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setPage(1);
								updateUrl({ q: event.target.value, page: 1 });
							}}
							placeholder={t("Search article titles, keywords...")}
							className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
						/>
					</label>
				</div>

				{/* cat-filter-row */}
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => {
							setSelectedCategoryId(null);
							setPage(1);
							updateUrl({ category: null, page: 1 });
						}}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
							selectedCategoryId == null
								? "border-primary-500 bg-primary-500 text-white"
								: "border-neutral-200 bg-white text-neutral-700 hover:border-primary-300",
						)}
					>
						{t("All")}
					</button>
					{categories.map((category) => {
						const active = selectedCategoryId === category.id;
						const dot =
							categoryAccent[category.slug] ?? "var(--color-primary-500)";
						return (
							<button
								type="button"
								key={category.id}
								onClick={() => {
									setSelectedCategoryId(category.id);
									setPage(1);
									updateUrl({ category: category.id, page: 1 });
								}}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
									active
										? "border-primary-500 bg-primary-500 text-white"
										: "border-neutral-200 bg-white text-neutral-700 hover:border-primary-300",
								)}
							>
								<span
									aria-hidden="true"
									className="h-2 w-2 rounded-full"
									style={{ background: active ? "white" : dot }}
								/>
								{category.name}
							</button>
						);
					})}
				</div>

				{/* article rows */}
				<section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
					{articlesQuery.isLoading ? (
						<div className="space-y-3 p-5">
							{[0, 1, 2, 3, 4].map((index) => (
								<Skeleton
									key={`row-skel-${index}`}
									variant="rectangular"
									height={72}
								/>
							))}
						</div>
					) : articlesQuery.isError ? (
						<div className="p-8 text-center">
							<AlertTriangle
								aria-hidden="true"
								className="mx-auto h-8 w-8 text-red-500"
							/>
							<p className="mt-3 text-sm font-medium text-neutral-900">
								{t("Failed to load articles")}
							</p>
						</div>
					) : filteredArticles.length === 0 ? (
						<div className="p-12 text-center text-sm text-neutral-500">
							{search ? t("No articles in this category") : t("No articles")}
						</div>
					) : (
						<ul className="divide-y divide-neutral-100">
							{filteredArticles.map((article) => {
								const risk = bucketRisk(article.risk_score);
								const riskMeta = riskPillStyles[risk];
								const statusKey = (article.status ?? "").toLowerCase();
								const statusMeta = statusBadgeStyles[statusKey] ?? null;
								const categoryName = article.category_id
									? categoryById.get(article.category_id)?.name
									: null;
								return (
									<li key={article.id}>
										<Link
											href={withLocalePath(locale, `/articles/${article.id}`)}
											className="group flex gap-4 px-6 py-5 transition-colors hover:bg-neutral-50"
										>
											<div className="flex shrink-0 flex-col items-start gap-1.5">
												<span
													className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
													style={{
														background: riskMeta.bg,
														color: riskMeta.color,
													}}
												>
													{risk === "low" ? (
														<CheckCircle2
															aria-hidden="true"
															className="h-3 w-3"
														/>
													) : (
														<AlertTriangle
															aria-hidden="true"
															className="h-3 w-3"
														/>
													)}
													{t(riskMeta.labelKey)}
												</span>
												{statusMeta ? (
													<span
														className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
														style={{
															background: statusMeta.bg,
															color: statusMeta.color,
														}}
													>
														{t(statusMeta.labelKey)}
													</span>
												) : null}
											</div>
											<div className="min-w-0 flex-1">
												<h3 className="line-clamp-1 text-[14px] font-semibold text-neutral-900 transition-colors group-hover:text-primary-600">
													{article.title}
												</h3>
												{article.summary ? (
													<p className="mt-1 line-clamp-2 text-[13px] text-neutral-500">
														{article.summary}
													</p>
												) : null}
												<div className="mt-1.5 flex items-center gap-3 text-[12px] text-neutral-400">
													{article.author ? (
														<span>{article.author}</span>
													) : null}
													{categoryName ? <span>{categoryName}</span> : null}
													{article.published_at || article.created_at ? (
														<span>
															{formatRelativeTime(
																article.published_at ?? article.created_at,
																t,
															)}
														</span>
													) : null}
												</div>
											</div>
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				{/* pagination */}
				{totalPages > 1 ? (
					<nav
						className="flex items-center justify-center gap-3"
						aria-label={t("Pagination")}
					>
						<button
							type="button"
							onClick={() => {
								const next = Math.max(1, page - 1);
								setPage(next);
								updateUrl({ page: next });
							}}
							disabled={page <= 1}
							className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:border-primary-300 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<ChevronLeft aria-hidden="true" className="h-4 w-4" />
							{t("Previous")}
						</button>
						<span className="text-sm text-neutral-500">
							{t("Page {current} / {total}", {
								current: page,
								total: totalPages,
							})}
						</span>
						<button
							type="button"
							onClick={() => {
								const next = Math.min(totalPages, page + 1);
								setPage(next);
								updateUrl({ page: next });
							}}
							disabled={page >= totalPages}
							className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:border-primary-300 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{t("Next")}
							<ChevronRight aria-hidden="true" className="h-4 w-4" />
						</button>
					</nav>
				) : null}
			</motion.div>
		</UserShell>
	);
}
