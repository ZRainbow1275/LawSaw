"use client";

import dynamic from "next/dynamic";
import type * as React from "react";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";

import type { MarkdownEditorProps } from "./markdown-editor-types";

/**
 * Lightweight skeleton shown while the Milkdown bundle is loading.
 * Keeps the same border-radius / token palette as the real editor so
 * the layout does not jank on hydration.
 */
function EditorSkeleton({ minHeight = 240 }: { minHeight?: number }) {
	const t = useT();
	return (
		<output
			className={cn(
				"lawsaw-md-editor-skeleton animate-pulse",
				"flex items-center justify-center",
			)}
			style={
				{
					"--lawsaw-md-min-height": `${minHeight}px`,
					minHeight: `${minHeight}px`,
				} as React.CSSProperties
			}
			aria-live="polite"
			aria-busy="true"
		>
			<span className="sr-only">{t("Loading editor")}</span>
			<span aria-hidden="true">{t("Loading editor")}</span>
		</output>
	);
}

const MarkdownEditorImpl = dynamic(
	() => import("./markdown-editor-impl").then((m) => m.MarkdownEditorImpl),
	{
		ssr: false,
		loading: () => <EditorSkeleton />,
	},
);

/**
 * Public Markdown editor wrapper. Always renders client-side.
 *
 * SSR safety: Milkdown depends on the DOM (ProseMirror), so the impl is
 * dynamically imported with `ssr: false`. The skeleton fallback preserves
 * layout while the chunk loads.
 */
export function MarkdownEditor(props: MarkdownEditorProps) {
	return <MarkdownEditorImpl {...props} />;
}

export type {
	MarkdownEditorProps,
	MarkdownEditorToolbar,
	MarkdownEditorLocale,
} from "./markdown-editor-types";
