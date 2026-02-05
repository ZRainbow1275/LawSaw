import { describe, expect, it } from "vitest";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
	detectLocale,
	isLocale,
	localeFromPathname,
	stripLocalePrefix,
	t,
	withLocalePath,
} from "./i18n";

describe("i18n", () => {
	it("recognizes supported locales", () => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(isLocale(locale)).toBe(true);
		}

		expect(isLocale("jp")).toBe(false);
		expect(isLocale(null)).toBe(false);
	});

	it("parses locale from pathname", () => {
		expect(localeFromPathname("/zh/articles")).toBe("zh");
		expect(localeFromPathname("/en/articles")).toBe("en");
		expect(localeFromPathname("/articles")).toBe(DEFAULT_LOCALE);
	});

	it("strips locale prefix", () => {
		expect(stripLocalePrefix("/zh/articles/123")).toBe("/articles/123");
		expect(stripLocalePrefix("/articles/123")).toBe("/articles/123");
	});

	it("adds locale prefix to internal links", () => {
		expect(withLocalePath("zh", "/")).toBe("/zh");
		expect(withLocalePath("zh", "/articles")).toBe("/zh/articles");
		expect(withLocalePath("en", "articles")).toBe("/en/articles");
		expect(withLocalePath("en", "/zh/articles")).toBe("/zh/articles");
		expect(withLocalePath("en", "https://example.com")).toBe(
			"https://example.com",
		);
	});

	it("translates keys and interpolates params", () => {
		expect(t("en", "Just now")).toBe("Just now");
		expect(t("zh", "Just now")).toBe("刚刚");
		expect(t("zh", "{count} minutes ago", { count: 5 })).toBe("5 分钟前");
	});

	it("detects locale from cookie / headers / pathname", () => {
		expect(
			detectLocale({
				pathname: "/en/articles",
				cookieLocale: "zh",
				acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
			}),
		).toBe("en");

		expect(
			detectLocale({
				pathname: "/articles",
				cookieLocale: "en",
				acceptLanguage: "zh-CN,zh;q=0.9",
			}),
		).toBe("en");

		expect(
			detectLocale({
				pathname: "/articles",
				cookieLocale: null,
				acceptLanguage: "en-US,en;q=0.9,zh;q=0.8",
			}),
		).toBe("en");

		expect(
			detectLocale({
				pathname: "/articles",
				cookieLocale: null,
				acceptLanguage: null,
			}),
		).toBe(DEFAULT_LOCALE);
	});

	it("keeps cookie name stable", () => {
		expect(LOCALE_COOKIE_NAME).toBe("LAW_EYE_LOCALE");
	});
});
