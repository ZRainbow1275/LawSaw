import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/ai-governance — placeholder per SPEC-02 §4 / P1.3.
 * Real AI governance dashboard (model allow-list, redaction policies,
 * spend caps) ships in a follow-up wave. The route exists today so
 * navigation and breadcrumb resolution match the spec.
 */
export default function AdminAiGovernancePage() {
	return (
		<AdminPlaceholderPage
			titleKey="AI governance"
			descriptionKey="Govern model allow-lists, redaction policy, and tenant AI spend caps."
		/>
	);
}
