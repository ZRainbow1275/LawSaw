/**
 * Shared types for the Markdown editor surface.
 *
 * Kept in a tiny dedicated module so the SSR-safe wrapper
 * (`markdown-editor.tsx`) can import the type without pulling
 * the Milkdown runtime into the server bundle.
 */

export type MarkdownEditorToolbar = "full" | "minimal";
export type MarkdownEditorLocale = "zh" | "en";

export interface MarkdownEditorProps {
	/** Controlled markdown source. */
	value: string;
	/** Fires on every keystroke that mutates the markdown serialization. */
	onChange: (markdown: string) => void;
	/** Placeholder text for the empty document state. */
	placeholder?: string;
	/** Minimum content area height in pixels. Default 240. */
	minHeight?: number;
	/** Disables editing — slash menu, toolbar, drag handles all suppressed. */
	readOnly?: boolean;
	/**
	 * Async upload callback for image-block. Receives the user-selected File and
	 * MUST resolve to a public URL the editor can persist into the markdown
	 * source as `![alt](url)`.
	 */
	uploadHandler?: (file: File) => Promise<string>;
	/**
	 * Toolbar variant. `full` = block-edit (slash menu) + bubble toolbar
	 * (admin authoring); `minimal` = bubble toolbar only (compact surfaces).
	 */
	toolbar?: MarkdownEditorToolbar;
	/** Optional locale hint. Currently used only to seed default placeholder copy. */
	locale?: MarkdownEditorLocale;
	/** Optional className for the outer wrapper (rare; prefer minHeight). */
	className?: string;
}
