/**
 * 阅读偏好状态管理
 * 支持字体大小、行高、主题等个性化设置
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ============================================
// 类型定义
// ============================================

export type FontSize = "sm" | "md" | "lg" | "xl";
export type LineHeight = "compact" | "normal" | "relaxed";
export type ReadingTheme = "light" | "dark" | "sepia";
export type ContentWidth = "narrow" | "normal" | "wide";
export type FontFamily = "sans" | "serif";

export interface ReadingSettings {
  /** 字体大小 */
  fontSize: FontSize;
  /** 行高 */
  lineHeight: LineHeight;
  /** 阅读主题 */
  theme: ReadingTheme;
  /** 阅读宽度 */
  contentWidth: ContentWidth;
  /** 字体类型 */
  fontFamily: FontFamily;
  /** 是否显示目录 */
  showToc: boolean;
  /** 是否自动隐藏工具栏 */
  autoHideToolbar: boolean;
}

export interface ReadingProgress {
  /** 文章 ID */
  articleId: string;
  /** 阅读进度 (0-1) */
  progress: number;
  /** 最后阅读时间 */
  lastReadAt: number;
  /** 滚动位置 */
  scrollPosition: number;
}

interface ReadingState {
  // 阅读设置
  settings: ReadingSettings;

  // 阅读进度记录（按文章 ID 索引）
  progressMap: Record<string, ReadingProgress>;

  // 收藏列表
  bookmarks: string[];

  // Actions
  updateSettings: (settings: Partial<ReadingSettings>) => void;
  resetSettings: () => void;

  updateProgress: (articleId: string, progress: Partial<Omit<ReadingProgress, "articleId">>) => void;
  getProgress: (articleId: string) => ReadingProgress | undefined;
  clearProgress: (articleId: string) => void;

  addBookmark: (articleId: string) => void;
  removeBookmark: (articleId: string) => void;
  isBookmarked: (articleId: string) => boolean;
  toggleBookmark: (articleId: string) => boolean;
}

// ============================================
// 默认设置
// ============================================

const defaultSettings: ReadingSettings = {
  fontSize: "md",
  lineHeight: "normal",
  theme: "light",
  contentWidth: "normal",
  fontFamily: "serif",
  showToc: true,
  autoHideToolbar: true,
};

// ============================================
// 字体大小映射（用于 CSS）
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

export const themeMap: Record<ReadingTheme, { bg: string; text: string; name: string }> = {
  light: { bg: "#FFFFFF", text: "#212529", name: "默认" },
  dark: { bg: "#1A1A1A", text: "#E9ECEF", name: "暗色" },
  sepia: { bg: "#F4ECD8", text: "#5C4B37", name: "护眼" },
};

export const contentWidthMap: Record<ContentWidth, string> = {
  narrow: "560px",
  normal: "680px",
  wide: "800px",
};

export const fontFamilyMap: Record<FontFamily, { css: string; label: string }> = {
  sans: { css: "var(--font-sans)", label: "无衬线" },
  serif: { css: "var(--font-serif)", label: "衬线体" },
};

// ============================================
// Store 实现
// ============================================

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      progressMap: {},
      bookmarks: [],

      // 更新设置
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      // 重置设置
      resetSettings: () =>
        set({ settings: defaultSettings }),

      // 更新阅读进度
      updateProgress: (articleId, progress) =>
        set((state) => ({
          progressMap: {
            ...state.progressMap,
            [articleId]: {
              articleId,
              progress: progress.progress ?? state.progressMap[articleId]?.progress ?? 0,
              scrollPosition: progress.scrollPosition ?? state.progressMap[articleId]?.scrollPosition ?? 0,
              lastReadAt: Date.now(),
            },
          },
        })),

      // 获取阅读进度
      getProgress: (articleId) => get().progressMap[articleId],

      // 清除阅读进度
      clearProgress: (articleId) =>
        set((state) => {
          const { [articleId]: _, ...rest } = state.progressMap;
          return { progressMap: rest };
        }),

      // 添加收藏
      addBookmark: (articleId) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(articleId)
            ? state.bookmarks
            : [...state.bookmarks, articleId],
        })),

      // 移除收藏
      removeBookmark: (articleId) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((id) => id !== articleId),
        })),

      // 检查是否已收藏
      isBookmarked: (articleId) => get().bookmarks.includes(articleId),

      // 切换收藏状态，返回新状态
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
    }
  )
);

// ============================================
// 便捷 Hooks
// ============================================

/**
 * 获取当前阅读设置的 CSS 变量
 */
export function useReadingStyles() {
  const { fontSize, lineHeight, theme, contentWidth, fontFamily } = useReadingStore((s) => s.settings);

  return {
    "--reading-font-size": fontSizeMap[fontSize],
    "--reading-line-height": lineHeightMap[lineHeight],
    "--reading-bg": themeMap[theme].bg,
    "--reading-text": themeMap[theme].text,
    "--reading-content-width": contentWidthMap[contentWidth],
    "--reading-font-family": fontFamilyMap[fontFamily].css,
  } as React.CSSProperties;
}

/**
 * 获取文章收藏状态和操作
 */
export function useBookmark(articleId: string) {
  const isBookmarked = useReadingStore((s) => s.bookmarks.includes(articleId));
  const toggleBookmark = useReadingStore((s) => s.toggleBookmark);

  return {
    isBookmarked,
    toggle: () => toggleBookmark(articleId),
  };
}
