import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ADMIN_TIERS, normalizeRoleTier } from "@/lib/authz";
import { getServerSession } from "@/lib/auth/server-session";
import { DEFAULT_LOCALE, isLocale, withLocalePath } from "@/lib/i18n";

/**
 * Admin workspace guard.
 *
 * - Server component: enforces auth + role tier before any nested page renders.
 * - Unauthenticated callers are bounced to `/<locale>/login?next=/admin...`.
 * - Authenticated non-admin tiers are redirected to `/<locale>/me/feed?denied=admin`.
 *
 * This layout intentionally renders only `{children}`. The admin workspace
 * shell (sidebar / topbar / tile grid) is the responsibility of the nested
 * pages so the guard stays minimal and side-effect free.
 */
export default async function AdminLocaleLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const resolved = await params;
	const locale = isLocale(resolved.locale) ? resolved.locale : DEFAULT_LOCALE;

	const session = await getServerSession();
	if (!session) {
		const next = encodeURIComponent("/admin");
		redirect(`${withLocalePath(locale, "/login")}?next=${next}`);
	}

	const tier = normalizeRoleTier(session.role_tier);
	if (!ADMIN_TIERS.includes(tier)) {
		redirect(`${withLocalePath(locale, "/me/feed")}?denied=admin`);
	}

	return <>{children}</>;
}
