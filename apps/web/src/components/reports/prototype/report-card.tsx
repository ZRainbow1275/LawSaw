"use client";

/**
 * ReportCard — `prototype/app.html:1098-1234`.
 *
 * Renders a single report card with prototype 1:1 visual structure:
 * header (number + status badge + period badge), title, meta line
 * (date range / article count / status hint), and an action row whose
 * buttons depend on the lifecycle status.
 *
 * Status → visible actions matrix (matches prototype):
 *   - draft     : Generate, Delete
 *   - generating: (disabled hint only)
 *   - generated : Export PDF, Approve, Delete
 *   - review    : Preview, Export PDF, Delete
 *   - approved  : Export PDF, Export HTML, Delete
 *   - published : Export PDF, Export HTML, Open
 *   - error     : Regenerate, Delete
 *   - archived  : Export PDF, Restore
 */

import {
	useDeleteReport,
	useExportReport,
	useGenerateReport,
	useTransitionReportStatus,
} from "@/hooks/use-reports";
import type { Report, ReportStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	ArchiveRestore,
	Calendar,
	CheckCircle2,
	Clock,
	Eye,
	FileCode2,
	FileText,
	Hourglass,
	Loader2,
	Play,
	RefreshCcw,
	Trash2,
	TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ReportCardProps = {
	report: Report;
	onPreview?: (report: Report) => void;
};

const STATUS_BADGE_STYLE: Record<string, { bgVar: string; fgVar: string }> = {
	draft: {
		bgVar: "var(--report-draft-bg)",
		fgVar: "var(--report-draft-fg)",
	},
	generating: {
		bgVar: "var(--report-generating-bg)",
		fgVar: "var(--report-generating-fg)",
	},
	generated: {
		bgVar: "var(--report-generated-bg)",
		fgVar: "var(--report-generated-fg)",
	},
	approved: {
		bgVar: "var(--report-approved-bg)",
		fgVar: "var(--report-approved-fg)",
	},
	published: {
		bgVar: "var(--report-published-bg)",
		fgVar: "var(--report-published-fg)",
	},
	review: {
		bgVar: "var(--report-review-bg)",
		fgVar: "var(--report-review-fg)",
	},
	archived: {
		bgVar: "var(--report-archived-bg)",
		fgVar: "var(--report-archived-fg)",
	},
	error: {
		bgVar: "var(--report-error-bg)",
		fgVar: "var(--report-error-fg)",
	},
};

const STATUS_LABEL_KEY: Record<string, string> = {
	draft: "Draft",
	generating: "Generating",
	generated: "Generated",
	review: "In Review",
	approved: "Approved",
	published: "Published",
	archived: "Archived",
	error: "Generation failed",
};

const STATUS_ICON: Record<string, { icon: LucideIcon; spin?: boolean }> = {
	generating: { icon: Loader2, spin: true },
	review: { icon: Hourglass },
	archived: { icon: ArchiveRestore },
};

const PERIOD_LABEL_KEY: Record<string, string> = {
	weekly: "Weekly report",
	monthly: "Monthly report",
	quarterly: "Quarterly report",
	custom: "Custom",
};

function StatusBadge({ status }: { status: string }) {
	const t = useT();
	const palette = STATUS_BADGE_STYLE[status] ?? STATUS_BADGE_STYLE.draft;
	const iconCfg = STATUS_ICON[status];
	const Icon = iconCfg?.icon;
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
			style={{ backgroundColor: palette.bgVar, color: palette.fgVar }}
		>
			{Icon ? (
				<Icon
					aria-hidden="true"
					className={`h-3 w-3 ${iconCfg?.spin ? "animate-spin" : ""}`}
				/>
			) : null}
			{t(STATUS_LABEL_KEY[status] ?? status)}
		</span>
	);
}

function PeriodBadge({ period }: { period: string }) {
	const t = useT();
	const isCustom = period === "custom";
	const style = isCustom
		? {
				backgroundColor: "var(--period-custom-bg)",
				color: "var(--period-custom-fg)",
			}
		: {
				backgroundColor: "var(--period-bg)",
				color: "var(--period-fg)",
			};
	return (
		<span
			className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
			style={style}
		>
			{t(PERIOD_LABEL_KEY[period] ?? period)}
		</span>
	);
}

function ActionButton({
	onClick,
	disabled,
	icon: Icon,
	label,
	variant = "default",
	dataTestid,
}: {
	onClick?: () => void;
	disabled?: boolean;
	icon: LucideIcon;
	label: string;
	variant?: "default" | "danger" | "muted";
	dataTestid?: string;
}) {
	const variantStyle =
		variant === "danger"
			? {
					borderColor: "color-mix(in srgb, #c62828 30%, transparent)",
					color: "#c62828",
				}
			: variant === "muted"
				? {
						borderColor: "var(--surface-card-border-strong)",
						color: "var(--surface-card-faint-fg)",
					}
				: {
						borderColor: "var(--surface-card-border-strong)",
						color: "var(--surface-card-muted-fg)",
					};

	const hoverClass =
		variant === "danger"
			? "hover:bg-rose-50 focus:bg-rose-50"
			: "hover:bg-neutral-50 focus:bg-neutral-50 dark:hover:bg-white/5 dark:focus:bg-white/5";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			data-testid={dataTestid}
			className={`inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-900 ${hoverClass}`}
			style={variantStyle}
		>
			<Icon aria-hidden="true" className="h-3.5 w-3.5" />
			{label}
		</button>
	);
}

export function ReportCard({ report, onPreview }: ReportCardProps) {
	const t = useT();
	const locale = useLocale();
	const { success: toastSuccess, error: toastError } = useToast();
	const exportMutation = useExportReport();
	const generateMutation = useGenerateReport();
	const deleteMutation = useDeleteReport();
	const transitionMutation = useTransitionReportStatus();

	const status = report.status;
	const periodStart = formatDateTime(locale, report.period_start, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const periodEnd = formatDateTime(locale, report.period_end, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

	const handleExport = (format: "pdf" | "html" | "docx") => {
		exportMutation.mutate(
			{ id: report.id, format },
			{
				onSuccess: () =>
					toastSuccess(
						t("Export queued"),
						t("{format} export job is running, you will be notified soon.", {
							format: format.toUpperCase(),
						}),
					),
				onError: (cause) =>
					toastError(
						t("Export failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					),
			},
		);
	};

	const handleGenerate = () => {
		generateMutation.mutate(report.id, {
			onSuccess: () =>
				toastSuccess(
					t("Generation queued"),
					t("Report regeneration has been queued."),
				),
			onError: (cause) =>
				toastError(
					t("Generation failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				),
		});
	};

	const handleDelete = () => {
		if (typeof window !== "undefined") {
			const confirmed = window.confirm(t("Delete this report?"));
			if (!confirmed) return;
		}
		deleteMutation.mutate(
			{ id: report.id },
			{
				onSuccess: () => toastSuccess(t("Report deleted")),
				onError: (cause) =>
					toastError(
						t("Delete failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					),
			},
		);
	};

	const handleTransition = (target: ReportStatus, label: string) => {
		transitionMutation.mutate(
			{ id: report.id, target_status: target },
			{
				onSuccess: () => toastSuccess(label),
				onError: (cause) =>
					toastError(
						t("Action failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					),
			},
		);
	};

	const renderActions = () => {
		switch (status) {
			case "generating":
				return (
					<button
						type="button"
						disabled
						className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-medium opacity-50 dark:bg-neutral-900"
						style={{
							borderColor: "var(--surface-card-border-strong)",
							color: "var(--surface-card-muted-fg)",
						}}
					>
						<Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
						{t("Generating, please wait...")}
					</button>
				);
			case "draft":
				return (
					<>
						<ActionButton
							onClick={handleGenerate}
							disabled={generateMutation.isPending}
							icon={Play}
							label={t("Generate report")}
						/>
						<ActionButton
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
							icon={Trash2}
							label={t("Delete")}
							variant="danger"
						/>
					</>
				);
			case "error":
				return (
					<>
						<ActionButton
							onClick={handleGenerate}
							disabled={generateMutation.isPending}
							icon={RefreshCcw}
							label={t("Regenerate")}
						/>
						<ActionButton
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
							icon={Trash2}
							label={t("Delete")}
							variant="danger"
						/>
					</>
				);
			case "generated":
				return (
					<>
						<ActionButton
							onClick={() => handleExport("pdf")}
							disabled={exportMutation.isPending}
							icon={FileText}
							label={t("Export PDF")}
						/>
						<ActionButton
							onClick={() => handleTransition("approved", t("Report approved"))}
							disabled={transitionMutation.isPending}
							icon={CheckCircle2}
							label={t("Approve")}
						/>
						<ActionButton
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
							icon={Trash2}
							label={t("Delete")}
							variant="danger"
						/>
					</>
				);
			case "review":
				return (
					<>
						<ActionButton
							onClick={() => onPreview?.(report)}
							icon={Eye}
							label={t("Preview")}
						/>
						<ActionButton
							onClick={() => handleExport("pdf")}
							disabled={exportMutation.isPending}
							icon={FileText}
							label={t("Export PDF")}
						/>
						<ActionButton
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
							icon={Trash2}
							label={t("Delete")}
							variant="danger"
						/>
					</>
				);
			case "approved":
				return (
					<>
						<ActionButton
							onClick={() => handleExport("pdf")}
							disabled={exportMutation.isPending}
							icon={FileText}
							label={t("Export PDF")}
						/>
						<ActionButton
							onClick={() => handleExport("html")}
							disabled={exportMutation.isPending}
							icon={FileCode2}
							label={t("Export HTML")}
						/>
						<ActionButton
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
							icon={Trash2}
							label={t("Delete")}
							variant="danger"
						/>
					</>
				);
			case "published":
				return (
					<>
						<ActionButton
							onClick={() => handleExport("pdf")}
							disabled={exportMutation.isPending}
							icon={FileText}
							label={t("Export PDF")}
						/>
						<ActionButton
							onClick={() => handleExport("html")}
							disabled={exportMutation.isPending}
							icon={FileCode2}
							label={t("Export HTML")}
						/>
						<ActionButton
							onClick={() => onPreview?.(report)}
							icon={Eye}
							label={t("Open")}
						/>
					</>
				);
			case "archived":
				return (
					<>
						<ActionButton
							onClick={() => handleExport("pdf")}
							disabled={exportMutation.isPending}
							icon={FileText}
							label={t("Export PDF")}
						/>
						<ActionButton
							onClick={() => handleTransition("draft", t("Report restored"))}
							disabled={transitionMutation.isPending}
							icon={ArchiveRestore}
							label={t("Restore")}
						/>
					</>
				);
			default:
				return null;
		}
	};

	return (
		<article
			className="mb-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md dark:bg-neutral-900 dark:border-white/10"
			style={{ borderColor: "var(--surface-card-border)" }}
			data-testid={`report-card-${report.id}`}
		>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<span
					className="font-mono text-xs"
					style={{ color: "var(--surface-card-faint-fg)" }}
				>
					{report.report_number}
				</span>
				<div className="flex items-center gap-2">
					<StatusBadge status={status} />
					<PeriodBadge period={report.period_type} />
				</div>
			</div>

			<h3
				className="mb-2 text-[15px] font-bold"
				style={{ color: "var(--surface-card-foreground)" }}
			>
				{report.title}
			</h3>

			<div
				className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
				style={{ color: "var(--surface-card-faint-fg)" }}
			>
				<span className="inline-flex items-center gap-1">
					<Calendar aria-hidden="true" className="h-3.5 w-3.5" />
					{periodStart} ~ {periodEnd}
				</span>
				<span className="inline-flex items-center gap-1">
					<FileText aria-hidden="true" className="h-3.5 w-3.5" />
					{t("Contains {count} articles", { count: report.article_count })}
				</span>
				{status === "error" ? (
					<span
						className="inline-flex items-center gap-1"
						style={{ color: "var(--color-error)" }}
					>
						<TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
						{t("Template render timeout")}
					</span>
				) : null}
				{status === "review" ? (
					<span
						className="inline-flex items-center gap-1"
						style={{ color: "var(--color-warning)" }}
					>
						<Clock aria-hidden="true" className="h-3.5 w-3.5" />
						{t("Awaiting legal review")}
					</span>
				) : null}
				{status === "archived" && report.updated_at ? (
					<span
						className="inline-flex items-center gap-1"
						style={{ color: "var(--surface-card-faint-fg)" }}
					>
						<ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" />
						{t("Archived on {date}", {
							date: formatDateTime(locale, report.updated_at, {
								year: "numeric",
								month: "2-digit",
								day: "2-digit",
							}),
						})}
					</span>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-2">{renderActions()}</div>
		</article>
	);
}
