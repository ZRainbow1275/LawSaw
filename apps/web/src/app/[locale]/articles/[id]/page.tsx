"use client";

/**
 * Article detail page - immersive reader.
 * Includes: progress bar, TOC navigation, actions, reading settings.
 */

import { AiInsightsCard } from "@/components/article/ai-insights";
import {
	ArticleActions,
	MobileArticleActions,
} from "@/components/article/article-actions";
import { ArticleContent } from "@/components/article/article-content";
import { ParagraphAnchor } from "@/components/article/paragraph-anchor";
import { ReadingProgress } from "@/components/article/reading-progress";
import { ReadingSettings } from "@/components/article/reading-settings";
import { SelectionToolbar } from "@/components/article/selection-toolbar";
import {
	type ArticleViewMode,
	SourceViewToggle,
} from "@/components/article/source-view-toggle";
import {
	TOCDrawer,
	type TOCItem,
	TableOfContents,
	useTableOfContents,
} from "@/components/article/table-of-contents";
import { ReaderLayout } from "@/components/layout/reader-layout";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { ArticleContentSkeleton } from "@/components/ui/skeleton";
import { useArticle, usePublishArticle } from "@/hooks/use-articles";
import { useAuthzDecision } from "@/hooks/use-authz";
import {
	isArticleBodyTruncated,
	normalizeArticleAiInsights,
} from "@/lib/api/types";
import {
	formatArticlePublishedAtLabel,
	parseArticlePublishedAt,
} from "@/lib/article-reader";
import {
	type RoleTier,
	hasPermission,
	isRoleTierAtLeast,
	roleTierLabelKey,
} from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import {
	type ReadingTheme,
	useReadingStore,
	useReadingStyles,
} from "@/stores/reading-store";
import { useToast } from "@/stores/toast-store";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Loader2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
	type CSSProperties,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";

function estimateReadingTime(content: string | null): number {
	if (!content) return 0;
	const wordsPerMinute = 400;
	const textLength = content.replace(/<[^>]*>/g, "").length;
	return Math.max(1, Math.ceil(textLength / wordsPerMinute));
}

function sourceVisibilityLabel(
	t: ReturnType<typeof useT>,
	visibility: "hidden" | "summary" | "full",
) {
	switch (visibility) {
		case "full":
			return t("Full source access");
		case "summary":
			return t("Summary source access");
		default:
			return t("Restricted source access");
	}
}

function sourceVisibilityDescription(
	t: ReturnType<typeof useT>,
	visibility: "hidden" | "summary" | "full",
) {
	switch (visibility) {
		case "full":
			return t(
				"This reader can inspect full source metadata, original URL, and operational health.",
			);
		case "summary":
			return t(
				"This reader can see the source label, but operational metadata and original URL remain hidden.",
			);
		default:
			return t(
				"This article can be read, but its source metadata is restricted by policy.",
			);
	}
}

function sourceTypeLabelKey(sourceType: string): string {
	switch (sourceType.trim().toLowerCase()) {
		case "rss":
			return "RSS feed";
		case "api":
			return "API endpoint";
		case "spider":
			return "Web crawler";
		default:
			return "Web crawler";
	}
}

function sourceHealthStatusLabelKey(status: string): string {
	switch (status.trim().toLowerCase()) {
		case "healthy":
			return "Healthy";
		case "degraded":
			return "Degraded";
		case "unhealthy":
			return "Unhealthy";
		case "unknown":
			return "Unknown";
		default:
			return "Unknown status";
	}
}

function sourcePolicyRoleTierLabel(
	t: ReturnType<typeof useT>,
	roleTier: string | null | undefined,
): string {
	switch (roleTier) {
		case "super_admin":
		case "tenant_admin":
		case "premium_user":
		case "verified_user":
		case "basic_user":
			return t(roleTierLabelKey(roleTier as RoleTier));
		default:
			return t("Unknown role tier");
	}
}

type ReaderPageTone = {
	scopeStyle: CSSProperties;
	cardStyle: CSSProperties;
	panelStyle: CSSProperties;
	metaCardStyle: CSSProperties;
	titleStyle: CSSProperties;
	bodyStyle: CSSProperties;
	mutedStyle: CSSProperties;
	subtleStyle: CSSProperties;
	navStyle: CSSProperties;
	actionStyle: CSSProperties;
	actionHoverClassName: string;
	strongTextStyle: CSSProperties;
	footerLinkStyle: CSSProperties;
	footerLinkHoverClassName: string;
};

const readerInlineChipClassName =
	"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors";

const readerInlineButtonClassName =
	"inline-flex h-8 appearance-none items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-[filter,transform] hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:pointer-events-none disabled:opacity-50";

const readerMutedChipStyle = {
	borderColor: "var(--surface-muted-border)",
	backgroundColor: "transparent",
	color: "var(--surface-muted-text)",
} as const;

const readerAccentChipStyle = {
	borderColor: "var(--surface-accent-border)",
	backgroundColor: "var(--surface-accent-bg)",
	color: "var(--surface-accent-strong)",
} as const;

const readerAccentOutlineChipStyle = {
	borderColor: "var(--surface-accent-border)",
	backgroundColor: "transparent",
	color: "var(--surface-accent-strong)",
} as const;

const readerInlineButtonStyle = {
	...readerAccentChipStyle,
	boxShadow: "none",
} as const;

function sourceVisibilityChipStyle(
	visibility: "hidden" | "summary" | "full",
): CSSProperties {
	switch (visibility) {
		case "full":
			return readerAccentChipStyle;
		case "summary":
			return readerAccentOutlineChipStyle;
		default:
			return readerMutedChipStyle;
	}
}

function getReaderPageTone(theme: ReadingTheme): ReaderPageTone {
	if (theme === "sepia") {
		return {
			scopeStyle: {
				backgroundColor: "#F4ECD8",
				color: "#5C4B37",
				"--surface-muted-bg": "color-mix(in srgb, #F4ECD8 88%, white 12%)",
				"--surface-muted-border":
					"color-mix(in srgb, #E5C896 88%, transparent)",
				"--surface-muted-text": "#8B735A",
				"--surface-accent-bg":
					"color-mix(in srgb, var(--color-primary-50) 82%, #F4ECD8 18%)",
				"--surface-accent-border":
					"color-mix(in srgb, var(--color-primary-700) 22%, transparent)",
				"--surface-accent-strong": "var(--color-primary-700)",
				"--field-foreground": "#5C4B37",
				"--control-hover-bg": "color-mix(in srgb, #E5C896 26%, #F4ECD8 74%)",
				"--reading-link-hover":
					"color-mix(in srgb, var(--color-primary-700) 84%, #5C4B37 16%)",
				"--reading-inline-code-bg":
					"color-mix(in srgb, #E5C896 26%, #F4ECD8 74%)",
				"--reading-inline-code-text": "#6E5A43",
				"--reading-pre-bg": "#3B2F25",
				"--reading-pre-code": "#F7EEDC",
			} as CSSProperties,
			cardStyle: {
				borderColor: "var(--surface-muted-border)",
				backgroundColor: "var(--surface-muted-bg)",
				color: "var(--field-foreground)",
			},
			panelStyle: {
				borderColor: "var(--surface-muted-border)",
				backgroundColor:
					"color-mix(in srgb, var(--surface-muted-bg) 84%, white 16%)",
			},
			metaCardStyle: {
				borderColor: "var(--surface-muted-border)",
				backgroundColor:
					"color-mix(in srgb, var(--surface-muted-bg) 84%, white 16%)",
				color: "var(--field-foreground)",
			},
			titleStyle: { color: "var(--field-foreground)" },
			bodyStyle: { color: "#6E5A43" },
			mutedStyle: { color: "var(--surface-muted-text)" },
			subtleStyle: { color: "#9C8368" },
			navStyle: {
				borderColor: "var(--surface-muted-border)",
				backgroundColor:
					"color-mix(in srgb, var(--surface-muted-bg) 76%, #E5C896 24%)",
			},
			actionStyle: { color: "var(--surface-muted-text)" },
			actionHoverClassName: "hover:text-[var(--surface-accent-strong)]",
			strongTextStyle: { color: "#6E5A43" },
			footerLinkStyle: { color: "var(--surface-accent-strong)" },
			footerLinkHoverClassName: "hover:text-[var(--surface-accent-strong)]",
		};
	}

	const isDark = theme === "dark";
	return {
		scopeStyle: {
			backgroundColor: isDark ? "#111114" : "#FFFFFF",
			color: isDark
				? "color-mix(in srgb, white 96%, transparent)"
				: "var(--surface-card-foreground)",
			"--surface-muted-bg": isDark
				? "color-mix(in srgb, var(--surface-card-foreground) 92%, transparent)"
				: "color-mix(in srgb, white 92%, transparent)",
			"--surface-muted-border": isDark
				? "color-mix(in srgb, var(--surface-card-muted-fg) 80%, transparent)"
				: "color-mix(in srgb, var(--surface-card-border-strong) 80%, transparent)",
			"--surface-muted-text": isDark
				? "color-mix(in srgb, white 82%, var(--surface-card-border-strong) 18%)"
				: "var(--surface-card-muted-fg)",
			"--surface-accent-bg": isDark
				? "color-mix(in srgb, var(--color-primary-900) 34%, var(--surface-card-foreground) 66%)"
				: "color-mix(in srgb, var(--color-primary-50) 72%, white 28%)",
			"--surface-accent-border": isDark
				? "color-mix(in srgb, var(--color-primary-500) 28%, transparent)"
				: "color-mix(in srgb, var(--color-primary-200) 72%, transparent)",
			"--surface-accent-strong": isDark
				? "color-mix(in srgb, var(--color-primary-300) 88%, white 12%)"
				: "var(--color-primary-700)",
			"--field-foreground": isDark
				? "color-mix(in srgb, white 96%, transparent)"
				: "var(--surface-card-foreground)",
			"--control-hover-bg": isDark
				? "color-mix(in srgb, var(--surface-card-foreground) 92%, transparent)"
				: "color-mix(in srgb, var(--surface-card-subtle-bg) 92%, white 8%)",
			"--reading-link-hover": isDark
				? "color-mix(in srgb, var(--color-primary-200) 88%, white 12%)"
				: "var(--color-primary-700)",
			"--reading-inline-code-bg": isDark
				? "color-mix(in srgb, var(--surface-card-foreground) 92%, transparent)"
				: "color-mix(in srgb, var(--surface-card-subtle-bg) 92%, white 8%)",
			"--reading-inline-code-text": isDark
				? "var(--field-foreground)"
				: "var(--surface-card-foreground)",
			"--reading-pre-bg": isDark
				? "color-mix(in srgb, black 96%, var(--surface-card-foreground) 4%)"
				: "#18181B",
			"--reading-pre-code": isDark ? "var(--field-foreground)" : "#F4F4F5",
		} as CSSProperties,
		cardStyle: {
			borderColor: "var(--surface-muted-border)",
			backgroundColor: "var(--surface-muted-bg)",
			color: "var(--field-foreground)",
		},
		panelStyle: {
			borderColor: "var(--surface-muted-border)",
			backgroundColor: "var(--control-hover-bg)",
		},
		metaCardStyle: {
			borderColor: "var(--surface-muted-border)",
			backgroundColor: "var(--surface-muted-bg)",
			color: "var(--surface-muted-text)",
		},
		titleStyle: { color: "var(--field-foreground)" },
		bodyStyle: {
			color: isDark
				? "color-mix(in srgb, white 90%, var(--surface-card-border-strong) 10%)"
				: "var(--surface-card-muted-fg)",
		},
		mutedStyle: { color: "var(--surface-muted-text)" },
		subtleStyle: {
			color: isDark
				? "color-mix(in srgb, white 64%, var(--surface-card-faint-fg) 36%)"
				: "var(--surface-card-muted-fg)",
		},
		navStyle: {
			borderColor: "var(--surface-muted-border)",
			backgroundColor: isDark
				? "color-mix(in srgb, black 95%, var(--surface-card-foreground) 5%)"
				: "color-mix(in srgb, white 95%, transparent)",
		},
		actionStyle: { color: "var(--surface-muted-text)" },
		actionHoverClassName: "hover:text-[var(--field-foreground)]",
		strongTextStyle: { color: "var(--field-foreground)" },
		footerLinkStyle: { color: "var(--surface-accent-strong)" },
		footerLinkHoverClassName: "hover:text-[var(--surface-accent-strong)]",
	};
}

export default function ArticleDetailPage() {
	const params = useParams();
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
	const articleId = params.id as string;
	const contentRef = useRef<HTMLDivElement>(null);
	const permissions = useAuthStore((s) => s.permissions);
	const roleTier = useAuthStore((s) => s.roleTier);
	const { success: toastSuccess, error: toastError } = useToast();

	const [settingsOpen, setSettingsOpen] = useState(false);
	const [tocDrawerOpen, setTocDrawerOpen] = useState(false);
	const [viewMode, setViewMode] = useState<ArticleViewMode>("rendered");

	const { data: article, isLoading, error } = useArticle(articleId);
	const readDecision = useAuthzDecision("article", articleId, "articles:read");
	const writeDecision = useAuthzDecision(
		"article",
		articleId,
		"articles:write",
	);
	const publishDecision = useAuthzDecision(
		"article",
		articleId,
		"articles:publish",
	);
	const publishArticle = usePublishArticle();
	const readingStyles = useReadingStyles();
	const theme = useReadingStore((s) => s.settings.theme);
	const aiInsights = useMemo(
		() => (article ? normalizeArticleAiInsights(article) : null),
		[article],
	);
	const canReadArticle =
		readDecision.data?.allow ?? hasPermission(permissions, "articles:read");
	const canWriteArticle =
		writeDecision.data?.allow ?? hasPermission(permissions, "articles:write");
	const canPublishArticle =
		publishDecision.data?.allow ??
		hasPermission(permissions, "articles:publish");
	const isPremiumOrAbove = isRoleTierAtLeast(roleTier, "premium_user");
	const isVerifiedOrAbove = isRoleTierAtLeast(roleTier, "verified_user");
	const isBasicTier = !isVerifiedOrAbove;
	const showAiInsights = Boolean(aiInsights) && isPremiumOrAbove;
	const isContentTruncated =
		isBasicTier && isArticleBodyTruncated(article?.content ?? null);
	const showAiUpgradeHint = !isPremiumOrAbove;
	const readerTocItems = useMemo(() => {
		const items: TOCItem[] = [
			{
				id: "article-overview-section",
				text: t("Overview"),
				level: 1 as const,
			},
			{
				id: "article-source-section",
				text: t("Source visibility"),
				level: 1 as const,
			},
		];

		if (showAiInsights) {
			items.push({
				id: "article-ai-section",
				text: t("AI insights"),
				level: 1 as const,
			});
		}

		items.push({
			id: "article-body-section",
			text: t("Article"),
			level: 1 as const,
			observe: false,
		});
		return items;
	}, [showAiInsights, t]);
	const {
		items: tocItems,
		activeId,
		setActiveId,
	} = useTableOfContents(contentRef, readerTocItems, article?.content ?? null);
	const readerTone = getReaderPageTone(theme);

	const handleSelectionHighlight = useCallback(
		(_selectedText: string, range: Range) => {
			const resolveBlock = (node: Node) => {
				const element = node instanceof Element ? node : node.parentElement;
				return element?.closest("p, li, blockquote") ?? null;
			};

			try {
				const startBlock = resolveBlock(range.startContainer);
				const endBlock = resolveBlock(range.endContainer);
				const commonAncestor =
					range.commonAncestorContainer instanceof Element
						? range.commonAncestorContainer
						: range.commonAncestorContainer.parentElement;

				if (!startBlock || !endBlock || startBlock !== endBlock) {
					toastError(t("Highlight"), t("Operation failed"));
					window.getSelection()?.removeAllRanges();
					return false;
				}

				if (commonAncestor?.closest("mark.risk-highlight")) {
					window.getSelection()?.removeAllRanges();
					return false;
				}

				const fragment = range.extractContents();
				if (!fragment.textContent?.trim()) {
					window.getSelection()?.removeAllRanges();
					return false;
				}

				const highlight = document.createElement("mark");
				highlight.className = "risk-highlight";
				highlight.appendChild(fragment);
				range.insertNode(highlight);
				window.getSelection()?.removeAllRanges();
				return true;
			} catch {
				toastError(t("Highlight"), t("Operation failed"));
				window.getSelection()?.removeAllRanges();
				return false;
			}
		},
		[t, toastError],
	);

	if (isLoading) {
		return (
			<ReaderLayout>
				<div className="min-h-screen" style={readerTone.scopeStyle}>
					<div className="mx-auto max-w-2xl px-5 py-12">
						<ArticleContentSkeleton />
					</div>
				</div>
			</ReaderLayout>
		);
	}

	if (readDecision.data && !canReadArticle) {
		return (
			<ReaderLayout>
				<div
					className="flex min-h-screen items-center justify-center px-5"
					style={readerTone.scopeStyle}
				>
					<div
						className="max-w-lg rounded-3xl border p-6 shadow-sm"
						style={readerTone.cardStyle}
					>
						<h1 className="text-lg font-semibold" style={readerTone.titleStyle}>
							{t("You don't have permission to access this resource.")}
						</h1>
						<p className="mt-2 text-sm" style={readerTone.mutedStyle}>
							{t("You do not have permission to read this article.")}
						</p>
						<div className="mt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => router.back()}
							>
								{t("Go back")}
							</Button>
						</div>
					</div>
				</div>
			</ReaderLayout>
		);
	}

	if (error || !article) {
		return (
			<ReaderLayout>
				<div className="flex min-h-screen items-center justify-center">
					<ErrorState
						action={{
							label: t("Go back"),
							onClick: () => router.back(),
						}}
					/>
				</div>
			</ReaderLayout>
		);
	}

	const readingTime = estimateReadingTime(article.content);
	const fallbackSourceLink =
		article.link && article.link.length > 0 ? article.link : null;
	const sourceView = article.source_view ?? null;
	const sourceVisibility =
		sourceView?.visibility ?? (fallbackSourceLink ? "full" : "hidden");
	const sourceViewUrl =
		sourceView?.original_url ??
		(sourceView == null ? fallbackSourceLink : null);
	const sourceLabel =
		sourceView?.source_name || sourceView?.source_ref || t("Unknown source");
	const sourceDescription = sourceVisibilityDescription(t, sourceVisibility);
	const sourcePolicy = sourceView?.policy;
	const publishedAtDate = parseArticlePublishedAt(article.published_at);
	const publishedAtLabel = formatArticlePublishedAtLabel(
		locale,
		publishedAtDate,
	);
	const canTriggerPublish =
		canPublishArticle &&
		article.version != null &&
		article.status !== "published" &&
		article.status !== "archived";

	const handlePublish = () => {
		if (article.version == null) {
			toastError(t("Publish"), t("Operation failed"));
			return;
		}

		publishArticle.mutate(
			{ id: article.id, version: article.version },
			{
				onSuccess: () => {
					toastSuccess(t("Published"));
				},
				onError: (cause) => {
					const message =
						cause instanceof Error ? cause.message : t("Operation failed");
					toastError(t("Publish"), message);
				},
			},
		);
	};

	return (
		<ReaderLayout>
			<ReadingProgress articleId={articleId} />

			<div
				className="min-h-screen transition-colors duration-300"
				style={readerTone.scopeStyle}
			>
				<nav
					className="sticky top-0 z-40 border-b backdrop-blur-sm"
					style={readerTone.navStyle}
				>
					<div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
						<button
							type="button"
							onClick={() => router.back()}
							className={cn(
								"flex items-center gap-2 text-sm transition-colors",
								readerTone.actionHoverClassName,
							)}
							style={readerTone.actionStyle}
						>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
							<span>{t("Back")}</span>
						</button>

						<div className="flex items-center gap-4">
							<span className="text-xs" style={readerTone.subtleStyle}>
								{t("About {minutes} minutes", { minutes: readingTime })}
							</span>

							<SourceViewToggle
								mode={viewMode}
								onChange={setViewMode}
								disabled={!article.content}
							/>

							{sourceViewUrl ? (
								<Link
									href={sourceViewUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={cn(
										"flex items-center gap-1.5 text-sm transition-colors",
										readerTone.actionHoverClassName,
									)}
									style={readerTone.actionStyle}
								>
									<span>{t("Original")}</span>
									<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
								</Link>
							) : (
								<span className="text-sm" style={readerTone.subtleStyle}>
									{t("Source metadata is hidden by policy")}
								</span>
							)}
						</div>
					</div>
				</nav>

				<div className="relative mx-auto max-w-4xl">
					{tocItems.length > 0 && (
						<div
							className="fixed left-8 top-1/2 z-20 hidden -translate-y-1/2 min-[1400px]:block"
							data-testid="article-reader-toc"
						>
							<TableOfContents
								items={tocItems}
								activeId={activeId}
								onItemClick={setActiveId}
							/>
						</div>
					)}

					<ArticleActions
						articleId={articleId}
						articleTitle={article.title}
						articleUrl={sourceViewUrl || undefined}
						onOpenSettings={() => setSettingsOpen(true)}
					/>

					<article
						className="mx-auto px-5 pb-24 lg:pb-20"
						style={{ ...readingStyles, maxWidth: "var(--reading-content-width, 42rem)" }}
					>
						<header
							className="border-b border-current/10 pb-8 pt-10"
							id="article-overview-section"
						>
							<motion.div
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5 }}
							>
								{article.category_id && (
									<div className="mb-4">
										<span
											className={readerInlineChipClassName}
											style={readerMutedChipStyle}
										>
											{t("Article")}
										</span>
									</div>
								)}

								<div
									className="mb-4 flex items-center gap-2 text-sm"
									style={readerTone.subtleStyle}
								>
									{article.author ? (
										<span style={readerTone.strongTextStyle}>
											{article.author}
										</span>
									) : null}
									{article.author && publishedAtLabel ? <span>·</span> : null}
									{publishedAtLabel ? (
										<time dateTime={publishedAtDate?.toISOString()}>
											{publishedAtLabel}
										</time>
									) : null}
								</div>

								<h1
									className="text-3xl font-bold leading-tight tracking-tight md:text-4xl"
									style={{ ...readerTone.titleStyle, lineHeight: 1.3 }}
								>
									{article.title}
								</h1>

								{article.summary && (
									<p
										className="mt-6 text-lg leading-relaxed"
										style={readerTone.mutedStyle}
									>
										{article.summary}
									</p>
								)}

								<div
									className="mt-6 rounded-3xl border p-5"
									style={readerTone.panelStyle}
									data-testid="article-access-summary"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span
											className={readerInlineChipClassName}
											style={
												canWriteArticle
													? readerAccentChipStyle
													: readerMutedChipStyle
											}
										>
											{canWriteArticle
												? t("Manage article")
												: t("Read-only access")}
										</span>
										{showAiUpgradeHint ? (
											<span
												className={readerInlineChipClassName}
												data-testid="article-ai-insights-locked"
												style={readerMutedChipStyle}
											>
												{t("AI insights are hidden for the current role tier.")}
											</span>
										) : null}
									</div>
									<p className="mt-3 text-sm" style={readerTone.mutedStyle}>
										{canWriteArticle || canPublishArticle
											? t(
													"Use the controls below to continue the article workflow.",
												)
											: t(
													"You can read this article, but editing and publishing stay gated by ReBAC.",
												)}
									</p>
									<div className="mt-4 flex flex-wrap gap-3">
										{canWriteArticle ? (
											<Link
												href={withLocalePath(locale, "/data")}
												className={readerInlineButtonClassName}
												style={readerInlineButtonStyle}
												data-testid="article-manage-button"
											>
												{t("Manage article")}
											</Link>
										) : null}
										<button
											type="button"
											onClick={handlePublish}
											disabled={!canTriggerPublish || publishArticle.isPending}
											title={
												!canPublishArticle
													? t("Article publish permission required")
													: undefined
											}
											className={readerInlineButtonClassName}
											style={readerInlineButtonStyle}
											data-testid="article-publish-button"
										>
											{publishArticle.isPending ? (
												<Loader2
													aria-hidden="true"
													className="h-4 w-4 animate-spin"
												/>
											) : null}
											{t("Publish")}
										</button>
									</div>
								</div>

								<div
									id="article-source-section"
									data-testid="article-source-card"
									className="mt-8 rounded-3xl border p-5"
									style={readerTone.panelStyle}
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p
												className="text-sm font-semibold"
												style={readerTone.titleStyle}
											>
												{t("Source visibility")}
											</p>
											<p className="mt-1 text-sm" style={readerTone.mutedStyle}>
												{sourceDescription}
											</p>
										</div>
										<span
											className={readerInlineChipClassName}
											style={sourceVisibilityChipStyle(sourceVisibility)}
										>
											{sourceVisibilityLabel(t, sourceVisibility)}
										</span>
									</div>

									<div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
										<div
											className="rounded-2xl px-4 py-3 shadow-sm"
											style={readerTone.metaCardStyle}
										>
											<p
												className="text-xs uppercase tracking-wide"
												style={readerTone.subtleStyle}
											>
												{t("Source label")}
											</p>
											<p
												className="mt-1 font-medium"
												style={readerTone.bodyStyle}
											>
												{sourceLabel}
											</p>
										</div>
										<div
											className="rounded-2xl px-4 py-3 shadow-sm"
											style={readerTone.metaCardStyle}
										>
											<p
												className="text-xs uppercase tracking-wide"
												style={readerTone.subtleStyle}
											>
												{t("Source type")}
											</p>
											<p
												className="mt-1 font-medium"
												style={readerTone.bodyStyle}
											>
												{sourceView?.source_type
													? t(sourceTypeLabelKey(sourceView.source_type))
													: t("Policy controlled")}
											</p>
										</div>
										{sourceView?.health_status ? (
											<div
												className="rounded-2xl px-4 py-3 shadow-sm"
												style={readerTone.metaCardStyle}
											>
												<p
													className="text-xs uppercase tracking-wide"
													style={readerTone.subtleStyle}
												>
													{t("Health status")}
												</p>
												<p
													className="mt-1 font-medium"
													style={readerTone.bodyStyle}
												>
													{t(
														sourceHealthStatusLabelKey(
															sourceView.health_status,
														),
													)}
												</p>
											</div>
										) : null}
										{sourceView?.schedule ? (
											<div
												className="rounded-2xl px-4 py-3 shadow-sm"
												style={readerTone.metaCardStyle}
											>
												<p
													className="text-xs uppercase tracking-wide"
													style={readerTone.subtleStyle}
												>
													{t("Refresh schedule")}
												</p>
												<p
													className="mt-1 font-medium"
													style={readerTone.bodyStyle}
												>
													{sourceView.schedule}
												</p>
											</div>
										) : null}
										{sourceView?.source_ref ? (
											<div
												className="rounded-2xl px-4 py-3 shadow-sm sm:col-span-2"
												style={readerTone.metaCardStyle}
											>
												<p
													className="text-xs uppercase tracking-wide"
													style={readerTone.subtleStyle}
												>
													{t("Source reference")}
												</p>
												<p
													className="mt-1 font-medium"
													style={readerTone.bodyStyle}
												>
													{sourceView.source_ref}
												</p>
											</div>
										) : null}
									</div>

									{sourcePolicy ? (
										<div
											className="mt-4 flex flex-wrap gap-2 text-xs"
											style={readerTone.mutedStyle}
										>
											<span
												className={readerInlineChipClassName}
												style={readerMutedChipStyle}
											>
												{t("Role tier")}:{" "}
												{sourcePolicyRoleTierLabel(t, sourcePolicy.role_tier)}
											</span>
											{sourcePolicy.matched_relation ? (
												<span
													className={readerInlineChipClassName}
													style={readerMutedChipStyle}
												>
													{t("Matched relation")}:{" "}
													{sourcePolicy.matched_relation}
												</span>
											) : null}
											{sourcePolicy.matched_subject ? (
												<span
													className={readerInlineChipClassName}
													style={readerMutedChipStyle}
												>
													{t("Matched subject")}: {sourcePolicy.matched_subject}
												</span>
											) : null}
										</div>
									) : null}
								</div>

								{showAiInsights ? (
									<div
										className="mt-6"
										data-testid="article-ai-insights"
										id="article-ai-section"
									>
										<AiInsightsCard insights={aiInsights} />
									</div>
								) : null}
							</motion.div>
						</header>

						<motion.div
							ref={contentRef}
							id="article-body-section"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ delay: 0.2, duration: 0.5 }}
							className="relative pt-10"
							data-testid="article-reader-content"
						>
							<ArticleContent
								content={article.content}
								viewMode={viewMode}
								sourceFileNameHint={article.title}
								className={
									viewMode === "rendered"
										? cn(
												"prose prose-lg max-w-none",
												theme === "dark" && "prose-invert",
												theme === "sepia" && "prose-amber",
											)
										: undefined
								}
							/>
							{viewMode === "rendered" ? (
								<>
									<ParagraphAnchor key={article.id} containerRef={contentRef} />
									<SelectionToolbar
										containerRef={contentRef}
										onHighlight={handleSelectionHighlight}
									/>
								</>
							) : null}
						</motion.div>

						{isContentTruncated ? (
							<aside
								className="mt-10 rounded-3xl border p-6"
								style={readerTone.panelStyle}
								data-testid="article-content-upgrade-cta"
							>
								<div className="flex items-start gap-3">
									<span
										className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
										style={readerAccentChipStyle}
									>
										<Lock aria-hidden="true" className="h-4 w-4" />
									</span>
									<div className="min-w-0 flex-1">
										<p
											className="text-sm font-semibold"
											style={readerTone.titleStyle}
										>
											{t("Upgrade to read the full article")}
										</p>
										<p className="mt-1 text-sm" style={readerTone.mutedStyle}>
											{t(
												"Basic readers see a 200-character preview. Verified and Premium tiers unlock the full body, source URL, and AI insights.",
											)}
										</p>
										<div className="mt-4">
											<Link
												href={withLocalePath(locale, "/settings")}
												className={readerInlineButtonClassName}
												style={readerInlineButtonStyle}
												data-testid="article-content-upgrade-button"
											>
												{t("Upgrade plan")}
											</Link>
										</div>
									</div>
								</div>
							</aside>
						) : null}

						{showAiUpgradeHint && !isContentTruncated ? (
							<aside
								className="mt-10 rounded-3xl border p-6"
								style={readerTone.panelStyle}
								data-testid="article-ai-upgrade-cta"
							>
								<div className="flex items-start gap-3">
									<span
										className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
										style={readerAccentChipStyle}
									>
										<Sparkles aria-hidden="true" className="h-4 w-4" />
									</span>
									<div className="min-w-0 flex-1">
										<p
											className="text-sm font-semibold"
											style={readerTone.titleStyle}
										>
											{t("Upgrade to view AI deep-dive insights")}
										</p>
										<p className="mt-1 text-sm" style={readerTone.mutedStyle}>
											{t(
												"Premium readers see structured summaries, key entities, risk dimensions, and recommended next steps.",
											)}
										</p>
										<div className="mt-4">
											<Link
												href={withLocalePath(locale, "/settings")}
												className={readerInlineButtonClassName}
												style={readerInlineButtonStyle}
												data-testid="article-ai-upgrade-button"
											>
												{t("Upgrade plan")}
											</Link>
										</div>
									</div>
								</div>
							</aside>
						) : null}

						<footer className="mt-16 border-t border-current/10 pt-8">
							<div className="flex items-center justify-between text-sm">
								<button
									type="button"
									onClick={() => router.back()}
									className={cn(
										"transition-colors",
										readerTone.actionHoverClassName,
									)}
									style={readerTone.actionStyle}
								>
									← {t("Back to list")}
								</button>
								{sourceViewUrl ? (
									<Link
										href={sourceViewUrl}
										target="_blank"
										rel="noopener noreferrer"
										className={cn(
											"transition-colors",
											readerTone.footerLinkHoverClassName,
										)}
										style={readerTone.footerLinkStyle}
									>
										{t("Read original")} →
									</Link>
								) : (
									<span style={readerTone.subtleStyle}>
										{t("Source metadata is hidden by policy")}
									</span>
								)}
							</div>
						</footer>
					</article>
				</div>

				<MobileArticleActions
					articleId={articleId}
					articleTitle={article.title}
					articleUrl={sourceViewUrl || undefined}
					onOpenToc={() => setTocDrawerOpen(true)}
					onOpenSettings={() => setSettingsOpen(true)}
					tocItemCount={tocItems.length}
				/>

				<TOCDrawer
					items={tocItems}
					activeId={activeId}
					onItemClick={setActiveId}
					open={tocDrawerOpen}
					onOpenChange={setTocDrawerOpen}
				/>

				<ReadingSettings
					open={settingsOpen}
					onClose={() => setSettingsOpen(false)}
				/>
			</div>
		</ReaderLayout>
	);
}
