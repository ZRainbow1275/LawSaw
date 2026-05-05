import { cookies, headers } from "next/headers";
import { permanentRedirect } from "next/navigation";

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, detectLocale } from "@/lib/i18n";

/**
 * Server-side helper used by legacy `/settings/admin/<sub>` page modules to
 * 308-redirect into the canonical localized admin workspace path
 * `/<locale>/admin/<sub>` (per SPEC-02 §8 dual-panel migration table).
 *
 * The locale is resolved from the LAW_EYE_LOCALE cookie first, then the
 * Accept-Language header, falling back to DEFAULT_LOCALE — keeping the
 * redirect URL aligned with the user's chosen locale even when they hit a
 * stale bookmark from before the dual-panel migration landed.
 */
export async function redirectLegacyAdminPath(
	adminSubPath: string,
): Promise<never> {
	const normalized = adminSubPath.startsWith("/")
		? adminSubPath
		: `/${adminSubPath}`;
	const cookieStore = await cookies();
	const headerStore = await headers();
	const locale = detectLocale({
		cookieLocale: cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null,
		acceptLanguage: headerStore.get("accept-language"),
	});
	const finalLocale = locale ?? DEFAULT_LOCALE;
	permanentRedirect(`/${finalLocale}/admin${normalized}`);
}
