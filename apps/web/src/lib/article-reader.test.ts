import { describe, expect, it } from "vitest";

import { extractMarkdownSource, renderArticleBodyHtml } from "./article-reader";

describe("renderArticleBodyHtml", () => {
	it("keeps existing rich HTML content unchanged", () => {
		const html = "<h2 id=\"scope\">Scope</h2><p>Rendered upstream.</p>";

		expect(renderArticleBodyHtml(html)).toBe(html);
	});

	it("converts plain text markdown headings into real heading elements", () => {
		const markdown = [
			"Intro paragraph line one.",
			"Intro paragraph line two.",
			"",
			"# Comments: 0",
			"",
			"- First point",
			"- Second point",
		].join("\n");

		expect(renderArticleBodyHtml(markdown)).toBe(
			[
				"<p>Intro paragraph line one.<br />Intro paragraph line two.</p>",
				"<h1 id=\"comments-0\">Comments: 0</h1>",
				"<ul><li>First point</li><li>Second point</li></ul>",
			].join("\n"),
		);
	});

	it("assigns stable suffixes to duplicate markdown headings", () => {
		const markdown = ["# Comments", "Paragraph", "", "# Comments"].join("\n");
		const html = renderArticleBodyHtml(markdown);

		expect(html).toContain("<h1 id=\"comments\">Comments</h1>");
		expect(html).toContain("<h1 id=\"comments-2\">Comments</h1>");
	});
});

describe("extractMarkdownSource", () => {
	it("returns zero metrics for null or empty content", () => {
		expect(extractMarkdownSource(null)).toEqual({
			markdown: "",
			wordCount: 0,
			lineCount: 0,
			originalFormat: "plain",
		});
		expect(extractMarkdownSource("   ")).toEqual({
			markdown: "",
			wordCount: 0,
			lineCount: 0,
			originalFormat: "plain",
		});
	});

	it("preserves markdown input and reports it as markdown", () => {
		const source = [
			"# Heading",
			"",
			"First paragraph with [link](https://example.com).",
			"",
			"- item one",
			"- item two",
		].join("\n");

		const result = extractMarkdownSource(source);

		expect(result.originalFormat).toBe("markdown");
		expect(result.markdown).toContain("# Heading");
		expect(result.markdown).toContain("- item one");
		expect(result.lineCount).toBe(6);
		expect(result.wordCount).toBeGreaterThan(0);
	});

	it("flags plain prose without markdown signals as plain", () => {
		const source = "Just a single paragraph with no markers.";

		const result = extractMarkdownSource(source);

		expect(result.originalFormat).toBe("plain");
		expect(result.markdown).toBe(source);
		expect(result.lineCount).toBe(1);
		expect(result.wordCount).toBe(7);
	});

	it("converts HTML into normalized markdown", () => {
		const html = [
			"<h2>Title</h2>",
			"<p>Intro <strong>bold</strong> and <a href=\"https://example.com\">link</a>.</p>",
			"<ul><li>Alpha</li><li>Beta</li></ul>",
		].join("");

		const result = extractMarkdownSource(html);

		expect(result.originalFormat).toBe("html");
		expect(result.markdown).toContain("## Title");
		expect(result.markdown).toContain("**bold**");
		expect(result.markdown).toContain("[link](https://example.com)");
		expect(result.markdown).toContain("- Alpha");
		expect(result.markdown).toContain("- Beta");
		expect(result.lineCount).toBeGreaterThanOrEqual(3);
	});

	it("counts CJK characters as individual words alongside western tokens", () => {
		const source = "合同审查 requires attention.";
		const result = extractMarkdownSource(source);
		expect(result.wordCount).toBe(6);
	});
});
