import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/banners/new — placeholder per SPEC-02 §4 / P1.3.
 * Banner creation wizard ships in a follow-up wave. Until then, the
 * roster page (`/admin/banners`) keeps the inline create modal.
 */
export default function AdminBannerNewPage() {
	return (
		<AdminPlaceholderPage
			titleKey="New banner"
			descriptionKey="Compose a tenant or audience-segment-scoped banner ahead of publication."
		/>
	);
}
