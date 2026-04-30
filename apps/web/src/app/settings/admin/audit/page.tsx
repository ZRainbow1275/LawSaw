import { redirectLegacyAdminPath } from "@/lib/redirects/legacy-admin";

/**
 * Legacy alias — canonical path is now `/<locale>/admin/audit` (P1.2).
 * 308-redirect per SPEC-02 §8 dual-panel migration table.
 */
export default async function LegacyAdminAuditPage(): Promise<never> {
	return redirectLegacyAdminPath("/audit");
}
