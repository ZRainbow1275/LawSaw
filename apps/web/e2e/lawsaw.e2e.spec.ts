import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

function loadRuntimeE2EEnv(): { rssUrl: string } | null {
	const candidate = path.resolve(process.cwd(), "..", "..", "tmp", "e2e-env.json");
	try {
		const raw = fs.readFileSync(candidate, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const rssUrl = (parsed as { rss_url?: unknown }).rss_url;
		if (typeof rssUrl !== "string") return null;
		const trimmed = rssUrl.trim();
		return trimmed.length > 0 ? { rssUrl: trimmed } : null;
	} catch {
		return null;
	}
}

function buildTenantSlug(seed: string): string {
	const cleaned = seed.toLowerCase().replace(/[^a-z0-9-]/g, "-");
	const withPrefix = cleaned.startsWith("e2e-") ? cleaned : `e2e-${cleaned}`;
	const trimmed = withPrefix.replace(/^-+/, "e").replace(/-+$/, "");
	const safe = trimmed.length >= 3 ? trimmed : "e2e";
	return safe.slice(0, 32);
}

test.describe.serial("LawSaw 关键用户流 E2E", () => {
	test("未登录访问受保护页面应重定向到登录页", async ({ page }) => {
		await page.goto("/articles");
		await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });
		await expect(page.getByLabel("邮箱")).toBeVisible();
	});

	test("注册/登录 → 信息源抓取 → 文章详情 → 搜索", async ({ page }) => {
		const rssUrl =
			process.env.E2E_RSS_URL?.trim() || loadRuntimeE2EEnv()?.rssUrl || "";
		if (!rssUrl) {
			throw new Error(
				"缺少 E2E_RSS_URL。请使用 scripts/no-dockerhub/e2e.sh 启动全栈并注入 RSS fixture。",
			);
		}

		const unique = Date.now().toString(36);
		const tenantSlug = buildTenantSlug(`${unique}`);
		const tenantName = `E2E Tenant ${unique}`;
		const displayName = `E2E 用户 ${unique}`;
		const email = `e2e+${unique}@example.com`;
		const password = "TestPass123!";

		const sourceName = `E2E RSS ${unique}`;
		const expectedArticleTitle = "E2EKEY 合规要点速览（测试）";
		const expectedSearchKeyword = "E2EKEY-12345";

		// 1) 注册并自动登录（新租户首用户 => admin）
		await page.goto("/register");

		await page.getByLabel(/显示名称/).fill(displayName);
		await page.getByLabel(/租户标识/).fill(tenantSlug);
		await page.getByLabel(/租户名称/).fill(tenantName);
		await page.getByLabel("邮箱").fill(email);
		await page.getByLabel("密码").fill(password);
		await page.getByRole("button", { name: "创建账户" }).click();

		await expect(page).toHaveURL(/\/$/);
		await expect(
			page.getByRole("heading", { name: "数据看板", level: 1 }),
		).toBeVisible();

		// 2) 添加 RSS 信息源（admin-only）
		await page.goto("/sources");
		await expect(
			page.getByRole("heading", { name: "信息源管理", level: 1 }),
		).toBeVisible();

		const addSourceButton = page.getByRole("button", { name: "添加信息源" });
		await expect(addSourceButton).toBeEnabled();
		await addSourceButton.click();

		await page.getByLabel("名称").fill(sourceName);
		await page.getByLabel("URL").fill(rssUrl);
		await page.getByRole("button", { name: "添加", exact: true }).click();

		await expect(
			page.getByRole("heading", { name: sourceName }),
		).toBeVisible({ timeout: 30_000 });

		// 3) 触发抓取并等待 worker 入库/回写 last_fetch
		const sourceRow = page
			.locator("div")
			.filter({ has: page.getByRole("heading", { name: sourceName }) })
			.first();
		const fetchButton = sourceRow.getByRole("button", { name: "抓取" });
		await expect(fetchButton).toBeEnabled();
		await fetchButton.click();
		await expect(page.getByText("已触发抓取")).toBeVisible();

		const api = page.context().request;
		const origin = new URL(page.url()).origin;
		const sourcesResp = await api.get(`${origin}/api/v1/sources`);
		expect(sourcesResp.ok()).toBeTruthy();
		const sources = (await sourcesResp.json()) as Array<{
			id: string;
			name: string;
		}>;
		const createdSource = sources.find((s) => s.name === sourceName);
		expect(createdSource).toBeTruthy();

		const sourceId = createdSource?.id;
		if (!sourceId) throw new Error("未能从 /api/v1/sources 找到新建信息源。");

		await expect
			.poll(
				async () => {
					const resp = await api.get(`${origin}/api/v1/sources/${sourceId}`);
					if (!resp.ok()) {
						return { lastFetch: null, lastError: `http_${resp.status()}` };
					}
					const data = (await resp.json()) as {
						last_fetch: string | null;
						last_error: string | null;
					};
					return { lastFetch: data.last_fetch, lastError: data.last_error };
				},
				{ timeout: 90_000 },
			)
			.toEqual({ lastFetch: expect.any(String), lastError: null });

		// 4) 文章列表出现 RSS 内容，并可进入详情页
		await page.goto("/articles");
		await expect(
			page.getByRole("heading", { name: "资讯列表", level: 1 }),
		).toBeVisible();

		await page.reload();
		const articleLink = page
			.getByRole("link", { name: new RegExp(expectedArticleTitle) })
			.first();
		await expect(articleLink).toBeVisible({ timeout: 90_000 });
		await articleLink.click();
		await expect(page).toHaveURL(/\/articles\/[^/]+/, { timeout: 90_000 });
		await expect(
			page.getByRole("heading", { name: expectedArticleTitle, level: 1 }),
		).toBeVisible({ timeout: 90_000 });

		// 5) 关键词搜索可命中该文章（非 AI）
		await page.goto("/search");
		await expect(page.getByRole("heading", { name: "搜索", level: 1 })).toBeVisible();

		await page.getByPlaceholder("输入关键词搜索...").fill(expectedSearchKeyword);
		const searchForm = page
			.locator("form")
			.filter({ has: page.getByPlaceholder("输入关键词搜索...") });
		await searchForm.getByRole("button", { name: "搜索", exact: true }).click();

		await expect(
			page.getByRole("link", { name: new RegExp(expectedArticleTitle) }).first(),
		).toBeVisible({ timeout: 90_000 });
	});
});
