import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/sources/[id] — placeholder per SPEC-02 §4 / P1.3.
 * Per-source detail (recent runs, parsed articles, error history) ships
 * in a follow-up wave. The roster page already opens an inline drawer.
 */
export default function AdminSourceDetailPage() {
	return (
		<AdminPlaceholderPage
			titleKey="Source detail"
			descriptionKey="Inspect a single ingestion source's recent runs, error history, and ingested articles."
		/>
	);
}
