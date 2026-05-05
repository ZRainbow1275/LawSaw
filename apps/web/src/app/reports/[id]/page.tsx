import { DEFAULT_LOCALE, withLocalePath } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default async function ReportReaderRedirect({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<never> {
	const { id } = await params;
	redirect(withLocalePath(DEFAULT_LOCALE, `/reports/${encodeURIComponent(id)}`));
}
