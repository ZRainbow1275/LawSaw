import { AdminShell } from "@/components/layout/admin-shell";
import { getServerSession } from "@/lib/auth/server-session";
import { ADMIN_TIERS, normalizeRoleTier } from "@/lib/authz";
import {
	DEFAULT_LOCALE,
	isLocale,
	stripLocalePrefix,
	withLocalePath,
} from "@/lib/i18n";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Admin workspace guard.
 *
 * - Server component: enforces auth + role tier before any nested page renders.
 * - Unauthenticated callers are bounced to `/<locale>/login?next=<original-path>`.
 *   The original path is read from the `x-pathname` header injected by
 *   `apps/web/src/middleware.ts`, so deep links like `/zh/admin/audit` round-trip
 *   correctly after login instead of always landing back on `/zh/admin`.
 * - Authenticated non-admin tiers are redirected to `/<locale>/me/feed?denied=admin`.
 *
 * This layout owns the admin workspace shell so every nested admin route uses
 * the same sidebar, topbar, breadcrumb, workspace switcher, and visual surface.
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
		const headerStore = await headers();
		const requestPath = headerStore.get("x-pathname") ?? "/admin";
		// Strip leading locale prefix so the eventual login redirect builds
		// `/<locale>/login?next=<path-without-locale>`. Fallback to `/admin`
		// when the middleware header is missing (e.g. test environments).
		const localeStripped = stripLocalePrefix(requestPath) || "/admin";
		const next = encodeURIComponent(localeStripped);
		redirect(`${withLocalePath(locale, "/login")}?next=${next}`);
	}

	const tier = normalizeRoleTier(session.role_tier);
	if (!ADMIN_TIERS.includes(tier)) {
		redirect(`${withLocalePath(locale, "/me/feed")}?denied=admin`);
	}

	return <AdminShell>{children}</AdminShell>;
}
