import {
	DEFAULT_APPEARANCE,
	readAppearancePreferences,
	resolveAppearanceTheme,
} from "@/stores/appearance-store";
import { describe, expect, it } from "vitest";

describe("appearance-store helpers", () => {
	it("falls back to defaults for invalid appearance payloads", () => {
		expect(readAppearancePreferences(null)).toEqual(DEFAULT_APPEARANCE);
		expect(readAppearancePreferences("dark")).toEqual(DEFAULT_APPEARANCE);
	});

	it("reads valid appearance preferences and rejects invalid theme values", () => {
		expect(
			readAppearancePreferences({
				theme: "dark",
				compactMode: true,
			}),
		).toEqual({
			theme: "dark",
			compactMode: true,
		});

		expect(
			readAppearancePreferences({
				theme: "sepia",
				compactMode: true,
			}),
		).toEqual({
			theme: DEFAULT_APPEARANCE.theme,
			compactMode: true,
		});
	});

	it("resolves system theme against the active color-scheme preference", () => {
		expect(resolveAppearanceTheme("system", true)).toBe("dark");
		expect(resolveAppearanceTheme("system", false)).toBe("light");
		expect(resolveAppearanceTheme("dark", false)).toBe("dark");
	});
});
