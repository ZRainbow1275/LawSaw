import { PersistentUserShell } from "@/components/layout/persistent-user-shell";
import { isLocale } from "@/lib/i18n";
import { notFound } from "next/navigation";

export default async function LocaleLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const resolvedParams = await params;
	if (!isLocale(resolvedParams.locale)) {
		notFound();
	}

	return <PersistentUserShell>{children}</PersistentUserShell>;
}
