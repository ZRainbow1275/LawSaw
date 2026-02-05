"use client";

/**
 * Article detail page - immersive reader.
 * Includes: progress bar, TOC navigation, actions, reading settings.
 */

import {
	ArticleActions,
	MobileArticleActions,
} from "@/components/article/article-actions";
import { ArticleContent } from "@/components/article/article-content";
import { ReadingProgress } from "@/components/article/reading-progress";
import { ReadingSettings } from "@/components/article/reading-settings";
import {
	TOCDrawer,
	TableOfContents,
	useTableOfContents,
} from "@/components/article/table-of-contents";
import { ReaderLayout } from "@/components/layout/reader-layout";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty-state";
import { ArticleContentSkeleton } from "@/components/ui/skeleton";
import { useArticle } from "@/hooks/use-articles";
import { type Locale, formatDateTime, t as translate } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useReadingStore, useReadingStyles } from "@/stores/reading-store";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

// ============================================
// Helpers
// ============================================

function formatDate(locale: Locale, dateString: string | null) {
	if (!dateString) return "";
	const date = new Date(dateString);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days === 0) return translate(locale, "Today");
	if (days === 1) return translate(locale, "Yesterday");
	if (days < 7) return translate(locale, "{count} days ago", { count: days });

	return formatDateTime(locale, date, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

function estimateReadingTime(content: string | null): number {
	if (!content) return 0;
	const wordsPerMinute = 400; // Reading speed heuristic
	const textLength = content.replace(/<[^>]*>/g, "").length;
	return Math.max(1, Math.ceil(textLength / wordsPerMinute));
}

// ============================================
// Main
// ============================================

export default function ArticleDetailPage() {
	const params = useParams();
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
	const articleId = params.id as string;
	const contentRef = useRef<HTMLDivElement>(null);

	// State
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [tocDrawerOpen, setTocDrawerOpen] = useState(false);

	// Data
	const { data: article, isLoading, error } = useArticle(articleId);

	// TOC
	const { items: tocItems, activeId } = useTableOfContents(contentRef);

	// Reading settings
	const readingStyles = useReadingStyles();
	const theme = useReadingStore((s) => s.settings.theme);

	// Theme styles
	const themeStyles = {
		light: "bg-white text-neutral-900",
		dark: "bg-[#1A1A1A] text-neutral-100",
		sepia: "bg-[#F4ECD8] text-[#5C4B37]",
	};

	// Loading state
	if (isLoading) {
		return (
			<ReaderLayout>
				<div className="min-h-screen bg-white">
					<div className="mx-auto max-w-2xl px-5 py-12">
						<ArticleContentSkeleton />
					</div>
				</div>
			</ReaderLayout>
		);
	}

	// Error state
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

	return (
		<ReaderLayout>
			{/* Reading progress */}
			<ReadingProgress />

			{/* Container */}
			<div
				className={cn(
					"min-h-screen transition-colors duration-300",
					themeStyles[theme],
				)}
			>
				{/* Top nav */}
				<nav
					className={cn(
						"sticky top-0 z-40 backdrop-blur-sm border-b",
						theme === "dark"
							? "bg-[#1A1A1A]/95 border-neutral-800"
							: theme === "sepia"
								? "bg-[#F4ECD8]/95 border-amber-200"
								: "bg-white/95 border-neutral-100",
					)}
				>
					<div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
						{/* Back */}
						<button
							type="button"
							onClick={() => router.back()}
							className={cn(
								"flex items-center gap-2 text-sm transition-colors",
								theme === "dark"
									? "text-neutral-400 hover:text-neutral-200"
									: "text-neutral-500 hover:text-neutral-900",
							)}
						>
							<ArrowLeft className="h-4 w-4" />
							<span>{t("Back")}</span>
						</button>

						{/* Reading time + source link */}
						<div className="flex items-center gap-4">
							<span
								className={cn(
									"text-xs",
									theme === "dark" ? "text-neutral-500" : "text-neutral-400",
								)}
							>
								{t("About {minutes} minutes", { minutes: readingTime })}
							</span>

							{article.link && (
								<Link
									href={article.link}
									target="_blank"
									rel="noopener noreferrer"
									className={cn(
										"flex items-center gap-1.5 text-sm transition-colors",
										theme === "dark"
											? "text-neutral-400 hover:text-neutral-200"
											: "text-neutral-500 hover:text-neutral-900",
									)}
								>
									<span>{t("Original")}</span>
									<ExternalLink className="h-3.5 w-3.5" />
								</Link>
							)}
						</div>
					</div>
				</nav>

				{/* Main */}
				<div className="relative mx-auto max-w-4xl">
					{/* Desktop: TOC */}
					{tocItems.length > 0 && (
						<div className="hidden xl:block fixed left-8 top-1/2 -translate-y-1/2 z-20">
							<TableOfContents items={tocItems} activeId={activeId} />
						</div>
					)}

					{/* Desktop: actions */}
					<ArticleActions
						articleId={articleId}
						articleTitle={article.title}
						articleUrl={article.link || undefined}
						onOpenSettings={() => setSettingsOpen(true)}
					/>

					{/* Content */}
					<article
						className="mx-auto max-w-2xl px-5 pb-24 lg:pb-20"
						style={readingStyles}
					>
						{/* Header */}
						<header className="pt-10 pb-8 border-b border-current/10">
							<motion.div
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5 }}
							>
								{/* Category */}
								{article.category_id && (
									<div className="mb-4">
										<Badge variant="outline" className="text-xs">
											{t("Article")}
										</Badge>
									</div>
								)}

								{/* Meta */}
								<div
									className={cn(
										"flex items-center gap-2 text-sm mb-4",
										theme === "dark" ? "text-neutral-500" : "text-neutral-400",
									)}
								>
									{article.author && (
										<>
											<span
												className={
													theme === "dark"
														? "text-neutral-300"
														: "text-neutral-600"
												}
											>
												{article.author}
											</span>
											<span>·</span>
										</>
									)}
									<time>{formatDate(locale, article.published_at)}</time>
								</div>

								{/* Title */}
								<h1
									className="text-3xl md:text-4xl font-bold leading-tight tracking-tight"
									style={{ lineHeight: 1.3 }}
								>
									{article.title}
								</h1>

								{/* Summary */}
								{article.summary && (
									<p
										className={cn(
											"mt-6 text-lg leading-relaxed",
											theme === "dark"
												? "text-neutral-400"
												: "text-neutral-500",
										)}
									>
										{article.summary}
									</p>
								)}
							</motion.div>
						</header>

						{/* Body */}
						<motion.div
							ref={contentRef}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ delay: 0.2, duration: 0.5 }}
							className="pt-10"
						>
							<ArticleContent
								content={article.content}
								className={cn(
									"prose prose-lg max-w-none",
									theme === "dark" && "prose-invert",
									theme === "sepia" && "prose-amber",
								)}
							/>
						</motion.div>

						{/* Footer */}
						<footer className="mt-16 pt-8 border-t border-current/10">
							<div className="flex items-center justify-between text-sm">
								<button
									type="button"
									onClick={() => router.back()}
									className={cn(
										"transition-colors",
										theme === "dark"
											? "text-neutral-400 hover:text-neutral-200"
											: "text-neutral-500 hover:text-neutral-900",
									)}
								>
									← {t("Back to list")}
								</button>
								{article.link && (
									<Link
										href={article.link}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary-600 hover:text-primary-700 transition-colors"
									>
										{t("Read original")} →
									</Link>
								)}
							</div>
						</footer>
					</article>
				</div>

				{/* Mobile: bottom actions */}
				<MobileArticleActions
					articleId={articleId}
					onOpenToc={() => setTocDrawerOpen(true)}
					onOpenSettings={() => setSettingsOpen(true)}
					tocItemCount={tocItems.length}
				/>

				{/* Mobile: TOC drawer */}
				<TOCDrawer
					items={tocItems}
					activeId={activeId}
					open={tocDrawerOpen}
					onOpenChange={setTocDrawerOpen}
				/>

				{/* Reading settings */}
				<ReadingSettings
					open={settingsOpen}
					onClose={() => setSettingsOpen(false)}
				/>
			</div>
		</ReaderLayout>
	);
}
