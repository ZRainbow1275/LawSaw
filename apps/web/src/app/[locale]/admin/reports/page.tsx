"use client";

import { ReportTemplateDrawer } from "@/components/admin/report-template-drawer";
import { useAdminDeepLink } from "@/hooks/use-admin-deep-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import {
	useCreateReportTemplate,
	useDeleteReportTemplate,
	useReportTemplates,
	useReports,
	useUpdateReportTemplate,
} from "@/hooks/use-reports";
import {
	REPORT_PERIOD_TYPES,
	REPORT_STATUSES,
	type ReportPeriodType,
	type ReportStatus,
	type ReportTemplate,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	ClipboardList,
	FileCode2,
	FileStack,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
	Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TemplateDraft = {
	name: string;
	description: string;
	period_type: ReportPeriodType;
	template_body: string;
	css_styles: string;
};

const DEFAULT_PERIOD_TYPE: ReportPeriodType = "weekly";

function createEmptyTemplateDraft(
	templateBody: string,
	periodType: ReportPeriodType = DEFAULT_PERIOD_TYPE,
): TemplateDraft {
	return {
		name: "",
		description: "",
		period_type: periodType,
		template_body: templateBody,
		css_styles: "",
	};
}

function periodLabel(t: ReturnType<typeof useT>, value: string) {
	switch (value) {
		case "weekly":
			return t("Weekly");
		case "monthly":
			return t("Monthly");
		case "quarterly":
			return t("Quarterly");
		case "custom":
			return t("Custom");
		default:
			return value;
	}
}

function reportStatusVariant(
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
		default:
			return "outline";
	}
}

function reportStatusLabel(t: ReturnType<typeof useT>, status: ReportStatus) {
	switch (status) {
		case "draft":
			return t("Draft");
		case "generating":
			return t("Generating");
		case "generated":
			return t("Generated");
		case "review":
			return t("In review");
		case "approved":
			return t("Approved");
		case "published":
			return t("Published");
		case "archived":
			return t("Archived");
		case "error":
			return t("Error");
		default:
			return status;
	}
}

function templateSummary(template: ReportTemplate) {
	const body = template.template_body.trim();
	if (!body) return "";
	return body.length > 160 ? `${body.slice(0, 160)}...` : body;
}

function AdminReportsContent() {
	const locale = useLocale();
	const t = useT();
	const { success, error } = useToast();
	const { searchParams, clearSearchParams } = useAdminDeepLink();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const softSurfaceStyle = {
		backgroundColor: "var(--control-hover-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldSurfaceStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const selectedSurfaceStyle = {
		backgroundColor: "var(--control-selected-bg)",
		borderColor: "var(--control-selected-border)",
		color: "var(--control-selected-text)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const defaultTemplateBody = t("Default report template body");
	const defaultTemplateBodyRef = useRef(defaultTemplateBody);
	const runsSectionRef = useRef<HTMLDivElement | null>(null);
	const authoringSectionRef = useRef<HTMLDivElement | null>(null);

	const [periodFilter, setPeriodFilter] = useState<"all" | ReportPeriodType>(
		"all",
	);
	const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
		null,
	);
	const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
	const [drawerTemplateId, setDrawerTemplateId] = useState<string | null>(null);
	const [draft, setDraft] = useState<TemplateDraft>(() =>
		createEmptyTemplateDraft(defaultTemplateBodyRef.current),
	);
	const createParam = searchParams.get("create");
	const tabParam = searchParams.get("tab");
	const templateIdParam = searchParams.get("templateId");

	useEffect(() => {
		defaultTemplateBodyRef.current = defaultTemplateBody;
	}, [defaultTemplateBody]);

	const overviewReportsQuery = useReports({ limit: 50, offset: 0 });
	const recentReportsQuery = useReports({
		limit: 8,
		offset: 0,
		period_type: periodFilter === "all" ? undefined : periodFilter,
		status: statusFilter === "all" ? undefined : statusFilter,
	});
	const allTemplatesQuery = useReportTemplates();
	const filteredTemplatesQuery = useReportTemplates(
		periodFilter === "all" ? undefined : periodFilter,
	);

	const createTemplate = useCreateReportTemplate();
	const updateTemplate = useUpdateReportTemplate();
	const deleteTemplate = useDeleteReportTemplate();

	const templates = filteredTemplatesQuery.data ?? [];
	const allTemplates = allTemplatesQuery.data ?? [];
	const selectedTemplate = useMemo(
		() => allTemplates.find((item) => item.id === selectedTemplateId) ?? null,
		[allTemplates, selectedTemplateId],
	);
	const drawerTemplate = useMemo(
		() => allTemplates.find((item) => item.id === drawerTemplateId) ?? null,
		[allTemplates, drawerTemplateId],
	);

	const resetTemplateDraft = useCallback(() => {
		setSelectedTemplateId(null);
		setDraft(
			createEmptyTemplateDraft(
				defaultTemplateBodyRef.current,
				periodFilter === "all" ? DEFAULT_PERIOD_TYPE : periodFilter,
			),
		);
	}, [periodFilter]);

	useEffect(() => {
		if (!templateIdParam) return;
		const template = allTemplates.find((item) => item.id === templateIdParam);
		if (!template) return;
		setPeriodFilter("all");
		setSelectedTemplateId(template.id);
		setDrawerTemplateId(template.id);
	}, [allTemplates, templateIdParam]);

	useEffect(() => {
		if (createParam !== "1") return;
		setDrawerTemplateId(null);
		resetTemplateDraft();
		authoringSectionRef.current?.scrollIntoView({
			block: "start",
			behavior: "smooth",
		});
	}, [createParam, resetTemplateDraft]);

	useEffect(() => {
		if (tabParam !== "runs") return;
		runsSectionRef.current?.scrollIntoView({
			block: "start",
			behavior: "smooth",
		});
	}, [tabParam]);

	useEffect(() => {
		if (selectedTemplate) {
			setDraft({
				name: selectedTemplate.name,
				description: selectedTemplate.description ?? "",
				period_type:
					(selectedTemplate.period_type as ReportPeriodType) ||
					DEFAULT_PERIOD_TYPE,
				template_body: selectedTemplate.template_body,
				css_styles: selectedTemplate.css_styles ?? "",
			});
			return;
		}

		setDraft(
			createEmptyTemplateDraft(
				defaultTemplateBodyRef.current,
				periodFilter === "all" ? DEFAULT_PERIOD_TYPE : periodFilter,
			),
		);
	}, [selectedTemplate, periodFilter]);

	const statusCounts = useMemo(() => {
		const counts = new Map<ReportStatus, number>();
		for (const item of overviewReportsQuery.data?.data ?? []) {
			const key = item.status as ReportStatus;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	}, [overviewReportsQuery.data]);

	const summaryCards = [
		{
			tone: "info" as const,
			label: t("Templates in catalog"),
			value: allTemplates.length,
			icon: FileCode2,
		},
		{
			tone: "success" as const,
			label: t("Active templates"),
			value: allTemplates.filter((item) => item.is_active).length,
			icon: FileStack,
		},
		{
			tone: "warning" as const,
			label: t("Built-in templates"),
			value: allTemplates.filter((item) => item.is_builtin).length,
			icon: Workflow,
		},
		{
			tone: "info" as const,
			label: t("Reports in pipeline"),
			value: overviewReportsQuery.data?.total ?? 0,
			icon: ClipboardList,
		},
	];

	const handleResetDraft = () => {
		resetTemplateDraft();
		clearSearchParams(["create", "templateId"]);
	};

	const handleSubmitTemplate = () => {
		const payload = {
			name: draft.name.trim(),
			description: draft.description.trim() || undefined,
			period_type: draft.period_type,
			template_body: draft.template_body.trim(),
			css_styles: draft.css_styles.trim() || undefined,
		};

		if (!payload.name || !payload.template_body) {
			error(t("Validation failed"), t("Template name and body are required."));
			return;
		}

		if (!selectedTemplate) {
			createTemplate.mutate(payload, {
				onSuccess: (created) => {
					success(
						t("Template created"),
						t("The report template is ready for operational use."),
					);
					setSelectedTemplateId(created.id);
					clearSearchParams(["create"]);
				},
				onError: (cause) => {
					error(
						t("Create failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			});
			return;
		}

		updateTemplate.mutate(
			{
				id: selectedTemplate.id,
				name: payload.name,
				description: payload.description,
				period_type: payload.period_type,
				template_body: payload.template_body,
				css_styles: payload.css_styles,
			},
			{
				onSuccess: () => {
					success(
						t("Template updated"),
						t("Template changes are now visible to report operators."),
					);
				},
				onError: (cause) => {
					error(
						t("Update failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const handleDeleteTemplate = () => {
		if (!selectedTemplate) return;
		setConfirmArchiveOpen(true);
	};

	const confirmDeleteTemplate = () => {
		if (!selectedTemplate) return;
		deleteTemplate.mutate(selectedTemplate.id, {
			onSuccess: () => {
				success(
					t("Template archived"),
					t(
						"The template was soft deleted and removed from active operations.",
					),
				);
				setConfirmArchiveOpen(false);
				handleResetDraft();
			},
			onError: (cause) => {
				error(
					t("Delete failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	const templateBusy =
		createTemplate.isPending ||
		updateTemplate.isPending ||
		deleteTemplate.isPending;

	return (
		<>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
							<ClipboardList
								aria-hidden="true"
								className="h-7 w-7"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Report operations hub")}
						</CardTitle>
						<CardDescription>
							{t(
								"Govern report templates, monitor lifecycle status, and keep delivery policy aligned with tenant roles.",
							)}
						</CardDescription>
					</CardHeader>
				</Card>

				{!isAdmin ? (
					<EmptyState
						title={t("Access restricted")}
						description={t(
							"You need an administrative role to access this workspace.",
						)}
					/>
				) : (
					<>
						<KpiCardGrid columns={4}>
							{summaryCards.map((item) => (
								<KpiCard
									key={item.label}
									tone={item.tone}
									label={item.label}
									value={item.value}
									icon={item.icon}
								/>
							))}
						</KpiCardGrid>

						<div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
							<Card>
								<CardHeader>
									<CardTitle>{t("Status overview")}</CardTitle>
									<CardDescription>
										{t(
											"Use real generation status and period filters to focus the current delivery queue.",
										)}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="grid gap-3 md:grid-cols-2">
										<div>
											<label
												htmlFor="report-period-filter"
												className="mb-1 block text-xs font-medium uppercase tracking-wide"
												style={mutedTextStyle}
											>
												{t("Period filter")}
											</label>
											<select
												id="report-period-filter"
												value={periodFilter}
												onChange={(event) =>
													setPeriodFilter(
														event.target.value as "all" | ReportPeriodType,
													)
												}
												className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
												style={fieldSurfaceStyle}
											>
												<option value="all">{t("All periods")}</option>
												{REPORT_PERIOD_TYPES.map((value) => (
													<option key={value} value={value}>
														{periodLabel(t, value)}
													</option>
												))}
											</select>
										</div>
										<div>
											<label
												htmlFor="report-status-filter"
												className="mb-1 block text-xs font-medium uppercase tracking-wide"
												style={mutedTextStyle}
											>
												{t("Status filter")}
											</label>
											<select
												id="report-status-filter"
												value={statusFilter}
												onChange={(event) =>
													setStatusFilter(
														event.target.value as "all" | ReportStatus,
													)
												}
												className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
												style={fieldSurfaceStyle}
											>
												<option value="all">{t("All statuses")}</option>
												{REPORT_STATUSES.map((value) => (
													<option key={value} value={value}>
														{reportStatusLabel(t, value)}
													</option>
												))}
											</select>
										</div>
									</div>

									<div className="grid gap-3 md:grid-cols-2">
										{REPORT_STATUSES.map((status) => (
											<div
												key={status}
												className="rounded-2xl border px-4 py-3"
												style={softSurfaceStyle}
											>
												<div className="flex items-center justify-between gap-3">
													<Badge variant={reportStatusVariant(status)}>
														{reportStatusLabel(t, status)}
													</Badge>
													<span
														className="text-lg font-semibold"
														style={headingStyle}
													>
														{statusCounts.get(status) ?? 0}
													</span>
												</div>
											</div>
										))}
									</div>

									<p className="text-xs" style={mutedTextStyle}>
										{t(
											"This view surfaces real report records and real template definitions. No mock data is used.",
										)}
									</p>
								</CardContent>
							</Card>

							<Card
								ref={runsSectionRef}
								data-testid="reports-runs-section"
							>
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<div>
											<CardTitle>{t("Recent delivery queue")}</CardTitle>
											<CardDescription>
												{t(
													"Track live reports, article volume, and publish readiness from the current filter context.",
												)}
											</CardDescription>
										</div>
										<Button
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
								</CardHeader>
								<CardContent className="space-y-3">
									{recentReportsQuery.isLoading ? (
										<p className="text-sm" style={mutedTextStyle}>
											{t("Loading reports")}
										</p>
									) : recentReportsQuery.isError ? (
										<EmptyState
											variant="error"
											title={t("Failed to load reports")}
											description={
												recentReportsQuery.error instanceof Error
													? recentReportsQuery.error.message
													: t("Unknown error")
											}
											action={{
												label: t("Retry"),
												onClick: () => recentReportsQuery.refetch(),
											}}
											className="py-8"
										/>
									) : (recentReportsQuery.data?.data.length ?? 0) === 0 ? (
										<EmptyState
											title={t("No reports matched")}
											description={t(
												"Adjust the period or status filter to inspect another operational slice.",
											)}
											className="py-8"
										/>
									) : (
										recentReportsQuery.data?.data.map((report) => (
											<div
												key={report.id}
												className="rounded-2xl border px-4 py-4"
												style={surfaceStyle}
											>
												<div className="flex flex-wrap items-start justify-between gap-3">
													<div className="min-w-0 space-y-1">
														<p
															className="truncate text-base font-semibold"
															style={headingStyle}
														>
															{report.title}
														</p>
														<p className="text-xs" style={mutedTextStyle}>
															{report.report_number}
														</p>
													</div>
													<div className="flex flex-wrap items-center gap-2">
														<Badge variant={reportStatusVariant(report.status)}>
															{reportStatusLabel(t, report.status)}
														</Badge>
														<Badge variant="outline">
															{periodLabel(t, report.period_type)}
														</Badge>
													</div>
												</div>
												<div
													className="mt-3 grid gap-3 text-sm md:grid-cols-3"
													style={mutedTextStyle}
												>
													<div>
														<p
															className="text-xs uppercase tracking-wide"
															style={mutedTextStyle}
														>
															{t("Report window")}
														</p>
														<p className="mt-1">
															{report.period_start} - {report.period_end}
														</p>
													</div>
													<div>
														<p
															className="text-xs uppercase tracking-wide"
															style={mutedTextStyle}
														>
															{t("Articles included")}
														</p>
														<p className="mt-1">{report.article_count}</p>
													</div>
													<div>
														<p
															className="text-xs uppercase tracking-wide"
															style={mutedTextStyle}
														>
															{t("Updated at")}
														</p>
														<p className="mt-1">
															{formatDateTime(locale, report.updated_at, {
																year: "numeric",
																month: "2-digit",
																day: "2-digit",
																hour: "2-digit",
																minute: "2-digit",
															})}
														</p>
													</div>
												</div>
											</div>
										))
									)}
								</CardContent>
							</Card>
						</div>

						<div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<div>
											<CardTitle>{t("Template library")}</CardTitle>
											<CardDescription>
												{t(
													"Filter real tenant templates by cadence, then open one for editing or create a new operational baseline.",
												)}
											</CardDescription>
										</div>
										<Button
											variant="outline"
											size="sm"
											onClick={handleResetDraft}
										>
											<Plus aria-hidden="true" className="h-4 w-4" />
											{t("New template")}
										</Button>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									{filteredTemplatesQuery.isLoading ? (
										<p className="text-sm" style={mutedTextStyle}>
											{t("Loading templates")}
										</p>
									) : filteredTemplatesQuery.isError ? (
										<EmptyState
											variant="error"
											title={t("Failed to load templates")}
											description={
												filteredTemplatesQuery.error instanceof Error
													? filteredTemplatesQuery.error.message
													: t("Unknown error")
											}
											action={{
												label: t("Retry"),
												onClick: () => filteredTemplatesQuery.refetch(),
											}}
											className="py-8"
										/>
									) : templates.length === 0 ? (
										<EmptyState
											title={t("No templates matched")}
											description={t(
												"Create the first template for this cadence or switch to another period filter.",
											)}
											className="py-8"
										/>
									) : (
										templates.map((template) => {
											const isSelected = template.id === selectedTemplateId;
											return (
												<button
													key={template.id}
													type="button"
													onClick={() => setSelectedTemplateId(template.id)}
													className="w-full rounded-2xl border px-4 py-4 text-left transition-colors"
													style={
														isSelected ? selectedSurfaceStyle : surfaceStyle
													}
												>
													<div className="flex items-start justify-between gap-3">
														<div className="min-w-0">
															<p
																className="truncate text-base font-semibold"
																style={headingStyle}
															>
																{template.name}
															</p>
															<p
																className="mt-1 text-xs"
																style={mutedTextStyle}
															>
																{template.description ||
																	t("No template description yet.")}
															</p>
														</div>
														<div className="flex flex-wrap items-center gap-2">
															<Badge variant="outline">
																{periodLabel(t, template.period_type)}
															</Badge>
															{template.is_builtin ? (
																<Badge variant="secondary">
																	{t("Built-in")}
																</Badge>
															) : null}
															<Badge
																variant={
																	template.is_active ? "success" : "outline"
																}
															>
																{template.is_active
																	? t("Active")
																	: t("Disabled")}
															</Badge>
														</div>
													</div>
													<p
														className="mt-3 text-sm leading-6"
														style={mutedTextStyle}
													>
														{templateSummary(template) ||
															t("No template body yet.")}
													</p>
													<p className="mt-3 text-xs" style={mutedTextStyle}>
														{t("Updated at")}:{" "}
														{formatDateTime(locale, template.updated_at, {
															year: "numeric",
															month: "2-digit",
															day: "2-digit",
															hour: "2-digit",
															minute: "2-digit",
														})}
													</p>
												</button>
											);
										})
									)}
								</CardContent>
							</Card>

							<Card
								ref={authoringSectionRef}
								data-testid="report-template-authoring-section"
							>
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<div>
											<CardTitle>
												{selectedTemplate
													? t("Edit template")
													: t("New template")}
											</CardTitle>
											<CardDescription>
												{t(
													"Authoring is markdown-first; use the rich editor for collaborative review and live preview.",
												)}
											</CardDescription>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												variant="outline"
												onClick={handleResetDraft}
												disabled={templateBusy}
											>
												{t("Reset")}
											</Button>
											{selectedTemplate ? (
												<Button
													type="button"
													variant="outline"
													onClick={() =>
														setDrawerTemplateId(selectedTemplate.id)
													}
												>
													<Pencil aria-hidden="true" className="h-4 w-4" />
													{t("Open rich editor")}
												</Button>
											) : null}
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="grid gap-3 md:grid-cols-2">
										<div>
											<label
												htmlFor="report-template-name"
												className="mb-1 block text-xs uppercase tracking-wide"
												style={mutedTextStyle}
											>
												{t("Template name")}
											</label>
											<Input
												id="report-template-name"
												value={draft.name}
												onChange={(event) =>
													setDraft((current) => ({
														...current,
														name: event.target.value,
													}))
												}
												style={fieldSurfaceStyle}
											/>
										</div>
										<div>
											<label
												htmlFor="report-template-period"
												className="mb-1 block text-xs uppercase tracking-wide"
												style={mutedTextStyle}
											>
												{t("Cadence")}
											</label>
											<select
												id="report-template-period"
												value={draft.period_type}
												onChange={(event) =>
													setDraft((current) => ({
														...current,
														period_type: event.target.value as ReportPeriodType,
													}))
												}
												className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
												style={fieldSurfaceStyle}
											>
												{REPORT_PERIOD_TYPES.map((value) => (
													<option key={value} value={value}>
														{periodLabel(t, value)}
													</option>
												))}
											</select>
										</div>
									</div>
									<div>
										<label
											htmlFor="report-template-description"
											className="mb-1 block text-xs uppercase tracking-wide"
											style={mutedTextStyle}
										>
											{t("Description")}
										</label>
										<Input
											id="report-template-description"
											value={draft.description}
											onChange={(event) =>
												setDraft((current) => ({
													...current,
													description: event.target.value,
												}))
											}
											style={fieldSurfaceStyle}
										/>
									</div>
									<div>
										<label
											htmlFor="report-template-body"
											className="mb-1 block text-xs uppercase tracking-wide"
											style={mutedTextStyle}
										>
											{t("Template body (Markdown)")}
										</label>
										<textarea
											id="report-template-body"
											value={draft.template_body}
											onChange={(event) =>
												setDraft((current) => ({
													...current,
													template_body: event.target.value,
												}))
											}
											className="min-h-48 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
											style={fieldSurfaceStyle}
										/>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<p className="text-xs" style={mutedTextStyle}>
											{selectedTemplate?.is_builtin
												? t("Built-in templates are read-only.")
												: t(
														"Saving creates a new active version; previous versions are archived.",
													)}
										</p>
										<div className="flex flex-wrap gap-2">
											{selectedTemplate && !selectedTemplate.is_builtin ? (
												<Button
													type="button"
													variant="destructive"
													onClick={handleDeleteTemplate}
													disabled={templateBusy}
												>
													<Trash2 aria-hidden="true" className="h-4 w-4" />
													{t("Archive")}
												</Button>
											) : null}
											<Button
												type="button"
												onClick={handleSubmitTemplate}
												disabled={
													templateBusy ||
													(selectedTemplate?.is_builtin ?? false)
												}
											>
												{selectedTemplate
													? t("Save template")
													: t("Create template")}
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
					</>
				)}
			</div>
			<ConfirmActionModal
				isOpen={confirmArchiveOpen}
				onClose={() => setConfirmArchiveOpen(false)}
				onConfirm={confirmDeleteTemplate}
				title={t("Archive template")}
				description={t(
					"Custom templates can be updated live and soft deleted without losing audit history.",
				)}
				confirmLabel={t("Archive template")}
				cancelLabel={t("Cancel")}
				busy={deleteTemplate.isPending}
			/>
			<ReportTemplateDrawer
				open={drawerTemplateId !== null}
				template={drawerTemplate}
				onClose={() => {
					setDrawerTemplateId(null);
					clearSearchParams(["templateId"]);
				}}
				saving={updateTemplate.isPending}
				onSaveTemplateBody={async (next) => {
					if (!drawerTemplate) return;
					await updateTemplate.mutateAsync({
						id: drawerTemplate.id,
						name: drawerTemplate.name,
						description: drawerTemplate.description ?? undefined,
						period_type: drawerTemplate.period_type,
						template_body: next,
						css_styles: drawerTemplate.css_styles ?? undefined,
					});
				}}
			/>
		</>
	);
}

export default function AdminReportsPage() {
	return <AdminReportsContent />;
}
