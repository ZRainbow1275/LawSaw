/**
 * Wave 9-1 dashboard structural refactor verification capture.
 *
 * Captures the dashboard at 3 viewport widths in BOTH light and dark schemes
 * to verify:
 *   1. Hero (orange banner + dark viz) fills the viewport top — no empty band
 *   2. Stats strip + scroll-hint sit INSIDE dashboard-hero (prototype layout)
 *   3. Feed section is a sibling, max-w-1200, with header + trending + filters
 *   4. (shell-wide) layout still works (sidebar/header chrome unchanged)
 *
 * Output:
 *   prompts/0507/wave9-1-dashboard/screenshots/{light,dark}/<viewport>-<slug>.png
 */

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:18849";
const EMAIL = "admin@qa.lawsaw.local";
const PASSWORD = "Admin@Lawsaw2026";

const VIEWPORTS = [
	{ slug: "wide-1600", width: 1600, height: 900 },
	{ slug: "desktop-1440", width: 1440, height: 900 },
	{ slug: "laptop-1280", width: 1280, height: 800 },
];

// Pages to verify — dashboard is the focus, others confirm sibling shells
// still render correctly under (shell-wide).
const PAGES = [
	{ slug: "01-dashboard", url: "/zh/dashboard" },
	{ slug: "02-knowledge", url: "/zh/knowledge" },
	{ slug: "03-reports", url: "/zh/reports" },
	{ slug: "04-me-feed", url: "/zh/me/feed" },
];

const SCHEMES = ["light", "dark"];

async function ensureDir(p) {
	await fs.promises.mkdir(p, { recursive: true });
}

async function login(page) {
	await page.goto(`${BASE}/zh/login`, {
		waitUntil: "domcontentloaded",
		timeout: 60_000,
	});
	await page
		.waitForLoadState("networkidle", { timeout: 20_000 })
		.catch(() => null);

	const emailSel = page.locator('input#email').first();
	const pwSel = page.locator('input#password').first();

	await emailSel.waitFor({ state: "visible", timeout: 30_000 });
	await emailSel.click();
	await emailSel.fill("");
	await page.keyboard.type(EMAIL, { delay: 20 });

	await pwSel.click();
	await pwSel.fill("");
	await page.keyboard.type(PASSWORD, { delay: 20 });

	const submit = page.locator('button[type="submit"]').first();
	await submit.waitFor({ state: "visible" });
	await page
		.waitForFunction(
			() => {
				const b = document.querySelector('button[type="submit"]');
				return b && !b.disabled;
			},
			null,
			{ timeout: 15_000 },
		)
		.catch(() => null);

	await submit.click();
	await page
		.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 })
		.catch(() => null);
	await page
		.waitForLoadState("networkidle", { timeout: 30_000 })
		.catch(() => null);
	console.log(`logged in -> ${page.url()}`);
}

async function dismissOnboarding(page) {
	// The onboarding tour stores its completion in localStorage. Mark it as
	// completed before navigation so it never appears during capture.
	await page
		.evaluate(() => {
			try {
				const keys = Object.keys(localStorage).filter(
					(k) => /onboarding|tour|guide/i.test(k),
				);
				for (const key of keys) {
					const raw = localStorage.getItem(key);
					if (raw) {
						try {
							const parsed = JSON.parse(raw);
							if (parsed?.state) {
								parsed.state.completed = true;
								parsed.state.dismissed = true;
								parsed.state.hasSeenOnboarding = true;
								parsed.state.tourCompleted = true;
								localStorage.setItem(key, JSON.stringify(parsed));
							}
						} catch {}
					}
				}
				// Generic dismissal flags some apps store as plain strings
				localStorage.setItem("onboarding-dismissed", "1");
				localStorage.setItem("hasSeenOnboarding", "true");
			} catch {}
		})
		.catch(() => null);
}

async function setScheme(page, scheme) {
	await page
		.evaluate((schemeArg) => {
			try {
				const candidateKeys = Object.keys(localStorage).filter((k) =>
					/appearance/i.test(k),
				);
				for (const key of candidateKeys) {
					const raw = localStorage.getItem(key);
					if (raw) {
						const parsed = JSON.parse(raw);
						if (parsed?.state?.appearance) {
							parsed.state.appearance.theme = schemeArg;
							localStorage.setItem(key, JSON.stringify(parsed));
						}
					}
				}
				document.documentElement.classList.toggle("dark", schemeArg === "dark");
				document.documentElement.dataset.theme = schemeArg;
				document.documentElement.style.colorScheme = schemeArg;
			} catch {}
		}, scheme)
		.catch(() => null);
}

async function captureScheme(scheme, viewport) {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		colorScheme: scheme,
		locale: "zh-CN",
	});
	const page = await context.newPage();
	const outDir = path.join(__dirname, "screenshots", scheme);
	await ensureDir(outDir);

	console.log(`\n=== ${scheme} @ ${viewport.slug} ===`);
	try {
		await login(page);
	} catch (err) {
		console.error(`login error:`, err.message);
	}
	await setScheme(page, scheme);
	await dismissOnboarding(page);

	for (const p of PAGES) {
		const file = path.join(outDir, `${viewport.slug}-${p.slug}.png`);
		try {
			await page.goto(`${BASE}${p.url}`, {
				waitUntil: "domcontentloaded",
				timeout: 60_000,
			});
			await setScheme(page, scheme);
			await dismissOnboarding(page);
			await page
				.waitForLoadState("networkidle", { timeout: 25_000 })
				.catch(() => null);
			// Allow charts/marquee to settle
			await page.waitForTimeout(1500);
			// Dismiss any onboarding modal that managed to mount despite localStorage
			await page
				.evaluate(() => {
					const candidates = Array.from(document.querySelectorAll("button"))
						.filter((b) => /跳过|跳过引导|skip|dismiss|关闭/i.test(b.textContent || ""));
					if (candidates.length > 0) candidates[0].click();
				})
				.catch(() => null);
			await page.waitForTimeout(400);
			await setScheme(page, scheme);
			await page.waitForTimeout(200);
			await page.screenshot({ path: file, fullPage: true });
			console.log(`OK  ${p.url} -> ${file}`);
		} catch (err) {
			console.error(`FAIL ${p.url}:`, err.message);
			try {
				await page.screenshot({ path: file, fullPage: false });
			} catch {}
		}
	}

	await context.close();
	await browser.close();
}

(async () => {
	for (const scheme of SCHEMES) {
		for (const viewport of VIEWPORTS) {
			await captureScheme(scheme, viewport);
		}
	}
	console.log("\nDone.");
})().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
