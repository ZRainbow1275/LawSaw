"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useDeleteReport,
	useGenerateReport,
	useReports,
	useTransitionReportStatus,
} from "@/hooks/use-reports";
import type { Report, ReportPeriodType, ReportStatus } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { motion } from "framer-motion";
import {
	ArchiveRestore,
	CheckCircle,
	ChevronLeft,
	ChevronRight,
	Download,
	Eye,
	FileText,
	Loader2,
	Play,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { ReportPeriodBadge, ReportStatusBadge } from "./report-status-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportListProps {
	canManageReports: boolean;
	canExportReports: boolean;
	onCreateClick: () => void;
	onReportClick: (report: Report) => void;
	onExportClick: (report: Report) => void;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
	"",
	"draft",
	"generating",
	"generated",
	"review",
	"approved",
	"published",
	"archived",
	"error",
] as const;

const PERIOD_OPTIONS = [
	"",
	"weekly",
	"monthly",
	"quarterly",
	"custom",
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportList({
	canManageReports,
	canExportReports,
	onCreateClick,
	onReportClick,
	onExportClick,
}: ReportListProps) {
	const t = useT();
	const [statusFilter, setStatusFilter] = useState<ReportStatus | "">("");
	const [periodFilter, setPeriodFilter] = useState<ReportPeriodType | "">("");
	const [page, setPage] = useState(0);
	const [pendingDeleteReport, setPendingDeleteReport] = useState<Report | null>(
		null,
	);

	const offset = page * PAGE_SIZE;
	const {
		data: reportsData,
		isLoading,
		isError,
		refetch,
	} = useReports({
		limit: PAGE_SIZE,
		offset,
		status: statusFilter || undefined,
		period_type: periodFilter || undefined,
	});

	const deleteReport = useDeleteReport();
	const generateReport = useGenerateReport();
	const transitionStatus = useTransitionReportStatus();
	const { error: toastError } = useToast();

	const reports = reportsData?.data ?? [];
	const total = reportsData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const showFrom = total > 0 ? offset + 1 : 0;
	const showTo = Math.min(offset + PAGE_SIZE, total);

	const handleDelete = (report: Report) => {
		setPendingDeleteReport(report);
	};

	const confirmDelete = () => {
		if (!pendingDeleteReport) return;
		deleteReport.mutate(
			{ id: pendingDeleteReport.id },
			{
				onSettled: () => setPendingDeleteReport(null),
			},
		);
	};

	const handleGenerate = (id: string) => {
		generateReport.mutate(id);
	};

	const handleTransition = (
		id: string,
		target: ReportStatus,
		labelKey: string,
	) => {
		transitionStatus.mutate(
			{ id, target_status: target },
			{
				onError: (err) => {
					toastError(
						t("Status update failed"),
						err instanceof Error ? err.message : t(labelKey),
					);
				},
			},
		);
	};

	const selectClassName = cn(
		"themed-input h-9 rounded-lg border-2 px-3 text-sm",
		"focus:border-[var(--surface-accent-border)] focus:outline-none",
	);
	const selectStyle = {
		borderColor: "var(--field-border)",
		backgroundColor: "var(--field-surface)",
		color: "var(--field-foreground)",
	} as const;
	const skeletonSurfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
	} as const;
	const cardHoverClassName =
		"cursor-pointer hover:border-[var(--surface-accent-border)]";
	const reportNumberStyle = { color: "var(--surface-muted-text)" } as const;

	const statusLabels: Record<string, string> = {
		"": t("All statuses"),
		draft: t("Draft"),
		generating: t("Generating"),
		generated: t("Generated"),
		review: t("In Review"),
		approved: t("Approved"),
		published: t("Published"),
		archived: t("Archived"),
		error: t("Error"),
	};

	const periodLabels: Record<string, string> = {
		"": t("All periods"),
		weekly: t("Weekly"),
		monthly: t("Monthly"),
		quarterly: t("Quarterly"),
		custom: t("Custom"),
	};

	return (
		<>
			<div>
				{/* Filter Bar */}
				<div className="flex flex-wrap items-center gap-3 mb-6">
					<select
						value={statusFilter}
						onChange={(e) => {
							setStatusFilter(e.target.value as ReportStatus | "");
							setPage(0);
						}}
						className={selectClassName}
						style={selectStyle}
						aria-label={t("Filter by status")}
					>
						{STATUS_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{statusLabels[opt]}
							</option>
						))}
					</select>

					<select
						value={periodFilter}
						onChange={(e) => {
							setPeriodFilter(e.target.value as ReportPeriodType | "");
							setPage(0);
						}}
						className={selectClassName}
						style={selectStyle}
						aria-label={t("Filter by period type")}
					>
						{PERIOD_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{periodLabels[opt]}
							</option>
						))}
					</select>

					<Button
						variant="ghost"
						size="sm"
						onClick={() => refetch()}
						aria-label={t("Refresh")}
					>
						<RefreshCw aria-hidden="true" className="h-4 w-4" />
					</Button>

					<div className="ml-auto">
						<Button
							onClick={onCreateClick}
							disabled={!canManageReports}
							title={
								!canManageReports
									? t(
											"Report creation and workflow controls require reports:write.",
										)
									: undefined
							}
							data-testid="reports-create-button"
						>
							<Plus aria-hidden="true" className="h-4 w-4" />
							{t("Create Report")}
						</Button>
					</div>
				</div>

				{/* Loading */}
				{isLoading && (
					<div className="space-y-3">
						{Array.from({ length: 5 }, (_, i) => `skel-${i}`).map((key) => (
							<div
								key={key}
								className="h-24 animate-pulse rounded-xl"
								style={skeletonSurfaceStyle}
							/>
						))}
					</div>
				)}

				{/* Error */}
				{isError && !isLoading && (
					<EmptyState
						variant="error"
						title={t("Failed to load reports")}
						description={t("Please check your connection and try again.")}
						action={{ label: t("Retry"), onClick: () => refetch() }}
					/>
				)}

				{/* Empty */}
				{!isLoading && !isError && reports.length === 0 && (
					<EmptyState
						title={t("No reports yet")}
						description={t(
							"Create your first periodic analysis report to get started.",
						)}
						action={
							canManageReports
								? { label: t("Create Report"), onClick: onCreateClick }
								: undefined
						}
					/>
				)}

				{/* Report Cards */}
				{!isLoading && !isError && reports.length > 0 && (
					<div className="space-y-3">
						{reports.map((report, index) => (
							<motion.div
								key={report.id}
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: index * 0.04 }}
							>
								<Card className={cardHoverClassName}>
									<CardContent className="p-4">
										<div className="flex items-start justify-between gap-4">
											{/* Left: Info */}
											<button
												type="button"
												className="flex-1 text-left min-w-0"
												onClick={() => onReportClick(report)}
											>
												<div className="flex items-center gap-3 flex-wrap">
													<span
														className="font-mono text-xs"
														style={reportNumberStyle}
													>
														{report.report_number}
													</span>
													<h3
														className="truncate text-sm font-semibold"
														style={{ color: "var(--field-foreground)" }}
													>
														{report.title}
													</h3>
													<ReportStatusBadge status={report.status} />
													<ReportPeriodBadge periodType={report.period_type} />
												</div>
												<div
													className="mt-2 flex items-center gap-4 text-xs"
													style={{ color: "var(--surface-muted-text)" }}
												>
													<span>
														{new Date(report.period_start).toLocaleDateString()}{" "}
														— {new Date(report.period_end).toLocaleDateString()}
													</span>
													<span className="flex items-center gap-1">
														<FileText aria-hidden="true" className="h-3 w-3" />
														{report.article_count} {t("articles")}
													</span>
													<span>
														{t("Created")}{" "}
														{new Date(report.created_at).toLocaleDateString()}
													</span>
												</div>
											</button>

											{/* Right: Actions */}
											<div className="flex items-center gap-1 shrink-0">
												{canManageReports &&
													(report.status === "draft" ||
														report.status === "error") && (
														<Button
															variant="ghost"
															size="sm"
															onClick={(e) => {
																e.stopPropagation();
																handleGenerate(report.id);
															}}
															disabled={generateReport.isPending}
															title={
																report.status === "error"
																	? t("Retry Generate")
																	: t("Generate")
															}
														>
															{generateReport.isPending ? (
																<Loader2
																	aria-hidden="true"
																	className="h-4 w-4 animate-spin"
																/>
															) : (
																<Play aria-hidden="true" className="h-4 w-4" />
															)}
														</Button>
													)}
												{(report.status === "generated" ||
													report.status === "review" ||
													report.status === "approved" ||
													report.status === "published") && (
													<Button
														variant="ghost"
														size="sm"
														onClick={(e) => {
															e.stopPropagation();
															onReportClick(report);
														}}
														title={t("Preview")}
														data-testid="reports-list-preview"
													>
														<Eye aria-hidden="true" className="h-4 w-4" />
													</Button>
												)}
												{canManageReports &&
													(report.status === "generated" ||
														report.status === "review") && (
														<Button
															variant="ghost"
															size="sm"
															onClick={(e) => {
																e.stopPropagation();
																handleTransition(
																	report.id,
																	"approved",
																	"Approve",
																);
															}}
															disabled={transitionStatus.isPending}
															title={t("Approve")}
															data-testid="reports-list-approve"
														>
															{transitionStatus.isPending ? (
																<Loader2
																	aria-hidden="true"
																	className="h-4 w-4 animate-spin"
																/>
															) : (
																<CheckCircle
																	aria-hidden="true"
																	className="h-4 w-4"
																/>
															)}
														</Button>
													)}
												{canManageReports && report.status === "archived" && (
													<Button
														variant="ghost"
														size="sm"
														onClick={(e) => {
															e.stopPropagation();
															handleTransition(
																report.id,
																"published",
																"Restore",
															);
														}}
														disabled={transitionStatus.isPending}
														title={t("Restore")}
														data-testid="reports-list-restore"
													>
														{transitionStatus.isPending ? (
															<Loader2
																aria-hidden="true"
																className="h-4 w-4 animate-spin"
															/>
														) : (
															<ArchiveRestore
																aria-hidden="true"
																className="h-4 w-4"
															/>
														)}
													</Button>
												)}
												{canExportReports &&
													(report.status === "generated" ||
														report.status === "review" ||
														report.status === "approved" ||
														report.status === "published") && (
														<Button
															variant="ghost"
															size="sm"
															onClick={(e) => {
																e.stopPropagation();
																onExportClick(report);
															}}
															title={t("Export")}
														>
															<Download
																aria-hidden="true"
																className="h-4 w-4"
															/>
														</Button>
													)}
												{canManageReports ? (
													<Button
														variant="ghost"
														size="sm"
														onClick={(e) => {
															e.stopPropagation();
															handleDelete(report);
														}}
														disabled={deleteReport.isPending}
														title={t("Delete")}
														className="text-[var(--surface-muted-text)] hover:text-[var(--color-error)]"
													>
														<Trash2 aria-hidden="true" className="h-4 w-4" />
													</Button>
												) : null}
											</div>
										</div>
									</CardContent>
								</Card>
							</motion.div>
						))}
					</div>
				)}

				{/* Pagination */}
				{total > PAGE_SIZE && (
					<div className="flex items-center justify-between mt-6">
						<p
							className="text-sm"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{t("Showing {from}-{to} of {total}", {
								from: showFrom.toString(),
								to: showTo.toString(),
								total: total.toString(),
							})}
						</p>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage((p) => Math.max(0, p - 1))}
								disabled={page === 0}
							>
								<ChevronLeft aria-hidden="true" className="h-4 w-4" />
								{t("Previous")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
								disabled={page >= totalPages - 1}
							>
								{t("Next")}
								<ChevronRight aria-hidden="true" className="h-4 w-4" />
							</Button>
						</div>
					</div>
				)}
			</div>
			<ConfirmActionModal
				isOpen={!!pendingDeleteReport}
				onClose={() => setPendingDeleteReport(null)}
				onConfirm={confirmDelete}
				title={t("Are you sure you want to delete this report?")}
				confirmLabel={t("Delete")}
				cancelLabel={t("Cancel")}
				busy={deleteReport.isPending}
			/>
		</>
	);
}
