import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/reports/runs — placeholder per SPEC-02 §4 / P1.3.
 * Generation history with retry/inspect controls ships in a follow-up
 * wave. Today the reports page surfaces a recent delivery queue.
 */
export default function AdminReportRunsPage() {
	return (
		<AdminPlaceholderPage
			titleKey="Report runs"
			descriptionKey="Inspect the report generation pipeline, retry failures, and audit historical outputs."
		/>
	);
}
