"use client";

import { AdminDetailErrorCard } from "@/components/admin/detail-error-card";
import { DetailLayout, MetaList } from "@/components/admin/detail-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	useReportTemplate,
	useUpdateReportTemplate,
} from "@/hooks/use-reports";
import {
	REPORT_PERIOD_TYPES,
	type ReportPeriodType,
} from "@/lib/api/types";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	ArrowLeft,
	Eye,
	FileText,
	Hash,
	Loader2,
	Save,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

export default function AdminReportTemplateDetailPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const templateId = typeof params?.id === "string" ? params.id : "";

	const templateQuery = useReportTemplate(templateId);
	const updateTemplate = useUpdateReportTemplate();
	const { success, error } = useToast();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [periodType, setPeriodType] = useState<ReportPeriodType>("weekly");
	const [body, setBody] = useState("");
	const [cssStyles, setCssStyles] = useState("");

	useEffect(() => {
		if (!templateQuery.data) return;
		const tpl = templateQuery.data;
		setName(tpl.name);
		setDescription(tpl.description ?? "");
		setPeriodType(tpl.period_type as ReportPeriodType);
		setBody(tpl.template_body);
		setCssStyles(tpl.css_styles ?? "");
	}, [templateQuery.data]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--field-surface)",
		color: "var(--field-foreground)",
	} as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const handleBack = () =>
		router.push(withLocalePath(locale, "/admin/reports"));

	const handleSave = () => {
		if (!templateQuery.data) return;
		if (!name.trim() || !body.trim()) {
			error(
				t("Validation failed"),
				t("Template name and body are required."),
			);
			return;
		}
		updateTemplate.mutate(
			{
				id: templateQuery.data.id,
				name: name.trim(),
				description: description.trim() || undefined,
				period_type: periodType,
				template_body: body,
				css_styles: cssStyles.trim() || undefined,
			},
			{
				onSuccess: () => {
					success(
						t("Saved successfully"),
						t("The report template is updated."),
					);
				},
				onError: (cause) => {
					error(
						t("Save failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const dateOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	} as const;

	const previewHtml = useMemo(() => {
		const escaped = body
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		return escaped.replace(/\n/g, "<br/>");
	}, [body]);

	if (!templateId) return null;

	const header = (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
							<FileText
								aria-hidden="true"
								className="h-7 w-7"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Report template editor")}
						</CardTitle>
						<p className="mt-1 text-sm" style={mutedTextStyle}>
							{t(
								"Edit the template body, cadence, and styles. Live preview updates as you type.",
							)}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" variant="outline" onClick={handleBack}>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
							{t("Back to reports")}
						</Button>
						<Button
							type="button"
							onClick={handleSave}
							disabled={
								updateTemplate.isPending || templateQuery.isLoading
							}
						>
							{updateTemplate.isPending ? (
								<Loader2
									aria-hidden="true"
									className="h-4 w-4 animate-spin"
								/>
							) : (
								<Save aria-hidden="true" className="h-4 w-4" />
							)}
							{t("Save template")}
						</Button>
					</div>
				</div>
			</CardHeader>
		</Card>
	);

	if (templateQuery.isLoading) {
		return (
			<DetailLayout
				header={header}
				main={
					<Card>
						<CardContent className="flex items-center gap-2 py-8 text-sm">
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading template")}
						</CardContent>
					</Card>
				}
			/>
		);
	}

	if (templateQuery.isError || !templateQuery.data) {
		return (
			<DetailLayout
				header={header}
				main={
					<AdminDetailErrorCard
						resource="reportTemplate"
						error={templateQuery.error}
						onRetry={() => templateQuery.refetch()}
					/>
				}
			/>
		);
	}

	const template = templateQuery.data;

	const main = (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t("Template details")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label
								htmlFor="template-name"
								className="mb-1 block text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Template name")}
							</label>
							<Input
								id="template-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						<div>
							<label
								htmlFor="template-period"
								className="mb-1 block text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Cadence")}
							</label>
							<select
								id="template-period"
								value={periodType}
								onChange={(event) =>
									setPeriodType(event.target.value as ReportPeriodType)
								}
								className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
								style={fieldStyle}
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
							htmlFor="template-description"
							className="mb-1 block text-xs uppercase tracking-wide"
							style={mutedTextStyle}
						>
							{t("Description")}
						</label>
						<Input
							id="template-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						{t("Template body (Markdown)")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<textarea
						id="template-body"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						className="min-h-72 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2"
						style={fieldStyle}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						{t("CSS styles (optional)")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<textarea
						id="template-css"
						value={cssStyles}
						onChange={(event) => setCssStyles(event.target.value)}
						className="min-h-32 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2"
						style={fieldStyle}
					/>
				</CardContent>
			</Card>
		</>
	);

	const meta = (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Eye aria-hidden="true" className="h-4 w-4" />
						{t("Live preview")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div
						className="rounded-2xl border p-4 text-xs leading-6"
						style={surfaceStyle}
					>
						{cssStyles ? <style>{cssStyles}</style> : null}
						<div
							style={headingStyle}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: preview-only newline-to-br rendering of escaped markdown body
							dangerouslySetInnerHTML={{ __html: previewHtml }}
						/>
					</div>
				</CardContent>
			</Card>

			<MetaList
				title={t("Template metadata")}
				icon={<Hash aria-hidden="true" className="h-4 w-4" />}
				items={[
					{
						label: t("Template ID"),
						value: (
							<code className="break-all font-mono text-xs">{template.id}</code>
						),
					},
					{
						label: t("Status"),
						value: (
							<div className="flex flex-wrap gap-2">
								{template.is_builtin ? (
									<Badge variant="secondary">{t("Built-in")}</Badge>
								) : null}
								{template.is_active ? (
									<Badge variant="success">{t("Active")}</Badge>
								) : (
									<Badge variant="outline">{t("Archived")}</Badge>
								)}
							</div>
						),
					},
					{
						label: t("Version"),
						value: String(template.version),
					},
					{
						label: t("Created at"),
						value: formatDateTime(locale, template.created_at, dateOptions),
					},
					{
						label: t("Updated at"),
						value: formatDateTime(locale, template.updated_at, dateOptions),
					},
				]}
			/>
		</>
	);

	return <DetailLayout header={header} main={main} meta={meta} />;
}
