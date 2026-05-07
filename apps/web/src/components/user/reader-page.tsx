"use client";

import { AiInsightsCard } from "@/components/article/ai-insights";
import { ArticleContent } from "@/components/article/article-content";
import { ReadingSettings } from "@/components/article/reading-settings";
import {
	type TOCItem,
	TableOfContents,
	useTableOfContents,
} from "@/components/article/table-of-contents";
import { UserShell } from "@/components/layout/user-shell";
import { ReactionToggle } from "@/components/reactions/reaction-toggle";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArticleContentSkeleton } from "@/components/ui/skeleton";
import { ReaderProgressBar } from "@/components/user/reader-progress-bar";
import { useArticle } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useReadingTracker } from "@/hooks/use-reading-tracker";
import {
	isArticleBodyTruncated,
	normalizeArticleAiInsights,
} from "@/lib/api/types";
import {
	type ArticleMarkdownSource,
	extractMarkdownSource,
	formatArticlePublishedAtLabel,
	parseArticlePublishedAt,
} from "@/lib/article-reader";
import { isRoleTierAtLeast } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useReadingStore, useReadingStyles } from "@/stores/reading-store";
import {
	ArrowLeft,
	BookmarkCheck,
	BookmarkPlus,
	Clock,
	ExternalLink,
	Eye,
	Lock,
	Settings2,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

interface ReaderPageProps {
	articleId: string;
	/**
	 * When true, the page assumes a parent already provides the user shell
	 * (Sidebar/Header/ProtectedRoute) and renders only its content. Used by the
	 * persistent locale shell at
	 * `[locale]/(shell-default)/me/articles/[id]/page.tsx`.
	 */
	embedded?: boolean;
}

const HERO_TOC_ITEM: TOCItem = {
	id: "reader-summary",
	text: "Summary",
	level: 1,
	observe: false,
};

const ESTIMATE_WORDS_PER_MINUTE = 360;

function estimateMinutes(source: ArticleMarkdownSource | null): number {
	if (!source || source.wordCount === 0) return 1;
	return Math.max(1, Math.ceil(source.wordCount / ESTIMATE_WORDS_PER_MINUTE));
}

export function ReaderPage({ articleId, embedded = false }: ReaderPageProps) {
	const t = useT();
	const locale = useLocale();
	const articleQuery = useArticle(articleId);
	const categoriesQuery = useCategories();
	const readingStyles = useReadingStyles();
	const isBookmarked = useReadingStore((s) => s.bookmarks.includes(articleId));
	const toggleBookmark = useReadingStore((s) => s.toggleBookmark);

	const [settingsOpen, setSettingsOpen] = useState(false);
	const [summaryOpen, setSummaryOpen] = useState(true);

	const contentRef = useRef<HTMLDivElement | null>(null);

	const article = articleQuery.data ?? null;
	const markdownSource = useMemo(
		() => (article ? extractMarkdownSource(article.content) : null),
		[article],
	);
	const aiInsights = useMemo(
		() => (article ? normalizeArticleAiInsights(article) : null),
		[article],
	);
	const roleTier = useAuthStore((s) => s.roleTier);
	const isPremiumOrAbove = isRoleTierAtLeast(roleTier, "premium_user");
	const isVerifiedOrAbove = isRoleTierAtLeast(roleTier, "verified_user");
	const isBasicTier = !isVerifiedOrAbove;
	const showAiInsights = Boolean(aiInsights) && isPremiumOrAbove;
	const showAiUpgradeHint = !isPremiumOrAbove;
	const isContentTruncated =
		isBasicTier && isArticleBodyTruncated(article?.content ?? null);

	const tocStaticItems = useMemo<TOCItem[]>(
		() => [{ ...HERO_TOC_ITEM, text: t("Summary") }],
		[t],
	);
	const tocContentKey = article ? `${article.id}:${article.version}` : null;
	const { items: tocItems, activeId } = useTableOfContents(
		contentRef,
		tocStaticItems,
		tocContentKey,
	);

	useReadingTracker({
		articleId: article ? article.id : null,
		containerRef: contentRef,
		enabled: Boolean(article),
	});

	const category = useMemo(() => {
		if (!article?.category_id) return undefined;
		return categoriesQuery.data?.find((c) => c.id === article.category_id);
	}, [article?.category_id, categoriesQuery.data]);

	const publishedDate = parseArticlePublishedAt(article?.published_at ?? null);
	const minutes = estimateMinutes(markdownSource);

	const DefaultShell = ({ children }: { children: React.ReactNode }) =>
		embedded ? (
			<>{children}</>
		) : (
			<UserShell widthVariant="default">{children}</UserShell>
		);
	const WideShell = ({ children }: { children: React.ReactNode }) =>
		embedded ? (
			<>{children}</>
		) : (
			<UserShell widthVariant="wide" hideWorkspaceStrip>
				{children}
			</UserShell>
		);

	if (articleQuery.isError) {
		return (
			<DefaultShell>
				<EmptyState
					variant="error"
					title={t("Failed to load article")}
					description={
						articleQuery.error instanceof Error
							? articleQuery.error.message
							: t("Unknown error")
					}
					action={{
						label: t("Retry"),
						onClick: () => articleQuery.refetch(),
					}}
				/>
			</DefaultShell>
		);
	}

	return (
		<WideShell>
			<ReaderProgressBar />

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<Link
						href={withLocalePath(locale, "/me/feed")}
						className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--control-hover-bg)]"
						style={{ color: "var(--surface-muted-text)" }}
					>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("Back to feed")}
					</Link>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => toggleBookmark(articleId)}
							aria-pressed={isBookmarked}
						>
							{isBookmarked ? (
								<BookmarkCheck aria-hidden="true" className="h-4 w-4" />
							) : (
								<BookmarkPlus aria-hidden="true" className="h-4 w-4" />
							)}
							{isBookmarked ? t("Saved") : t("Save")}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setSettingsOpen(true)}
							aria-label={t("Reading settings")}
						>
							<Settings2 aria-hidden="true" className="h-4 w-4" />
							<span className="hidden sm:inline">{t("Reading settings")}</span>
						</Button>
					</div>
				</div>

				<div className="grid gap-8 xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
					<aside className="hidden xl:block">
						<div
							className="sticky top-32 max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border p-4"
							style={{
								backgroundColor: "var(--surface-popover-bg)",
								borderColor: "var(--surface-muted-border)",
							}}
						>
							<TableOfContents items={tocItems} activeId={activeId} />
						</div>
					</aside>

					<article
						ref={contentRef}
						className="min-w-0 space-y-6 rounded-3xl border p-6 md:p-8 shadow-popup-card"
						style={{
							backgroundColor: "var(--surface-popover-bg)",
							borderColor: "var(--surface-muted-border)",
							color: "var(--reading-text)",
							fontFamily: "var(--reading-font-family)",
							...readingStyles,
						}}
					>
						{articleQuery.isLoading || !article ? (
							<ArticleContentSkeleton />
						) : (
							<>
								<header className="space-y-4">
									<div
										className="flex flex-wrap items-center gap-2 text-xs"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{category ? (
											<span
												className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.1em]"
												style={{
													backgroundColor: "var(--surface-accent-icon-bg)",
													color: "var(--surface-accent-strong)",
												}}
											>
												{category.name}
											</span>
										) : null}
										{publishedDate ? (
											<span>
												{formatArticlePublishedAtLabel(locale, publishedDate)}
											</span>
										) : null}
										<span className="inline-flex items-center gap-1">
											<Clock aria-hidden="true" className="h-3.5 w-3.5" />
											{t("{count} min read", { count: minutes })}
										</span>
										{article.author ? <span>· {article.author}</span> : null}
									</div>

									<h1
										className="text-3xl font-bold tracking-tight md:text-4xl"
										style={{ color: "var(--auth-copy-primary)" }}
									>
										{article.title}
									</h1>

									{article.link ? (
										<a
											href={article.link}
											target="_blank"
											rel="noreferrer noopener"
											className="inline-flex items-center gap-1.5 text-sm font-medium"
											style={{ color: "var(--color-primary-600)" }}
										>
											<ExternalLink
												aria-hidden="true"
												className="h-3.5 w-3.5"
											/>
											{t("View original")}
										</a>
									) : null}
								</header>

								<section
									id={HERO_TOC_ITEM.id}
									aria-label={t("Summary")}
									className="rounded-2xl border p-5"
									style={{
										backgroundColor: "var(--surface-accent-bg)",
										borderColor: "var(--surface-accent-border)",
									}}
								>
									<button
										type="button"
										onClick={() => setSummaryOpen((o) => !o)}
										aria-expanded={summaryOpen}
										className="flex w-full items-center justify-between gap-3 text-left"
									>
										<span
											className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em]"
											style={{ color: "var(--surface-accent-strong)" }}
										>
											<Sparkles aria-hidden="true" className="h-4 w-4" />
											{t("Summary")}
										</span>
										<span
											className="text-xs"
											style={{ color: "var(--surface-accent-muted)" }}
										>
											{summaryOpen ? t("Hide") : t("Show")}
										</span>
									</button>
									{summaryOpen ? (
										article.summary ? (
											<p
												className="mt-3 text-sm leading-relaxed"
												style={{ color: "var(--surface-accent-copy)" }}
											>
												{article.summary}
											</p>
										) : (
											<p
												className="mt-3 text-sm"
												style={{ color: "var(--surface-accent-muted)" }}
											>
												{t(
													"Summary will appear here once AI insights are generated.",
												)}
											</p>
										)
									) : null}
									{article.keywords.length > 0 && summaryOpen ? (
										<ul className="mt-3 flex flex-wrap gap-2 text-xs">
											{article.keywords.slice(0, 6).map((keyword) => (
												<li
													key={keyword}
													className="rounded-full border px-2 py-0.5 font-medium"
													style={{
														borderColor: "var(--surface-accent-border)",
														color: "var(--surface-accent-strong)",
														backgroundColor:
															"color-mix(in srgb, var(--surface-accent-bg) 60%, white)",
													}}
												>
													{keyword}
												</li>
											))}
										</ul>
									) : null}
								</section>

								<ArticleContent content={article.content} />

								<section
									aria-label={t("Reactions")}
									className="mt-2 flex flex-col items-center gap-3 rounded-2xl border p-5"
									style={{
										backgroundColor: "var(--surface-popover-bg)",
										borderColor: "var(--surface-muted-border)",
									}}
									data-testid="reader-reactions"
								>
									<p
										className="text-sm font-medium"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t("Was this helpful?")}
									</p>
									<ReactionToggle
										targetType="article"
										targetId={article.id}
										initialSummary={article.reaction_summary ?? null}
										variant="stacked"
									/>
								</section>

								{isContentTruncated ? (
									<aside
										className="rounded-2xl border p-5"
										data-testid="reader-content-upgrade-cta"
										style={{
											backgroundColor: "var(--surface-accent-bg)",
											borderColor: "var(--surface-accent-border)",
										}}
									>
										<div className="flex items-start gap-3">
											<span
												className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
												style={{
													backgroundColor: "var(--surface-accent-icon-bg)",
													color: "var(--surface-accent-strong)",
												}}
											>
												<Lock aria-hidden="true" className="h-4 w-4" />
											</span>
											<div className="min-w-0 flex-1">
												<p
													className="text-sm font-semibold"
													style={{ color: "var(--surface-accent-strong)" }}
												>
													{t("Upgrade to read the full article")}
												</p>
												<p
													className="mt-1 text-sm leading-relaxed"
													style={{ color: "var(--surface-accent-copy)" }}
												>
													{t(
														"Basic readers see a 200-character preview. Verified and Premium tiers unlock the full body, source URL, and AI insights.",
													)}
												</p>
												<div className="mt-3">
													<Link
														href={withLocalePath(locale, "/settings")}
														className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors"
														style={{
															backgroundColor: "var(--surface-accent-strong)",
															color: "var(--surface-popover-bg)",
														}}
														data-testid="reader-content-upgrade-button"
													>
														{t("Upgrade plan")}
													</Link>
												</div>
											</div>
										</div>
									</aside>
								) : null}
							</>
						)}
					</article>

					<aside className="hidden xl:block" aria-label={t("AI insights")}>
						<div className="sticky top-32 space-y-4">
							{showAiInsights && aiInsights ? (
								<div data-testid="reader-ai-insights">
									<AiInsightsCard insights={aiInsights} />
								</div>
							) : (
								<div
									className="rounded-2xl border p-5 shadow-popup-card"
									data-testid="reader-ai-upgrade-cta"
									style={{
										backgroundColor: "var(--surface-popover-bg)",
										borderColor: "var(--surface-muted-border)",
									}}
								>
									<header className="flex items-center gap-2">
										<Sparkles
											aria-hidden="true"
											className="h-4 w-4"
											style={{ color: "var(--color-primary-500)" }}
										/>
										<h3
											className="text-sm font-semibold uppercase tracking-[0.12em]"
											style={{ color: "var(--surface-muted-text)" }}
										>
											{t("AI insights")}
										</h3>
									</header>
									<p
										className="mt-3 text-sm leading-relaxed"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{showAiUpgradeHint
											? t(
													"Premium readers see structured summaries, key entities, risk dimensions, and recommended next steps.",
												)
											: t(
													"AI summary, sentiment, and risk insights will appear here when ready.",
												)}
									</p>
									{showAiUpgradeHint ? (
										<div className="mt-3">
											<Link
												href={withLocalePath(locale, "/settings")}
												className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors"
												style={{
													backgroundColor: "var(--color-primary-500)",
													color: "var(--surface-popover-bg)",
												}}
												data-testid="reader-ai-upgrade-button"
											>
												{t("Upgrade plan")}
											</Link>
										</div>
									) : null}
								</div>
							)}

							<div
								className="rounded-2xl border p-5"
								style={{
									backgroundColor: "var(--surface-popover-bg)",
									borderColor: "var(--surface-muted-border)",
								}}
							>
								<header className="flex items-center gap-2">
									<TrendingUp
										aria-hidden="true"
										className="h-4 w-4"
										style={{ color: "var(--color-primary-500)" }}
									/>
									<h3
										className="text-sm font-semibold uppercase tracking-[0.12em]"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t("Reader stats")}
									</h3>
								</header>
								<dl className="mt-3 space-y-2 text-sm">
									<div className="flex items-center justify-between">
										<dt style={{ color: "var(--surface-muted-text)" }}>
											{t("Word count")}
										</dt>
										<dd
											className="font-semibold tabular-nums"
											style={{ color: "var(--auth-copy-primary)" }}
										>
											{markdownSource?.wordCount ?? 0}
										</dd>
									</div>
									<div className="flex items-center justify-between">
										<dt style={{ color: "var(--surface-muted-text)" }}>
											{t("Estimated read")}
										</dt>
										<dd
											className="font-semibold tabular-nums"
											style={{ color: "var(--auth-copy-primary)" }}
										>
											{t("{count} min", { count: minutes })}
										</dd>
									</div>
									<div className="flex items-center justify-between">
										<dt style={{ color: "var(--surface-muted-text)" }}>
											{t("View mode")}
										</dt>
										<dd
											className="inline-flex items-center gap-1 font-semibold"
											style={{ color: "var(--auth-copy-primary)" }}
										>
											<Eye aria-hidden="true" className="h-3.5 w-3.5" />
											{t("Rendered")}
										</dd>
									</div>
								</dl>
							</div>
						</div>
					</aside>
				</div>
			</div>

			<ReadingSettings
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
			/>
		</WideShell>
	);
}
