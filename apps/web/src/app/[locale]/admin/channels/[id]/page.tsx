import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/channels/[id] — placeholder per SPEC-02 §4 / P1.3.
 * Per-channel detail (subscribers, included sources, audience scope)
 * ships in a follow-up wave. Channel admin currently exposes inline
 * editing on the roster page.
 */
export default function AdminChannelDetailPage() {
	return (
		<AdminPlaceholderPage
			titleKey="Channel detail"
			descriptionKey="Inspect a single channel's subscribers, included sources, and visibility policy."
		/>
	);
}
