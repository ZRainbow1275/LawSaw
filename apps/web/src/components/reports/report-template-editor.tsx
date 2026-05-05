"use client";

import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ReportPeriodType, ReportTemplate } from "@/lib/api/types";
import { renderArticleBodyHtml } from "@/lib/article-reader";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { sanitizeRenderedHtml } from "@/lib/safe-html";
import {
	GLOBAL_SAVE_SHORTCUT_EVENT,
	type GlobalSaveShortcutDetail,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import {
	Bold,
	Code2,
	Eye,
	FileText,
	Heading1,
	Heading2,
	Link2,
	List,
	ListOrdered,
	Quote,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type TemplateDraft = {
	name: string;
	description: string;
	period_type: ReportPeriodType;
	template_body: string;
	css_styles: string;
};

type EditorMode = "write" | "split" | "preview";

function insertAroundSelection(
	currentValue: string,
	selectionStart: number,
	selectionEnd: number,
	before: string,
	after = "",
) {
	const start = Math.max(0, selectionStart);
	const end = Math.max(start, selectionEnd);
	const selected = currentValue.slice(start, end);
	const nextValue =
		currentValue.slice(0, start) +
		before +
		selected +
		after +
		currentValue.slice(end);
	const nextSelectionStart = start + before.length;
	const nextSelectionEnd = nextSelectionStart + selected.length;

	return {
		nextValue,
		nextSelectionStart,
		nextSelectionEnd,
	};
}

const SNIPPET_BUTTONS = [
	{ key: "h1", icon: Heading1, before: "# ", labelKey: "Heading 1" },
	{ key: "h2", icon: Heading2, before: "## ", labelKey: "Heading 2" },
	{ key: "bold", icon: Bold, before: "**", after: "**", labelKey: "Bold" },
	{ key: "bullet", icon: List, before: "- ", labelKey: "Bullet list" },
	{
		key: "ordered",
		icon: ListOrdered,
		before: "1. ",
		labelKey: "Numbered list",
	},
	{ key: "quote", icon: Quote, before: "> ", labelKey: "Quote" },
	{
		key: "link",
		icon: Link2,
		before: "[",
		after: "](https://example.com)",
		labelKey: "Link",
	},
	{
		key: "code",
		icon: Code2,
		before: "```\n",
		after: "\n```",
		labelKey: "Code block",
	},
];

export function ReportTemplateEditor({
	draft,
	onDraftChange,
	periodOptions,
	getPeriodLabel,
	selectedTemplate,
	templateBusy,
	onReset,
	onSubmit,
	onDelete,
}: {
	draft: TemplateDraft;
	onDraftChange: (updater: (current: TemplateDraft) => TemplateDraft) => void;
	periodOptions: readonly ReportPeriodType[];
	getPeriodLabel: (value: ReportPeriodType) => string;
	selectedTemplate: ReportTemplate | null;
	templateBusy: boolean;
	onReset: () => void;
	onSubmit: () => void;
	onDelete: () => void;
}) {
	const locale = useLocale();
	const t = useT();
	const bodyRef = useRef<HTMLTextAreaElement | null>(null);
	const [editorMode, setEditorMode] = useState<EditorMode>("split");

	const renderedPreview = useMemo(
		() =>
			sanitizeRenderedHtml(renderArticleBodyHtml(draft.template_body.trim())),
		[draft.template_body],
	);
	const headingOutline = useMemo(
		() =>
			draft.template_body
				.split(/\r?\n/)
				.map((line, index) => {
					const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
					if (!match) return null;
					return {
						level: match[1].length,
						title: match[2].trim(),
						line: index + 1,
					};
				})
				.filter(
					(item): item is { level: number; title: string; line: number } =>
						!!item,
				),
		[draft.template_body],
	);
	const editorMetrics = useMemo(() => {
		const lines =
			draft.template_body.length === 0
				? 0
				: draft.template_body.split(/\r?\n/).length;
		const words = draft.template_body.trim()
			? draft.template_body.trim().split(/\s+/).length
			: 0;
		return {
			lines,
			words,
			headings: headingOutline.length,
		};
	}, [draft.template_body, headingOutline.length]);
	const surfaceStyle = {
		borderColor: "var(--surface-muted-border)",
		backgroundColor: "var(--surface-muted-bg)",
	} as const;
	const softSurfaceStyle = {
		borderColor: "var(--surface-muted-border)",
		backgroundColor: "var(--control-hover-bg)",
	} as const;
	const fieldSurfaceStyle = {
		borderColor: "var(--field-border)",
		backgroundColor: "var(--field-surface)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	useEffect(() => {
		const handleSaveShortcut = (event: Event) => {
			const customEvent = event as CustomEvent<GlobalSaveShortcutDetail>;
			const pathname = customEvent.detail?.pathname ?? "";
			if (!pathname.includes("/settings/admin/reports")) return;
			onSubmit();
		};

		window.addEventListener(
			GLOBAL_SAVE_SHORTCUT_EVENT,
			handleSaveShortcut as EventListener,
		);
		return () => {
			window.removeEventListener(
				GLOBAL_SAVE_SHORTCUT_EVENT,
				handleSaveShortcut as EventListener,
			);
		};
	}, [onSubmit]);

	const applySnippet = (before: string, after = "") => {
		const textarea = bodyRef.current;
		if (!textarea) {
			onDraftChange((current) => ({
				...current,
				template_body: `${current.template_body}${current.template_body.endsWith("\n") ? "" : "\n"}${before}${after}`,
			}));
			return;
		}

		const next = insertAroundSelection(
			draft.template_body,
			textarea.selectionStart,
			textarea.selectionEnd,
			before,
			after,
		);

		onDraftChange((current) => ({
			...current,
			template_body: next.nextValue,
		}));

		window.requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(
				next.nextSelectionStart,
				next.nextSelectionEnd,
			);
		});
	};

	const handleBodyKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		if (event.key === "Tab") {
			event.preventDefault();
			applySnippet("  ");
			return;
		}

		if (!(event.ctrlKey || event.metaKey)) return;

		const key = event.key.toLowerCase();
		if (key === "1") {
			event.preventDefault();
			applySnippet("# ");
			return;
		}
		if (key === "2") {
			event.preventDefault();
			applySnippet("## ");
			return;
		}
		if (key === "b") {
			event.preventDefault();
			applySnippet("**", "**");
			return;
		}
		if (key === "k") {
			event.preventDefault();
			applySnippet("[", "](https://example.com)");
		}
	};

	return (
		<>
			<CardHeader>
				<div className="flex items-center justify-between gap-3">
					<div>
						<CardTitle>
							{selectedTemplate
								? t("Template editor")
								: t("Create report template")}
						</CardTitle>
						<CardDescription>
							{selectedTemplate
								? t(
										"Edit the selected template body, cadence, and styling rules.",
									)
								: t(
										"Create a new tenant-specific template for real report generation.",
									)}
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{selectedTemplate ? (
							<span
								className="rounded-full border px-3 py-1 text-xs font-medium"
								style={{ ...softSurfaceStyle, ...mutedTextStyle }}
							>
								{t("Version")}: {selectedTemplate.version}
							</span>
						) : null}
						<Button variant="outline" size="sm" onClick={onReset}>
							{t("Clear selection")}
						</Button>
					</div>
				</div>
			</CardHeader>

			<div className="space-y-4 p-6 pt-0">
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<label
							htmlFor="report-template-name"
							className="mb-1 block text-xs font-medium uppercase tracking-wide"
							style={mutedTextStyle}
						>
							{t("Template name")}
						</label>
						<Input
							id="report-template-name"
							value={draft.name}
							onChange={(event) =>
								onDraftChange((current) => ({
									...current,
									name: event.target.value,
								}))
							}
							placeholder={t("Tenant report template name")}
						/>
					</div>
					<div>
						<label
							htmlFor="report-period-type"
							className="mb-1 block text-xs font-medium uppercase tracking-wide"
							style={mutedTextStyle}
						>
							{t("Period type")}
						</label>
						<select
							id="report-period-type"
							value={draft.period_type}
							onChange={(event) =>
								onDraftChange((current) => ({
									...current,
									period_type: event.target.value as ReportPeriodType,
								}))
							}
							className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
							style={fieldSurfaceStyle}
						>
							{periodOptions.map((value) => (
								<option key={value} value={value}>
									{getPeriodLabel(value)}
								</option>
							))}
						</select>
					</div>
				</div>

				<div>
					<label
						htmlFor="report-template-description"
						className="mb-1 block text-xs font-medium uppercase tracking-wide"
						style={mutedTextStyle}
					>
						{t("Description")}
					</label>
					<Input
						id="report-template-description"
						value={draft.description}
						onChange={(event) =>
							onDraftChange((current) => ({
								...current,
								description: event.target.value,
							}))
						}
						placeholder={t(
							"Explain who should use this template and under which reporting scenario.",
						)}
					/>
				</div>

				<div className="rounded-3xl border" style={surfaceStyle}>
					<div
						className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
						style={{ borderColor: "var(--surface-muted-border)" }}
					>
						<div>
							<p className="text-sm font-semibold" style={headingStyle}>
								{t("Markdown editor")}
							</p>
							<p className="mt-1 text-xs" style={mutedTextStyle}>
								{t(
									"Write raw Markdown, preview rendered output instantly, and save with Ctrl+S.",
								)}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{(
								[
									{ value: "write", labelKey: "Write mode", icon: FileText },
									{ value: "split", labelKey: "Split view", icon: Code2 },
									{ value: "preview", labelKey: "Preview mode", icon: Eye },
								] as const
							).map((option) => {
								const Icon = option.icon;
								const active = editorMode === option.value;
								return (
									<Button
										key={option.value}
										type="button"
										variant={active ? "default" : "outline"}
										size="sm"
										onClick={() => setEditorMode(option.value)}
									>
										<Icon aria-hidden="true" className="h-4 w-4" />
										{t(option.labelKey)}
									</Button>
								);
							})}
						</div>
					</div>

					<div
						className="flex flex-wrap gap-2 border-b px-4 py-3"
						style={{ borderColor: "var(--surface-muted-border)" }}
					>
						{SNIPPET_BUTTONS.map((snippet) => {
							const Icon = snippet.icon;
							return (
								<Button
									key={snippet.key}
									type="button"
									variant="outline"
									size="sm"
									onClick={() => applySnippet(snippet.before, snippet.after)}
								>
									<Icon aria-hidden="true" className="h-4 w-4" />
									{t(snippet.labelKey)}
								</Button>
							);
						})}
					</div>

					<div className="grid gap-0 xl:grid-cols-2">
						{editorMode !== "preview" ? (
							<div
								className={cn(
									"border-b xl:border-b-0",
									editorMode === "split" ? "xl:border-r" : "",
								)}
								style={{ borderColor: "var(--surface-muted-border)" }}
							>
								<div className="flex items-center justify-between px-4 py-3">
									<div>
										<p className="text-sm font-semibold" style={headingStyle}>
											{t("Markdown source")}
										</p>
										<p className="mt-1 text-xs" style={mutedTextStyle}>
											{t(
												"Use headings, lists, quotes, and links exactly as they will be saved.",
											)}
										</p>
									</div>
									<span
										className="rounded-full border px-3 py-1 text-[11px] font-medium"
										style={{ ...softSurfaceStyle, ...mutedTextStyle }}
									>
										{t("Shortcut")}: Ctrl+S
									</span>
								</div>
								<div className="px-4 pb-4">
									<textarea
										ref={bodyRef}
										id="report-template-body"
										value={draft.template_body}
										onChange={(event) =>
											onDraftChange((current) => ({
												...current,
												template_body: event.target.value,
											}))
										}
										onKeyDown={handleBodyKeyDown}
										className="min-h-[28rem] w-full rounded-2xl border px-4 py-3 font-mono text-sm leading-6 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
										style={fieldSurfaceStyle}
										spellCheck={false}
									/>
								</div>
							</div>
						) : null}

						{editorMode !== "write" ? (
							<div>
								<div className="flex items-center justify-between px-4 py-3">
									<div>
										<p className="text-sm font-semibold" style={headingStyle}>
											{t("Live preview")}
										</p>
										<p className="mt-1 text-xs" style={mutedTextStyle}>
											{t(
												"Review the rendered report structure before saving it to real operations.",
											)}
										</p>
									</div>
									{selectedTemplate ? (
										<span className="text-xs" style={mutedTextStyle}>
											{t("Updated at")}:{" "}
											{formatDateTime(locale, selectedTemplate.updated_at, {
												year: "numeric",
												month: "2-digit",
												day: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
									) : null}
								</div>
								<div className="px-4 pb-4">
									<div
										className="min-h-[28rem] rounded-2xl border border-dashed px-6 py-5"
										style={surfaceStyle}
									>
										{renderedPreview ? (
											<div
												className="prose prose-neutral prose-reader max-w-none"
												// biome-ignore lint/security/noDangerouslySetInnerHtml: Preview HTML is sanitized via sanitizeRenderedHtml before injection.
												dangerouslySetInnerHTML={{ __html: renderedPreview }}
											/>
										) : (
											<div
												className="flex h-full min-h-[20rem] items-center justify-center text-sm"
												style={mutedTextStyle}
											>
												{t("Start writing Markdown to see the live preview.")}
											</div>
										)}
									</div>
								</div>
							</div>
						) : null}
					</div>
				</div>

				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
					<div className="rounded-2xl border px-4 py-3" style={surfaceStyle}>
						<p className="text-sm font-semibold" style={headingStyle}>
							{t("Editor metrics")}
						</p>
						<div className="mt-3 grid gap-3 sm:grid-cols-3">
							<div
								className="rounded-xl border px-3 py-2"
								style={softSurfaceStyle}
							>
								<p
									className="text-[11px] uppercase tracking-[0.18em]"
									style={mutedTextStyle}
								>
									{t("Lines")}
								</p>
								<p className="mt-1 text-lg font-semibold" style={headingStyle}>
									{editorMetrics.lines}
								</p>
							</div>
							<div
								className="rounded-xl border px-3 py-2"
								style={softSurfaceStyle}
							>
								<p
									className="text-[11px] uppercase tracking-[0.18em]"
									style={mutedTextStyle}
								>
									{t("Words")}
								</p>
								<p className="mt-1 text-lg font-semibold" style={headingStyle}>
									{editorMetrics.words}
								</p>
							</div>
							<div
								className="rounded-xl border px-3 py-2"
								style={softSurfaceStyle}
							>
								<p
									className="text-[11px] uppercase tracking-[0.18em]"
									style={mutedTextStyle}
								>
									{t("Headings")}
								</p>
								<p className="mt-1 text-lg font-semibold" style={headingStyle}>
									{editorMetrics.headings}
								</p>
							</div>
						</div>
						<p className="mt-3 text-xs" style={mutedTextStyle}>
							{t(
								"Use Tab for indentation, Ctrl+1 / Ctrl+2 for headings, Ctrl+B for bold, and Ctrl+K for links while keeping the raw Markdown workflow intact.",
							)}
						</p>
					</div>

					<div className="rounded-2xl border px-4 py-3" style={surfaceStyle}>
						<p className="text-sm font-semibold" style={headingStyle}>
							{t("Outline")}
						</p>
						<p className="mt-1 text-xs" style={mutedTextStyle}>
							{t(
								"Track the current section structure before saving to production report operations.",
							)}
						</p>
						{headingOutline.length === 0 ? (
							<p className="mt-4 text-sm" style={mutedTextStyle}>
								{t("Add headings to build a navigable report outline.")}
							</p>
						) : (
							<div className="mt-4 space-y-2">
								{headingOutline.map((item) => (
									<div
										key={`${item.line}-${item.title}`}
										className={cn(
											"rounded-xl border px-3 py-2 text-sm",
											item.level > 1 ? "ml-3" : "",
											item.level > 2 ? "ml-6" : "",
										)}
										style={{ ...softSurfaceStyle, ...mutedTextStyle }}
									>
										<p className="font-medium" style={headingStyle}>
											{item.title}
										</p>
										<p
											className="mt-1 text-[11px] uppercase tracking-[0.18em]"
											style={mutedTextStyle}
										>
											{t("Line")} {item.line}
										</p>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				<div>
					<label
						htmlFor="report-template-stylesheet"
						className="mb-1 block text-xs font-medium uppercase tracking-wide"
						style={mutedTextStyle}
					>
						{t("Stylesheet")}
					</label>
					<textarea
						id="report-template-stylesheet"
						value={draft.css_styles}
						onChange={(event) =>
							onDraftChange((current) => ({
								...current,
								css_styles: event.target.value,
							}))
						}
						className="min-h-40 w-full rounded-2xl border px-4 py-3 font-mono text-sm leading-6 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
						style={fieldSurfaceStyle}
						spellCheck={false}
						placeholder={t(
							"Optional print styles or layout overrides for report export.",
						)}
					/>
				</div>

				<div className="rounded-2xl border px-4 py-3" style={surfaceStyle}>
					<p className="text-sm font-semibold" style={headingStyle}>
						{t("Markdown syntax support")}
					</p>
					<p className="mt-1 text-xs" style={mutedTextStyle}>
						{t(
							"Use # Heading, ## Section, - Bullet, 1. Numbered list, > Quote, and fenced code blocks to structure operational reports.",
						)}
					</p>
				</div>

				<div
					className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
					style={{ ...softSurfaceStyle, ...mutedTextStyle }}
				>
					<div>
						<p className="font-medium" style={headingStyle}>
							{t("Operational note")}
						</p>
						<p className="mt-1">
							{selectedTemplate?.is_builtin
								? t(
										"This template is built-in and remains protected from deletion.",
									)
								: t(
										"Custom templates can be updated live and soft deleted without losing audit history.",
									)}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="outline" onClick={onReset}>
							{t("Reset")}
						</Button>
						<Button type="button" onClick={onSubmit} disabled={templateBusy}>
							{templateBusy ? (
								<RefreshCw
									aria-hidden="true"
									className="h-4 w-4 animate-spin"
								/>
							) : null}
							{selectedTemplate ? t("Save template") : t("Create template")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={onDelete}
							disabled={
								templateBusy || !selectedTemplate || selectedTemplate.is_builtin
							}
						>
							<Trash2 aria-hidden="true" className="h-4 w-4" />
							{t("Archive template")}
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
