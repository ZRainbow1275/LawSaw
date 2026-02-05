"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
	type Locale,
	type TranslationParams,
	localeFromPathname,
	t,
} from "./i18n";

export function useLocale(): Locale {
	const pathname = usePathname() ?? "/";
	return localeFromPathname(pathname);
}

export function useT(): (key: string, params?: TranslationParams) => string {
	const locale = useLocale();
	return useMemo(
		() => (key: string, params?: TranslationParams) => t(locale, key, params),
		[locale],
	);
}
