import { DEFAULT_LOCALE, isLocale, withLocalePath } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default async function AdminReportTemplateDetailPage({
	params,
}: {
	params: Promise<{ locale: string; id: string }>;
}): Promise<never> {
	const resolved = await params;
	const locale = isLocale(resolved.locale) ? resolved.locale : DEFAULT_LOCALE;
	redirect(withLocalePath(locale, `/admin/reports?templateId=${encodeURIComponent(resolved.id)}`));
}
