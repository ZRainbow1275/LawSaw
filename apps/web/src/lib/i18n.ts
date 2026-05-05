import enTranslations from "../messages/en.json";
import zhTranslations from "../messages/zh.json";

export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_COOKIE_NAME = "LAW_EYE_LOCALE";

export function isLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" &&
		(SUPPORTED_LOCALES as readonly string[]).includes(value)
	);
}

export function localeFromPathname(pathname: string): Locale {
	const segments = pathname.split("/").filter(Boolean);
	const maybeLocale = segments[0];
	return isLocale(maybeLocale) ? maybeLocale : DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	const maybeLocale = segments[0];
	if (!isLocale(maybeLocale)) return pathname || "/";
	const rest = segments.slice(1).join("/");
	return rest ? `/${rest}` : "/";
}

export function bcp47(locale: Locale): string {
	switch (locale) {
		case "en":
			return "en-US";
		case "zh":
			return "zh-CN";
	}
}

export function withLocalePath(locale: Locale, href: string): string {
	if (href.startsWith("http://") || href.startsWith("https://")) return href;

	const normalized = href.startsWith("/") ? href : `/${href}`;
	const firstSegment = normalized.split("/").filter(Boolean)[0];
	if (isLocale(firstSegment)) return normalized;

	if (normalized === "/") return `/${locale}`;
	return `/${locale}${normalized}`;
}

function parseAcceptLanguage(value: string | null): Locale {
	if (!value) return DEFAULT_LOCALE;
	const lowered = value.toLowerCase();

	// Minimal parsing: prefer explicit "en" over "zh" when present.
	// We intentionally keep this lightweight for Edge runtime compatibility.
	const hasEn = /\ben(-|;|,|$)/.test(lowered);
	const hasZh = /\bzh(-|;|,|$)/.test(lowered);
	if (hasEn && !hasZh) return "en";
	if (hasZh && !hasEn) return "zh";

	// Fallback: choose the first language tag.
	const first = lowered.split(",")[0]?.trim() ?? "";
	if (first.startsWith("en")) return "en";
	if (first.startsWith("zh")) return "zh";
	return DEFAULT_LOCALE;
}

export function detectLocale(options: {
	pathname?: string;
	cookieLocale?: string | null;
	acceptLanguage?: string | null;
}): Locale {
	if (options.pathname) {
		const segments = options.pathname.split("/").filter(Boolean);
		const maybeLocale = segments[0];
		if (isLocale(maybeLocale)) return maybeLocale;
	}

	if (isLocale(options.cookieLocale)) return options.cookieLocale;
	return parseAcceptLanguage(options.acceptLanguage ?? null);
}

export type TranslationParams = Record<string, string | number>;

function interpolate(
	template: string,
	params: TranslationParams | undefined,
): string {
	if (!params) return template;
	return template.replaceAll(/\{(\w+)\}/g, (match, key: string) => {
		if (!(key in params)) return match;
		return String(params[key]);
	});
}

export function t(
	locale: Locale,
	key: string,
	params?: TranslationParams,
): string {
	const dict =
		locale === "zh"
			? (zhTranslations as Record<string, string>)
			: (enTranslations as Record<string, string>);
	const template = dict[key];
	if (template === undefined) {
		if (process.env.NODE_ENV === "development") {
			console.error(
				`[i18n] missing ${locale} key: ${JSON.stringify(key)}`,
			);
		}
		return interpolate(key, params);
	}
	return interpolate(template, params);
}

export function formatDateTime(
	locale: Locale,
	value: Date | string | number,
	options: Intl.DateTimeFormatOptions = {},
): string {
	const date = value instanceof Date ? value : new Date(value);
	const formatter = new Intl.DateTimeFormat(bcp47(locale), options);
	return formatter.format(date);
}

export function formatNumber(
	locale: Locale,
	value: number,
	options: Intl.NumberFormatOptions = {},
): string {
	const formatter = new Intl.NumberFormat(bcp47(locale), options);
	return formatter.format(value);
}

export function formatTimeAgo(
	locale: Locale,
	value: Date | string | number,
): string {
	const date = value instanceof Date ? value : new Date(value);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();

	if (!Number.isFinite(diffMs)) return "";
	if (diffMs < 0) return formatDateTime(locale, date);

	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return t(locale, "Just now");
	if (diffMins < 60)
		return t(locale, "{count} minutes ago", { count: diffMins });
	if (diffHours < 24)
		return t(locale, "{count} hours ago", { count: diffHours });
	return t(locale, "{count} days ago", { count: diffDays });
}
