import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE_NAME, detectLocale } from "@/lib/i18n";

/**
 * Non-localized root entry point.
 *
 * Detects the user's preferred locale (cookie → Accept-Language → default)
 * and forwards to `/{locale}` where the localized server component performs
 * role-tier dispatch (admin → `/admin`, end user → `/me/feed`).
 *
 * In production, the proxy at `apps/web/src/proxy.ts` already redirects
 * unprefixed paths to a locale segment, so this server component is a
 * defense-in-depth fallback for direct hits.
 */
export default async function RootRedirect() {
	const cookieStore = await cookies();
	const headerStore = await headers();
	const locale = detectLocale({
		cookieLocale: cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null,
		acceptLanguage: headerStore.get("accept-language"),
	});
	redirect(`/${locale}`);
}
