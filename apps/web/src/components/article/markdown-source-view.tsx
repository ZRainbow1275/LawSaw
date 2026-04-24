"use client";

import {
	type ArticleMarkdownSource,
	extractMarkdownSource,
} from "@/lib/article-reader";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { Check, Copy, Download } from "lucide-react";
import * as React from "react";

interface MarkdownSourceViewProps {
	content: string | null;
	fileNameHint?: string | null;
	className?: string;
}

function toSafeFileName(hint: string | null | undefined): string {
	const fallback = "article";
	if (!hint) return fallback;
	const trimmed = hint.trim();
	if (trimmed.length === 0) return fallback;
	const cleaned = trimmed
		.normalize("NFKC")
		.replace(/[\\/:*?"<>|]+/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return cleaned.length > 0 ? cleaned : fallback;
}

function formatCount(value: number): string {
	return new Intl.NumberFormat().format(value);
}

export function MarkdownSourceView({
	content,
	fileNameHint,
	className,
}: MarkdownSourceViewProps) {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();
	const [copied, setCopied] = React.useState(false);
	const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const source = React.useMemo<ArticleMarkdownSource>(
		() => extractMarkdownSource(content),
		[content],
	);

	React.useEffect(() => {
		return () => {
			if (resetTimerRef.current) {
				clearTimeout(resetTimerRef.current);
			}
		};
	}, []);

	const lines = React.useMemo(
		() => (source.markdown.length > 0 ? source.markdown.split("\n") : []),
		[source.markdown],
	);

	const formatLabel = React.useMemo(() => {
		switch (source.originalFormat) {
			case "html":
				return t("Converted from HTML");
			case "markdown":
				return t("Original markdown");
			default:
				return t("Plain text source");
		}
	}, [source.originalFormat, t]);

	const canOperate = source.markdown.length > 0;

	const handleCopy = React.useCallback(async () => {
		if (!canOperate) return;
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(source.markdown);
			} else {
				throw new Error("Clipboard API unavailable");
			}
			setCopied(true);
			toastSuccess(t("Copied to clipboard"));
			if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
			resetTimerRef.current = setTimeout(() => setCopied(false), 1600);
		} catch {
			toastError(t("Copy"), t("Copy failed"));
		}
	}, [canOperate, source.markdown, t, toastError, toastSuccess]);

	const handleDownload = React.useCallback(() => {
		if (!canOperate) return;
		try {
			if (typeof window === "undefined") return;
			const blob = new Blob([source.markdown], {
				type: "text/markdown;charset=utf-8",
			});
			const url = window.URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${toSafeFileName(fileNameHint)}.md`;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			window.URL.revokeObjectURL(url);
			toastSuccess(t("Download"));
		} catch {
			toastError(t("Download"), t("Operation failed"));
		}
	}, [canOperate, fileNameHint, source.markdown, t, toastError, toastSuccess]);

	if (!canOperate) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-2xl border py-12 text-sm",
					className,
				)}
				style={{
					borderColor: "var(--surface-muted-border)",
					backgroundColor: "var(--surface-muted-bg)",
					color: "var(--surface-muted-text)",
				}}
			>
				<p>{t("No content available")}</p>
			</div>
		);
	}

	return (
		<section
			className={cn(
				"rounded-2xl border shadow-sm",
				className,
			)}
			style={{
				borderColor: "var(--surface-muted-border)",
				backgroundColor: "var(--surface-muted-bg)",
				color: "var(--field-foreground)",
			}}
			data-testid="article-markdown-source"
			data-format={source.originalFormat}
			aria-label={t("Markdown source")}
		>
			<header
				className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
				style={{ borderColor: "var(--surface-muted-border)" }}
			>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span
						className="rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide"
						style={{
							borderColor: "var(--surface-accent-border)",
							backgroundColor: "var(--surface-accent-bg)",
							color: "var(--surface-accent-strong)",
						}}
					>
						{t("Markdown source")}
					</span>
					<span style={{ color: "var(--surface-muted-text)" }}>{formatLabel}</span>
					<span
						className="hidden h-3 w-px sm:inline-block"
						style={{ backgroundColor: "var(--surface-muted-border)" }}
						aria-hidden="true"
					/>
					<span
						className="inline-flex items-center gap-1"
						data-testid="article-markdown-source-stats"
					>
						<span style={{ color: "var(--surface-muted-text)" }}>
							{t("Lines")}
						</span>
						<span
							className="font-semibold"
							style={{ color: "var(--field-foreground)" }}
						>
							{formatCount(source.lineCount)}
						</span>
						<span aria-hidden="true" style={{ color: "var(--surface-muted-text)" }}>
							·
						</span>
						<span style={{ color: "var(--surface-muted-text)" }}>
							{t("Words")}
						</span>
						<span
							className="font-semibold"
							style={{ color: "var(--field-foreground)" }}
						>
							{formatCount(source.wordCount)}
						</span>
					</span>
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handleCopy}
						data-testid="article-markdown-source-copy"
						aria-live="polite"
						className={cn(
							"inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
						)}
						style={{
							borderColor: copied
								? "var(--surface-accent-border)"
								: "var(--surface-muted-border)",
							backgroundColor: copied
								? "var(--surface-accent-bg)"
								: "transparent",
							color: copied
								? "var(--surface-accent-strong)"
								: "var(--surface-muted-text)",
						}}
					>
						{copied ? (
							<Check aria-hidden="true" className="h-3.5 w-3.5" />
						) : (
							<Copy aria-hidden="true" className="h-3.5 w-3.5" />
						)}
						<span>{copied ? t("Copied") : t("Copy")}</span>
					</button>
					<button
						type="button"
						onClick={handleDownload}
						data-testid="article-markdown-source-download"
						className={cn(
							"inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
						)}
						style={{
							borderColor: "var(--surface-muted-border)",
							backgroundColor: "transparent",
							color: "var(--surface-muted-text)",
						}}
					>
						<Download aria-hidden="true" className="h-3.5 w-3.5" />
						<span>{t("Download markdown")}</span>
					</button>
				</div>
			</header>

			<div
				className="max-h-[70vh] overflow-auto"
				style={{
					backgroundColor: "var(--reading-pre-bg)",
					color: "var(--reading-pre-code)",
				}}
			>
				<pre
					className="m-0 font-mono text-sm leading-[1.7]"
					style={{ color: "var(--reading-pre-code)" }}
				>
					<ol
						className="m-0 list-none p-0"
						style={{ counterReset: "source-line" }}
					>
						{lines.map((line, index) => (
							<li
								key={`${index}-${line.length}`}
								className="group flex items-start gap-4 px-4 py-0.5 transition-colors hover:bg-white/5"
							>
								<span
									aria-hidden="true"
									className="w-10 shrink-0 select-none text-right font-mono text-xs"
									style={{
										color:
											"color-mix(in srgb, var(--reading-pre-code) 48%, transparent)",
									}}
								>
									{index + 1}
								</span>
								<span className="whitespace-pre-wrap break-words">
									{line.length > 0 ? line : "\u00A0"}
								</span>
							</li>
						))}
					</ol>
				</pre>
			</div>
		</section>
	);
}
