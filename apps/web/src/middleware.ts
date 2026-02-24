import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
	detectLocale,
	isLocale,
} from "@/lib/i18n";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

function hasLocalePrefix(pathname: string): boolean {
	const segments = pathname.split("/").filter(Boolean);
	const maybeLocale = segments[0] ?? "";
	return isLocale(maybeLocale);
}

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api") ||
		pathname.startsWith("/api-docs") ||
		pathname === "/health" ||
		pathname === "/metrics" ||
		pathname === "/sw" ||
		pathname === "/favicon.ico" ||
		pathname === "/robots.txt" ||
		pathname === "/sitemap.xml" ||
		PUBLIC_FILE.test(pathname)
	) {
		return NextResponse.next();
	}

	const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value ?? null;

	if (hasLocalePrefix(pathname)) {
		const locale = pathname.split("/").filter(Boolean)[0] ?? DEFAULT_LOCALE;
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set("x-law-eye-locale", locale);
		const response = NextResponse.next({
			request: { headers: requestHeaders },
		});
		response.cookies.set(LOCALE_COOKIE_NAME, locale, {
			path: "/",
			sameSite: "lax",
		});
		return response;
	}

	const locale = detectLocale({
		cookieLocale,
		acceptLanguage: request.headers.get("accept-language"),
	});

	// Safety: ensure only supported locales are used.
	const safeLocale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
		? locale
		: DEFAULT_LOCALE;

	const url = request.nextUrl.clone();
	url.pathname = `/${safeLocale}${pathname}`;
	const response = NextResponse.redirect(url);
	response.cookies.set(LOCALE_COOKIE_NAME, safeLocale, {
		path: "/",
		sameSite: "lax",
	});
	return response;
}

export const config = {
	matcher: ["/((?!_next).*)"],
};
