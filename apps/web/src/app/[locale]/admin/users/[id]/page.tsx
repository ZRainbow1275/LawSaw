import { AdminPlaceholderPage } from "@/components/admin/admin-placeholder-page";

/**
 * /<locale>/admin/users/[id] — placeholder per SPEC-02 §4 / P1.3.
 * Per-user detail panel (role assignments, AI spend, activity log) ships
 * in a follow-up wave. The roster (`/admin/users`) exposes an inline
 * drawer in the meantime.
 */
export default function AdminUserDetailPage() {
	return (
		<AdminPlaceholderPage
			titleKey="User profile"
			descriptionKey="Inspect a tenant member's roles, ReBAC tuples, and recent activity."
		/>
	);
}
