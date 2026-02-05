import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	bcp47,
	detectLocale,
	isLocale,
	t,
} from "@/lib/i18n";
import type { MetadataRoute } from "next";
import { cookies, headers } from "next/headers";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
	const headerStore = await headers();
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null;
	const headerLocale = headerStore.get("x-law-eye-locale");

	const locale = isLocale(headerLocale)
		? headerLocale
		: detectLocale({
				cookieLocale,
				acceptLanguage: headerStore.get("accept-language"),
			});

	return {
		name: t(locale, "Law Eye"),
		short_name: t(locale, "Law Eye (short)"),
		description: t(
			locale,
			"A legal intelligence platform that aggregates multi-source legal updates and builds an authoritative knowledge base.",
		),
		start_url: `/${locale}`,
		scope: "/",
		display: "standalone",
		background_color: "#0b0f1a",
		theme_color: "#0b0f1a",
		lang: bcp47(locale),
		orientation: "portrait",
		icons: [
			{
				src: "/icon.svg",
				sizes: "any",
				type: "image/svg+xml",
			},
		],
	};
}
