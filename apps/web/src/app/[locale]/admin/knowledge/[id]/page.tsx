import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/knowledge/[id] — placeholder per SPEC-02 §4 / P1.3.
 * Per-entity inspector (relations, mention graph, embedding signals)
 * ships in a follow-up wave. Today the knowledge governance hub opens
 * an inline drawer.
 */
export default function AdminKnowledgeEntityDetailPage() {
	return (
		<AdminPlaceholderPage
			titleKey="Knowledge entity"
			descriptionKey="Inspect a single knowledge graph entity, its relations, mentions, and embedding coverage."
		/>
	);
}
