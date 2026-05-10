/**
 * Wave 9-recovery global verification: every user-facing route at 1440x900 light only.
 *
 * Captures all routes that were affected by the UserShell flex regression to
 * confirm sidebar / main / scrollbar layout is consistent with PersistentUserShell.
 */

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:18849";
const EMAIL = "admin@qa.lawsaw.local";
const PASSWORD = "Admin@Lawsaw2026";

const VIEWPORT = { width: 1440, height: 900 };

const PAGES = [
	// PersistentUserShell (shell-default + shell-wide)
	{ slug: "01-dashboard", url: "/zh/dashboard" },
	{ slug: "02-me", url: "/zh/me" },
	{ slug: "03-me-feed", url: "/zh/me/feed" },
	{ slug: "04-knowledge", url: "/zh/knowledge" },
	{ slug: "05-reports", url: "/zh/reports" },
	// Legacy UserShell (exempt prefixes)
	{ slug: "06-articles", url: "/zh/articles" },
	{ slug: "07-sources", url: "/zh/sources" },
	{ slug: "08-settings", url: "/zh/settings" },
	{ slug: "09-search", url: "/zh/search?q=test" },
	{ slug: "10-data", url: "/zh/data" },
	{ slug: "11-feedback", url: "/zh/feedback" },
	{ slug: "12-analytics", url: "/zh/analytics" },
	// Admin
	{ slug: "13-admin", url: "/zh/admin" },
	{ slug: "14-admin-reactions", url: "/zh/admin/insights/reactions" },
];

async function ensureDir(p) {
	await fs.promises.mkdir(p, { recursive: true });
}

async function login(page) {
	await page.goto(`${BASE}/zh/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
	await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);

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
	await page.waitForFunction(
		() => { const b = document.querySelector('button[type="submit"]'); return b && !b.disabled; },
		null, { timeout: 15_000 },
	).catch(() => null);
	await submit.click();
	await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 }).catch(() => null);
	await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);
	console.log(`logged in -> ${page.url()}`);
}

async function dismissOnboarding(page) {
	await page.evaluate(() => {
		try {
			const keys = Object.keys(localStorage).filter((k) => /onboarding|tour|guide/i.test(k));
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
			localStorage.setItem("onboarding-dismissed", "1");
			localStorage.setItem("hasSeenOnboarding", "true");
		} catch {}
	}).catch(() => null);
}

(async () => {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: VIEWPORT,
		colorScheme: "light",
		locale: "zh-CN",
	});
	const page = await context.newPage();
	const outDir = path.join(__dirname, "screenshots", "light");
	await ensureDir(outDir);

	try {
		await login(page);
	} catch (err) {
		console.error("login error:", err.message);
	}
	await dismissOnboarding(page);

	for (const p of PAGES) {
		const file = path.join(outDir, `${p.slug}.png`);
		try {
			await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
			await dismissOnboarding(page);
			await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => null);
			await page.waitForTimeout(1500);
			// Capture viewport-only (top of page) — that's where layout regressions show up
			await page.screenshot({ path: file, fullPage: false });
			console.log(`OK  ${p.url} -> ${file}`);
		} catch (err) {
			console.error(`FAIL ${p.url}:`, err.message);
			try { await page.screenshot({ path: file, fullPage: false }); } catch {}
		}
	}

	await context.close();
	await browser.close();
	console.log("\nDone.");
})().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
