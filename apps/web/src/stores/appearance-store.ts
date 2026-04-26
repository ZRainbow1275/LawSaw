import { create } from "zustand";

export type AppearanceTheme = "light" | "dark" | "system";

export interface AppearancePreferences {
	theme: AppearanceTheme;
	compactMode: boolean;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
	theme: "light",
	compactMode: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function pickTheme(
	value: unknown,
	fallback: AppearanceTheme,
): AppearanceTheme {
	return value === "light" || value === "dark" || value === "system"
		? value
		: fallback;
}

export function readAppearancePreferences(
	value: unknown,
): AppearancePreferences {
	if (!isRecord(value)) {
		return DEFAULT_APPEARANCE;
	}

	return {
		theme: pickTheme(value.theme, DEFAULT_APPEARANCE.theme),
		compactMode: pickBoolean(
			value.compactMode,
			DEFAULT_APPEARANCE.compactMode,
		),
	};
}

export function resolveAppearanceTheme(
	theme: AppearanceTheme,
	prefersDark: boolean,
): "light" | "dark" {
	if (theme === "system") {
		return prefersDark ? "dark" : "light";
	}

	return theme;
}

interface AppearanceState {
	appearance: AppearancePreferences;
	setAppearance: (appearance: AppearancePreferences) => void;
	resetAppearance: () => void;
}

export const useAppearanceStore = create<AppearanceState>()((set) => ({
	appearance: DEFAULT_APPEARANCE,
	setAppearance: (appearance) => set({ appearance }),
	resetAppearance: () => set({ appearance: DEFAULT_APPEARANCE }),
}));
