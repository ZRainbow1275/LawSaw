import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/feedbacks/[id] — placeholder per SPEC-02 §4 / P1.3.
 * Per-ticket reply console (with audit trail and tenant-targeting) ships
 * in a follow-up wave. The feedback desk already exposes an inline reply
 * drawer.
 */
export default function AdminFeedbackDetailPage() {
	return (
		<AdminPlaceholderPage
			titleKey="Feedback ticket"
			descriptionKey="Triage a single feedback record, post a reply, and audit prior interactions."
		/>
	);
}
