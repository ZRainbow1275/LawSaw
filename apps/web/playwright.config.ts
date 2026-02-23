import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadBaseUrlFromRuntimeFile(): string | null {
	const candidate = path.resolve(process.cwd(), "..", "..", "tmp", "e2e-env.json");
	try {
		const raw = fs.readFileSync(candidate, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			"base_url" in parsed &&
			typeof (parsed as { base_url?: unknown }).base_url === "string"
		) {
			const value = (parsed as { base_url: string }).base_url.trim();
			return value.length > 0 ? value : null;
		}
	} catch {
		// ignore
	}
	return null;
}

function resolveSystemChromiumExecutable(): string | null {
	const candidates = [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	];
	for (const candidate of candidates) {
		try {
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		} catch {
			// ignore filesystem errors and continue probing
		}
	}
	return null;
}

const baseURL =
	process.env.E2E_BASE_URL?.trim() ||
	loadBaseUrlFromRuntimeFile() ||
	"http://127.0.0.1:8849";

const systemChromiumExecutable = resolveSystemChromiumExecutable();

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	timeout: 90_000,
	expect: {
		timeout: 15_000,
	},
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI
		? [["github"], ["html", { open: "never" }]]
		: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		locale: "zh-CN",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: process.env.PLAYWRIGHT_VIDEO === "1" ? "retain-on-failure" : "off",
	},
	outputDir: "test-results",
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				...(systemChromiumExecutable
					? {
							launchOptions: {
								executablePath: systemChromiumExecutable,
							},
						}
					: {}),
			},
		},
	],
});
