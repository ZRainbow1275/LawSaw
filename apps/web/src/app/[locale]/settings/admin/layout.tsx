import type { ReactNode } from "react";

/**
 * Legacy admin settings layout — kept as a transparent pass-through.
 *
 * Each `/<locale>/settings/admin/<scope>/page.tsx` issues its own
 * path-preserving 308 redirect to `/<locale>/admin/<scope>` per
 * SPEC-02-DUAL-PANEL §8. We deliberately avoid redirecting at the
 * layout level so that legacy URLs preserve their sub-path on the
 * new workspace (`/settings/admin/users` → `/admin/users`, not
 * `/admin`).
 */
export default function LegacyAdminSettingsLayout({
	children,
}: {
	children: ReactNode;
}) {
	return <>{children}</>;
}
