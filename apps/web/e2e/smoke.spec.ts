import { expect, test } from "@playwright/test";

test.describe("@smoke", () => {
	test("landing page renders with 200 status and a title", async ({ page }) => {
		const response = await page.goto("/", { waitUntil: "domcontentloaded" });
		expect(response, "navigation response should exist").not.toBeNull();
		expect(response?.status(), "landing page should return HTTP 200").toBe(200);

		const title = await page.title();
		expect(title, "page title should be a non-empty string").toBeTruthy();
		expect(title.length, "page title should have content").toBeGreaterThan(0);
	});
});
