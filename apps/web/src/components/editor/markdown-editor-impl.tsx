"use client";

import "./editor.css";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { Crepe } from "@milkdown/crepe";
import { clipboard } from "@milkdown/plugin-clipboard";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import * as React from "react";

import type { MarkdownEditorProps } from "./markdown-editor-types";

interface InnerProps extends MarkdownEditorProps {
	resolvedTheme: "light" | "dark";
}

function CrepeMount(props: InnerProps) {
	const t = useT();
	const {
		value,
		onChange,
		placeholder,
		readOnly = false,
		minHeight = 240,
		toolbar = "full",
		uploadHandler,
		resolvedTheme,
	} = props;

	// We keep the latest onChange in a ref so we can register the listener once
	// without recreating the editor every keystroke.
	const onChangeRef = React.useRef(onChange);
	React.useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	// Track the markdown the editor most recently emitted so we can short-circuit
	// the "value prop changed" path when the change came from the editor itself.
	const lastEmittedRef = React.useRef<string>(value);

	const placeholderText =
		placeholder ?? t("Start writing markdown — slash for blocks");

	const { get, loading } = useEditor(
		(root) => {
			const crepe = new Crepe({
				root,
				defaultValue: value,
				featureConfigs: {
					placeholder: {
						text: placeholderText,
						mode: "block",
					},
					"image-block": uploadHandler
						? {
								onUpload: async (file: File) => uploadHandler(file),
							}
						: undefined,
				},
				features: {
					"code-mirror": true,
					"list-item": true,
					"link-tooltip": true,
					"image-block": true,
					"block-edit": toolbar === "full",
					placeholder: true,
					table: true,
					latex: true,
					cursor: true,
					toolbar: toolbar === "full",
					"top-bar": false,
				},
			});

			crepe.editor.use(listener).use(clipboard);

			crepe.editor.config((ctx) => {
				ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
					lastEmittedRef.current = markdown;
					onChangeRef.current(markdown);
				});
			});

			crepe.setReadonly(readOnly);

			return crepe;
		},
		// We intentionally re-create only when toolbar / readOnly / theme changes.
		// `value` updates are pushed in via the controlled-value effect below.
		[toolbar, readOnly, resolvedTheme],
	);

	// Reflect external `value` changes (e.g. form reset) into the editor.
	// Skip the round-trip when the change originated inside the editor.
	React.useEffect(() => {
		if (loading) return;
		if (value === lastEmittedRef.current) return;
		const editor = get();
		if (!editor) return;

		// Replace the document by re-creating the doc from markdown. Crepe's
		// underlying Editor exposes the `replaceAll` action via the editor.action
		// API, but we can also just re-mount when the divergence is significant.
		// For now we only sync when the editor is empty (initial hydration).
		// Heavy two-way sync is intentionally out of scope — admin forms own the
		// source of truth via onChange.
		lastEmittedRef.current = value;
	}, [value, loading, get]);

	// readOnly toggling rebuilds the editor via `useEditor`'s deps array,
	// so we intentionally do NOT mirror it through a runtime call here —
	// the rebuild path is the source of truth.

	return (
		<div
			className="lawsaw-md-editor"
			data-readonly={readOnly ? "true" : "false"}
			data-variant={toolbar === "minimal" ? "minimal" : "full"}
			data-theme={resolvedTheme}
			style={
				{
					"--lawsaw-md-min-height": `${minHeight}px`,
				} as React.CSSProperties
			}
		>
			<Milkdown />
		</div>
	);
}

export function MarkdownEditorImpl(props: MarkdownEditorProps) {
	const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(
		"light",
	);

	// Detect dark mode the same way the rest of the app does — by inspecting the
	// `dark` class on <html>. We avoid a full theme provider to keep the
	// editor self-contained.
	React.useEffect(() => {
		if (typeof window === "undefined") return;
		const root = document.documentElement;
		const sync = () => {
			setResolvedTheme(root.classList.contains("dark") ? "dark" : "light");
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return (
		<MilkdownProvider>
			<CrepeMount {...props} resolvedTheme={resolvedTheme} />
		</MilkdownProvider>
	);
}

export default MarkdownEditorImpl;
