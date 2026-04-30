import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/reports/new — placeholder per SPEC-02 §4 / P1.3.
 * Report composition wizard (template + period + delivery scope) ships
 * in a follow-up wave. Operators currently launch generation through
 * the inline modal on the reports admin page.
 */
export default function AdminReportNewPage() {
	return (
		<AdminPlaceholderPage
			titleKey="New report"
			descriptionKey="Schedule a new report generation run from a published template."
		/>
	);
}
