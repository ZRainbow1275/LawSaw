"use client";

import { Button } from "@/components/ui/button";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { useExportReport, useReport } from "@/hooks/use-reports";
import type { Report, ReportExportFormat } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	CheckCircle,
	FileDown,
	FileText,
	Globe,
	Loader2,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportExportDialogProps {
	isOpen: boolean;
	onClose: () => void;
	report: Report | null;
}

interface FormatOption {
	format: ReportExportFormat;
	icon: LucideIcon;
	label: string;
	description: string;
}

function reportFormatRequiresTemplate(format: ReportExportFormat) {
	return format === "pdf" || format === "html";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportExportDialog({
	isOpen,
	onClose,
	report,
}: ReportExportDialogProps) {
	const t = useT();
	const exportReport = useExportReport();
	const wasOpenRef = useRef(isOpen);
	const [selectedFormat, setSelectedFormat] =
		useState<ReportExportFormat>("docx");
	const [queuedFormat, setQueuedFormat] = useState<ReportExportFormat | null>(
		null,
	);
	const [showSuccess, setShowSuccess] = useState(false);
	const pollReport = useReport(report?.id ?? "", {
		enabled: isOpen && !!report && showSuccess,
		refetchInterval: showSuccess ? 2_000 : false,
	});

	const latestReport = pollReport.data ?? report;
	const lacksTemplate = !latestReport?.template_id;
	const activeFormat = queuedFormat ?? selectedFormat;
	const latestExportKey =
		activeFormat === "pdf"
			? latestReport?.export_pdf_key ?? null
			: activeFormat === "docx"
				? latestReport?.export_docx_key ?? null
				: latestReport?.export_html_key ?? null;
	const readyDownloadUrl =
		showSuccess && latestReport && latestExportKey
			? `/api/v1/reports/${latestReport.id}/download/${activeFormat}`
			: null;

	const formats: FormatOption[] = [
		{
			format: "pdf",
			icon: FileDown,
			label: t("PDF Document"),
			description: t("Professional PDF with formatting"),
		},
		{
			format: "docx",
			icon: FileText,
			label: t("Word Document"),
			description: t("Editable Word document"),
		},
		{
			format: "html",
			icon: Globe,
			label: t("HTML Page"),
			description: t("Web-friendly HTML format"),
		},
	];

	const isFormatDisabled = (format: ReportExportFormat) =>
		lacksTemplate && reportFormatRequiresTemplate(format);

	useEffect(() => {
		const wasOpen = wasOpenRef.current;
		wasOpenRef.current = isOpen;
		if (!wasOpen || isOpen) return;

		// Reset once on close transition to prevent repeated reset() render loops.
		setSelectedFormat("docx");
		setQueuedFormat(null);
		setShowSuccess(false);
		exportReport.reset();
	}, [isOpen, exportReport]);

	useEffect(() => {
		if (!isOpen) return;
		if (!lacksTemplate) return;
		if (!reportFormatRequiresTemplate(selectedFormat)) return;
		setSelectedFormat("docx");
	}, [isOpen, lacksTemplate, selectedFormat]);

	const handleExport = () => {
		if (!report) return;
		if (isFormatDisabled(selectedFormat)) return;
		const format = selectedFormat;
		setQueuedFormat(format);
		exportReport.mutate(
			{ id: report.id, format },
			{
				onSuccess: () => {
					setShowSuccess(true);
				},
				onError: () => {
					setQueuedFormat(null);
					setShowSuccess(false);
				},
			},
		);
	};

	if (!report) return null;

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="md">
			<ModalHeader>
				<h2 className="text-xl font-bold text-neutral-900">
					{t("Export Report")}
				</h2>
				<p className="text-sm text-neutral-500 mt-1 truncate">{report.title}</p>
			</ModalHeader>

			<ModalBody>
				{showSuccess ? (
					<div className="flex flex-col items-center gap-3 py-8">
						{readyDownloadUrl ? (
							<>
								<CheckCircle className="h-12 w-12 text-green-500" />
								<p className="text-sm font-medium text-green-700">
									{t("Export file is ready.")}
								</p>
								<a
									href={readyDownloadUrl}
									download
									className={cn(
										"inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
										"border border-primary-200 bg-primary-50 text-primary-700",
										"hover:border-primary-300 hover:bg-primary-100",
									)}
								>
									<FileDown aria-hidden="true" className="h-4 w-4" />
									{t("Download file")}
								</a>
							</>
						) : (
							<>
								<Loader2 className="h-10 w-10 animate-spin text-primary-500" />
								<p className="text-sm font-medium text-primary-700">
									{t("Export task queued!")}
								</p>
								<p className="text-xs text-neutral-500">
									{t("Preparing export file...")}
								</p>
							</>
						)}
					</div>
				) : (
					<div className="space-y-3">
						{lacksTemplate && (
							<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
								{t(
									"This report has no template. DOCX export is available now; PDF/HTML can be enabled after assigning a template.",
								)}
							</div>
						)}
						<div className="grid grid-cols-3 gap-4">
						{formats.map((fmt) => {
							const Icon = fmt.icon;
							const isSelected = selectedFormat === fmt.format;
							const disabled = isFormatDisabled(fmt.format);
							return (
								<button
									key={fmt.format}
									type="button"
									disabled={disabled}
									onClick={() => setSelectedFormat(fmt.format)}
									className={cn(
										"flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all",
										isSelected && !disabled
											? "border-primary-500 bg-primary-50 text-primary-700"
											: "border-neutral-200 bg-white text-neutral-600 hover:border-primary-200 hover:bg-neutral-50",
										disabled && "cursor-not-allowed opacity-45",
									)}
								>
									<Icon aria-hidden="true" className="h-8 w-8" />
									<span className="text-sm font-medium">{fmt.label}</span>
									<span className="text-xs text-center opacity-70">
										{fmt.description}
									</span>
									{disabled && (
										<span className="text-[10px] font-medium text-amber-600">
											{t("Template required")}
										</span>
									)}
								</button>
							);
						})}
					</div>
					</div>
				)}

				{exportReport.isError && (
					<div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
						{exportReport.error instanceof Error
							? exportReport.error.message
							: t("Export failed")}
					</div>
				)}
			</ModalBody>

			{!showSuccess && (
				<ModalFooter>
					<Button variant="outline" onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button
						onClick={handleExport}
						disabled={exportReport.isPending || isFormatDisabled(selectedFormat)}
					>
						{exportReport.isPending && (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						)}
						{t("Export")}
					</Button>
				</ModalFooter>
			)}
			{showSuccess && (
				<ModalFooter>
					<Button variant="outline" onClick={onClose}>
						{t("Close")}
					</Button>
				</ModalFooter>
			)}
		</Modal>
	);
}
