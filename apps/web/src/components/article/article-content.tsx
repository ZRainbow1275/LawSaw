"use client";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { useMemo } from "react";

interface ArticleContentProps {
	content: string | null;
	className?: string;
}

export function ArticleContent({ content, className }: ArticleContentProps) {
	const t = useT();
	const sanitizedContent = useMemo(() => {
		if (!content) return "";
		// This is a Client Component, but Next.js may still perform an initial server render.
		// To avoid emitting un-sanitized HTML during SSR (XSS risk), we render nothing on the
		// server and only inject sanitized HTML on the client using DOMPurify.
		if (typeof window === "undefined") return "";

		const sanitized = DOMPurify.sanitize(content, {
			ALLOWED_TAGS: [
				"p",
				"br",
				"h1",
				"h2",
				"h3",
				"h4",
				"h5",
				"h6",
				"strong",
				"b",
				"em",
				"i",
				"u",
				"s",
				"strike",
				"a",
				"img",
				"figure",
				"figcaption",
				"ul",
				"ol",
				"li",
				"blockquote",
				"pre",
				"code",
				"table",
				"thead",
				"tbody",
				"tr",
				"th",
				"td",
				"div",
				"span",
				"hr",
			],
			ALLOWED_ATTR: [
				"href",
				"src",
				"alt",
				"title",
				"width",
				"height",
				"class",
				"id",
				"target",
				"rel",
			],
			ADD_ATTR: ["target"],
			ALLOW_UNKNOWN_PROTOCOLS: false,
			ALLOWED_URI_REGEXP:
				/^(?:(?:https?|mailto|tel):|(?!(?:[a-z][a-z0-9+.-]*):))/i,
			FORBID_TAGS: ["script", "style", "iframe"],
		});

		const allowedLinkProtocols = new Set([
			"http:",
			"https:",
			"mailto:",
			"tel:",
		]);
		const allowedImageProtocols = new Set(["http:", "https:"]);

		const isSafeUrl = (raw: string, allowedProtocols: Set<string>) => {
			try {
				const url = new URL(raw, window.location.origin);
				return allowedProtocols.has(url.protocol);
			} catch {
				return false;
			}
		};

		const doc = new DOMParser().parseFromString(sanitized, "text/html");

		for (const anchor of Array.from(
			doc.querySelectorAll<HTMLAnchorElement>("a"),
		)) {
			const href = anchor.getAttribute("href")?.trim();
			if (href && !isSafeUrl(href, allowedLinkProtocols)) {
				anchor.removeAttribute("href");
				anchor.removeAttribute("target");
				anchor.removeAttribute("rel");
				continue;
			}

			const target = anchor.getAttribute("target")?.trim();
			if (target && target !== "_blank" && target !== "_self") {
				anchor.removeAttribute("target");
				anchor.removeAttribute("rel");
				continue;
			}

			if (target === "_blank") {
				anchor.setAttribute("rel", "noopener noreferrer");
			} else {
				anchor.removeAttribute("target");
				anchor.removeAttribute("rel");
			}
		}

		for (const img of Array.from(
			doc.querySelectorAll<HTMLImageElement>("img[src]"),
		)) {
			const src = img.getAttribute("src")?.trim();
			if (!src || !isSafeUrl(src, allowedImageProtocols)) {
				img.remove();
			}
		}

		return doc.body.innerHTML;
	}, [content]);

	if (!content) {
		return (
			<div className="flex items-center justify-center py-12 text-neutral-400">
				<p>{t("No content available")}</p>
			</div>
		);
	}

	return (
		<article
			className={cn(
				// Base typography
				"prose prose-neutral max-w-none prose-legal",
				// Headings
				"prose-headings:font-semibold prose-headings:text-neutral-900",
				"prose-headings:tracking-tight prose-headings:scroll-mt-20",
				"prose-h1:text-2xl prose-h1:mb-6",
				"prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-neutral-100",
				"prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3",
				// Paragraphs
				"prose-p:text-neutral-700 prose-p:leading-[1.85] prose-p:mb-6",
				// Links
				"prose-a:text-primary-600 prose-a:no-underline prose-a:font-medium",
				"hover:prose-a:text-primary-700 hover:prose-a:underline",
				// Emphasis
				"prose-strong:text-neutral-900 prose-strong:font-semibold",
				// Blockquotes
				"prose-blockquote:border-l-[3px] prose-blockquote:border-l-primary-500",
				"prose-blockquote:bg-[var(--bg-paper)] prose-blockquote:py-4 prose-blockquote:px-5",
				"prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:my-8",
				// Code
				"prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5",
				"prose-code:rounded-md prose-code:text-sm prose-code:font-mono",
				"prose-code:before:content-none prose-code:after:content-none",
				"prose-pre:bg-neutral-900 prose-pre:text-neutral-100 prose-pre:rounded-xl",
				// Images
				"prose-img:rounded-xl prose-img:shadow-card prose-img:mx-auto",
				"prose-figure:my-8",
				"prose-figcaption:text-center prose-figcaption:text-neutral-500 prose-figcaption:text-sm prose-figcaption:mt-3",
				// Tables
				"prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden",
				"prose-th:bg-neutral-50 prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:text-neutral-800",
				"prose-td:p-3 prose-td:border-t prose-td:border-neutral-100",
				// Divider
				"prose-hr:border-neutral-100 prose-hr:my-10",
				// Lists
				"prose-ul:list-disc prose-ol:list-decimal",
				"prose-li:text-neutral-700 prose-li:leading-relaxed prose-li:my-2",
				// Embedded media
				"[&_img]:max-w-full [&_img]:h-auto",
				// Special styles
				"[&_.legal-clause]:pl-4 [&_.legal-clause]:border-l-2 [&_.legal-clause]:border-primary-200",
				"[&_.risk-highlight]:bg-error-light [&_.risk-highlight]:px-1 [&_.risk-highlight]:rounded",
				className,
			)}
			suppressHydrationWarning
			// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized with DOMPurify on the client; SSR emits empty content to avoid XSS.
			dangerouslySetInnerHTML={{ __html: sanitizedContent }}
		/>
	);
}
