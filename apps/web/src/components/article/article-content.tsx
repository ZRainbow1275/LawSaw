"use client";

import { MarkdownSourceView } from "@/components/article/markdown-source-view";
import type { ArticleViewMode } from "@/components/article/source-view-toggle";
import { renderArticleBodyHtml } from "@/lib/article-reader";
import { useT } from "@/lib/i18n-client";
import { sanitizeRenderedHtml } from "@/lib/safe-html";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface ArticleContentProps {
	content: string | null;
	className?: string;
	viewMode?: ArticleViewMode;
	sourceFileNameHint?: string | null;
}

export function ArticleContent({
	content,
	className,
	viewMode = "rendered",
	sourceFileNameHint,
}: ArticleContentProps) {
	const t = useT();
	const sanitizedContent = useMemo(() => {
		if (!content) return "";
		// This is a Client Component, but Next.js may still perform an initial server render.
		// To avoid emitting un-sanitized HTML during SSR (XSS risk), we render nothing on the
		// server and only inject sanitized HTML on the client using DOMPurify.
		if (typeof window === "undefined") return "";

		const renderedContent = renderArticleBodyHtml(content);
		return sanitizeRenderedHtml(renderedContent);
	}, [content]);

	if (!content) {
		return (
			<div className="flex items-center justify-center py-12 text-[var(--surface-muted-text)]">
				<p>{t("No content available")}</p>
			</div>
		);
	}

	if (viewMode === "source") {
		return (
			<MarkdownSourceView
				content={content}
				fileNameHint={sourceFileNameHint}
				className={className}
			/>
		);
	}

	return (
		<article
			className={cn(
				// Base typography
				"prose max-w-none prose-legal prose-reader",
				// Headings
				"prose-headings:font-semibold",
				"prose-headings:tracking-tight prose-headings:scroll-mt-20",
				"prose-h1:text-2xl prose-h1:mb-6",
				"prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b",
				"prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3",
				// Paragraphs
				"prose-p:leading-[1.85] prose-p:mb-6",
				// Links
				"prose-a:no-underline prose-a:font-medium hover:prose-a:underline",
				// Emphasis
				"prose-strong:font-semibold",
				// Blockquotes
				"prose-blockquote:border-l-[3px] prose-blockquote:py-4 prose-blockquote:px-5",
				"prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:my-8",
				// Code
				"prose-code:px-1.5 prose-code:py-0.5",
				"prose-code:rounded-md prose-code:text-sm prose-code:font-mono",
				"prose-code:before:content-none prose-code:after:content-none",
				"prose-pre:rounded-xl",
				// Images
				"prose-img:rounded-xl prose-img:shadow-card prose-img:mx-auto",
				"prose-figure:my-8",
				"prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:mt-3",
				// Tables
				"prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden",
				"prose-th:p-3 prose-th:text-left prose-th:font-semibold",
				"prose-td:p-3 prose-td:border-t",
				// Divider
				"prose-hr:my-10",
				// Lists
				"prose-ul:list-disc prose-ol:list-decimal",
				"prose-li:leading-relaxed prose-li:my-2",
				// Embedded media
				"[&_img]:max-w-full [&_img]:h-auto",
				// Special styles
				"[&_.legal-clause]:pl-4 [&_.legal-clause]:border-l-2 [&_.legal-clause]:border-[var(--surface-accent-border)]",
				"[&_.risk-highlight]:rounded [&_.risk-highlight]:bg-[var(--surface-accent-bg)] [&_.risk-highlight]:px-1 [&_.risk-highlight]:text-[var(--field-foreground)]",
				className,
			)}
			suppressHydrationWarning
			// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized with DOMPurify on the client; SSR emits empty content to avoid XSS.
			dangerouslySetInnerHTML={{ __html: sanitizedContent }}
		/>
	);
}
