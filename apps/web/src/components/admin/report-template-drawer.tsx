"use client";

/**
 * Right-slide drawer wrapping the Milkdown editor for a report template.
 *
 * Surfaces three actions:
 *   1) live edit of `template_body` via `<MarkdownEditor variant="full">`
 *   2) "立即生成" — composes a new draft report from the template and enqueues
 *      AI generation via `useComposeAndGenerateReport` (real backend, no mocks).
 *   3) Recent generation history — last 10 reports keyed off the template id,
 *      with status badges and refresh.
 *
 * The drawer is purely presentational; persistence is delegated to the parent
 * via `onSaveTemplateBody`. A second mutation handler is invoked once the
 * generate task is enqueued so the parent can refresh its template list.
 */

import { MarkdownEditor } from "@/components/editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useComposeAndGenerateReport } from "@/hooks/use-report-generate";
import { useReports } from "@/hooks/use-reports";
import {
	type ReportPeriodType,
	type ReportStatus,
	type ReportTemplate,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Play, RefreshCw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PANEL_VARIANTS = {
	hidden: { x: "100%", opacity: 0.6 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 },
	},
	exit: {
		x: "100%",
		opacity: 0.6,
		transition: { duration: 0.2 },
	},
} as const;

interface ReportTemplateDrawerProps {
	open: boolean;
	template: ReportTemplate | null;
	onClose: () => void;
	onSaveTemplateBody: (next: string) => Promise<void> | void;
	saving?: boolean;
}

function statusVariant(
	status: ReportStatus,
): "outline" | "warning" | "success" | "secondary" | "destructive" {
	switch (status) {
		case "published":
			return "success";
		case "approved":
			return "secondary";
		case "review":
			return "warning";
		case "error":
			return "destructive";
		case "generating":
			return "warning";
		default:
			return "outline";
	}
}

function defaultPeriodWindow(periodType: ReportPeriodType): {
	start: string;
	end: string;
} {
	const now = new Date();
	const end = now.toISOString().slice(0, 10);
	const startDate = new Date(now);
	switch (periodType) {
		case "weekly":
			startDate.setDate(startDate.getDate() - 7);
			break;
		case "monthly":
			startDate.setMonth(startDate.getMonth() - 1);
			break;
		case "quarterly":
			startDate.setMonth(startDate.getMonth() - 3);
			break;
		default:
			startDate.setDate(startDate.getDate() - 7);
			break;
	}
	return { start: startDate.toISOString().slice(0, 10), end };
}

export function ReportTemplateDrawer({
	open,
	template,
	onClose,
	onSaveTemplateBody,
	saving,
}: ReportTemplateDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();

	const [draftBody, setDraftBody] = useState("");
	const [generateTitle, setGenerateTitle] = useState("");
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");

	useEffect(() => {
		if (!template) return;
		setDraftBody(template.template_body);
		const period = defaultPeriodWindow(
			(template.period_type as ReportPeriodType) ?? "weekly",
		);
		setPeriodStart(period.start);
		setPeriodEnd(period.end);
		setGenerateTitle(`${template.name} · ${period.end}`);
	}, [template]);

	const compose = useComposeAndGenerateReport();
	const recentReportsQuery = useReports({
		limit: 10,
		offset: 0,
	});

	const recentForTemplate = useMemo(() => {
		const all = recentReportsQuery.data?.data ?? [];
		if (!template) return [];
		return all.filter((report) => report.template_id === template.id).slice(0, 10);
	}, [recentReportsQuery.data, template]);

	if (!template) {
		return null;
	}

	const handleSave = async () => {
		if (!draftBody.trim()) {
			error(t("Validation failed"), t("Template body cannot be empty."));
			return;
		}
		try {
			await onSaveTemplateBody(draftBody);
			success(t("Template updated"), t("Template body saved."));
		} catch (cause) {
			error(
				t("Update failed"),
				cause instanceof Error ? cause.message : t("Unknown error"),
			);
		}
	};

	const handleGenerate = () => {
		if (!template) return;
		if (!generateTitle.trim() || !periodStart || !periodEnd) {
			error(
				t("Validation failed"),
				t("Title and period range are required."),
			);
			return;
		}
		compose.mutate(
			{
				template_id: template.id,
				title: generateTitle.trim(),
				period_type: (template.period_type as ReportPeriodType) ?? "weekly",
				period_start: periodStart,
				period_end: periodEnd,
			},
			{
				onSuccess: () => {
					success(
						t("Generation enqueued"),
						t("AI report generation has been queued."),
					);
					recentReportsQuery.refetch();
				},
				onError: (cause) => {
					error(
						t("Generation failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-50 flex">
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.aside
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border-l shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						role="dialog"
						aria-label={t("Edit report template")}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="min-w-0">
								<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
									{t("Report template")}
								</p>
								<h2 className="mt-1 truncate text-lg font-semibold" style={headingStyle}>
									{template.name}
								</h2>
								{template.description ? (
									<p className="mt-1 text-sm" style={mutedStyle}>
										{template.description}
									</p>
								) : null}
							</div>
							<button
								type="button"
								onClick={onClose}
								className="flex h-9 w-9 items-center justify-center rounded-full border"
								style={{
									backgroundColor: "var(--field-surface)",
									borderColor: "var(--field-border)",
									color: "var(--field-foreground)",
								}}
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</header>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							<section className="space-y-3">
								<div className="flex items-center justify-between gap-3">
									<h3 className="text-sm font-semibold" style={headingStyle}>
										{t("Template body (Markdown)")}
									</h3>
									<Button
										type="button"
										size="sm"
										onClick={handleSave}
										disabled={saving || template.is_builtin}
									>
										{saving ? (
											<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
										) : (
											<Save aria-hidden="true" className="h-4 w-4" />
										)}
										{t("Save")}
									</Button>
								</div>
								{template.is_builtin ? (
									<p className="text-xs" style={mutedStyle}>
										{t(
											"Built-in templates are read-only. Clone the template to edit operationally.",
										)}
									</p>
								) : null}
								<MarkdownEditor
									value={draftBody}
									onChange={setDraftBody}
									toolbar="full"
									minHeight={420}
									readOnly={template.is_builtin}
									placeholder={t("Write the template body using Markdown.")}
								/>
							</section>

							<section
								className="mt-6 space-y-3 rounded-2xl border p-4"
								style={surfaceStyle}
							>
								<div className="flex items-center justify-between gap-3">
									<h3 className="text-sm font-semibold" style={headingStyle}>
										{t("Generate now")}
									</h3>
									<Badge variant="outline">{template.period_type}</Badge>
								</div>
								<p className="text-xs" style={mutedStyle}>
									{t(
										"Creates a new draft report from this template, then enqueues real AI generation.",
									)}
								</p>
								<div className="grid gap-3 md:grid-cols-2">
									<div>
										<label
											htmlFor="report-generate-title"
											className="mb-1 block text-xs uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("Report title")}
										</label>
										<Input
											id="report-generate-title"
											value={generateTitle}
											onChange={(event) => setGenerateTitle(event.target.value)}
											style={fieldStyle}
										/>
									</div>
									<div className="grid gap-3 md:grid-cols-2">
										<div>
											<label
												htmlFor="report-generate-start"
												className="mb-1 block text-xs uppercase tracking-wide"
												style={mutedStyle}
											>
												{t("Period start")}
											</label>
											<Input
												id="report-generate-start"
												type="date"
												value={periodStart}
												onChange={(event) => setPeriodStart(event.target.value)}
												style={fieldStyle}
											/>
										</div>
										<div>
											<label
												htmlFor="report-generate-end"
												className="mb-1 block text-xs uppercase tracking-wide"
												style={mutedStyle}
											>
												{t("Period end")}
											</label>
											<Input
												id="report-generate-end"
												type="date"
												value={periodEnd}
												onChange={(event) => setPeriodEnd(event.target.value)}
												style={fieldStyle}
											/>
										</div>
									</div>
								</div>
								<div className="flex justify-end">
									<Button
										type="button"
										size="sm"
										onClick={handleGenerate}
										disabled={compose.isPending}
									>
										{compose.isPending ? (
											<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
										) : (
											<Play aria-hidden="true" className="h-4 w-4" />
										)}
										{t("Generate now")}
									</Button>
								</div>
							</section>

							<section className="mt-6 space-y-3">
								<div className="flex items-center justify-between gap-3">
									<h3 className="text-sm font-semibold" style={headingStyle}>
										{t("Generation history")}
									</h3>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => recentReportsQuery.refetch()}
										disabled={recentReportsQuery.isFetching}
									>
										<RefreshCw
											aria-hidden="true"
											className={
												recentReportsQuery.isFetching
													? "h-4 w-4 animate-spin"
													: "h-4 w-4"
											}
										/>
										{t("Refresh")}
									</Button>
								</div>
								{recentReportsQuery.isLoading ? (
									<p className="text-sm" style={mutedStyle}>
										{t("Loading reports")}
									</p>
								) : recentForTemplate.length === 0 ? (
									<p className="text-sm" style={mutedStyle}>
										{t("No generation runs yet for this template.")}
									</p>
								) : (
									<ul className="space-y-2">
										{recentForTemplate.map((report) => (
											<li
												key={report.id}
												className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2"
												style={surfaceStyle}
											>
												<div className="min-w-0">
													<p
														className="truncate text-sm font-medium"
														style={headingStyle}
													>
														{report.title}
													</p>
													<p className="text-xs" style={mutedStyle}>
														{formatDateTime(locale, report.updated_at, {
															year: "numeric",
															month: "2-digit",
															day: "2-digit",
															hour: "2-digit",
															minute: "2-digit",
														})}
													</p>
												</div>
												<Badge variant={statusVariant(report.status)}>
													{report.status}
												</Badge>
											</li>
										))}
									</ul>
								)}
							</section>
						</div>
					</motion.aside>
				</div>
			) : null}
		</AnimatePresence>
	);
}
