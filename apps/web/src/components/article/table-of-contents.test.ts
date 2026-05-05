import { describe, expect, it } from "vitest";

import { type TOCItem, extractTableOfContentsItems } from "./table-of-contents";

function createHeading(tagName: string, textContent: string, id = "") {
	return {
		tagName,
		textContent,
		id,
	};
}

function createContainer(headings: Array<ReturnType<typeof createHeading>>) {
	return {
		querySelectorAll: () => headings,
	} as unknown as ParentNode;
}

describe("extractTableOfContentsItems", () => {
	it("merges static sections with body headings and assigns stable ids", () => {
		const container = createContainer([
			createHeading("H2", "Scope"),
			createHeading("H3", "Obligations", "obligations-heading"),
		]);

		const staticItems: TOCItem[] = [
			{ id: "article-overview-section", text: "Overview", level: 1 },
		];

		expect(extractTableOfContentsItems(container, staticItems)).toEqual([
			{ id: "article-overview-section", text: "Overview", level: 1 },
			{ id: "heading-0", text: "Scope", level: 2 },
			{ id: "obligations-heading", text: "Obligations", level: 3 },
		]);
	});

	it("skips headings whose ids are already represented by static sections", () => {
		const container = createContainer([
			createHeading("H1", "Article", "article-body-section"),
			createHeading("H2", "Compliance checks", "compliance-checks"),
		]);

		const staticItems: TOCItem[] = [
			{ id: "article-body-section", text: "Article", level: 1 },
		];

		expect(extractTableOfContentsItems(container, staticItems)).toEqual([
			{ id: "article-body-section", text: "Article", level: 1 },
			{ id: "compliance-checks", text: "Compliance checks", level: 2 },
		]);
	});
});
