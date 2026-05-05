"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCreateReportTemplate } from "@/hooks/use-reports";
import {
	REPORT_PERIOD_TYPES,
	type ReportPeriodType,
} from "@/lib/api/types";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_PERIOD_TYPE: ReportPeriodType = "weekly";

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

export default function AdminReportNewPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const { success, error } = useToast();
	const createTemplate = useCreateReportTemplate();

	const fieldSurfaceStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	const defaultBody = t("Default report template body");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [periodType, setPeriodType] = useState<ReportPeriodType>(
		DEFAULT_PERIOD_TYPE,
	);
	const [templateBody, setTemplateBody] = useState(defaultBody);
	const [cssStyles, setCssStyles] = useState("");

	const handleSubmit = () => {
		const payload = {
			name: name.trim(),
			description: description.trim() || undefined,
			period_type: periodType,
			template_body: templateBody.trim(),
			css_styles: cssStyles.trim() || undefined,
		};

		if (!payload.name || !payload.template_body) {
			error(t("Validation failed"), t("Template name and body are required."));
			return;
		}

		createTemplate.mutate(payload, {
			onSuccess: (created) => {
				success(
					t("Template created"),
					t("The report template is ready for operational use."),
				);
				router.push(
					withLocalePath(locale, `/admin/reports?templateId=${created.id}`),
				);
			},
			onError: (cause) => {
				error(
					t("Create failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between gap-3">
						<div>
							<CardTitle
								className="flex items-center gap-2 text-3xl font-bold tracking-tight"
								style={headingStyle}
							>
								<FilePlus2
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("New report template")}
							</CardTitle>
							<CardDescription>
								{t(
									"Author a new operational baseline. Saving will publish the template to the active catalog.",
								)}
							</CardDescription>
						</div>
						<Link
							href={withLocalePath(locale, "/admin/reports")}
							className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-opacity hover:opacity-80"
							style={{
								backgroundColor: "var(--surface-muted-bg)",
								borderColor: "var(--surface-muted-border)",
								color: "var(--surface-muted-text)",
							}}
						>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
							{t("Back to reports")}
						</Link>
					</div>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("Template details")}</CardTitle>
					<CardDescription>
						{t(
							"Provide a name, cadence, and body. Description and CSS styles are optional.",
						)}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 md:grid-cols-2">
						<div>
							<label
								htmlFor="new-report-template-name"
								className="mb-1 block text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Template name")}
							</label>
							<Input
								id="new-report-template-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								style={fieldSurfaceStyle}
							/>
						</div>
						<div>
							<label
								htmlFor="new-report-template-period"
								className="mb-1 block text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Cadence")}
							</label>
							<select
								id="new-report-template-period"
								value={periodType}
								onChange={(event) =>
									setPeriodType(event.target.value as ReportPeriodType)
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
							htmlFor="new-report-template-description"
							className="mb-1 block text-xs uppercase tracking-wide"
							style={mutedTextStyle}
						>
							{t("Description")}
						</label>
						<Input
							id="new-report-template-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							style={fieldSurfaceStyle}
						/>
					</div>

					<div>
						<label
							htmlFor="new-report-template-body"
							className="mb-1 block text-xs uppercase tracking-wide"
							style={mutedTextStyle}
						>
							{t("Template body (Markdown)")}
						</label>
						<textarea
							id="new-report-template-body"
							value={templateBody}
							onChange={(event) => setTemplateBody(event.target.value)}
							className="min-h-48 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
							style={fieldSurfaceStyle}
						/>
					</div>

					<div>
						<label
							htmlFor="new-report-template-css"
							className="mb-1 block text-xs uppercase tracking-wide"
							style={mutedTextStyle}
						>
							{t("CSS styles (optional)")}
						</label>
						<textarea
							id="new-report-template-css"
							value={cssStyles}
							onChange={(event) => setCssStyles(event.target.value)}
							className="min-h-32 w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
							style={fieldSurfaceStyle}
						/>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs" style={mutedTextStyle}>
							{t(
								"Saving creates a new active version; previous versions are archived.",
							)}
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									router.push(withLocalePath(locale, "/admin/reports"))
								}
								disabled={createTemplate.isPending}
							>
								{t("Cancel")}
							</Button>
							<Button
								type="button"
								onClick={handleSubmit}
								disabled={createTemplate.isPending}
							>
								{createTemplate.isPending
									? t("Creating...")
									: t("Create template")}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
