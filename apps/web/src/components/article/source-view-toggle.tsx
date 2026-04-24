"use client";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { Code2, FileText } from "lucide-react";
import * as React from "react";

export type ArticleViewMode = "rendered" | "source";

interface SourceViewToggleProps {
	mode: ArticleViewMode;
	onChange: (next: ArticleViewMode) => void;
	className?: string;
	disabled?: boolean;
}

export function SourceViewToggle({
	mode,
	onChange,
	className,
	disabled = false,
}: SourceViewToggleProps) {
	const t = useT();
	const isSource = mode === "source";
	const label = isSource ? t("Show rendered view") : t("Show markdown source");
	const Icon = isSource ? FileText : Code2;

	return (
		<button
			type="button"
			role="switch"
			aria-checked={isSource}
			aria-label={label}
			title={label}
			disabled={disabled}
			data-testid="article-source-view-toggle"
			data-mode={mode}
			onClick={() => onChange(isSource ? "rendered" : "source")}
			className={cn(
				"inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
				"disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
			style={{
				borderColor: isSource
					? "var(--surface-accent-border)"
					: "var(--surface-muted-border)",
				backgroundColor: isSource ? "var(--surface-accent-bg)" : "transparent",
				color: isSource
					? "var(--surface-accent-strong)"
					: "var(--surface-muted-text)",
			}}
		>
			<Icon aria-hidden="true" className="h-3.5 w-3.5" />
			<span>{isSource ? t("Rendered") : t("Markdown source")}</span>
		</button>
	);
}
