/**
 * Standalone Playwright capture for dark-mode-full Phase 3 verification.
 * Bypasses the (currently unresponsive) MCP playwright backend.
 *
 * Usage:
 *   cd D:/Desktop/LawSaw && node prompts/0507/dark-mode-full/capture.mjs
 *
 * Output:
 *   prompts/0507/dark-mode-full/screenshots/{light,dark}/<page>.png
 */

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:8849";
const EMAIL = "admin@qa.lawsaw.local";
const PASSWORD = "Admin@Lawsaw2026";

const PAGES = [
	{ slug: "home", url: "/zh" },
	{ slug: "me", url: "/zh/me" },
	{ slug: "dashboard", url: "/zh/dashboard" },
	{ slug: "me-feed", url: "/zh/me/feed" },
	{ slug: "admin", url: "/zh/admin" },
	{ slug: "reports", url: "/zh/reports" },
	{ slug: "sources", url: "/zh/sources" },
];

const SCHEMES = ["light", "dark"];

async function ensureDir(p) {
	await fs.promises.mkdir(p, { recursive: true });
}

async function login(page) {
	await page.goto(`${BASE}/zh/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
	await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);

	const emailSel = page.locator('input[type="email"], input[name="email"], input[id*="email" i]').first();
	const pwSel = page.locator('input[type="password"], input[name="password"], input[id*="password" i]').first();

	await emailSel.waitFor({ state: "visible", timeout: 15_000 });
	await emailSel.click();
	await emailSel.fill("");
	await page.keyboard.type(EMAIL, { delay: 30 });

	await pwSel.click();
	await pwSel.fill("");
	await page.keyboard.type(PASSWORD, { delay: 30 });

	const submit = page.locator('button[type="submit"]').first();
	// wait until submit becomes enabled (form validates)
	await submit.waitFor({ state: "visible" });
	await page.waitForFunction(
		() => {
			const b = document.querySelector('button[type="submit"]');
			return b && !b.disabled;
		},
		null,
		{ timeout: 15_000 },
	).catch((e) => console.error("submit stayed disabled:", e.message));

	await submit.click();
	await page
		.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 })
		.catch(() => null);
	await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);
	console.log(`logged in, current URL: ${page.url()}`);
}

async function captureFor(scheme) {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		colorScheme: scheme,
		locale: "zh-CN",
	});
	const page = await context.newPage();
	const outDir = path.join(__dirname, "screenshots", scheme);
	await ensureDir(outDir);

	console.log(`\n=== Scheme: ${scheme} ===`);
	try {
		await login(page);
	} catch (err) {
		console.error(`[${scheme}] login error:`, err.message);
	}

	// Force theme via the app's appearance store (zustand persisted in localStorage)
	// + apply .dark class immediately so first paint already matches.
	try {
		await page.evaluate((schemeArg) => {
			try {
				const persistKey = "law-eye-appearance"; // zustand persist name guess
				const candidateKeys = Object.keys(localStorage).filter((k) =>
					/appearance/i.test(k),
				);
				const targetKeys = candidateKeys.length > 0 ? candidateKeys : [persistKey];
				for (const key of targetKeys) {
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
			} catch (e) {
				console.warn("theme override fail", e);
			}
		}, scheme);
	} catch (err) {
		console.error(`[${scheme}] theme override error:`, err.message);
	}

	for (const p of PAGES) {
		const file = path.join(outDir, `${p.slug}.png`);
		try {
			await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
			// re-apply on each navigation in case provider re-resets (system mode etc.)
			await page.evaluate((schemeArg) => {
				document.documentElement.classList.toggle("dark", schemeArg === "dark");
				document.documentElement.dataset.theme = schemeArg;
				document.documentElement.style.colorScheme = schemeArg;
			}, scheme);
			await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
			// give AppearanceProvider effect a beat to settle
			await page.waitForTimeout(800);
			// final enforce after react effects
			await page.evaluate((schemeArg) => {
				document.documentElement.classList.toggle("dark", schemeArg === "dark");
			}, scheme);
			await page.waitForTimeout(200);
			await page.screenshot({ path: file, fullPage: true });
			console.log(`[${scheme}] OK ${p.url} → ${file}`);
		} catch (err) {
			console.error(`[${scheme}] FAIL ${p.url}:`, err.message);
			try {
				await page.screenshot({ path: file, fullPage: false });
				console.log(`[${scheme}] partial ${file}`);
			} catch {}
		}
	}

	await context.close();
	await browser.close();
}

(async () => {
	for (const scheme of SCHEMES) {
		await captureFor(scheme);
	}
	console.log("\nDone.");
})().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
