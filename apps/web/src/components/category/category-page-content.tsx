"use client";

/**
 * CategoryPageContent — 10 个分类详情页统一壳层。
 *
 * 顶部 4px accent line 取自 `--cat-{slug}` 真值（design-system.md §3.2），
 * 与 dashboard 的 KpiCard 同一套色谱。文章用 ArticleCard grid 渲染。
 */

import { ArticleCard } from "@/components/article/article-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArticleCardSkeleton } from "@/components/ui/skeleton";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type CSSProperties, useMemo, useState } from "react";

const PAGE_SIZE = 12;

const SLUG_TO_TOKEN: Record<string, string> = {
	legislation: "var(--cat-legislation)",
	regulation: "var(--cat-regulation)",
	enforcement: "var(--cat-enforcement)",
	industry: "var(--cat-industry)",
	compliance: "var(--cat-compliance)",
	"data-trends": "var(--cat-data-trends)",
	security: "var(--cat-security)",
	academic: "var(--cat-academic)",
	"major-events": "var(--cat-major-events)",
	international: "var(--cat-international)",
};

function accentForSlug(slug: string): string {
	return SLUG_TO_TOKEN[slug] ?? "var(--cat-legislation)";
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06, delayChildren: 0.04 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 12 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.3, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

export function CategoryPageContent() {
	const t = useT();
	const locale = useLocale();
	const params = useParams();
	const slug = String(params?.slug ?? "");
	const [page, setPage] = useState(0);

	const categoriesQuery = useCategories();
	const categories = categoriesQuery.data ?? [];
	const category = categories.find((c) => c.slug === slug);
	const accent = accentForSlug(slug);

	const articlesQuery = useArticles({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
		category_id: category?.id,
	});

	const articles = articlesQuery.data?.data ?? [];
	const total = articlesQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const stats = useMemo(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayMs = today.getTime();
		const weekMs = todayMs - 6 * 24 * 60 * 60 * 1000;

		let todayCount = 0;
		let weekCount = 0;
		let highRiskCount = 0;
		for (const article of articles) {
			const ts = article.published_at
				? new Date(article.published_at).getTime()
				: 0;
			if (ts >= todayMs) todayCount += 1;
			if (ts >= weekMs) weekCount += 1;
			const score = article.risk_score ?? 0;
			if (score >= 0.7) highRiskCount += 1;
		}
		return { todayCount, weekCount, highRiskCount };
	}, [articles]);

	const accentSurface: CSSProperties = {
		backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${accent} 14%, transparent), color-mix(in srgb, ${accent} 4%, transparent))`,
		borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
	};

	const isInitialLoading = categoriesQuery.isLoading;
	const isCategoryMissing =
		!isInitialLoading && categoriesQuery.isSuccess && !category;

	if (isCategoryMissing) {
		return (
			<div className="mx-auto max-w-3xl py-12 text-center">
				<EmptyState
					title={t("Category not found")}
					description={t(
						"This category may have been renamed or removed. Browse all articles instead.",
					)}
					action={{
						label: t("Back to articles"),
						onClick: () => {
							window.location.href = withLocalePath(locale, "/articles");
						},
					}}
				/>
			</div>
		);
	}

	return (
		<motion.div
			className="space-y-6"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div variants={itemVariants}>
				<Link
					href={withLocalePath(locale, "/articles")}
					className="inline-flex items-center gap-1 text-sm transition-colors"
					style={{ color: "var(--surface-muted-text)" }}
				>
					<ArrowLeft aria-hidden="true" className="h-4 w-4" />
					{t("Back to all articles")}
				</Link>
			</motion.div>

			<motion.section variants={itemVariants}>
				<div
					className="relative overflow-hidden rounded-3xl border p-6 md:p-8"
					style={accentSurface}
				>
					<span
						aria-hidden="true"
						className="absolute inset-x-0 top-0 h-1"
						style={{ backgroundColor: accent }}
					/>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="flex items-center gap-4">
							<span
								className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl"
								style={{
									backgroundColor: `color-mix(in srgb, ${accent} 16%, white)`,
									color: accent,
								}}
							>
								{category?.icon ?? "📁"}
							</span>
							<div className="min-w-0">
								<h1
									className="text-2xl font-bold tracking-tight md:text-3xl"
									style={{ color: "var(--color-foreground)" }}
								>
									{category?.name ?? t("Loading...")}
								</h1>
								{category?.description ? (
									<p
										className="mt-1 max-w-2xl text-sm"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{category.description}
									</p>
								) : null}
							</div>
						</div>
						<Badge variant="outline" className="self-start">
							{t("Total {count} articles", { count: String(total) })}
						</Badge>
					</div>
				</div>
			</motion.section>

			<motion.section variants={itemVariants} aria-label={t("Article statistics")}>
				<dl
					className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs"
					style={{ color: "var(--surface-muted-text)" }}
					data-testid="category-inline-stats"
				>
					<InlineStat label={t("Total articles")} value={total.toLocaleString()} />
					<span aria-hidden style={{ color: "var(--surface-card-border-strong)" }}>
						·
					</span>
					<InlineStat
						label={t("Today's articles")}
						value={stats.todayCount.toLocaleString()}
					/>
					<span aria-hidden style={{ color: "var(--surface-card-border-strong)" }}>
						·
					</span>
					<InlineStat
						label={t("Last 7 days trend")}
						value={stats.weekCount.toLocaleString()}
					/>
					<span aria-hidden style={{ color: "var(--surface-card-border-strong)" }}>
						·
					</span>
					<InlineStat
						label={t("High risk")}
						value={stats.highRiskCount.toLocaleString()}
					/>
				</dl>
			</motion.section>

			<motion.section variants={itemVariants} className="space-y-4">
				<header className="flex items-baseline justify-between">
					<h2
						className="text-lg font-semibold"
						style={{ color: "var(--color-foreground)" }}
					>
						{t("Latest articles")}
					</h2>
					{articlesQuery.isFetching ? (
						<span
							className="text-xs"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{t("Loading articles")}
						</span>
					) : null}
				</header>

				{articlesQuery.isLoading ? (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{["a", "b", "c", "d", "e", "f"].map((key) => (
							<ArticleCardSkeleton key={`cat-skel-${key}`} />
						))}
					</div>
				) : articlesQuery.isError ? (
					<EmptyState
						variant="error"
						title={t("Failed to load articles")}
						description={
							articlesQuery.error instanceof Error
								? articlesQuery.error.message
								: t("Unknown error")
						}
						action={{
							label: t("Retry"),
							onClick: () => articlesQuery.refetch(),
						}}
					/>
				) : articles.length === 0 ? (
					<EmptyState
						title={t("No articles in this category")}
						description={t(
							"Try clearing filters, or generate a new report to populate this view.",
						)}
					/>
				) : (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{articles.map((article) => (
							<ArticleCard
								key={article.id}
								article={article}
								categoryName={category?.name}
								categoryIcon={category?.icon ?? undefined}
								showSummary
							/>
						))}
					</div>
				)}

				{totalPages > 1 ? (
					<div className="flex items-center justify-between pt-2">
						<p
							className="text-xs"
							style={{ color: "var(--surface-muted-text)" }}
						>
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
					</div>
				) : null}
			</motion.section>
		</motion.div>
	);
}

function InlineStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="inline-flex items-baseline gap-1.5">
			<span style={{ color: "var(--surface-card-faint-fg)" }}>{label}</span>
			<span
				className="text-sm font-semibold tabular-nums"
				style={{ color: "var(--color-foreground)" }}
			>
				{value}
			</span>
		</div>
	);
}
