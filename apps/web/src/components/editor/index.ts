/**
 * Markdown editing surface — public exports.
 *
 * `MarkdownEditor` is the SSR-safe Crepe (Milkdown 7) wrapper used by admin
 * authoring forms (articles, banners, report templates). The editor itself is
 * dynamically imported so the ProseMirror runtime never lands in the server
 * bundle.
 *
 * `MarkdownReader` is the read-only sibling, re-using the project-wide
 * `renderArticleBodyHtml` + `sanitizeRenderedHtml` (DOMPurify) pipeline so we
 * do not introduce a second markdown rendering path.
 */

export { MarkdownEditor } from "./markdown-editor";
export { MarkdownReader } from "./markdown-reader";
export type {
	MarkdownEditorProps,
	MarkdownEditorToolbar,
	MarkdownEditorLocale,
} from "./markdown-editor-types";
