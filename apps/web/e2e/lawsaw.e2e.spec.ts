import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

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

const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [
	/^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/,
	/^Failed to load resource: the server responded with a status of 403 \(Forbidden\)$/,
];

function createPageErrorGate() {
	const errors: string[] = [];

	function attach(page: Page) {
		page.on("requestfailed", (request) => {
			const failure = request.failure();
			if (failure?.errorText?.includes("net::ERR_ABORTED")) {
				// Next.js RSC prefetch/navigation can intentionally abort in-flight requests.
				return;
			}
			const detail = failure?.errorText ? ` (${failure.errorText})` : "";
			errors.push(`requestfailed: ${request.method()} ${request.url()}${detail}`);
		});

		page.on("response", (response) => {
			const status = response.status();
			if (status < 500 && status !== 429) return;
			errors.push(`http_${status}: ${response.request().method()} ${response.url()}`);
		});

		page.on("pageerror", (error) => {
			const detail = error instanceof Error ? error.stack || error.message : String(error);
			errors.push(`pageerror: ${detail}`);
		});

		page.on("console", (message) => {
			if (message.type() !== "error") return;
			const text = message.text();
			if (CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(text))) return;
			errors.push(`console.error: ${text}`);
		});
	}

	function assertNoErrors() {
		if (errors.length === 0) return;
		throw new Error(`Detected console/page errors:\n${errors.join("\n")}`);
	}

	return { attach, assertNoErrors };
}

async function waitForStackReady(context: BrowserContext, baseURL: string) {
	const healthUrl = new URL("/health", baseURL).toString();
	const requestTimeoutMs = 10_000;
	const deadline = Date.now() + 90_000;
	let lastDetail = "";

	while (Date.now() < deadline) {
		try {
			const resp = await context.request.get(healthUrl, {
				timeout: requestTimeoutMs,
			});
			const text = (await resp.text()).trim();
			lastDetail = `${resp.status()} ${text.slice(0, 200)}`;
			if (!resp.ok) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				continue;
			}

			try {
				const parsed: unknown = JSON.parse(text);
				if (
					parsed &&
					typeof parsed === "object" &&
					"status" in parsed &&
					(parsed as { status?: unknown }).status === "ok"
				) {
					return;
				}
			} catch {
				// ignore json parse error
			}
		} catch (err) {
			lastDetail = err instanceof Error ? err.message : String(err);
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`Stack not ready: GET /health did not return {status: ok}. Last: ${lastDetail}`);
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

	const requestTimeoutMs = 20_000;
	const doRegister = async () =>
		context.request.post(registerUrl, {
			data: payload,
			timeout: requestTimeoutMs,
			headers: {
				Origin: baseURL,
				Referer: new URL("/register", baseURL).toString(),
			},
		});

	const maxRegisterAttempts = 5;
	let response: Awaited<ReturnType<typeof doRegister>> | null = null;
	let lastError: unknown = null;
	for (let attempt = 1; attempt <= maxRegisterAttempts; attempt++) {
		try {
			response = await doRegister();
		} catch (error) {
			lastError = error;
			response = null;
		}

		if (!response) {
			const delayMs = Math.min(15_000, 500 * 2 ** (attempt - 1));
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			continue;
		}

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
			continue;
		}

		if (response.status() >= 500 && attempt < maxRegisterAttempts) {
			const delayMs = Math.min(10_000, 500 * attempt);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			continue;
		}

		break;
	}

	if (!response) {
		const detail = lastError instanceof Error ? lastError.message : String(lastError);
		throw new Error(`Register request failed: ${detail}`);
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

	const maxMeAttempts = 5;
	let meResponse: Awaited<ReturnType<typeof context.request.get>> | null = null;
	for (let attempt = 1; attempt <= maxMeAttempts; attempt++) {
		meResponse = await context.request.get(meUrl, { timeout: 10_000 });
		if (meResponse.ok()) break;
		if (meResponse.status() >= 500 && attempt < maxMeAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
			continue;
		}
		break;
	}

	if (!meResponse) throw new Error("Auth session check failed: missing response");
	const meText = await meResponse.text();
	if (!meResponse.ok()) {
		throw new Error(
			`Auth session not established: ${meResponse.status()} ${meText.slice(0, 200)}`,
		);
	}

	const page = await context.newPage();
	const gate = createPageErrorGate();
	gate.attach(page);
	await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
	await expect(
		page.getByRole("heading", { name: "数据看板", level: 1 }),
	).toBeVisible({ timeout: 90_000 });
	gate.assertNoErrors();
	await page.close();
}

async function loginExistingUser(
	context: BrowserContext,
	baseURL: string,
	credentials: Pick<E2ECredentials, "email" | "password">,
) {
	const loginUrl = new URL("/api/v1/auth/login", baseURL).toString();
	const meUrl = new URL("/api/v1/auth/me", baseURL).toString();

	const payload = {
		email: credentials.email,
		password: credentials.password,
	};

	const requestTimeoutMs = 20_000;
	const doLogin = async () =>
		context.request.post(loginUrl, {
			data: payload,
			timeout: requestTimeoutMs,
			headers: {
				Origin: baseURL,
				Referer: new URL("/login", baseURL).toString(),
			},
		});

	const maxAttempts = 5;
	let response: Awaited<ReturnType<typeof doLogin>> | null = null;
	let lastError: unknown = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			response = await doLogin();
		} catch (error) {
			lastError = error;
			response = null;
		}

		if (!response) {
			await new Promise((resolve) =>
				setTimeout(resolve, Math.min(10_000, 500 * 2 ** (attempt - 1))),
			);
			continue;
		}

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
			continue;
		}

		if (response.status() >= 500 && attempt < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
			continue;
		}

		break;
	}

	if (!response) {
		const detail = lastError instanceof Error ? lastError.message : String(lastError);
		throw new Error(`Login request failed: ${detail}`);
	}

	const loginText = await response.text();
	if (!response.ok()) {
		throw new Error(`Login failed: ${response.status()} ${loginText.slice(0, 200)}`);
	}

	let loginJson: unknown = null;
	try {
		loginJson = JSON.parse(loginText) as unknown;
	} catch {
		throw new Error(`Login returned non-JSON: ${loginText.slice(0, 200)}`);
	}
	if (
		!loginJson ||
		typeof loginJson !== "object" ||
		!("success" in loginJson) ||
		(loginJson as { success?: unknown }).success !== true
	) {
		throw new Error(`Login returned unexpected payload: ${loginText.slice(0, 200)}`);
	}

	const maxMeAttempts = 5;
	let meResponse: Awaited<ReturnType<typeof context.request.get>> | null = null;
	for (let attempt = 1; attempt <= maxMeAttempts; attempt++) {
		meResponse = await context.request.get(meUrl, { timeout: 10_000 });
		if (meResponse.ok()) break;
		if (meResponse.status() >= 500 && attempt < maxMeAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
			continue;
		}
		break;
	}

	if (!meResponse) throw new Error("Auth session check failed: missing response");
	const meText = await meResponse.text();
	if (!meResponse.ok()) {
		throw new Error(
			`Auth session not established: ${meResponse.status()} ${meText.slice(0, 200)}`,
		);
	}
}

	test.describe.serial("LawSaw 关键用户流 E2E", () => {
		let auth:
			| {
					statePath: string;
					unique: string;
					displayName: string;
					email: string;
					password: string;
			  }
			| undefined;

	test.beforeAll(async ({ browser }, testInfo) => {
		testInfo.setTimeout(180_000);
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
		await waitForStackReady(context, baseURL);
		await registerAndLogin(context, baseURL, credentials);
		await context.storageState({ path: statePath });
		await context.close();

			auth = {
				statePath,
				unique: credentials.unique,
				displayName: credentials.displayName,
				email: credentials.email,
				password: credentials.password,
			};
		});

		test("未登录访问受保护页面应重定向到登录页", async ({ page }) => {
			if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
			const gate = createPageErrorGate();
			gate.attach(page);
			await page.goto("/articles");
			await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });

			const redirected = new URL(page.url());
			expect(redirected.searchParams.get("returnTo")).toBe("/articles");

			await expect(page.getByLabel("邮箱")).toBeVisible();
			await page.getByLabel("邮箱").fill(auth.email);
			await page.getByLabel("密码").fill(auth.password);
			await page.getByRole("button", { name: "登录" }).click();
			await expect(page).toHaveURL(/\/articles(?:\?|$)/, { timeout: 90_000 });
			await expect(
				page.getByRole("heading", { name: "资讯列表", level: 1 }),
			).toBeVisible({ timeout: 90_000 });
			gate.assertNoErrors();
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
		const gate = createPageErrorGate();
		gate.attach(page);

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

		gate.assertNoErrors();
		await context.close();
	});

	test("登录态 → 信息源抓取 → 文章详情 → 搜索 → 商业化关键链路巡检", async ({ browser }, testInfo) => {
		if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
		const baseURL = testInfo.project.use.baseURL as string | undefined;
		if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行用户流用例。");
		test.setTimeout(180_000);

		const rssUrl =
			process.env.E2E_RSS_URL?.trim() || loadRuntimeE2EEnv()?.rssUrl || "";
		if (!rssUrl) {
			throw new Error(
				[
					"缺少 E2E_RSS_URL。",
					"可选：",
					"1) scripts/no-dockerhub/e2e.sh（自动启动 RSS fixture + 栈）",
					"2) docker compose --profile e2e up -d && E2E_RSS_URL=http://rss-fixture:8000/rss.xml pnpm -C apps/web e2e",
					"3) 写入 tmp/e2e-env.json（rss_url/base_url），用于 Windows/WSL interop 下环境变量透传不稳定场景",
				].join("\n"),
			);
		}

		const context = await browser.newContext({
			baseURL,
			storageState: auth.statePath,
		});
		await waitForStackReady(context, baseURL);
		const page = await context.newPage();
		const gate = createPageErrorGate();
		gate.attach(page);

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

		// 6) 数据管理：归档该文章（验证批量写操作闭环）
		await page.goto("/data");
		await expect(
			page.getByRole("heading", { name: "数据管理", level: 1 }),
		).toBeVisible({ timeout: 90_000 });
		await page.getByPlaceholder("搜索标题或摘要...").fill(expectedArticleTitle);
		const dataRow = page.locator("tr").filter({ hasText: expectedArticleTitle }).first();
		await expect(dataRow).toBeVisible({ timeout: 90_000 });
		await dataRow.locator("input[type='checkbox']").first().check();
		const archiveButton = page.getByRole("button", { name: "归档" });
		await expect(archiveButton).toBeEnabled();
		await archiveButton.click();
		await expect(
			page
				.locator('[aria-live="polite"]')
				.getByText("已归档", { exact: true }),
		).toBeVisible({ timeout: 30_000 });
		await expect(dataRow.getByText("已归档")).toBeVisible({ timeout: 90_000 });

		// 7) 知识图谱：初始化 + 检索信息源实体 + 关联文章可见
		await page.goto("/knowledge");
		await expect(
			page.getByRole("heading", { name: "知识图谱", level: 1 }),
		).toBeVisible({ timeout: 90_000 });
		const backfillButton = page.getByTestId("knowledge-backfill");
		const anyEntityItem = page
			.locator("button[data-testid^='knowledge-entity-item-']")
			.first();

		await expect
			.poll(
				async () => {
					const hasEntities = (await anyEntityItem.count()) > 0;
					const canBackfill = await backfillButton.isVisible().catch(() => false);
					return hasEntities || canBackfill;
				},
				{ timeout: 90_000 },
			)
			.toBe(true);

		if (await backfillButton.isVisible().catch(() => false)) {
			await backfillButton.click();
			await expect(
				page
					.locator('[aria-live="polite"]')
					.getByText("初始化完成", { exact: true }),
			).toBeVisible({ timeout: 90_000 });

			await expect
				.poll(async () => (await anyEntityItem.count()) > 0, { timeout: 90_000 })
				.toBe(true);
		}

		await page
			.getByPlaceholder("搜索实体（例：网信办 / 反垄断 / GDPR）")
			.fill(sourceName);
		const entityButton = page
			.locator("button[data-testid^='knowledge-entity-item-']")
			.filter({ hasText: sourceName })
			.first();
		await expect(entityButton).toBeVisible({ timeout: 90_000 });
		await entityButton.click();
		await expect(page.getByText("属性面板")).toBeVisible({ timeout: 90_000 });
		await expect(
			page.getByRole("link", { name: new RegExp(expectedArticleTitle) }).first(),
		).toBeVisible({ timeout: 90_000 });

		// 8) 留言反馈：提交一条问题反馈并验证可见
		await page.goto("/feedback");
		await expect(
			page.getByRole("heading", { name: "留言反馈", level: 1 }),
		).toBeVisible({ timeout: 90_000 });
		const feedbackTypeGroup = page.getByRole("radiogroup", { name: "反馈类型" });
		await feedbackTypeGroup.getByText("问题反馈", { exact: true }).click();
		const feedbackTitle = `E2E 反馈 ${auth.unique}`;
		await page.locator("#feedback-title").fill(feedbackTitle);
		await page.locator("#feedback-content").fill("E2E 自动化回归：关键链路巡检");
		await page.getByRole("button", { name: "提交反馈" }).click();
		await expect(page.getByText("提交成功！")).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(feedbackTitle).first()).toBeVisible({ timeout: 90_000 });

		// 9) 系统设置：上传头像（对象存储）+ API Key 生命周期 + 系统健康检查
		await page.goto("/settings?tab=profile");
		await expect(
			page.getByRole("heading", { name: "系统设置", level: 1 }),
		).toBeVisible({ timeout: 90_000 });

		const avatarPng = Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X4YkAAAAASUVORK5CYII=",
			"base64",
		);
		await page.locator("#profile-avatar").setInputFiles({
			name: `avatar-${auth.unique}.png`,
			mimeType: "image/png",
			buffer: avatarPng,
		});
		await page.getByRole("button", { name: "上传头像" }).click();
		await expect(
			page
				.locator('[aria-live="polite"]')
				.getByText("头像已更新", { exact: true }),
		).toBeVisible({ timeout: 30_000 });

		await page.goto("/settings?tab=api");
		await expect(
			page.getByRole("heading", { name: "API 密钥" }),
		).toBeVisible({ timeout: 90_000 });
		const apiKeyName = `E2E Key ${auth.unique}`;
		await page.locator("#apikey-name").fill(apiKeyName);
		await page.getByRole("button", { name: "创建" }).click();
		await expect(
			page
				.locator('[aria-live="polite"]')
				.getByText("API 密钥已创建", { exact: true }),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText("新密钥（仅显示一次")).toBeVisible({ timeout: 30_000 });
		await page.getByRole("main").getByRole("button", { name: "关闭" }).click();

		const createdKeyCard = page
			.locator("div")
			.filter({ has: page.getByText(apiKeyName) })
			.filter({ has: page.getByRole("button", { name: "删除" }) })
			.first();
		await expect(createdKeyCard).toBeVisible({ timeout: 90_000 });
		page.once("dialog", (dialog) => dialog.accept());
		await createdKeyCard.getByRole("button", { name: "删除" }).click();
		await expect(
			page
				.locator('[aria-live="polite"]')
				.getByText("已删除 API 密钥", { exact: true }),
		).toBeVisible({ timeout: 30_000 });

		await page.goto("/settings?tab=system");
		await expect(page.getByText("API 状态")).toBeVisible({ timeout: 90_000 });
		await expect(page.getByText("ok")).toBeVisible({ timeout: 90_000 });

		// 10) 统计分析（确保聚合接口可用且页面可渲染）
		await page.goto("/analytics");
		await expect(
			page.getByRole("heading", { name: "统计分析", level: 1 }),
		).toBeVisible({ timeout: 90_000 });

		// 11) 分类页 smoke（确保默认分类可用）
		await page.goto("/category/legislation");
		await expect(page.getByText("未找到该分类")).toHaveCount(0);
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
			timeout: 90_000,
		});

		// 12) 登出并验证登录态已失效（关键用户旅程闭环）
		await page.getByText(auth.displayName).click();
		await page.getByRole("button", { name: "退出登录" }).click();
		await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });
		await expect(page.getByLabel("邮箱")).toBeVisible();

		const meStatus = await page.evaluate(async () => {
			const resp = await fetch("/api/v1/auth/me", { credentials: "include" });
			return resp.status;
		});
		expect(meStatus).toBe(401);

		await page.goto("/articles");
		await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });

		gate.assertNoErrors();
		await context.close();
	});

		test("会话失效（401）应跳转登录并可恢复 returnTo", async ({ browser }, testInfo) => {
			if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
			const baseURL = testInfo.project.use.baseURL as string | undefined;
			if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行用例。");
			test.setTimeout(180_000);

			const context = await browser.newContext({ baseURL });
			await waitForStackReady(context, baseURL);
			await loginExistingUser(context, baseURL, auth);
			const page = await context.newPage();
			const gate = createPageErrorGate();
			gate.attach(page);

			await page.goto("/sources");
			await expect(
				page.getByRole("heading", { name: "信息源管理", level: 1 }),
			).toBeVisible({ timeout: 90_000 });

			// 模拟会话过期：清 cookie，但不刷新页面（保持 UI 假登录态），再触发一个需要鉴权的操作。
			await context.clearCookies();
			await page.getByRole("button", { name: "抓取" }).first().click();

			await expect(page).toHaveURL(/\/login\?returnTo=/, { timeout: 90_000 });
			const redirected = new URL(page.url());
			expect(redirected.searchParams.get("returnTo")).toBe("/sources");

			await page.getByLabel("邮箱").fill(auth.email);
			await page.getByLabel("密码").fill(auth.password);
			await page.getByRole("button", { name: "登录" }).click();
			await expect(page).toHaveURL(/\/sources(?:\?|$)/, { timeout: 90_000 });
			await expect(
				page.getByRole("heading", { name: "信息源管理", level: 1 }),
			).toBeVisible({ timeout: 90_000 });

			gate.assertNoErrors();
			await context.close();
		});

		test("权限不足（403）应提示且不重试", async ({ browser }, testInfo) => {
			if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
			const baseURL = testInfo.project.use.baseURL as string | undefined;
			if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行用例。");
			test.setTimeout(180_000);

			const context = await browser.newContext({ baseURL });
			await waitForStackReady(context, baseURL);
			await loginExistingUser(context, baseURL, auth);
			const page = await context.newPage();
			const gate = createPageErrorGate();
			gate.attach(page);

			let sourcesHit = 0;
			await page.route("**/api/v1/sources", async (route) => {
				sourcesHit += 1;
				await route.fulfill({
					status: 403,
					contentType: "application/json",
					body: JSON.stringify({ error: "Permission denied" }),
				});
			});

			await page.goto("/sources");
			await expect(
				page.getByRole("heading", { name: "信息源管理", level: 1 }),
			).toBeVisible({ timeout: 90_000 });

			await expect(
				page.locator('[aria-live="polite"]').getByText("权限不足", { exact: true }),
			).toBeVisible({ timeout: 30_000 });
			await expect(page.getByText("加载失败", { exact: true })).toBeVisible({
				timeout: 90_000,
			});

			// 403 应被 QueryClient 识别为不可重试（避免放大无效流量）。
			await page.waitForTimeout(1500);
			expect(sourcesHit).toBe(1);

			gate.assertNoErrors();
			await context.close();
		});

		test("临时 5xx 失败可通过手动重试恢复", async ({ browser }, testInfo) => {
			if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
			const baseURL = testInfo.project.use.baseURL as string | undefined;
			if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行用例。");
			test.setTimeout(180_000);

			const context = await browser.newContext({ baseURL });
			await waitForStackReady(context, baseURL);
			await loginExistingUser(context, baseURL, auth);
			const page = await context.newPage();

			// 该用例会制造 5xx，避免使用全局 error gate（其会把 5xx 视为失败信号）。
			let failuresLeft = 3;
			await page.route("**/api/v1/sources", async (route) => {
				if (failuresLeft > 0) {
					failuresLeft -= 1;
					await route.fulfill({
						status: 503,
						contentType: "application/json",
						body: JSON.stringify({ error: "Service unavailable" }),
					});
					return;
				}
				await route.continue();
			});

			await page.goto("/sources");
			await expect(page.getByText("加载失败", { exact: true })).toBeVisible({
				timeout: 90_000,
			});

			await page.getByRole("button", { name: "重试" }).click();
			await expect(page.getByRole("button", { name: "抓取" }).first()).toBeVisible({
				timeout: 90_000,
			});

			await context.close();
		});
	});
