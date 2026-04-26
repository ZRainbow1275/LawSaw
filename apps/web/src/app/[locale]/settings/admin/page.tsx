import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, withLocalePath } from "@/lib/i18n";

/**
 * Legacy index — 308 redirect to `/<locale>/admin` per SPEC-02 §8.
 */
export default async function LegacyAdminSettingsIndexPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const resolved = await params;
	const locale = isLocale(resolved.locale) ? resolved.locale : DEFAULT_LOCALE;
	redirect(withLocalePath(locale, "/admin"));
}
