import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, withLocalePath } from "@/lib/i18n";

export default async function LegacyRedirect({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const resolved = await params;
	const locale = isLocale(resolved.locale) ? resolved.locale : DEFAULT_LOCALE;
	redirect(withLocalePath(locale, "/admin/channels"));
}
