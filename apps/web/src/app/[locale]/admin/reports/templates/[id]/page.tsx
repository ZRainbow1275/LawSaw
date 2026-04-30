import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/reports/templates/[id] — placeholder per SPEC-02 §4 / P1.3.
 * Per-template editor (markdown body + CSS + ReBAC scoping) ships in a
 * follow-up wave. The reports admin page already opens an inline drawer
 * for in-place edits.
 */
export default function AdminReportTemplateDetailPage() {
	return (
		<AdminPlaceholderPage
			titleKey="Report template"
			descriptionKey="Edit a single report template, preview its markdown rendering, and manage ReBAC scope."
		/>
	);
}
