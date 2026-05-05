import { type Locale, formatDateTime, t as translate } from "@/lib/i18n";

const KNOWN_HTML_TAG_PATTERN =
	/<(?:p|br|h[1-6]|strong|b|em|i|u|s|strike|a|img|figure|figcaption|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|div|span|hr)\b/i;
const INLINE_LINK_PATTERN = /(?<!["'=])((?:https?:\/\/|mailto:|tel:)[^\s<]+)/g;
const MARKDOWN_LINK_PATTERN =
	/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)]+)\)/g;

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function slugifyHeadingText(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{Mark}+/gu, "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function renderInlineText(value: string): string {
	return escapeHtml(value.trim())
		.replace(
			MARKDOWN_LINK_PATTERN,
			(_match, label: string, url: string) =>
				`<a href="${url}" target="_blank">${label}</a>`,
		)
		.replace(
			INLINE_LINK_PATTERN,
			(url: string) => `<a href="${url}" target="_blank">${url}</a>`,
		);
}

function renderPlainTextArticleContent(content: string): string {
	const html: string[] = [];
	const headingCounts = new Map<string, number>();
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	let paragraphLines: string[] = [];
	let quoteLines: string[] = [];
	let listType: "ul" | "ol" | null = null;
	let listItems: string[] = [];

	const flushParagraph = () => {
		if (paragraphLines.length === 0) return;
		html.push(`<p>${paragraphLines.map(renderInlineText).join("<br />")}</p>`);
		paragraphLines = [];
	};

	const flushQuote = () => {
		if (quoteLines.length === 0) return;
		html.push(
			`<blockquote>${quoteLines.map(renderInlineText).join("<br />")}</blockquote>`,
		);
		quoteLines = [];
	};

	const flushList = () => {
		if (listType === null || listItems.length === 0) {
			listType = null;
			listItems = [];
			return;
		}

		html.push(
			`<${listType}>${listItems
				.map((item) => `<li>${renderInlineText(item)}</li>`)
				.join("")}</${listType}>`,
		);
		listType = null;
		listItems = [];
	};

	const flushAll = () => {
		flushParagraph();
		flushQuote();
		flushList();
	};

	for (const rawLine of lines) {
		const trimmed = rawLine.trim();
		if (trimmed.length === 0) {
			flushAll();
			continue;
		}

		const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			flushAll();
			const level = Math.min(headingMatch[1].length, 6);
			const text = headingMatch[2].trim();
			const baseId = slugifyHeadingText(text) || `section-${level}`;
			const nextCount = (headingCounts.get(baseId) ?? 0) + 1;
			headingCounts.set(baseId, nextCount);
			const id = nextCount === 1 ? baseId : `${baseId}-${nextCount}`;
			html.push(`<h${level} id="${id}">${renderInlineText(text)}</h${level}>`);
			continue;
		}

		const quoteMatch = trimmed.match(/^>\s?(.*)$/);
		if (quoteMatch) {
			flushParagraph();
			flushList();
			quoteLines.push(quoteMatch[1]);
			continue;
		}
		flushQuote();

		const unorderedListMatch = trimmed.match(/^[-*+]\s+(.+)$/);
		if (unorderedListMatch) {
			flushParagraph();
			if (listType !== "ul") {
				flushList();
				listType = "ul";
			}
			listItems.push(unorderedListMatch[1]);
			continue;
		}

		const orderedListMatch = trimmed.match(/^\d+\.\s+(.+)$/);
		if (orderedListMatch) {
			flushParagraph();
			if (listType !== "ol") {
				flushList();
				listType = "ol";
			}
			listItems.push(orderedListMatch[1]);
			continue;
		}

		flushList();
		paragraphLines.push(trimmed);
	}

	flushAll();
	return html.join("\n");
}

export function renderArticleBodyHtml(content: string | null): string {
	if (!content) return "";
	const trimmed = content.trim();
	if (trimmed.length === 0) return "";
	if (KNOWN_HTML_TAG_PATTERN.test(trimmed)) {
		return trimmed;
	}
	return renderPlainTextArticleContent(trimmed);
}

export type ArticleSourceFormat = "html" | "markdown" | "plain";

export interface ArticleMarkdownSource {
	markdown: string;
	wordCount: number;
	lineCount: number;
	originalFormat: ArticleSourceFormat;
}

const MARKDOWN_SIGNAL_PATTERN =
	/^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```|\|.+\|)|\[[^\]]+\]\((?:https?:|mailto:|tel:)[^)]+\)|\*\*[^*]+\*\*|__[^_]+__/m;

const BLOCK_TAG_PATTERN =
	/<(p|h[1-6]|ul|ol|li|blockquote|pre|br|hr|table|tr|td|th|thead|tbody|div|figure|figcaption)\b[^>]*>/i;

function decodeHtmlEntities(value: string): string {
	return value
		.replaceAll("&nbsp;", " ")
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&apos;", "'");
}

function convertHtmlToMarkdown(html: string): string {
	let working = html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

	working = working.replace(/<\s*br\s*\/?\s*>/gi, "\n");
	working = working.replace(/<\s*hr\s*\/?\s*>/gi, "\n\n---\n\n");

	for (let level = 1; level <= 6; level += 1) {
		const prefix = "#".repeat(level);
		const regex = new RegExp(
			`<\\s*h${level}[^>]*>([\\s\\S]*?)<\\s*/\\s*h${level}\\s*>`,
			"gi",
		);
		working = working.replace(regex, (_match, inner: string) => {
			const text = inner.replace(/<[^>]+>/g, "").trim();
			return `\n\n${prefix} ${text}\n\n`;
		});
	}

	working = working.replace(
		/<\s*a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
		(_match, href: string, inner: string) => {
			const text = inner.replace(/<[^>]+>/g, "").trim();
			if (!text) return href;
			return `[${text}](${href})`;
		},
	);

	working = working.replace(
		/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi,
		(_m, _tag, inner: string) => `**${inner.trim()}**`,
	);
	working = working.replace(
		/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi,
		(_m, _tag, inner: string) => `*${inner.trim()}*`,
	);
	working = working.replace(
		/<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/gi,
		(_m, inner: string) => `\`${inner.trim()}\``,
	);
	working = working.replace(
		/<\s*pre\b[^>]*>([\s\S]*?)<\s*\/\s*pre\s*>/gi,
		(_m, inner: string) => {
			const text = inner.replace(/<[^>]+>/g, "");
			return `\n\n\`\`\`\n${text.trim()}\n\`\`\`\n\n`;
		},
	);

	working = working.replace(
		/<\s*blockquote\b[^>]*>([\s\S]*?)<\s*\/\s*blockquote\s*>/gi,
		(_m, inner: string) => {
			const lines = inner
				.replace(/<[^>]+>/g, "")
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.map((line) => `> ${line}`)
				.join("\n");
			return `\n\n${lines}\n\n`;
		},
	);

	working = working.replace(
		/<\s*ul\b[^>]*>([\s\S]*?)<\s*\/\s*ul\s*>/gi,
		(_m, inner: string) => {
			const items = [
				...inner.matchAll(/<\s*li\b[^>]*>([\s\S]*?)<\s*\/\s*li\s*>/gi),
			]
				.map((match) => match[1].replace(/<[^>]+>/g, "").trim())
				.filter((text) => text.length > 0)
				.map((text) => `- ${text}`)
				.join("\n");
			return `\n\n${items}\n\n`;
		},
	);

	working = working.replace(
		/<\s*ol\b[^>]*>([\s\S]*?)<\s*\/\s*ol\s*>/gi,
		(_m, inner: string) => {
			let index = 0;
			const items = [
				...inner.matchAll(/<\s*li\b[^>]*>([\s\S]*?)<\s*\/\s*li\s*>/gi),
			]
				.map((match) => match[1].replace(/<[^>]+>/g, "").trim())
				.filter((text) => text.length > 0)
				.map((text) => {
					index += 1;
					return `${index}. ${text}`;
				})
				.join("\n");
			return `\n\n${items}\n\n`;
		},
	);

	working = working.replace(
		/<\s*p\b[^>]*>([\s\S]*?)<\s*\/\s*p\s*>/gi,
		(_m, inner: string) => {
			const text = inner.replace(/<[^>]+>/g, "").trim();
			return text.length > 0 ? `\n\n${text}\n\n` : "";
		},
	);

	working = working.replace(
		/<\s*img\b[^>]*alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/gi,
		(_m, alt: string, src: string) => `![${alt}](${src})`,
	);
	working = working.replace(
		/<\s*img\b[^>]*src="([^"]+)"[^>]*>/gi,
		(_m, src: string) => `![](${src})`,
	);

	working = working.replace(/<\/?[a-z][^>]*>/gi, "");
	working = decodeHtmlEntities(working);

	return working
		.split("\n")
		.map((line) => line.replace(/\s+$/g, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function detectSourceFormat(trimmed: string): ArticleSourceFormat {
	if (BLOCK_TAG_PATTERN.test(trimmed) || KNOWN_HTML_TAG_PATTERN.test(trimmed)) {
		return "html";
	}
	if (MARKDOWN_SIGNAL_PATTERN.test(trimmed)) {
		return "markdown";
	}
	return "plain";
}

function countWords(value: string): number {
	if (value.length === 0) return 0;
	const cjk = value.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
	const westernTokens = value
		.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 0 && /[A-Za-z0-9]/.test(token)).length;
	return cjk + westernTokens;
}

export function extractMarkdownSource(
	content: string | null,
): ArticleMarkdownSource {
	if (!content) {
		return {
			markdown: "",
			wordCount: 0,
			lineCount: 0,
			originalFormat: "plain",
		};
	}
	const trimmed = content.trim();
	if (trimmed.length === 0) {
		return {
			markdown: "",
			wordCount: 0,
			lineCount: 0,
			originalFormat: "plain",
		};
	}

	const originalFormat = detectSourceFormat(trimmed);
	const markdown =
		originalFormat === "html"
			? convertHtmlToMarkdown(trimmed)
			: trimmed.replace(/\r\n/g, "\n");
	const normalized = markdown.trim();

	if (normalized.length === 0) {
		return { markdown: "", wordCount: 0, lineCount: 0, originalFormat };
	}

	const lineCount = normalized.split("\n").length;
	const wordCount = countWords(normalized);

	return { markdown: normalized, wordCount, lineCount, originalFormat };
}

export function parseArticlePublishedAt(value: string | null): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatArticlePublishedAtLabel(
	locale: Locale,
	date: Date | null,
	now: Date = new Date(),
): string {
	if (!date) return "";

	const diff = now.getTime() - date.getTime();
	if (!Number.isFinite(diff)) return "";

	if (diff < 0) {
		return formatDateTime(locale, date, {
			month: "short",
			day: "numeric",
			year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
		});
	}

	const days = Math.floor(diff / (1000 * 60 * 60 * 24));
	if (days === 0) return translate(locale, "Today");
	if (days === 1) return translate(locale, "Yesterday");
	if (days < 7) return translate(locale, "{count} days ago", { count: days });

	return formatDateTime(locale, date, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}
