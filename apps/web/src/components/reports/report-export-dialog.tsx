"use client";

import { Button } from "@/components/ui/button";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { useExportReport } from "@/hooks/use-reports";
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
import { useEffect, useState } from "react";

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
	const [selectedFormat, setSelectedFormat] =
		useState<ReportExportFormat>("pdf");
	const [showSuccess, setShowSuccess] = useState(false);

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

	useEffect(() => {
		if (!isOpen) {
			setSelectedFormat("pdf");
			setShowSuccess(false);
			exportReport.reset();
		}
	}, [isOpen, exportReport]);

	useEffect(() => {
		if (exportReport.isSuccess) {
			setShowSuccess(true);
			const timer = setTimeout(() => {
				onClose();
			}, 1500);
			return () => clearTimeout(timer);
		}
	}, [exportReport.isSuccess, onClose]);

	const handleExport = () => {
		if (!report) return;
		exportReport.mutate({ id: report.id, format: selectedFormat });
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
						<CheckCircle className="h-12 w-12 text-green-500" />
						<p className="text-sm font-medium text-green-700">
							{t("Export task queued!")}
						</p>
					</div>
				) : (
					<div className="grid grid-cols-3 gap-4">
						{formats.map((fmt) => {
							const Icon = fmt.icon;
							const isSelected = selectedFormat === fmt.format;
							return (
								<button
									key={fmt.format}
									type="button"
									onClick={() => setSelectedFormat(fmt.format)}
									className={cn(
										"flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all",
										isSelected
											? "border-primary-500 bg-primary-50 text-primary-700"
											: "border-neutral-200 bg-white text-neutral-600 hover:border-primary-200 hover:bg-neutral-50",
									)}
								>
									<Icon aria-hidden="true" className="h-8 w-8" />
									<span className="text-sm font-medium">{fmt.label}</span>
									<span className="text-xs text-center opacity-70">
										{fmt.description}
									</span>
								</button>
							);
						})}
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
					<Button onClick={handleExport} disabled={exportReport.isPending}>
						{exportReport.isPending && (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						)}
						{t("Export")}
					</Button>
				</ModalFooter>
			)}
		</Modal>
	);
}
