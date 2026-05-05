"use client";

import * as React from "react";

import { renderArticleBodyHtml } from "@/lib/article-reader";
import { useT } from "@/lib/i18n-client";
import { sanitizeRenderedHtml } from "@/lib/safe-html";
import { cn } from "@/lib/utils";

interface MarkdownReaderProps {
	/** Markdown source. Empty / null renders the empty state. */
	markdown: string | null | undefined;
	/** When true, renders the raw markdown in a `<pre>` instead of the rendered HTML. */
	sourceVisible?: boolean;
	className?: string;
}

/**
 * Read-only markdown surface for admin / authoring previews.
 *
 * Re-uses the project-wide rendering pipeline:
 *   markdown → renderArticleBodyHtml → sanitizeRenderedHtml (DOMPurify, client-only)
 *
 * No new runtime dependencies. The rendered branch mirrors `<ArticleContent>`'s
 * SSR-blank discipline: the server emits empty content and the client injects
 * sanitized HTML on hydration.
 */
export function MarkdownReader({
	markdown,
	sourceVisible = false,
	className,
}: MarkdownReaderProps) {
	const t = useT();

	const sanitized = React.useMemo(() => {
		if (!markdown) return "";
		if (typeof window === "undefined") return "";
		return sanitizeRenderedHtml(renderArticleBodyHtml(markdown));
	}, [markdown]);

	if (!markdown || markdown.trim().length === 0) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-2xl border py-10 text-sm",
					className,
				)}
				style={{
					borderColor: "var(--surface-muted-border)",
					backgroundColor: "var(--surface-muted-bg)",
					color: "var(--surface-muted-text)",
				}}
				aria-label={t("No content available")}
			>
				<p>{t("No content available")}</p>
			</div>
		);
	}

	if (sourceVisible) {
		return (
			<pre
				className={cn(
					"rounded-2xl border p-4 font-mono text-sm leading-[1.7] whitespace-pre-wrap break-words",
					className,
				)}
				style={{
					borderColor: "var(--surface-muted-border)",
					backgroundColor: "var(--surface-muted-bg)",
					color: "var(--field-foreground)",
				}}
				data-testid="markdown-reader-source"
				aria-label={t("Markdown source")}
			>
				<code>{markdown}</code>
			</pre>
		);
	}

	return (
		<article
			className={cn(
				"prose max-w-none prose-legal prose-reader",
				"prose-headings:font-semibold prose-headings:tracking-tight prose-headings:scroll-mt-20",
				"prose-h1:text-2xl prose-h1:mb-6",
				"prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b",
				"prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3",
				"prose-p:leading-[1.85] prose-p:mb-6",
				"prose-a:no-underline prose-a:font-medium hover:prose-a:underline",
				"prose-blockquote:border-l-[3px] prose-blockquote:py-4 prose-blockquote:px-5",
				"prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:my-8",
				"prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm",
				"prose-pre:rounded-xl",
				"prose-img:rounded-xl prose-img:shadow-card prose-img:mx-auto",
				"prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden",
				"prose-th:p-3 prose-th:text-left prose-th:font-semibold",
				"prose-td:p-3 prose-td:border-t",
				"prose-hr:my-10",
				"prose-ul:list-disc prose-ol:list-decimal",
				"prose-li:leading-relaxed prose-li:my-2",
				"[&_img]:max-w-full [&_img]:h-auto",
				className,
			)}
			data-testid="markdown-reader-rendered"
			suppressHydrationWarning
			// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized via DOMPurify on the client; SSR emits empty content to avoid XSS.
			dangerouslySetInnerHTML={{ __html: sanitized }}
		/>
	);
}
