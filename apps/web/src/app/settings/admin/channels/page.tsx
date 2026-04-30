import { redirectLegacyAdminPath } from "@/lib/redirects/legacy-admin";

/**
 * Legacy alias — canonical path is now `/<locale>/admin/channels` (P1.2).
 * 308-redirect per SPEC-02 §8 dual-panel migration table.
 */
export default async function LegacyAdminChannelsPage(): Promise<never> {
	return redirectLegacyAdminPath("/channels");
}
