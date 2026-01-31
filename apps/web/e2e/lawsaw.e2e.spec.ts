import fs from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext } from "@playwright/test";

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

interface E2ECredentials {
	unique: string;
	tenantSlug: string;
	tenantName: string;
	displayName: string;
	email: string;
	password: string;
}

function createE2ECredentials(): E2ECredentials {
	const unique = Date.now().toString(36);
	const tenantSlug = buildTenantSlug(`${unique}`);
	return {
		unique,
		tenantSlug,
		tenantName: `E2E Tenant ${unique}`,
		displayName: `E2E 用户 ${unique}`,
		email: `e2e+${unique}@example.com`,
		password: "TestPass123!",
	};
}

async function registerAndLogin(
	context: BrowserContext,
	baseURL: string,
	credentials: E2ECredentials,
) {
	const registerUrl = new URL("/api/v1/auth/register", baseURL).toString();
	const meUrl = new URL("/api/v1/auth/me", baseURL).toString();
	const dashboardUrl = new URL("/", baseURL).toString();

	const payload = {
		email: credentials.email,
		password: credentials.password,
		display_name: credentials.displayName,
		tenant_slug: credentials.tenantSlug,
		tenant_name: credentials.tenantName,
	};

	const doRegister = async () =>
		context.request.post(registerUrl, {
			data: payload,
			headers: {
				Origin: baseURL,
				Referer: new URL("/register", baseURL).toString(),
			},
		});

	let response = await doRegister();
	if (response.status() === 429) {
		const retryAfterRaw = response.headers()["retry-after"];
		const retryAfterSeconds = retryAfterRaw
			? Number.parseInt(retryAfterRaw, 10)
			: Number.NaN;
		const delayMs =
			Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
				? retryAfterSeconds * 1000
				: 5_000;
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		response = await doRegister();
	}

	const registerText = await response.text();
	if (!response.ok()) {
		throw new Error(
			`Register failed: ${response.status()} ${registerText.slice(0, 200)}`,
		);
	}

	let registerJson: unknown = null;
	try {
		registerJson = JSON.parse(registerText) as unknown;
	} catch {
		throw new Error(`Register returned non-JSON: ${registerText.slice(0, 200)}`);
	}

	if (
		!registerJson ||
		typeof registerJson !== "object" ||
		!("success" in registerJson) ||
		(registerJson as { success?: unknown }).success !== true
	) {
		throw new Error(`Register returned unexpected payload: ${registerText.slice(0, 200)}`);
	}

	const meResponse = await context.request.get(meUrl);
	const meText = await meResponse.text();
	if (!meResponse.ok()) {
		throw new Error(
			`Auth session not established: ${meResponse.status()} ${meText.slice(0, 200)}`,
		);
	}

	const page = await context.newPage();
	await page.goto(dashboardUrl);
	await expect(
		page.getByRole("heading", { name: "数据看板", level: 1 }),
	).toBeVisible({ timeout: 90_000 });
	await page.close();
}

test.describe.serial("LawSaw 关键用户流 E2E", () => {
	let auth:
		| {
				statePath: string;
				unique: string;
		  }
		| undefined;

	test.beforeAll(async ({ browser }, testInfo) => {
		const baseURL = testInfo.project.use.baseURL as string | undefined;
		if (!baseURL) throw new Error("Playwright baseURL 未配置，无法初始化登录态。");

		const credentials = createE2ECredentials();
		const statePath = path.resolve(
			process.cwd(),
			"..",
			"..",
			"tmp",
			`e2e-auth-state-${credentials.unique}.json`,
		);

		const context = await browser.newContext({ baseURL });
		await registerAndLogin(context, baseURL, credentials);
		await context.storageState({ path: statePath });
		await context.close();

		auth = { statePath, unique: credentials.unique };
	});

	test("未登录访问受保护页面应重定向到登录页", async ({ page }) => {
		await page.goto("/articles");
		await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });
		await expect(page.getByLabel("邮箱")).toBeVisible();
	});

	test("移动端抽屉导航：打开/关闭/跳转/锁滚动", async ({ browser }, testInfo) => {
		if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
		const baseURL = testInfo.project.use.baseURL as string | undefined;
		if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行移动端用例。");

		const context = await browser.newContext({
			baseURL,
			storageState: auth.statePath,
		});
		const page = await context.newPage();

		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: "数据看板", level: 1 }),
		).toBeVisible();

		const openButton = page.getByRole("button", { name: "打开导航菜单" });
		await expect(openButton).toBeVisible();

		const drawer = page.locator('aside[aria-label="主导航"]:visible');
		await expect(drawer).toHaveCount(0);

		const initialOverflow = await page.evaluate(() => document.body.style.overflow);

		// 1) 汉堡按钮打开
		await openButton.click();
		await expect(drawer).toHaveCount(1);
		await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe(
			"hidden",
		);

		// 2) ESC 关闭
		await page.keyboard.press("Escape");
		await expect(drawer).toHaveCount(0);
		await expect
			.poll(async () => page.evaluate(() => document.body.style.overflow))
			.toBe(initialOverflow);

		// 3) 遮罩点击关闭（点击抽屉外侧区域）
		await openButton.click();
		await expect(drawer).toHaveCount(1);
		await page.mouse.click(360, 20);
		await expect(drawer).toHaveCount(0);
		await expect
			.poll(async () => page.evaluate(() => document.body.style.overflow))
			.toBe(initialOverflow);

		// 4) 导航跳转自动收起 + 解除锁滚动
		await openButton.click();
		await expect(drawer).toHaveCount(1);
		await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe(
			"hidden",
		);
		await drawer.getByRole("link", { name: "全部资讯" }).click();
		await expect(page).toHaveURL(/\/articles(?:\?|$)/, { timeout: 90_000 });
		await expect(
			page.getByRole("heading", { name: "资讯列表", level: 1 }),
		).toBeVisible();
		await expect(drawer).toHaveCount(0);
		await expect
			.poll(async () => page.evaluate(() => document.body.style.overflow))
			.toBe(initialOverflow);

		await context.close();
	});

	test("登录态 → 信息源抓取 → 文章详情 → 搜索", async ({ browser }, testInfo) => {
		if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
		const baseURL = testInfo.project.use.baseURL as string | undefined;
		if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行用户流用例。");

		const rssUrl =
			process.env.E2E_RSS_URL?.trim() || loadRuntimeE2EEnv()?.rssUrl || "";
		if (!rssUrl) {
			throw new Error(
				"缺少 E2E_RSS_URL。请使用 scripts/no-dockerhub/e2e.sh 启动全栈并注入 RSS fixture。",
				);
		}

		const context = await browser.newContext({
			baseURL,
			storageState: auth.statePath,
		});
		const page = await context.newPage();

		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: "数据看板", level: 1 }),
		).toBeVisible();

		const sourceName = `E2E RSS ${auth.unique}`;
		const expectedArticleTitle = "E2EKEY 合规要点速览（测试）";
		const expectedSearchKeyword = "E2EKEY-12345";

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

		const sources = await page.evaluate(async () => {
			const resp = await fetch("/api/v1/sources", { credentials: "include" });
			const text = await resp.text();
			if (!resp.ok) {
				throw new Error(
					`GET /api/v1/sources failed: ${resp.status} ${text.slice(0, 200)}`,
				);
			}
			return JSON.parse(text) as Array<{ id: string; name: string }>;
		});
		const createdSource = sources.find((s) => s.name === sourceName);
		expect(createdSource).toBeTruthy();

		const sourceId = createdSource?.id;
		if (!sourceId) throw new Error("未能从 /api/v1/sources 找到新建信息源。");

		await expect
			.poll(
				async () => {
					const result = await page.evaluate(async (id) => {
						const resp = await fetch(`/api/v1/sources/${id}`, {
							credentials: "include",
						});
						let data: unknown = null;
						try {
							data = (await resp.json()) as unknown;
						} catch {
							data = null;
						}
						return {
							ok: resp.ok,
							status: resp.status,
							last_fetch:
								data && typeof data === "object" && "last_fetch" in data
									? (data as { last_fetch: unknown }).last_fetch
									: null,
							last_error:
								data && typeof data === "object" && "last_error" in data
									? (data as { last_error: unknown }).last_error
									: null,
						};
					}, sourceId);

					if (!result.ok) {
						return { lastFetch: null, lastError: `http_${result.status}` };
					}

					return {
						lastFetch:
							typeof result.last_fetch === "string" ? result.last_fetch : null,
						lastError:
							typeof result.last_error === "string" ? result.last_error : null,
					};
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

		await context.close();
	});
});
