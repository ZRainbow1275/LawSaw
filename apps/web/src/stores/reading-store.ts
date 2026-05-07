/**
 * Reading preference state management.
 * Supports font size, line height, theme and other personalization settings.
 */

import type { CSSProperties } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// ============================================
// Types
// ============================================

export type FontSize = "sm" | "md" | "lg" | "xl";
export type LineHeight = "compact" | "normal" | "relaxed";
export type ReadingTheme = "light" | "dark" | "sepia";
export type ContentWidth = "narrow" | "normal" | "wide";
export type FontFamily = "sans" | "serif";

export interface ReadingSettings {
	/** Font size */
	fontSize: FontSize;
	/** Line height */
	lineHeight: LineHeight;
	/** Reading theme */
	theme: ReadingTheme;
	/** Content width */
	contentWidth: ContentWidth;
	/** Font family */
	fontFamily: FontFamily;
	/** Whether to show table of contents */
	showToc: boolean;
	/** Whether to auto-hide the toolbar */
	autoHideToolbar: boolean;
	/**
	 * Focus mode (P3#7) — when true the reader dims non-central paragraphs
	 * and shows a top progress ring. Persisted across sessions.
	 */
	focusMode: boolean;
}

export interface ReadingProgress {
	/** Article ID */
	articleId: string;
	/** Reading progress (0-1) */
	progress: number;
	/** Last read timestamp */
	lastReadAt: number;
	/** Scroll position */
	scrollPosition: number;
}

interface ReadingState {
	// Settings
	settings: ReadingSettings;

	// Progress entries (indexed by article ID)
	progressMap: Record<string, ReadingProgress>;

	// Bookmarks
	bookmarks: string[];

	// Actions
	updateSettings: (settings: Partial<ReadingSettings>) => void;
	resetSettings: () => void;

	updateProgress: (
		articleId: string,
		progress: Partial<Omit<ReadingProgress, "articleId">>,
	) => void;
	getProgress: (articleId: string) => ReadingProgress | undefined;
	clearProgress: (articleId: string) => void;

	addBookmark: (articleId: string) => void;
	removeBookmark: (articleId: string) => void;
	isBookmarked: (articleId: string) => boolean;
	toggleBookmark: (articleId: string) => boolean;
}

// ============================================
// Defaults
// ============================================

const defaultSettings: ReadingSettings = {
	fontSize: "md",
	lineHeight: "normal",
	theme: "light",
	contentWidth: "normal",
	fontFamily: "serif",
	showToc: true,
	autoHideToolbar: true,
	focusMode: false,
};

// ============================================
// CSS mapping
// ============================================

export const fontSizeMap: Record<FontSize, string> = {
	sm: "15px",
	md: "17px",
	lg: "19px",
	xl: "21px",
};

export const lineHeightMap: Record<LineHeight, string> = {
	compact: "1.6",
	normal: "1.8",
	relaxed: "2.0",
};

export const themeMap: Record<
	ReadingTheme,
	{ bg: string; text: string; labelKey: string }
> = {
	light: { bg: "#FFFFFF", text: "#212529", labelKey: "Default" },
	dark: { bg: "#1A1A1A", text: "#E9ECEF", labelKey: "Dark" },
	sepia: { bg: "#F4ECD8", text: "#5C4B37", labelKey: "Sepia" },
};

export const contentWidthMap: Record<ContentWidth, string> = {
	narrow: "560px",
	normal: "680px",
	wide: "800px",
};

export const fontFamilyMap: Record<
	FontFamily,
	{ css: string; labelKey: string }
> = {
	sans: { css: "var(--font-sans)", labelKey: "Sans serif" },
	serif: { css: "var(--font-serif)", labelKey: "Serif" },
};

// ============================================
// Store
// ============================================

export const useReadingStore = create<ReadingState>()(
	persist(
		(set, get) => ({
			settings: defaultSettings,
			progressMap: {},
			bookmarks: [],

			// Update settings
			updateSettings: (newSettings) =>
				set((state) => ({
					settings: { ...state.settings, ...newSettings },
				})),

			// Reset settings
			resetSettings: () => set({ settings: defaultSettings }),

			// Update progress
			updateProgress: (articleId, progress) =>
				set((state) => ({
					progressMap: {
						...state.progressMap,
						[articleId]: {
							articleId,
							progress:
								progress.progress ??
								state.progressMap[articleId]?.progress ??
								0,
							scrollPosition:
								progress.scrollPosition ??
								state.progressMap[articleId]?.scrollPosition ??
								0,
							lastReadAt: Date.now(),
						},
					},
				})),

			// Get progress
			getProgress: (articleId) => get().progressMap[articleId],

			// Clear progress
			clearProgress: (articleId) =>
				set((state) => {
					const { [articleId]: _, ...rest } = state.progressMap;
					return { progressMap: rest };
				}),

			// Add bookmark
			addBookmark: (articleId) =>
				set((state) => ({
					bookmarks: state.bookmarks.includes(articleId)
						? state.bookmarks
						: [...state.bookmarks, articleId],
				})),

			// Remove bookmark
			removeBookmark: (articleId) =>
				set((state) => ({
					bookmarks: state.bookmarks.filter((id) => id !== articleId),
				})),

			// Check bookmark
			isBookmarked: (articleId) => get().bookmarks.includes(articleId),

			// Toggle bookmark and return the new state
			toggleBookmark: (articleId) => {
				const isCurrentlyBookmarked = get().isBookmarked(articleId);
				if (isCurrentlyBookmarked) {
					get().removeBookmark(articleId);
				} else {
					get().addBookmark(articleId);
				}
				return !isCurrentlyBookmarked;
			},
		}),
		{
			name: "lawsaw-reading",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				settings: state.settings,
				progressMap: state.progressMap,
				bookmarks: state.bookmarks,
			}),
		},
	),
);

// ============================================
// Hooks
// ============================================

/**
 * Get CSS variables derived from current reading settings.
 */
export function useReadingStyles() {
	const { fontSize, lineHeight, theme, contentWidth, fontFamily } =
		useReadingStore((s) => s.settings);

	return {
		"--reading-font-size": fontSizeMap[fontSize],
		"--reading-line-height": lineHeightMap[lineHeight],
		"--reading-bg": themeMap[theme].bg,
		"--reading-text": themeMap[theme].text,
		"--reading-content-width": contentWidthMap[contentWidth],
		"--reading-font-family": fontFamilyMap[fontFamily].css,
	} as CSSProperties;
}

/**
 * Get bookmark state and actions for an article.
 */
export function useBookmark(articleId: string) {
	const isBookmarked = useReadingStore((s) => s.bookmarks.includes(articleId));
	const toggleBookmark = useReadingStore((s) => s.toggleBookmark);

	return {
		isBookmarked,
		toggle: () => toggleBookmark(articleId),
	};
}
