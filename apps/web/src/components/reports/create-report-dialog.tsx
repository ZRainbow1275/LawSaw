"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { useCreateReport, useReportTemplates } from "@/hooks/use-reports";
import type { ReportPeriodType } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CreateReportDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess?: () => void;
}

const PERIOD_TYPES: ReportPeriodType[] = [
	"weekly",
	"monthly",
	"quarterly",
	"custom",
];

export function CreateReportDialog({
	isOpen,
	onClose,
	onSuccess,
}: CreateReportDialogProps) {
	const t = useT();
	const createReport = useCreateReport();

	const [title, setTitle] = useState("");
	const [periodType, setPeriodType] = useState<ReportPeriodType>("weekly");
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");
	const [templateId, setTemplateId] = useState<string>("");

	const { data: templates, isLoading: templatesLoading } =
		useReportTemplates(periodType);

	const resetForm = useCallback(() => {
		setTitle("");
		setPeriodType("weekly");
		setPeriodStart("");
		setPeriodEnd("");
		setTemplateId("");
	}, []);

	useEffect(() => {
		if (!isOpen) {
			resetForm();
			createReport.reset();
		}
	}, [isOpen, resetForm, createReport]);

	// Reset template selection when period type changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on periodType change
	useEffect(() => {
		setTemplateId("");
	}, [periodType]);

	const handleSubmit = () => {
		if (!title.trim() || !periodStart || !periodEnd) return;

		createReport.mutate(
			{
				title: title.trim(),
				period_type: periodType,
				period_start: periodStart,
				period_end: periodEnd,
				template_id: templateId || undefined,
			},
			{
				onSuccess: () => {
					onSuccess?.();
					onClose();
				},
			},
		);
	};

	const isValid = title.trim().length > 0 && periodStart && periodEnd;

	const selectClassName = cn(
		"flex h-10 w-full rounded-lg border-2 border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-900 transition-all",
		"focus:border-primary-500 focus:bg-white focus:outline-none",
		"hover:border-primary-200",
		"disabled:cursor-not-allowed disabled:opacity-50",
	);

	const periodLabels: Record<string, string> = {
		weekly: t("Weekly"),
		monthly: t("Monthly"),
		quarterly: t("Quarterly"),
		custom: t("Custom"),
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="lg">
			<ModalHeader>
				<h2 className="text-xl font-bold text-neutral-900">
					{t("Create Report")}
				</h2>
				<p className="text-sm text-neutral-500 mt-1">
					{t("Create a new periodic legal analysis report")}
				</p>
			</ModalHeader>

			<ModalBody>
				<div className="space-y-4">
					{/* Title */}
					<div>
						<label
							htmlFor="report-title"
							className="block text-sm font-medium text-neutral-700 mb-1.5"
						>
							{t("Report Title")}
						</label>
						<Input
							id="report-title"
							type="text"
							placeholder={t("Enter report title...")}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>

					{/* Period Type */}
					<div>
						<label
							htmlFor="period-type"
							className="block text-sm font-medium text-neutral-700 mb-1.5"
						>
							{t("Period Type")}
						</label>
						<select
							id="period-type"
							value={periodType}
							onChange={(e) =>
								setPeriodType(e.target.value as ReportPeriodType)
							}
							className={selectClassName}
						>
							{PERIOD_TYPES.map((pt) => (
								<option key={pt} value={pt}>
									{periodLabels[pt] ?? pt}
								</option>
							))}
						</select>
					</div>

					{/* Date Range */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label
								htmlFor="period-start"
								className="block text-sm font-medium text-neutral-700 mb-1.5"
							>
								{t("Period Start")}
							</label>
							<Input
								id="period-start"
								type="date"
								value={periodStart}
								onChange={(e) => setPeriodStart(e.target.value)}
							/>
						</div>
						<div>
							<label
								htmlFor="period-end"
								className="block text-sm font-medium text-neutral-700 mb-1.5"
							>
								{t("Period End")}
							</label>
							<Input
								id="period-end"
								type="date"
								value={periodEnd}
								onChange={(e) => setPeriodEnd(e.target.value)}
							/>
						</div>
					</div>

					{/* Template */}
					<div>
						<label
							htmlFor="report-template"
							className="block text-sm font-medium text-neutral-700 mb-1.5"
						>
							{t("Template (optional)")}
						</label>
						<select
							id="report-template"
							value={templateId}
							onChange={(e) => setTemplateId(e.target.value)}
							className={selectClassName}
							disabled={templatesLoading}
						>
							<option value="">
								{templatesLoading
									? t("Loading templates...")
									: t("No template")}
							</option>
							{templates?.map((tpl) => (
								<option key={tpl.id} value={tpl.id}>
									{tpl.name}
									{tpl.description ? ` — ${tpl.description}` : ""}
								</option>
							))}
						</select>
					</div>

					{/* Error */}
					{createReport.isError && (
						<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{createReport.error instanceof Error
								? createReport.error.message
								: t("Failed to create report")}
						</div>
					)}
				</div>
			</ModalBody>

			<ModalFooter>
				<Button variant="outline" onClick={onClose}>
					{t("Cancel")}
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={!isValid || createReport.isPending}
				>
					{createReport.isPending && (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					)}
					{t("Create Report")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
