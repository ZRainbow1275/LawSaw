"use client";

import { ArticleCard } from "@/components/article/article-card";
import { UserShell } from "@/components/layout/user-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ArticleCardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { FeedHero } from "@/components/user/feed-hero";
import { useCategories } from "@/hooks/use-categories";
import { useMeFeed } from "@/hooks/use-me-feed";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Megaphone, Pin, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08, delayChildren: 0.05 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.4, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

const heroSkeletonStyle = {
	background:
		"linear-gradient(135deg, color-mix(in srgb, var(--color-primary-200) 40%, transparent), color-mix(in srgb, var(--color-primary-100) 30%, transparent))",
} as const;

const FEED_ARTICLE_SKELETON_IDS = [
	"lead",
	"policy",
	"court",
	"enforcement",
	"compliance",
	"global",
] as const;
const CHANNEL_SKELETON_IDS = [
	"legislation",
	"regulation",
	"court",
	"global",
] as const;
const CATEGORY_SKELETON_IDS = [
	"basic",
	"verified",
	"premium",
	"admin",
	"global",
] as const;

interface MeFeedPageProps {
	/**
	 * When true, the page assumes a parent already provides the user shell
	 * (Sidebar/Header/ProtectedRoute) and renders only its content. Used by the
	 * persistent locale shell at `[locale]/(shell-default)/me/feed/page.tsx`.
	 */
	embedded?: boolean;
}

export function MeFeedPage({ embedded = false }: MeFeedPageProps = {}) {
	const t = useT();
	const locale = useLocale();
	const searchParams = useSearchParams();
	const feedQuery = useMeFeed(20, 8);
	const categoriesQuery = useCategories();
	const adminDenied = searchParams.get("denied") === "admin";

	const articles = feedQuery.data?.articles ?? [];
	const visibleChannels = feedQuery.data?.visible_channels ?? [];
	const pinned = feedQuery.data?.pinned_articles ?? [];
	const banners = feedQuery.data?.banners ?? [];
	const categories = categoriesQuery.data ?? [];
	const categoryById = useMemo(
		() => new Map(categories.map((category) => [category.id, category])),
		[categories],
	);

	const trendingChannels = visibleChannels.slice(0, 5);
	const followedCategories = categories.slice(0, 6);

	const Shell = ({ children }: { children: ReactNode }) =>
		embedded ? (
			<>{children}</>
		) : (
			<UserShell widthVariant="wide">{children}</UserShell>
		);

	return (
		<Shell>
			<motion.div
				className="space-y-8"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				<motion.div variants={itemVariants}>
					{feedQuery.isLoading ? (
						<div
							className="h-44 w-full animate-pulse rounded-3xl shadow-brand-lg"
							style={heroSkeletonStyle}
						/>
					) : (
						<FeedHero
							articleCount={articles.length}
							visibleChannelCount={visibleChannels.length}
							pinnedCount={pinned.length}
						/>
					)}
				</motion.div>

				{adminDenied ? (
					<motion.div variants={itemVariants}>
						<div
							className="flex items-start gap-3 rounded-2xl border p-4 text-sm"
							style={{
								backgroundColor: "color-mix(in srgb, #fef3c7 62%, white)",
								borderColor: "#f59e0b",
								color: "#92400e",
							}}
							role="alert"
						>
							<ShieldAlert
								aria-hidden="true"
								className="mt-0.5 h-4 w-4 shrink-0"
							/>
							<div>
								<div className="font-semibold">{t("Access restricted")}</div>
								<div className="mt-1">
									{t(
										"Your account does not have administrator access. You have been redirected to your personal feed.",
									)}
								</div>
							</div>
						</div>
					</motion.div>
				) : null}

				{banners.length > 0 ? (
					<motion.section
						aria-label={t("Active banners")}
						className="grid gap-3 md:grid-cols-2"
						variants={itemVariants}
					>
						{banners.slice(0, 3).map((banner, index) => {
							const isFeatured = index === 0;
							return (
								<article
									key={banner.id}
									className="relative overflow-hidden rounded-2xl border p-5 shadow-popup-card transition-transform hover:-translate-y-0.5"
									style={
										isFeatured
											? {
													backgroundImage: "var(--gradient-banner)",
													borderColor: "transparent",
													color: "white",
												}
											: {
													backgroundColor: "var(--surface-popover-bg)",
													borderColor: "var(--surface-accent-border)",
												}
									}
								>
									{isFeatured ? (
										<div
											aria-hidden="true"
											className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
											style={{
												background:
													"radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
											}}
										/>
									) : null}
									<div
										className="relative inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
										style={
											isFeatured
												? {
														backgroundColor: "rgba(255,255,255,0.22)",
														color: "white",
													}
												: {
														backgroundColor: "var(--surface-accent-icon-bg)",
														color: "var(--surface-accent-strong)",
													}
										}
									>
										<Megaphone aria-hidden="true" className="h-3 w-3" />
										{t("Announcement")}
									</div>
									<h3
										className="relative mt-3 text-base font-semibold"
										style={{
											color: isFeatured ? "white" : "var(--auth-copy-primary)",
										}}
									>
										{banner.title}
									</h3>
									{banner.body ? (
										<p
											className="relative mt-2 text-sm leading-relaxed"
											style={{
												color: isFeatured
													? "rgba(255,255,255,0.88)"
													: "var(--auth-copy-secondary)",
											}}
										>
											{banner.body}
										</p>
									) : null}
									{banner.cta_label && banner.cta_url ? (
										<a
											href={banner.cta_url}
											className="relative mt-3 inline-flex items-center gap-1 text-sm font-semibold"
											style={{
												color: isFeatured
													? "white"
													: "var(--color-primary-600)",
											}}
										>
											{banner.cta_label}
										</a>
									) : null}
								</article>
							);
						})}
					</motion.section>
				) : null}

				<motion.div
					className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,1fr)]"
					variants={itemVariants}
				>
					<section aria-label={t("Feed items")} className="space-y-4">
						{pinned.length > 0 ? (
							<div className="space-y-3">
								<header className="flex items-center gap-2">
									<Pin
										aria-hidden="true"
										className="h-4 w-4"
										style={{ color: "var(--surface-accent-strong)" }}
									/>
									<h2
										className="text-sm font-semibold uppercase tracking-[0.12em]"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t("Pinned by editors")}
									</h2>
								</header>
								<div className="grid gap-3 md:grid-cols-2">
									{pinned.slice(0, 4).map((item) => {
										const category = item.article.category_id
											? categoryById.get(item.article.category_id)
											: undefined;
										return (
											<div
												key={item.id}
												className="overflow-hidden rounded-2xl border p-1 shadow-feed-hover transition-transform hover:-translate-y-0.5"
												style={{
													backgroundColor: "var(--surface-accent-bg)",
													borderColor: "var(--surface-accent-border)",
													borderLeft: "4px solid var(--color-primary-600)",
												}}
											>
												<ArticleCard
													article={item.article}
													categoryName={category?.name}
													showSummary
												/>
											</div>
										);
									})}
								</div>
							</div>
						) : null}

						<header className="flex items-baseline justify-between">
							<h2
								className="text-lg font-semibold"
								style={{ color: "var(--auth-copy-primary)" }}
							>
								{t("Latest in your feed")}
							</h2>
							<span
								className="text-xs"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{feedQuery.isLoading
									? null
									: t("{count} articles", { count: articles.length })}
							</span>
						</header>

						{feedQuery.isLoading ? (
							<div className="grid gap-4 md:grid-cols-2">
								{FEED_ARTICLE_SKELETON_IDS.map((skeletonId) => (
									<ArticleCardSkeleton key={`feed-skeleton-${skeletonId}`} />
								))}
							</div>
						) : feedQuery.isError ? (
							<EmptyState
								variant="error"
								title={t("Failed to load feed items")}
								description={
									feedQuery.error instanceof Error
										? feedQuery.error.message
										: t("Unknown error")
								}
								action={{
									label: t("Retry"),
									onClick: () => feedQuery.refetch(),
								}}
							/>
						) : articles.length === 0 ? (
							<Card>
								<CardContent className="py-10">
									<EmptyState
										title={t("Your feed is quiet")}
										description={t(
											"Follow more channels and categories to start filling your feed.",
										)}
										action={{
											label: t("Browse categories"),
											onClick: () => {
												window.location.href = withLocalePath(
													locale,
													"/me/feed",
												);
											},
										}}
									/>
								</CardContent>
							</Card>
						) : (
							<div className="grid gap-4 md:grid-cols-2">
								{articles.map((article) => {
									const category = article.category_id
										? categoryById.get(article.category_id)
										: undefined;
									return (
										<div
											key={article.id}
											className="rounded-xl transition-shadow hover:shadow-feed-hover"
										>
											<ArticleCard
												article={article}
												categoryName={category?.name}
												showSummary
											/>
										</div>
									);
								})}
							</div>
						)}
					</section>

					<aside className="space-y-4" aria-label={t("Trending and follows")}>
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<TrendingUp
										aria-hidden="true"
										className="h-4 w-4"
										style={{ color: "var(--color-primary-500)" }}
									/>
									{t("Trending channels")}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{feedQuery.isLoading ? (
									<div className="space-y-2">
										{CHANNEL_SKELETON_IDS.map((skeletonId) => (
											<Skeleton
												key={`channel-skeleton-${skeletonId}`}
												variant="text"
												width="80%"
												height={18}
											/>
										))}
									</div>
								) : trendingChannels.length === 0 ? (
									<p
										className="text-sm"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t("No channels visible to your role yet.")}
									</p>
								) : (
									<ul className="space-y-2 text-sm">
										{trendingChannels.map((channel, index) => (
											<li key={channel.id} className="flex items-start gap-3">
												<span
													className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
													style={{
														backgroundColor: "var(--surface-accent-icon-bg)",
														color: "var(--surface-accent-strong)",
													}}
												>
													{index + 1}
												</span>
												<span className="min-w-0 flex-1">
													<span
														className="block truncate font-medium"
														style={{ color: "var(--auth-copy-primary)" }}
													>
														{channel.name}
													</span>
													{channel.description ? (
														<span
															className="block truncate text-xs"
															style={{ color: "var(--surface-muted-text)" }}
														>
															{channel.description}
														</span>
													) : null}
												</span>
											</li>
										))}
									</ul>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									{t("Followed categories")}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{categoriesQuery.isLoading ? (
									<div className="flex flex-wrap gap-2">
										{CATEGORY_SKELETON_IDS.map((skeletonId) => (
											<Skeleton
												key={`cat-skel-${skeletonId}`}
												variant="rectangular"
												width={88}
												height={28}
											/>
										))}
									</div>
								) : followedCategories.length === 0 ? (
									<p
										className="text-sm"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t("No categories available.")}
									</p>
								) : (
									<div className="flex flex-wrap gap-2">
										{followedCategories.map((category) => (
											<Link
												key={category.id}
												href={withLocalePath(
													locale,
													`/category/${category.slug}`,
												)}
												className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
												style={{
													backgroundColor: "var(--surface-popover-bg)",
													borderColor: "var(--surface-muted-border)",
													color: "var(--field-foreground)",
												}}
											>
												{category.name}
											</Link>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</aside>
				</motion.div>
			</motion.div>
		</Shell>
	);
}
