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
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
						{icon}
					</div>
					<div className="min-w-0">
						<p className="text-xs text-neutral-500">{label}</p>
						<div className="text-sm font-medium text-neutral-900 truncate">
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
	const { data: report, isLoading, isError, refetch } = useReport(reportId);
	const transitionStatus = useTransitionReportStatus();
	const generateReport = useGenerateReport();

	const isBusy = transitionStatus.isPending || generateReport.isPending;

	const handleTransition = (targetStatus: ReportStatus) => {
		transitionStatus.mutate({ id: reportId, target_status: targetStatus });
	};

	const handleGenerate = () => {
		generateReport.mutate(reportId);
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
							className="h-20 rounded-xl bg-neutral-100 animate-pulse"
						/>
					))}
				</div>
				<div className="h-64 rounded-xl bg-neutral-100 animate-pulse" />
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
						<h2 className="text-xl font-bold text-neutral-900 truncate">
							{report.title}
						</h2>
						<ReportStatusBadge status={report.status} />
					</div>
					<p className="text-xs text-neutral-400 font-mono mt-0.5">
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
						<Hash aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("Report Number")}
					value={report.report_number}
				/>
				<MetadataItem
					icon={
						<Calendar aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("Period Type")}
					value={<ReportPeriodBadge periodType={report.period_type} />}
				/>
				<MetadataItem
					icon={
						<Calendar aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("Period Range")}
					value={`${new Date(report.period_start).toLocaleDateString()} — ${new Date(report.period_end).toLocaleDateString()}`}
				/>
				<MetadataItem
					icon={
						<FileText aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("Article Count")}
					value={report.article_count.toString()}
				/>
				<MetadataItem
					icon={
						<Sparkles aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("AI Model")}
					value={report.ai_model ?? t("N/A")}
				/>
				<MetadataItem
					icon={
						<Clock aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("Created")}
					value={new Date(report.created_at).toLocaleDateString()}
				/>
				<MetadataItem
					icon={
						<CheckCircle
							aria-hidden="true"
							className="h-4 w-4 text-neutral-500"
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
						<Sparkles aria-hidden="true" className="h-4 w-4 text-neutral-500" />
					}
					label={t("AI Generated At")}
					value={
						report.ai_generated_at
							? new Date(report.ai_generated_at).toLocaleDateString()
							: t("N/A")
					}
				/>
			</div>

			{/* Content */}
			<Card>
				<div className="p-6">
					<h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
						<FileText aria-hidden="true" className="h-5 w-5 text-primary-500" />
						{t("Report Content")}
					</h3>
					{hasContent ? (
						<pre
							className={cn(
								"bg-neutral-50 rounded-lg p-4 text-sm font-mono",
								"overflow-x-auto max-h-[500px] overflow-y-auto",
								"border border-neutral-200",
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
