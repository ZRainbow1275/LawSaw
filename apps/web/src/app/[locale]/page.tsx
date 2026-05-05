import { getServerSession } from "@/lib/auth/server-session";
import { ADMIN_TIERS, normalizeRoleTier } from "@/lib/authz";
import { DEFAULT_LOCALE, isLocale, withLocalePath } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default async function LocaleRoot({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const resolved = await params;
	const locale = isLocale(resolved.locale) ? resolved.locale : DEFAULT_LOCALE;

	const session = await getServerSession();
	if (!session) {
		redirect(`${withLocalePath(locale, "/login")}?next=/`);
	}

	const tier = normalizeRoleTier(session.role_tier);
	if (ADMIN_TIERS.includes(tier)) {
		redirect(withLocalePath(locale, "/admin"));
	}

	redirect(withLocalePath(locale, "/me/feed"));
}
