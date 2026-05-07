"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useGenerateReport,
	useReport,
	useTransitionReportStatus,
} from "@/hooks/use-reports";
import type { Report, ReportStatus } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { motion } from "framer-motion";
import {
	Archive,
	ArrowLeft,
	Calendar,
	CheckCircle,
	Clock,
	Download,
	FileText,
	Hash,
	Loader2,
	Play,
	Send,
	Sparkles,
	XCircle,
} from "lucide-react";
import { ReportPeriodBadge, ReportStatusBadge } from "./report-status-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportDetailProps {
	reportId: string;
	onBack: () => void;
	onExportClick: (report: Report) => void;
}

// ---------------------------------------------------------------------------
// Metadata Item
// ---------------------------------------------------------------------------

interface MetadataItemProps {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
}

function MetadataItem({ icon, label, value }: MetadataItemProps) {
	return (
		<Card className="hover:shadow-none hover:-translate-y-0">
			<CardContent className="p-4">
				<div className="flex items-start gap-3">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-white/10">
						{icon}
					</div>
					<div className="min-w-0">
						<p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
						<div className="text-sm font-medium text-neutral-900 truncate dark:text-neutral-100">
							{value}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportDetail({
	reportId,
	onBack,
	onExportClick,
}: ReportDetailProps) {
	const t = useT();
	const { error: toastError } = useToast();
	const { data: report, isLoading, isError, refetch } = useReport(reportId);
	const transitionStatus = useTransitionReportStatus();
	const generateReport = useGenerateReport();

	const isBusy = transitionStatus.isPending || generateReport.isPending;

	const getErrorMessage = (error: unknown) =>
		error instanceof Error ? error.message : t("Operation failed");

	const handleTransition = (targetStatus: ReportStatus) => {
		transitionStatus.mutate(
			{ id: reportId, target_status: targetStatus },
			{
				onError: (error) => {
					toastError(t("Status update failed"), getErrorMessage(error));
				},
			},
		);
	};

	const handleFastApprove = async () => {
		if (!report || isBusy) return;
		try {
			if (report.status === "generated") {
				await transitionStatus.mutateAsync({
					id: reportId,
					target_status: "review",
				});
			}
			await transitionStatus.mutateAsync({
				id: reportId,
				target_status: "approved",
			});
		} catch (error) {
			toastError(t("Approval failed"), getErrorMessage(error));
		}
	};

	const handleGenerate = () => {
		generateReport.mutate(reportId, {
			onError: (error) => {
				toastError(t("Generation failed"), getErrorMessage(error));
			},
		});
	};

	// Loading
	if (isLoading) {
		return (
			<div>
				<div className="flex items-center gap-4 mb-6">
					<Button variant="ghost" size="sm" onClick={onBack}>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("Back")}
					</Button>
				</div>
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					{Array.from({ length: 8 }, (_, i) => `meta-skel-${i}`).map((key) => (
						<div
							key={key}
							className="h-20 rounded-xl bg-neutral-100 dark:bg-white/10 animate-pulse"
						/>
					))}
				</div>
				<div className="h-64 rounded-xl bg-neutral-100 dark:bg-white/10 animate-pulse" />
			</div>
		);
	}

	// Error
	if (isError || !report) {
		return (
			<div>
				<div className="flex items-center gap-4 mb-6">
					<Button variant="ghost" size="sm" onClick={onBack}>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("Back")}
					</Button>
				</div>
				<EmptyState
					variant="error"
					title={t("Failed to load report")}
					description={t("The report could not be found or loaded.")}
					action={{ label: t("Retry"), onClick: () => refetch() }}
				/>
			</div>
		);
	}

	const hasContent = report.content && Object.keys(report.content).length > 0;
	const hasAnyExportKey = Boolean(
		report.export_pdf_key || report.export_docx_key || report.export_html_key,
	);
	const isDownloadReady = hasAnyExportKey;
	const showDownloadPanel =
		hasAnyExportKey ||
		report.status === "generated" ||
		report.status === "review" ||
		report.status === "approved" ||
		report.status === "published";

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.2 }}
		>
			{/* Header */}
			<div className="flex items-center gap-4 mb-6">
				<Button variant="ghost" size="sm" onClick={onBack}>
					<ArrowLeft aria-hidden="true" className="h-4 w-4" />
					{t("Back")}
				</Button>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-3 flex-wrap">
						<h2 className="text-xl font-bold text-neutral-900 truncate dark:text-neutral-50">
							{report.title}
						</h2>
						<ReportStatusBadge status={report.status} />
					</div>
					<p className="text-xs text-neutral-400 font-mono mt-0.5 dark:text-neutral-500">
						{report.report_number}
					</p>
				</div>

				{/* Status Actions */}
				<div className="flex items-center gap-2 shrink-0">
					{isBusy && (
						<Loader2
							aria-hidden="true"
							className="h-4 w-4 animate-spin text-primary-500"
						/>
					)}

					{(report.status === "draft" || report.status === "error") && (
						<Button size="sm" onClick={handleGenerate} disabled={isBusy}>
							<Play aria-hidden="true" className="h-4 w-4" />
							{report.status === "error" ? t("Retry Generate") : t("Generate")}
						</Button>
					)}

					{report.status === "generated" && (
						<>
							<Button
								size="sm"
								onClick={() => handleTransition("review")}
								disabled={isBusy}
							>
								<Send aria-hidden="true" className="h-4 w-4" />
								{t("Submit for Review")}
							</Button>
							<Button size="sm" onClick={handleFastApprove} disabled={isBusy}>
								<CheckCircle aria-hidden="true" className="h-4 w-4" />
								{t("Approve")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleTransition("draft")}
								disabled={isBusy}
							>
								<XCircle aria-hidden="true" className="h-4 w-4" />
								{t("Reject")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onExportClick(report)}
							>
								<Download aria-hidden="true" className="h-4 w-4" />
								{t("Export")}
							</Button>
						</>
					)}

					{report.status === "review" && (
						<>
							<Button
								size="sm"
								onClick={() => handleTransition("approved")}
								disabled={isBusy}
							>
								<CheckCircle aria-hidden="true" className="h-4 w-4" />
								{t("Approve")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleTransition("draft")}
								disabled={isBusy}
							>
								<XCircle aria-hidden="true" className="h-4 w-4" />
								{t("Reject")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onExportClick(report)}
							>
								<Download aria-hidden="true" className="h-4 w-4" />
								{t("Export")}
							</Button>
						</>
					)}

					{report.status === "approved" && (
						<>
							<Button
								size="sm"
								onClick={() => handleTransition("published")}
								disabled={isBusy}
							>
								<CheckCircle aria-hidden="true" className="h-4 w-4" />
								{t("Publish")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleTransition("draft")}
								disabled={isBusy}
							>
								<XCircle aria-hidden="true" className="h-4 w-4" />
								{t("Revoke")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onExportClick(report)}
							>
								<Download aria-hidden="true" className="h-4 w-4" />
								{t("Export")}
							</Button>
						</>
					)}

					{report.status === "published" && (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleTransition("archived")}
								disabled={isBusy}
							>
								<Archive aria-hidden="true" className="h-4 w-4" />
								{t("Archive")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => onExportClick(report)}
							>
								<Download aria-hidden="true" className="h-4 w-4" />
								{t("Export")}
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Metadata Grid */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				<MetadataItem
					icon={
						<Hash aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("Report Number")}
					value={report.report_number}
				/>
				<MetadataItem
					icon={
						<Calendar aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("Period Type")}
					value={<ReportPeriodBadge periodType={report.period_type} />}
				/>
				<MetadataItem
					icon={
						<Calendar aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("Period Range")}
					value={`${new Date(report.period_start).toLocaleDateString()} — ${new Date(report.period_end).toLocaleDateString()}`}
				/>
				<MetadataItem
					icon={
						<FileText aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("Article Count")}
					value={report.article_count.toString()}
				/>
				<MetadataItem
					icon={
						<Sparkles aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("AI Model")}
					value={report.ai_model ?? t("N/A")}
				/>
				<MetadataItem
					icon={
						<Clock aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("Created")}
					value={new Date(report.created_at).toLocaleDateString()}
				/>
				<MetadataItem
					icon={
						<CheckCircle
							aria-hidden="true"
							className="h-4 w-4 text-neutral-500 dark:text-neutral-400"
						/>
					}
					label={t("Published At")}
					value={
						report.published_at
							? new Date(report.published_at).toLocaleDateString()
							: t("N/A")
					}
				/>
				<MetadataItem
					icon={
						<Sparkles aria-hidden="true" className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
					}
					label={t("AI Generated At")}
					value={
						report.ai_generated_at
							? new Date(report.ai_generated_at).toLocaleDateString()
							: t("N/A")
					}
				/>
			</div>

			{/* Available Downloads */}
			{showDownloadPanel && (
				<Card className="mb-6">
					<div className="p-4">
						<h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3 flex items-center gap-2">
							<Download
								aria-hidden="true"
								className="h-4 w-4 text-primary-500"
							/>
							{t("Available Downloads")}
						</h3>
						<div className="flex items-center gap-3 flex-wrap">
							{report.export_pdf_key && (
								<a
									href={`/api/v1/reports/${report.id}/download/pdf`}
									className={cn(
										"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
										"border border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200",
										"hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700",
										"transition-all",
									)}
									download={isDownloadReady}
								>
									<FileText aria-hidden="true" className="h-4 w-4" />
									{t("Download PDF")}
								</a>
							)}
							{report.export_docx_key && (
								<a
									href={`/api/v1/reports/${report.id}/download/docx`}
									className={cn(
										"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
										"border border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200",
										"hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700",
										"transition-all",
									)}
									download={isDownloadReady}
								>
									<FileText aria-hidden="true" className="h-4 w-4" />
									{t("Download DOCX")}
								</a>
							)}
							{report.export_html_key && (
								<a
									href={`/api/v1/reports/${report.id}/download/html`}
									className={cn(
										"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
										"border border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200",
										"hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700",
										"transition-all",
									)}
									download={isDownloadReady}
								>
									<FileText aria-hidden="true" className="h-4 w-4" />
									{t("Download HTML")}
								</a>
							)}
							{!hasAnyExportKey && (
								<p className="text-xs text-neutral-500 dark:text-neutral-400">
									{t(
										"No export file is ready yet. Please trigger export first.",
									)}
								</p>
							)}
						</div>
					</div>
				</Card>
			)}

			{/* Content */}
			<Card>
				<div className="p-6">
					<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4 flex items-center gap-2">
						<FileText aria-hidden="true" className="h-5 w-5 text-primary-500" />
						{t("Report Content")}
					</h3>
					{hasContent ? (
						<pre
							className={cn(
								"bg-neutral-50 rounded-lg p-4 text-sm font-mono dark:bg-white/5",
								"overflow-x-auto max-h-[500px] overflow-y-auto",
								"border border-neutral-200 dark:border-white/10",
							)}
						>
							{JSON.stringify(report.content, null, 2)}
						</pre>
					) : (
						<EmptyState
							title={t("No content generated yet")}
							description={t(
								'Use the "Generate" button to create AI-powered content for this report.',
							)}
							className="py-10"
						/>
					)}
				</div>
			</Card>
		</motion.div>
	);
}
