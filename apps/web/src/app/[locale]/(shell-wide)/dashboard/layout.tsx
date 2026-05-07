import { getServerSession } from "@/lib/auth/server-session";
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
 * Dashboard guard.
 *
 * Server-side check: anonymous SSR requests are redirected to the login
 * page with `?next=<original-path>` so the user lands back on the page
 * they originally hit after authenticating. This avoids a permanent
 * client-side spinner before `<ProtectedRoute>` finishes its session probe.
 *
 * The `next` value is sourced from the `x-pathname` header injected by
 * `src/middleware.ts`. The `[locale]/admin/layout.tsx` guard uses the same
 * mechanism — keeping a single contract for SSR-time redirects.
 *
 * The `<main>` container is owned by the parent `(shell-wide)/layout.tsx`;
 * this file is intentionally guard-only.
 */
export default async function DashboardLocaleLayout({
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
		const requestPath = headerStore.get("x-pathname") ?? "/dashboard";
		const localeStripped = stripLocalePrefix(requestPath) || "/dashboard";
		const next = encodeURIComponent(localeStripped);
		redirect(`${withLocalePath(locale, "/login")}?next=${next}`);
	}

	return <>{children}</>;
}
