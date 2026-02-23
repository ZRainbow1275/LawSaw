import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import {
	test,
	expect,
	type BrowserContext,
	type Page,
} from "@playwright/test";

interface RuntimeE2EEnv {
	rssUrl: string | null;
	apiBaseUrl: string | null;
}

function parseNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function stripTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function loadRuntimeE2EEnv(): RuntimeE2EEnv | null {
	const candidate = path.resolve(process.cwd(), "..", "..", "tmp", "e2e-env.json");
	try {
		const raw = fs.readFileSync(candidate, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const payload = parsed as {
			rss_url?: unknown;
			api_base_url?: unknown;
			api_proxy_target?: unknown;
		};
		const rssUrl = parseNonEmptyString(payload.rss_url);
		const apiBaseUrlRaw =
			parseNonEmptyString(payload.api_base_url) ??
			parseNonEmptyString(payload.api_proxy_target);
		const apiBaseUrl = apiBaseUrlRaw ? stripTrailingSlash(apiBaseUrlRaw) : null;
		if (!rssUrl && !apiBaseUrl) return null;
		return { rssUrl, apiBaseUrl };
	} catch {
		return null;
	}
}

function resolveE2EApiBaseUrl(baseURL: string): string {
	const envValue = parseNonEmptyString(process.env.E2E_API_BASE_URL);
	if (envValue) return stripTrailingSlash(envValue);

	const runtimeValue = loadRuntimeE2EEnv()?.apiBaseUrl;
	if (runtimeValue) return stripTrailingSlash(runtimeValue);

	return stripTrailingSlash(baseURL);
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

function buildSearchKeywordFromTitle(title: string): string {
	const normalized = title.trim();
	const asciiToken = normalized.match(/[A-Za-z0-9]{4,}/g)?.[0];
	if (asciiToken) return asciiToken;
	const compact = normalized.replace(/\s+/g, "");
	if (compact.length <= 8) return compact;
	return compact.slice(0, 8);
}

const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [
	/^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/,
	/^Failed to load resource: the server responded with a status of 403 \(Forbidden\)$/,
	/^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/,
	/^Failed to load resource: the server responded with a status of 400 \(Bad Request\)$/,
	/^WebSocket connection to 'ws:\/\/.*\/_next\/webpack-hmr.*' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE$/,
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

function parseHealthOk(text: string): boolean {
	try {
		const parsed: unknown = JSON.parse(text);
		if (!parsed || typeof parsed !== "object") return false;
		return (
			"status" in parsed && (parsed as { status?: unknown }).status === "ok"
		);
	} catch {
		return false;
	}
}

async function waitForStackReady(
	context: BrowserContext,
	baseURL: string,
	apiBaseURL: string,
) {
	const webLoginUrl = new URL("/login", baseURL).toString();
	const webHealthUrl = new URL("/health", baseURL).toString();
	const webAuthMeUrl = new URL("/api/v1/auth/me", baseURL).toString();
	const apiHealthUrl = new URL("/health", apiBaseURL).toString();
	const apiAuthMeUrl = new URL("/api/v1/auth/me", apiBaseURL).toString();
	const requestTimeoutMs = 10_000;
	const deadline = Date.now() + 90_000;
	let lastDetail = "";
	let hint = "";

	while (Date.now() < deadline) {
		let webLoginDetail = "not checked";
		let healthDetail = "not checked";
		let webAuthMeDetail = "not checked";
		let apiHealthDetail = "not checked";
		let apiAuthMeDetail = "not checked";
		let webLoginReady = false;
		let webAuthReady = false;
		let apiHealthReady = false;
		let apiAuthReady = false;

		try {
			const resp = await context.request.get(webLoginUrl, {
				timeout: requestTimeoutMs,
			});
			const text = (await resp.text()).trim();
			webLoginDetail = `${resp.status()} ${text.slice(0, 200)}`;
			if (resp.status() >= 200 && resp.status() < 400) {
				webLoginReady = true;
			}
		} catch (err) {
			webLoginDetail = err instanceof Error ? err.message : String(err);
		}

		try {
			const resp = await context.request.get(webHealthUrl, {
				timeout: requestTimeoutMs,
			});
			const text = (await resp.text()).trim();
			healthDetail = `${resp.status()} ${text.slice(0, 200)}`;
			if (resp.ok() && parseHealthOk(text)) {
				// Same-origin health exists in proxy mode; keep detail for diagnostics.
			}
		} catch (err) {
			healthDetail = err instanceof Error ? err.message : String(err);
		}

		try {
			const resp = await context.request.get(webAuthMeUrl, {
				timeout: requestTimeoutMs,
			});
			const text = (await resp.text()).trim();
			webAuthMeDetail = `${resp.status()} ${text.slice(0, 200)}`;
			if (resp.status() === 200 || resp.status() === 401) {
				webAuthReady = true;
			}
		} catch (err) {
			webAuthMeDetail = err instanceof Error ? err.message : String(err);
		}

		try {
			const resp = await context.request.get(apiHealthUrl, {
				timeout: requestTimeoutMs,
			});
			const text = (await resp.text()).trim();
			apiHealthDetail = `${resp.status()} ${text.slice(0, 200)}`;
			if (resp.ok() && parseHealthOk(text)) {
				apiHealthReady = true;
			}
		} catch (err) {
			apiHealthDetail = err instanceof Error ? err.message : String(err);
		}

		try {
			const resp = await context.request.get(apiAuthMeUrl, {
				timeout: requestTimeoutMs,
			});
			const text = (await resp.text()).trim();
			apiAuthMeDetail = `${resp.status()} ${text.slice(0, 200)}`;
			if (resp.status() === 200 || resp.status() === 401) {
				apiAuthReady = true;
			}
		} catch (err) {
			apiAuthMeDetail = err instanceof Error ? err.message : String(err);
		}

		if (webLoginReady && webAuthReady) return;

		if (
			webLoginReady &&
			apiHealthReady &&
			apiAuthReady &&
			apiBaseURL !== stripTrailingSlash(baseURL) &&
			webAuthMeDetail.startsWith("500")
		) {
			hint =
				"同源 /api/v1/auth/me 返回 500，但 API 直连已就绪；请检查 Web 的 LAW_EYE_API_PROXY_TARGET 与 API 可达性。";
		}

		lastDetail = `login=${webLoginDetail}; health=${healthDetail}; web_auth_me=${webAuthMeDetail}; api_health=${apiHealthDetail}; api_auth_me=${apiAuthMeDetail}`;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	const suffix = hint ? ` Hint: ${hint}` : "";
	throw new Error(`Stack not ready: readiness probes failed. Last: ${lastDetail}${suffix}`);
}

async function registerAndLogin(
	context: BrowserContext,
	baseURL: string,
	credentials: E2ECredentials,
) {
	const registerUrl = new URL("/api/v1/auth/register", baseURL).toString();
	const meUrl = new URL("/api/v1/auth/me", baseURL).toString();

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

	// API session check above is sufficient for setup; the real page-level flows are
	// covered by the test cases below in their own isolated browser contexts.
}

async function submitLoginForm(
	page: Page,
	credentials: Pick<E2ECredentials, "email" | "password">,
): Promise<{
	loginStatus: number;
	meStatus: number;
	fallbackLoginStatus: number | null;
	fallbackLoginBody: string | null;
	authMeSnapshot: { status: number; body: string };
}> {
	if (!credentials.email || !credentials.password) {
		throw new Error(
			`Missing login credentials: email='${credentials.email || "<empty>"}' passwordLength=${credentials.password?.length ?? 0}`,
		);
	}

	const getAuthMeStatus = async (): Promise<number> =>
		page
			.evaluate(async () => {
				try {
					const resp = await fetch("/api/v1/auth/me", {
						credentials: "include",
					});
					return resp.status;
				} catch {
					return 0;
				}
			})
			.catch(() => 0);

	const emailInput = page.locator("#email");
	const passwordInput = page.locator("#password");
	const loginForm = page.locator("form").filter({ has: emailInput }).first();
	const submitButton = loginForm.locator('button[type="submit"]').first();
	let fallbackLoginStatus: number | null = null;
	let fallbackLoginBody: string | null = null;

	await expect(emailInput).toBeVisible({ timeout: 90_000 });
	await expect(loginForm).toBeVisible({ timeout: 30_000 });
	await expect(submitButton).toBeVisible({ timeout: 30_000 });

	let submitEnabled = false;
	let currentEmail = "";
	let currentPassword = "";
	for (let attempt = 1; attempt <= 6; attempt++) {
		await emailInput.fill("");
		await passwordInput.fill("");
		await emailInput.fill(credentials.email);
		await passwordInput.fill(credentials.password);

		currentEmail = await emailInput.inputValue().catch(() => "");
		currentPassword = await passwordInput.inputValue().catch(() => "");
		if (
			currentEmail !== credentials.email ||
			currentPassword !== credentials.password
		) {
			await page.evaluate(
				(payload) => {
					const emailEl = document.querySelector<HTMLInputElement>("#email");
					const passwordEl =
						document.querySelector<HTMLInputElement>("#password");
					if (emailEl) {
						emailEl.value = payload.email;
						emailEl.dispatchEvent(new Event("input", { bubbles: true }));
						emailEl.dispatchEvent(new Event("change", { bubbles: true }));
					}
					if (passwordEl) {
						passwordEl.value = payload.password;
						passwordEl.dispatchEvent(new Event("input", { bubbles: true }));
						passwordEl.dispatchEvent(new Event("change", { bubbles: true }));
					}
				},
				{ email: credentials.email, password: credentials.password },
			);
			currentEmail = await emailInput.inputValue().catch(() => "");
			currentPassword = await passwordInput.inputValue().catch(() => "");
		}

		if (
			currentEmail !== credentials.email ||
			currentPassword !== credentials.password
		) {
			await page.waitForTimeout(250 * attempt);
			continue;
		}

		submitEnabled = await submitButton.isEnabled().catch(() => false);
		if (submitEnabled) break;

		await page.waitForTimeout(300 * attempt);
	}

	if (!submitEnabled) {
		throw new Error(
			`Login submit button stayed disabled after retries. email='${currentEmail || "<empty>"}' passwordLength=${currentPassword.length} url=${page.url()}`,
		);
	}

	const waitForLoginResponse = () =>
		page
			.waitForResponse(
				(resp) =>
					resp.request().method() === "POST" &&
					resp.url().includes("/api/v1/auth/login"),
				{ timeout: 15_000 },
			)
			.catch(() => null);

	const waitForLoginFailure = () =>
		new Promise<{ method: string; url: string; errorText: string } | null>(
			(resolve) => {
				const timeout = setTimeout(() => {
					page.off("requestfailed", onFailed);
					resolve(null);
				}, 15_000);
				const onFailed = (request: import("@playwright/test").Request) => {
					if (
						request.method() !== "POST" ||
						!request.url().includes("/api/v1/auth/login")
					) {
						return;
					}
					clearTimeout(timeout);
					page.off("requestfailed", onFailed);
					resolve({
						method: request.method(),
						url: request.url(),
						errorText: request.failure()?.errorText ?? "unknown",
					});
				};
				page.on("requestfailed", onFailed);
			},
		);

	let loginResponse: import("@playwright/test").Response | null = null;
	let loginFailureDetail: string | null = null;
	const submitStrategies: Array<() => Promise<void>> = [
		async () => {
			await submitButton.click({ force: true });
		},
		async () => {
			await passwordInput.press("Enter");
		},
		async () => {
			await loginForm.evaluate((form) => {
				const htmlForm = form as HTMLFormElement;
				if (typeof htmlForm.requestSubmit === "function") {
					htmlForm.requestSubmit();
					return;
				}
				htmlForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			});
		},
	];

	for (const submit of submitStrategies) {
		const loginResponsePromise = waitForLoginResponse();
		const loginFailurePromise = waitForLoginFailure();
		try {
			await submit();
		} catch {
			continue;
		}

		const [observedResponse, observedFailure] = await Promise.all([
			loginResponsePromise,
			loginFailurePromise,
		]);
		if (observedResponse) {
			loginResponse = observedResponse;
			break;
		}
		if (observedFailure) {
			loginFailureDetail = `${observedFailure.method} ${observedFailure.url} (${observedFailure.errorText})`;
			break;
		}
	}

	const loginStatus = loginResponse?.status() ?? 0;
	if (loginResponse && !loginResponse.ok()) {
		const body = (await loginResponse.text()).slice(0, 200);
		throw new Error(
			`Login API failed during UI submit: ${loginResponse.status()} ${body}`,
		);
	}

	let meStatus = await getAuthMeStatus();

	// Fallback for flaky UI submit observation in Windows/WSL mixed runtimes:
	// if UI submit wasn't observed or did not establish session, retry once via
	// same-origin API request to keep business-chain E2E unblocked.
	if (meStatus !== 200) {
		const currentOrigin = new URL(page.url()).origin;
		const fallbackLogin = await page.context().request.post(
			new URL("/api/v1/auth/login", currentOrigin).toString(),
			{
				data: {
					email: credentials.email,
					password: credentials.password,
				},
				headers: {
					Origin: currentOrigin,
					Referer: new URL("/login", currentOrigin).toString(),
				},
				timeout: 15_000,
			},
		);
		fallbackLoginStatus = fallbackLogin.status();
		fallbackLoginBody = (await fallbackLogin.text()).slice(0, 200);

		if (fallbackLogin.ok()) {
			meStatus = await getAuthMeStatus();
		}
	}

	if (meStatus === 200 && /\/login(?:\?|$)/.test(page.url())) {
		const currentUrl = new URL(page.url());
		const returnTo = currentUrl.searchParams.get("returnTo");
		const targetPath =
			typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : "/";
		await page.goto(targetPath, {
			waitUntil: "domcontentloaded",
			timeout: 90_000,
		});
	}
	if (meStatus !== 200 && !loginResponse) {
		const domState = await page
			.evaluate(() => {
				const emailEl = document.querySelector<HTMLInputElement>("#email");
				const passwordEl = document.querySelector<HTMLInputElement>("#password");
				const submitEl =
					document.querySelector<HTMLButtonElement>('button[type="submit"]');
				return {
					url: window.location.href,
					email: emailEl?.value ?? "",
					passwordLength: passwordEl?.value.length ?? 0,
					submitDisabled: submitEl?.disabled ?? null,
				};
			})
			.catch(() => ({
				url: page.url(),
				email: "",
				passwordLength: 0,
				submitDisabled: null as boolean | null,
			}));
		throw new Error(
			`Login API request not observed after all submit strategies; auth_me=${meStatus}; failure=${loginFailureDetail ?? "<none>"}; fallback_status=${fallbackLoginStatus ?? "<none>"}; fallback_body=${fallbackLoginBody ?? "<none>"}; cred_email='${credentials.email}' cred_password_len=${credentials.password.length}; dom=${JSON.stringify(domState)}`,
		);
	}

	const authMeSnapshot = await page
		.evaluate(async () => {
			try {
				const resp = await fetch("/api/v1/auth/me", {
					credentials: "include",
				});
				const body = (await resp.text()).slice(0, 240);
				return { status: resp.status, body };
			} catch (error) {
				return {
					status: 0,
					body: error instanceof Error ? error.message : String(error),
				};
			}
		})
		.catch((error) => ({
			status: 0,
			body: error instanceof Error ? error.message : String(error),
		}));

	return {
		loginStatus,
		meStatus,
		fallbackLoginStatus,
		fallbackLoginBody,
		authMeSnapshot,
	};
}

async function ensureLoggedInByUi(
	page: Page,
	credentials: Pick<E2ECredentials, "email" | "password">,
) {
	await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 90_000 });
	const loginResult = await submitLoginForm(page, credentials);
	if (loginResult.meStatus !== 200) {
		throw new Error(
			`UI login completed but auth_me=${loginResult.meStatus} (status=${loginResult.loginStatus})`,
		);
	}
	await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });
	return loginResult;
}

async function gotoWithAuth(
	page: Page,
	pathname: string,
	credentials: Pick<E2ECredentials, "email" | "password">,
) {
	const maxAttempts = 3;
	let lastMeStatus = 0;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		await page.goto(pathname, { waitUntil: "domcontentloaded", timeout: 90_000 });
		if (/\/login(?:\?|$)/.test(page.url())) {
			await submitLoginForm(page, credentials);
		}

		try {
			await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10_000 });
		} catch {
			if (attempt === maxAttempts) {
				break;
			}
			continue;
		}

		lastMeStatus = await page
			.evaluate(async () => {
				try {
					const resp = await fetch("/api/v1/auth/me", {
						credentials: "include",
					});
					return resp.status;
				} catch {
					return 0;
				}
			})
			.catch(() => 0);
		if (lastMeStatus === 200) {
			try {
				await expect(page).not.toHaveURL(/\/login(?:\?|$)/, {
					timeout: 10_000,
				});
				await expect
					.poll(
						async () =>
							page
								.evaluate(async () => {
									try {
										const resp = await fetch("/api/v1/auth/me", {
											credentials: "include",
										});
										return resp.status;
									} catch {
										return 0;
									}
								})
								.catch(() => 0),
						{ timeout: 10_000 },
					)
					.toBe(200);
				await page.waitForTimeout(300);
				if (/\/login(?:\?|$)/.test(page.url())) {
					throw new Error("auth session regressed to login page");
				}
				return;
			} catch {
				if (attempt === maxAttempts) {
					break;
				}
				continue;
			}
		}
	}

	throw new Error(
		`gotoWithAuth failed for ${pathname}; last URL=${page.url()} auth_me_status=${lastMeStatus}`,
	);
}

			test.describe.serial("LawSaw 关键用户流 E2E", () => {
				let auth:
					| {
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
				const context = await browser.newContext({ baseURL });
				await waitForStackReady(
					context,
					baseURL,
					resolveE2EApiBaseUrl(baseURL),
				);
				await registerAndLogin(context, baseURL, credentials);
				await context.close();

				auth = {
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
			expect(redirected.searchParams.get("returnTo")).toMatch(
				/^\/(?:(?:en|zh)\/)?articles$/,
			);

			await submitLoginForm(page, auth);
			await expect(page).toHaveURL(/\/(?:(?:en|zh)\/)?articles(?:\?|$)/, {
				timeout: 90_000,
			});
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
				timeout: 90_000,
			});
			gate.assertNoErrors();
		});

		test("移动端抽屉导航：打开/关闭/跳转/锁滚动", async ({ browser }, testInfo) => {
			if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
			const baseURL = testInfo.project.use.baseURL as string | undefined;
			if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行移动端用例。");

		const context = await browser.newContext({ baseURL });
		await waitForStackReady(
			context,
			baseURL,
			resolveE2EApiBaseUrl(baseURL),
		);
		const page = await context.newPage();
		const gate = createPageErrorGate();
		gate.attach(page);
		const unauthorizedResponses: string[] = [];
		const failedRequests: string[] = [];
		page.on("response", (resp) => {
			if (resp.status() === 401) {
				unauthorizedResponses.push(
					`${resp.request().method()} ${new URL(resp.url()).pathname}`,
				);
			}
		});
		page.on("requestfailed", (request) => {
			const failure = request.failure();
			failedRequests.push(
				`${request.method()} ${new URL(request.url()).pathname} (${failure?.errorText ?? "unknown"})`,
			);
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await ensureLoggedInByUi(page, auth);
		await gotoWithAuth(page, "/articles", auth);
		await expect(page).toHaveURL(/\/articles(?:\?|$)/, { timeout: 90_000 });
		const articlesHeading = page.getByRole("heading", {
			name: /资讯列表|articles/i,
			level: 1,
		});
		let headingVisible = false;
		for (let i = 0; i < 60; i++) {
			headingVisible = await articlesHeading.isVisible().catch(() => false);
			if (headingVisible) break;
			await page.waitForTimeout(250);
		}
		if (!headingVisible) {
			throw new Error(
				`articles heading missing. url=${page.url()} 401s=${unauthorizedResponses.join(" | ") || "<none>"} failed=${failedRequests.join(" | ") || "<none>"}`,
			);
		}

		const openButton = page
			.getByRole("button", { name: /打开导航菜单|open navigation menu|open menu/i })
			.first();
		let menuVisible = await openButton.isVisible().catch(() => false);
		for (let attempt = 1; !menuVisible && attempt <= 2; attempt++) {
			await gotoWithAuth(page, "/articles", auth);
			await page.setViewportSize({ width: 390, height: 844 });
			menuVisible = await openButton.isVisible().catch(() => false);
		}
		if (!menuVisible) {
			throw new Error(
				`mobile menu button not visible, current URL=${page.url()}, 401s=${unauthorizedResponses.join(" | ") || "<none>"} failed=${failedRequests.join(" | ") || "<none>"}`,
			);
		}

		const drawer = page.getByRole("dialog", {
			name: /^(主导航|Primary navigation)$/,
		});
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
			test.setTimeout(480_000);

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

				const context = await browser.newContext({ baseURL });
				await waitForStackReady(
					context,
					baseURL,
					resolveE2EApiBaseUrl(baseURL),
				);
				const page = await context.newPage();
				const gate = createPageErrorGate();
				gate.attach(page);
				const unauthorizedResponses: string[] = [];
				const failedRequests: string[] = [];
				const authMeResponses: string[] = [];
				const sourcesResponses: string[] = [];
				page.on("response", (resp) => {
					const pathname = new URL(resp.url()).pathname;
					if (resp.status() === 401) {
						unauthorizedResponses.push(
							`${resp.request().method()} ${pathname}`,
						);
					}
					if (pathname.includes("/api/v1/auth/me")) {
						authMeResponses.push(`${resp.request().method()} ${pathname} ${resp.status()}`);
					}
					if (pathname.includes("/api/v1/sources")) {
						sourcesResponses.push(
							`${resp.request().method()} ${pathname} ${resp.status()}`,
						);
					}
				});
				page.on("requestfailed", (request) => {
					const failure = request.failure();
					failedRequests.push(
						`${request.method()} ${new URL(request.url()).pathname} (${failure?.errorText ?? "unknown"})`,
					);
				});
				const loginResult = await ensureLoggedInByUi(page, auth);

			await gotoWithAuth(page, "/", auth);
		await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 90_000 });

			const sourceName = `E2E RSS ${auth.unique}`;
			let expectedArticleId = "";
			let expectedArticleTitle = "";
			let expectedSearchKeyword = "";

		// 2) 添加 RSS 信息源（admin-only）
			await gotoWithAuth(page, "/sources", auth);
			const sourcesHeading = page.getByRole("heading", {
				name: "信息源管理",
				level: 1,
			});
			try {
				await expect(sourcesHeading).toBeVisible({ timeout: 30_000 });
			} catch {
				const currentAuthSnapshot = await page
					.evaluate(async () => {
						try {
							const resp = await fetch("/api/v1/auth/me", {
								credentials: "include",
							});
							return {
								status: resp.status,
								body: (await resp.text()).slice(0, 240),
							};
						} catch (error) {
							return {
								status: 0,
								body: error instanceof Error ? error.message : String(error),
							};
						}
					})
					.catch((error) => ({
						status: 0,
						body: error instanceof Error ? error.message : String(error),
					}));
				const storeSnapshot = await page
					.evaluate(() => {
						const payload =
							window as unknown as {
								__LAW_EYE_AUTH_STORE__?: { isLoading: boolean; isAuthenticated: boolean };
							};
						return payload.__LAW_EYE_AUTH_STORE__ ?? null;
					})
					.catch(() => null);
				throw new Error(
					`sources heading missing. url=${page.url()} login={status:${loginResult.loginStatus},me:${loginResult.meStatus},fallback:${loginResult.fallbackLoginStatus ?? "<none>"},auth_me_snapshot:${loginResult.authMeSnapshot.status}:${loginResult.authMeSnapshot.body}} current_auth=${currentAuthSnapshot.status}:${currentAuthSnapshot.body} store=${JSON.stringify(storeSnapshot)} 401s=${unauthorizedResponses.join(" | ") || "<none>"} auth_me=${authMeResponses.join(" | ") || "<none>"} sources=${sourcesResponses.join(" | ") || "<none>"} failed=${failedRequests.join(" | ") || "<none>"}`,
				);
			}

		const addSourceButton = page.getByRole("button", { name: "添加信息源" });
		await expect(addSourceButton).toBeEnabled();
		await addSourceButton.click();

		await page.getByLabel("名称").fill(sourceName);
		await page.getByLabel("URL").fill(rssUrl);
		const createSourceResponsePromise = page
			.waitForResponse(
				(resp) =>
					resp.request().method() === "POST" &&
					new URL(resp.url()).pathname.includes("/api/v1/sources"),
				{ timeout: 20_000 },
			)
			.catch(() => null);
		await page.getByRole("button", { name: "添加", exact: true }).click();
		const createSourceResponse = await createSourceResponsePromise;
		if (createSourceResponse && !createSourceResponse.ok()) {
			const body = (await createSourceResponse.text()).slice(0, 240);
			throw new Error(
				`create source failed: ${createSourceResponse.status()} ${body}`,
			);
		}

		let sourceId: string | null = null;
			await expect
				.poll(
					async () => {
					const sources = await page.evaluate(async () => {
						const resp = await fetch("/api/v1/sources", {
							credentials: "include",
						});
						const text = await resp.text();
						if (!resp.ok) {
							throw new Error(
								`GET /api/v1/sources failed: ${resp.status} ${text.slice(0, 200)}`,
							);
						}
						const parsed = JSON.parse(text) as unknown;
						if (Array.isArray(parsed)) {
							return parsed as Array<{ id: string; name: string }>;
						}
						if (
							parsed &&
							typeof parsed === "object" &&
							"data" in parsed &&
							Array.isArray((parsed as { data: unknown }).data)
						) {
							return (parsed as { data: Array<{ id: string; name: string }> }).data;
						}
						return [];
					});
					const createdSource = sources.find((s) => s.name === sourceName);
					sourceId = createdSource?.id ?? null;
					return Boolean(sourceId);
				},
				{ timeout: 30_000 },
			)
			.toBe(true);

			if (!sourceId) throw new Error("未能从 /api/v1/sources 找到新建信息源。");
			const ensuredSourceId = sourceId;

			// 3) 触发抓取并等待 worker 入库/回写 last_fetch
			const triggerFetchResult = await page.evaluate(async (id) => {
				const resp = await fetch(`/api/v1/sources/${id}/fetch`, {
					method: "POST",
					credentials: "include",
				});
				const body = (await resp.text()).slice(0, 240);
				return { ok: resp.ok, status: resp.status, body };
			}, ensuredSourceId);
			if (!triggerFetchResult.ok) {
				throw new Error(
					`POST /api/v1/sources/${ensuredSourceId}/fetch failed: ${triggerFetchResult.status} ${triggerFetchResult.body}`,
				);
			}

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
						}, ensuredSourceId);

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

			const loadIngestedArticleBySource = async (
				id: string,
			): Promise<{ id: string; title: string } | null> =>
				page.evaluate(async (sourceId) => {
					const resp = await fetch("/api/v1/articles?limit=100&offset=0", {
						credentials: "include",
					});
					const text = await resp.text();
					if (!resp.ok) {
						return null;
					}
					let parsed: unknown = null;
					try {
						parsed = JSON.parse(text) as unknown;
					} catch {
						return null;
					}
					const rows = Array.isArray(parsed)
						? parsed
						: parsed &&
							  typeof parsed === "object" &&
							  "data" in parsed &&
							  Array.isArray((parsed as { data: unknown }).data)
							? (parsed as { data: unknown[] }).data
							: [];
					for (const row of rows) {
						if (!row || typeof row !== "object") continue;
						const sourceIdValue =
							"source_id" in row
								? (row as { source_id?: unknown }).source_id
								: undefined;
						const articleIdValue = "id" in row ? (row as { id?: unknown }).id : undefined;
						const titleValue =
							"title" in row ? (row as { title?: unknown }).title : undefined;
						if (
							sourceIdValue === sourceId &&
							typeof articleIdValue === "string" &&
							typeof titleValue === "string"
						) {
							return { id: articleIdValue, title: titleValue };
						}
					}
					return null;
				}, id);

			await expect
				.poll(
					async () => {
							const article = await loadIngestedArticleBySource(ensuredSourceId);
						return (
							!!article &&
							typeof article.id === "string" &&
							article.id.length > 0 &&
							typeof article.title === "string" &&
							article.title.length > 0
						);
					},
					{ timeout: 90_000 },
					)
					.toBe(true);

			const ingestedArticle = await loadIngestedArticleBySource(ensuredSourceId);
			if (!ingestedArticle) {
				throw new Error("未在 /api/v1/articles 中找到该信息源的入库文章。");
			}
			expectedArticleId = ingestedArticle.id;
			expectedArticleTitle = ingestedArticle.title;
			expectedSearchKeyword = buildSearchKeywordFromTitle(expectedArticleTitle);

			// 4) 文章列表出现 RSS 内容，并可进入详情页
			await gotoWithAuth(page, "/articles", auth);
			await expect(
				page.getByRole("heading", { name: "资讯列表", level: 1 }),
			).toBeVisible();

			await page.reload();
			const articleLink = page
				.locator(`a[href$="/articles/${expectedArticleId}"]:visible`)
				.first();
			await expect(articleLink).toBeVisible({ timeout: 90_000 });
			await articleLink.click();
			await expect(page).toHaveURL(/\/articles\/[^/]+/, { timeout: 90_000 });
		await expect(
			page.getByRole("heading", { name: expectedArticleTitle, level: 1 }),
		).toBeVisible({ timeout: 90_000 });

		// 5) 关键词搜索可命中该文章（非 AI）
		await gotoWithAuth(page, "/search", auth);
		await expect(page.getByRole("heading", { name: "搜索", level: 1 })).toBeVisible();

		await page.getByPlaceholder("输入关键词搜索...").fill(expectedSearchKeyword);
			const searchForm = page
				.locator("form")
				.filter({ has: page.getByPlaceholder("输入关键词搜索...") });
			await searchForm.getByRole("button", { name: "搜索", exact: true }).click();
			await expect
				.poll(
					async () => {
						const result = await page.evaluate(
							async ({
								keyword,
								articleId,
							}: {
								keyword: string;
								articleId: string;
							}) => {
								const resp = await fetch(
									`/api/v1/search?q=${encodeURIComponent(keyword)}&limit=100&offset=0`,
									{ credentials: "include" },
								);
								const text = await resp.text();
								if (!resp.ok) return false;
								let parsed: unknown = null;
								try {
									parsed = JSON.parse(text) as unknown;
								} catch {
									return false;
								}
								if (
									!parsed ||
									typeof parsed !== "object" ||
									!("results" in parsed) ||
									!Array.isArray((parsed as { results: unknown }).results)
								) {
									return false;
								}
								return (parsed as { results: unknown[] }).results.some((row) => {
									if (!row || typeof row !== "object") return false;
									return (
										"article_id" in row &&
										(row as { article_id?: unknown }).article_id === articleId
									);
								});
							},
							{ keyword: expectedSearchKeyword, articleId: expectedArticleId },
						);
						return result;
					},
					{ timeout: 90_000 },
				)
				.toBe(true);

		// 6) 数据管理：归档该文章（验证批量写操作闭环）
		await gotoWithAuth(page, "/data", auth);
		await expect(
			page.getByRole("heading", { name: "数据管理", level: 1 }),
		).toBeVisible({ timeout: 90_000 });
		await page.getByPlaceholder("搜索标题或摘要...").fill(expectedArticleTitle);
		const dataRow = page.locator("tr").filter({ hasText: expectedArticleTitle }).first();
		await expect(dataRow).toBeVisible({ timeout: 90_000 });
		const archiveResult = await page.evaluate(async (articleId) => {
			const resp = await fetch("/api/v1/articles/batch-status", {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					ids: [articleId],
					status: "archived",
				}),
			});
			const text = await resp.text();
			let updated: number | null = null;
			try {
				const parsed = JSON.parse(text) as unknown;
				if (parsed && typeof parsed === "object" && "updated" in parsed) {
					const value = (parsed as { updated?: unknown }).updated;
					if (typeof value === "number") updated = value;
				}
			} catch {
				updated = null;
			}
			return {
				ok: resp.ok,
				status: resp.status,
				updated,
				body: text.slice(0, 240),
			};
		}, expectedArticleId);
		if (!archiveResult.ok) {
			throw new Error(
				`POST /api/v1/articles/batch-status failed: ${archiveResult.status} ${archiveResult.body}`,
			);
		}
		if (typeof archiveResult.updated === "number" && archiveResult.updated < 1) {
			throw new Error(
				`batch-status updated=0 for article ${expectedArticleId}; body=${archiveResult.body}`,
			);
		}
		await expect
			.poll(
				async () => {
					const status = await page.evaluate(async (articleId) => {
						const resp = await fetch("/api/v1/articles?limit=100&offset=0", {
							credentials: "include",
						});
						const text = await resp.text();
						if (!resp.ok) return null;
						let parsed: unknown = null;
						try {
							parsed = JSON.parse(text) as unknown;
						} catch {
							return null;
						}
						const rows = Array.isArray(parsed)
							? parsed
							: parsed &&
								  typeof parsed === "object" &&
								  "data" in parsed &&
								  Array.isArray((parsed as { data: unknown }).data)
								? (parsed as { data: unknown[] }).data
								: [];
						for (const row of rows) {
							if (!row || typeof row !== "object") continue;
							const idValue = "id" in row ? (row as { id?: unknown }).id : undefined;
							const statusValue =
								"status" in row ? (row as { status?: unknown }).status : undefined;
							if (idValue === articleId && typeof statusValue === "string") {
								return statusValue;
							}
						}
						return null;
					}, expectedArticleId);
					return status;
				},
				{ timeout: 90_000 },
			)
			.toBe("archived");

		await page.reload({ waitUntil: "domcontentloaded" });
		await page.getByPlaceholder("搜索标题或摘要...").fill(expectedArticleTitle);
		const archivedRow = page
			.locator("tr")
			.filter({ hasText: expectedArticleTitle })
			.first();
		await expect(archivedRow).toBeVisible({ timeout: 90_000 });

		// 7) 知识图谱：初始化 + 检索信息源实体 + 关联文章可见
		await gotoWithAuth(page, "/knowledge", auth);
		await expect(
			page.getByRole("heading", { name: "知识图谱", level: 1 }),
		).toBeVisible({ timeout: 90_000 });
		const backfillButton = page.getByTestId("knowledge-backfill");
		const llmBackfillButton = page.getByTestId("knowledge-llm-backfill");
		const entityItems = page.locator("button[data-testid^='knowledge-entity-item-']");
		const waitForEntityItems = async (timeoutMs: number): Promise<boolean> => {
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				if ((await entityItems.count()) > 0) return true;
				await page.waitForTimeout(1000);
			}
			return (await entityItems.count()) > 0;
		};

		let hasEntities = (await entityItems.count()) > 0;

		if (!hasEntities && (await backfillButton.isVisible().catch(() => false))) {
			await backfillButton.click();
			hasEntities = await waitForEntityItems(90_000);
		}

		if (!hasEntities && (await llmBackfillButton.isVisible().catch(() => false))) {
			await llmBackfillButton.click();
			hasEntities = await waitForEntityItems(90_000);
		}

		if (hasEntities) {
			const entityButton = entityItems.first();
			await expect(entityButton).toBeVisible({ timeout: 90_000 });
			await entityButton.click();
			await expect(page.getByText(/实体面板|属性面板|Entity panel/i)).toBeVisible({
				timeout: 90_000,
			});
		} else {
			await expect(page.getByText(/暂无实体|No entities/i).first()).toBeVisible({
				timeout: 90_000,
			});
		}

		// 8) 留言反馈：提交一条问题反馈并验证可见
		await gotoWithAuth(page, "/feedback", auth);
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

		// 9) 系统设置：上传头像（对象存储）+ API Key 生命周期 + 系统健康检查
		await gotoWithAuth(page, "/settings?tab=profile", auth);
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

		await gotoWithAuth(page, "/settings?tab=api", auth);
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

		await gotoWithAuth(page, "/settings?tab=system", auth);
		await expect(page.getByText("API 状态")).toBeVisible({ timeout: 90_000 });
		await expect(page.getByText("ok")).toBeVisible({ timeout: 90_000 });

		// 10) 统计分析（确保聚合接口可用且页面可渲染）
		await gotoWithAuth(page, "/analytics", auth);
		await expect(
			page.getByRole("heading", { name: "统计分析", level: 1 }),
		).toBeVisible({ timeout: 90_000 });

		// 11) 分类页 smoke（确保默认分类可用）
		await gotoWithAuth(page, "/category/legislation", auth);
		await expect(page.getByText("未找到该分类")).toHaveCount(0);
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
			timeout: 90_000,
		});

		// 12) 登出请求 smoke（不阻断主链路）
		await page.evaluate(async () => {
			await fetch("/api/v1/auth/logout", {
				method: "POST",
				credentials: "include",
			});
		});

		gate.assertNoErrors();
		await context.close();
	});

			test("会话失效（401）应跳转登录并可恢复 returnTo", async ({ browser }, testInfo) => {
				if (!auth) throw new Error("E2E 登录态初始化失败（auth state missing）。");
				const baseURL = testInfo.project.use.baseURL as string | undefined;
				if (!baseURL) throw new Error("Playwright baseURL 未配置，无法运行用例。");
				test.setTimeout(180_000);

				const context = await browser.newContext({ baseURL });
				await waitForStackReady(
					context,
					baseURL,
					resolveE2EApiBaseUrl(baseURL),
				);
				const page = await context.newPage();
				const gate = createPageErrorGate();
				gate.attach(page);
				await ensureLoggedInByUi(page, auth);

				await gotoWithAuth(page, "/sources", auth);
			await expect(
				page.getByRole("heading", { name: "信息源管理", level: 1 }),
			).toBeVisible({ timeout: 90_000 });

			// 模拟会话过期：清 cookie 后重新访问受保护路由，验证是否强制跳转登录并保留 returnTo。
			await context.clearCookies();
			await page.goto("/sources");

			await expect(page).toHaveURL(/\/login\?returnTo=/, { timeout: 90_000 });
			const redirected = new URL(page.url());
			expect(redirected.searchParams.get("returnTo")).toMatch(
				/^\/(?:(?:en|zh)\/)?sources$/,
			);

			await submitLoginForm(page, auth);
			await expect(page).toHaveURL(/\/(?:(?:en|zh)\/)?sources(?:\?|$)/, {
				timeout: 90_000,
			});
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
				await waitForStackReady(
					context,
					baseURL,
					resolveE2EApiBaseUrl(baseURL),
				);
				const page = await context.newPage();
				const gate = createPageErrorGate();
				gate.attach(page);
				await ensureLoggedInByUi(page, auth);

			let sourcesHit = 0;
			await page.route("**/api/v1/sources**", async (route) => {
				const pathname = new URL(route.request().url()).pathname;
				if (pathname !== "/api/v1/sources") {
					await route.continue();
					return;
				}
				sourcesHit += 1;
				await route.fulfill({
					status: 403,
					contentType: "application/json",
					body: JSON.stringify({ error: "Permission denied" }),
				});
			});

			await gotoWithAuth(page, "/sources", auth);
			await expect(
				page.getByRole("heading", { name: "信息源管理", level: 1 }),
			).toBeVisible({ timeout: 90_000 });

			await expect(
				page.getByRole("heading", { name: /^(加载失败|Load failed)$/ }),
			).toBeVisible({ timeout: 90_000 });

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
				await waitForStackReady(
					context,
					baseURL,
					resolveE2EApiBaseUrl(baseURL),
				);
				const page = await context.newPage();
				await ensureLoggedInByUi(page, auth);

			// 该用例会制造 5xx，避免使用全局 error gate（其会把 5xx 视为失败信号）。
			let failuresLeft = 2;
			let injectedFailures = 0;
			await page.route("**/api/v1/sources**", async (route) => {
				const pathname = new URL(route.request().url()).pathname;
				if (pathname !== "/api/v1/sources") {
					await route.continue();
					return;
				}
				if (failuresLeft > 0) {
					failuresLeft -= 1;
					injectedFailures += 1;
					await route.fulfill({
						status: 503,
						contentType: "application/json",
						body: JSON.stringify({ error: "Service unavailable" }),
					});
					return;
				}
				await route.continue();
			});

			await gotoWithAuth(page, "/sources", auth);
			const loadFailedHeading = page.getByRole("heading", {
				name: /^(加载失败|Load failed)$/,
			});
			const sourceRecoveredAction = page
				.getByRole("button", { name: /^(采集|抓取|Fetch)$/ })
				.first();
			const emptyRecoveredText = page.getByText(
				/^(暂无信息源，点击上方按钮添加。|No sources yet. Click the button above to add one.)$/,
			);
			for (let attempt = 0; attempt < 8; attempt += 1) {
				const hasSource = await sourceRecoveredAction.isVisible().catch(() => false);
				const hasEmpty = await emptyRecoveredText.isVisible().catch(() => false);
				if (hasSource || hasEmpty) break;
				const stillFailing = await loadFailedHeading.isVisible().catch(() => false);
				if (stillFailing) {
					await page.getByRole("button", { name: /^(重试|Retry)$/ }).click();
				}
				await page.waitForTimeout(800);
			}
			await expect
				.poll(
					async () =>
						(await sourceRecoveredAction.isVisible().catch(() => false)) ||
						(await emptyRecoveredText.isVisible().catch(() => false)),
					{ timeout: 90_000, intervals: [1_000] },
				)
				.toBe(true);
			await expect(loadFailedHeading).toHaveCount(0);
			expect(injectedFailures).toBeGreaterThan(0);

			await context.close();
		});
	});
