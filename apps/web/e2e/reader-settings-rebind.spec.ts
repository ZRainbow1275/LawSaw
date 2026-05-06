import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * End-to-end verification: reading-settings panel must rebind to DOM
 * computed styles after the rebind fix (font-family / line-height /
 * content-width plumbing through CSS variables).
 *
 * Default reading-store values:
 *   fontSize=md (17px), lineHeight=normal (1.8 → 30.6px), theme=light,
 *   contentWidth=normal (680px), fontFamily=serif.
 *
 * This test toggles each control and asserts computed styles match the
 * expected mapping. Screenshots written under
 * `prompts/0506/reader-settings-rebind-after/`.
 */

const ARTICLE_URL =
	"/zh/articles/ffd22741-7480-4ced-bd48-3e8aca5abd9a";
// customer@qa pw is currently 401 (rotated). admin@qa is the canonical
// working account in this dev seed (see prompts/0506/wave6-final-report.md).
// For reading-settings UX coverage, role distinction doesn't matter — both
// can hit /zh/articles/[id]. Switch back to customer once seed creds rotate.
const LOGIN_EMAIL = "admin@qa.lawsaw.local";
const LOGIN_PASSWORD = "Admin@Lawsaw2026";
const SHOTS_DIR = path.resolve(
	process.cwd(),
	"..",
	"..",
	"prompts",
	"0506",
	"reader-settings-rebind-after",
);

async function login(page: import("@playwright/test").Page) {
	await page.goto("/zh/login", { waitUntil: "domcontentloaded" });
	const email = page.locator("#email");
	const password = page.locator("#password");
	await email.waitFor({ timeout: 30_000 });

	const typeWithRetry = async (
		locator: import("@playwright/test").Locator,
		expected: string,
	) => {
		for (let attempt = 0; attempt < 5; attempt++) {
			await locator.click();
			await page.waitForTimeout(120);
			await locator.press("Control+A").catch(() => {});
			await locator.press("Delete").catch(() => {});
			await page.waitForTimeout(80);
			await page.keyboard.type(expected, { delay: 25 });
			await page.waitForTimeout(200);
			const cur = await locator.inputValue();
			if (cur === expected) return;
			console.log(
				`[login] retry ${attempt + 1}: got '${cur.length > 30 ? `${cur.slice(0, 30)}…` : cur}' want length=${expected.length}`,
			);
		}
		throw new Error("failed to type expected value into field");
	};

	await typeWithRetry(email, LOGIN_EMAIL);
	await typeWithRetry(password, LOGIN_PASSWORD);
	await page.keyboard.press("Tab");
	await page.waitForTimeout(400);

	const e = await email.inputValue();
	const p = await password.inputValue();
	console.log(`[login] email='${e}' password.length=${p.length}`);
	if (e !== LOGIN_EMAIL || p !== LOGIN_PASSWORD) {
		throw new Error(
			`login fields mismatch — got email='${e}' password='${p.replace(/./g, "*")}' (len=${p.length}, expected=${LOGIN_PASSWORD.length})`,
		);
	}

	const submit = page.locator('button[type="submit"]').first();
	await submit.waitFor({ state: "visible" });
	for (let i = 0; i < 30; i++) {
		const enabled = await submit.isEnabled().catch(() => false);
		if (enabled) break;
		await page.waitForTimeout(200);
	}
	const submitEnabled = await submit.isEnabled();
	console.log(`[login] submit-enabled=${submitEnabled}`);
	const [loginResp] = await Promise.all([
		page
			.waitForResponse(
				(r) =>
					r.url().includes("/api/v1/auth/login") &&
					r.request().method() === "POST",
				{ timeout: 30_000 },
			)
			.catch(() => null),
		submit.click(),
	]);
	if (loginResp) {
		console.log(
			`[login] response status=${loginResp.status()} url=${loginResp.url()}`,
		);
	} else {
		console.log("[login] no /auth/login response observed");
	}
	// allow auth provider + zustand persist to flush
	await page.waitForTimeout(3_000);
	console.log(`[login] post-click url=${page.url()}`);
}

interface ProbeResult {
	wrapperMaxWidth: string;
	wrapperFontFamily: string;
	pFontSize: string;
	pLineHeight: string;
	pFontFamily: string;
	pCount: number;
	hasArticle: boolean;
}

async function probe(page: import("@playwright/test").Page): Promise<ProbeResult> {
	return await page.evaluate<ProbeResult>(() => {
		// Outer wrapper: receives `--reading-*` CSS vars + sets maxWidth.
		const wrapper =
			document.querySelector<HTMLElement>(
				"article.mx-auto.px-5.pb-24",
			) ?? document.querySelector<HTMLElement>("article");
		// Inner article: rendered by ArticleContent, has classes
		// "prose prose-legal prose-reader …" — this is what consumes the
		// CSS vars for paragraph styling.
		const inner =
			document.querySelector<HTMLElement>(
				"article.prose-reader",
			) ?? document.querySelector<HTMLElement>(".prose-reader");
		if (!wrapper || !inner) {
			return {
				wrapperMaxWidth: wrapper
					? window.getComputedStyle(wrapper).maxWidth
					: "",
				wrapperFontFamily: wrapper
					? window.getComputedStyle(wrapper).fontFamily
					: "",
				pFontSize: "",
				pLineHeight: "",
				pFontFamily: "",
				pCount: 0,
				hasArticle: false,
			};
		}
		const wrapperStyle = window.getComputedStyle(wrapper);
		// Pick the first <p> rendered inside the prose-reader article.
		const paragraphs = inner.querySelectorAll<HTMLElement>("p");
		const firstParagraph = paragraphs[0] ?? null;
		const pStyle = firstParagraph
			? window.getComputedStyle(firstParagraph)
			: null;
		const innerStyle = window.getComputedStyle(inner);
		return {
			wrapperMaxWidth: wrapperStyle.maxWidth,
			wrapperFontFamily: innerStyle.fontFamily,
			pFontSize: pStyle?.fontSize ?? "",
			pLineHeight: pStyle?.lineHeight ?? "",
			pFontFamily: pStyle?.fontFamily ?? "",
			pCount: paragraphs.length,
			hasArticle: true,
		};
	});
}

async function clickPanelButton(
	page: import("@playwright/test").Page,
	sectionLabel: string,
	buttonText: string | RegExp,
) {
	const panel = page.locator('[role="dialog"], div').filter({
		hasText: "阅读设置",
	}).last();
	// Prefer scoping by the visible section header, fall back to text match.
	const section = panel
		.locator(":scope >> div")
		.filter({ hasText: sectionLabel })
		.first();
	const candidate = section.locator("button", { hasText: buttonText }).first();
	if ((await candidate.count()) === 0) {
		// Fall back to root-level lookup
		await page
			.getByRole("button", { name: buttonText })
			.first()
			.click();
		return;
	}
	await candidate.click();
}

test.describe("@reader-settings reading panel rebind", () => {
	test("each control mutates computed CSS as expected", async ({ page }, testInfo) => {
		test.setTimeout(120_000);
		const consoleErrors: string[] = [];
		const knownNoiseRegex: RegExp[] = [
			// i18n missing keys are tracked separately by check-i18n-coverage —
			// don't fail this rebind test on them.
			/^\[i18n\] missing zh key:/,
			// CSS preload warnings are known dev-mode noise.
			/preload .* but not used/i,
		];
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				const text = msg.text();
				if (knownNoiseRegex.some((re) => re.test(text))) return;
				consoleErrors.push(text);
			}
		});

		// 0) Login first (article detail requires session)
		await login(page);

		// Wipe persisted reading-store so we always test the documented
		// defaults (serif / md / normal / normal). Also pre-dismiss the
		// onboarding tour modal — its localStorage flag varies between
		// builds, so we try a few candidate keys.
		await page.evaluate(() => {
			localStorage.removeItem("lawsaw-reading");
			// Mark onboarding completed for known keys.
			for (const k of [
				"lawsaw-onboarding",
				"lawsaw.onboarding",
				"onboarding-completed",
				"lawsaw.onboarding.completed",
			]) {
				try {
					localStorage.setItem(k, JSON.stringify({ completed: true, dismissed: true }));
				} catch {
					/* ignore */
				}
			}
		});

		// 1) Navigate
		await page.goto(ARTICLE_URL, { waitUntil: "domcontentloaded" });

		// Wait for the article wrapper + at least one paragraph to mount.
		await page.waitForSelector("article.prose-reader p", { timeout: 60_000 });
		await page.waitForTimeout(800); // allow CSS variables/zustand persist to flush

		// Dismiss any onboarding tour overlay if it appears (it intercepts clicks).
		const skipBtn = page
			.getByRole("button", { name: /跳过引导|跳过|Skip/i })
			.first();
		if (await skipBtn.isVisible().catch(() => false)) {
			await skipBtn.click().catch(() => {});
			await page.waitForTimeout(400);
		}
		// Failsafe: press Escape twice to close any modal.
		await page.keyboard.press("Escape").catch(() => {});
		await page.waitForTimeout(150);
		await page.keyboard.press("Escape").catch(() => {});
		await page.waitForTimeout(150);

		// === Default state probe ===
		const initial = await probe(page);
		console.log("[probe] default", initial);
		expect(initial.hasArticle, "article wrapper must exist").toBe(true);
		// Default contentWidth=normal → 680px
		expect(initial.wrapperMaxWidth).toBe("680px");
		// Default fontSize=md → 17px
		expect(initial.pFontSize).toBe("17px");
		// Default lineHeight=normal → 1.8 × 17 = 30.6px
		expect(Number.parseFloat(initial.pLineHeight)).toBeCloseTo(30.6, 0);
		// Default fontFamily=serif → expect serif token, NOT Inter primarily
		expect(initial.pFontFamily.toLowerCase()).not.toMatch(/^inter\b/);

		await page.screenshot({
			path: path.join(SHOTS_DIR, "01-default.png"),
			fullPage: false,
		});

		// 2) Open panel
		const openBtn = page
			.getByRole("button", { name: /阅读设置|Reading settings/i })
			.first();
		await openBtn.click();
		await page.waitForSelector("text=阅读设置", { timeout: 5_000 });
		await page.waitForTimeout(300);

		// === Step A: Font size → xl (21px) ===
		// Font-size section: 4 buttons all reading "A" with scaled inline
		// font-size. Pick the 4th (index 3) for "Extra large".
		const fontSizeSection = page.locator("div.space-y-2").filter({
			has: page.locator("span", { hasText: /字体大小|字号|Font size/i }),
		});
		await fontSizeSection.locator("button").nth(3).click();
		await page.waitForTimeout(200);
		const afterXl = await probe(page);
		console.log("[probe] after xl", afterXl);
		expect(afterXl.pFontSize).toBe("21px");

		await page.screenshot({
			path: path.join(SHOTS_DIR, "02-xl.png"),
			fullPage: false,
		});

		// === Step B: Line height → relaxed (2.0 → 21 × 2 = 42px) ===
		// zh.json lacks 'Relaxed' translation → button text falls back to "Relaxed".
		// Line-spacing section has 3 buttons (Compact/Normal/Relaxed) — pick the 3rd.
		const lineSection = page.locator("div.space-y-2").filter({
			has: page.locator("span", { hasText: /行距|Line spacing/i }),
		});
		await lineSection.locator("button").nth(2).click();
		await page.waitForTimeout(200);
		const afterRelaxed = await probe(page);
		console.log("[probe] after relaxed", afterRelaxed);
		expect(Number.parseFloat(afterRelaxed.pLineHeight)).toBeCloseTo(42, 0);

		await page.screenshot({
			path: path.join(SHOTS_DIR, "03-relaxed.png"),
			fullPage: false,
		});

		// === Step C: Content width → wide (800px) ===
		// Content-width section: Narrow/Normal/Wide → pick 3rd button.
		const widthSection = page.locator("div.space-y-2").filter({
			has: page.locator("span", { hasText: /内容宽度|Content width/i }),
		});
		await widthSection.locator("button").nth(2).click();
		await page.waitForTimeout(200);
		const afterWide = await probe(page);
		console.log("[probe] after wide", afterWide);
		expect(afterWide.wrapperMaxWidth).toBe("800px");

		await page.screenshot({
			path: path.join(SHOTS_DIR, "04-wide.png"),
			fullPage: false,
		});

		// === Step D: Font family → sans first, then back to serif ===
		// Font section: Sans serif / Serif → 2 buttons. Pick by index.
		// Match "字体" exactly (not "字体大小") via the section label span
		// that we know is "字体" (Font) in this build. We grab the *last*
		// matching section since "字体大小" appears earlier in the panel.
		const fontSection = page.locator("div.space-y-2").filter({
			has: page.locator("span", { hasText: /^字体$|^Font$/i }),
		}).last();
		await fontSection.locator("button").nth(0).click(); // Sans serif
		await page.waitForTimeout(200);
		const afterSans = await probe(page);
		console.log("[probe] after sans", afterSans);
		expect(afterSans.pFontFamily.toLowerCase()).toMatch(/inter/);

		await fontSection.locator("button").nth(1).click(); // Serif
		await page.waitForTimeout(200);
		const afterSerif = await probe(page);
		console.log("[probe] after serif", afterSerif);
		expect(afterSerif.pFontFamily.toLowerCase()).not.toMatch(/^inter\b/);
		expect(afterSerif.pFontFamily).not.toBe(afterSans.pFontFamily);

		await page.screenshot({
			path: path.join(SHOTS_DIR, "05-serif.png"),
			fullPage: false,
		});

		// === Console errors ===
		console.log(`[console] errors=${consoleErrors.length}`, consoleErrors);
		// Zero hard errors expected — preload warnings are warnings, not errors.
		expect(consoleErrors, "no hard console errors").toEqual([]);

		// Persist a JSON probe summary for the report.
		await testInfo.attach("probe-summary", {
			body: JSON.stringify(
				{
					initial,
					afterXl,
					afterRelaxed,
					afterWide,
					afterSans,
					afterSerif,
					consoleErrors,
				},
				null,
				2,
			),
			contentType: "application/json",
		});
	});
});
