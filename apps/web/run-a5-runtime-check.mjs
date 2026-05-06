// A5 runtime failure capture — drives Chromium against http://localhost:18849
// Outputs JSON evidence + per-route screenshots into the research/ tree.
//
// Run from D:/Desktop/LawSaw/apps/web so playwright is resolvable:
//   node ../../.trellis/tasks/04-29-audit-0425-plan-vs-delivered/research/run-a5-runtime-check.mjs

import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "http://localhost:18849";
const OUT_DIR = resolve(
  "D:/Desktop/LawSaw/.trellis/tasks/04-29-audit-0425-plan-vs-delivered/research",
);
const SHOT_DIR = resolve(OUT_DIR, "screenshots");

const CUSTOMER_ROUTES = [
  "/zh/login",
  "/zh/me/feed",
  "/zh/dashboard",
  "/zh/articles",
  "/zh/search",
  "/zh/knowledge",
  "/zh/me",
  "/zh/settings",
  "/zh/feedback",
  "/zh/reports",
  "/zh/analytics",
];
const ADMIN_ROUTES = [
  "/zh/admin",
  "/zh/admin/users",
  "/zh/admin/sources",
  "/zh/admin/feedbacks",
  "/zh/admin/knowledge",
  "/zh/admin/reports",
  "/zh/admin/categories",
  "/zh/admin/banners",
  "/zh/admin/audit",
];

const CREDS = {
  customer: { email: "customer@qa.lawsaw.local", password: "User@Lawsaw2026" },
  admin: { email: "admin@qa.lawsaw.local", password: "Admin@Lawsaw2026" },
};

const slug = (route) => route.replace(/[/]+/g, "-").replace(/^-/, "") || "root";

async function setupContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
    ignoreHTTPSErrors: true,
  });
  return context;
}

async function loginViaForm(page, role) {
  const { email, password } = CREDS[role];
  await page.goto(`${BASE}/zh/login`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  // Click the submit button (form has only one).
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  // Give the auth-provider time to refresh session and redirect.
  await page.waitForTimeout(2_500);
  const url = page.url();
  return { okUrl: url, loginRedirected: !/\/login(?:$|[\?\/])/.test(url) };
}

async function captureRoute(context, route, role) {
  const page = await context.newPage();
  const consoleMsgs = [];
  const pageErrors = [];
  const failedRequests = [];
  const responses = [];

  page.on("console", (msg) => {
    consoleMsgs.push({
      type: msg.type(),
      text: msg.text().slice(0, 800),
      location: msg.location(),
    });
  });
  page.on("pageerror", (err) => {
    pageErrors.push({ name: err.name, message: err.message.slice(0, 800), stack: (err.stack || "").slice(0, 1500) });
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText,
    });
  });
  page.on("response", (resp) => {
    const status = resp.status();
    if (status >= 400) {
      responses.push({
        url: resp.url(),
        status,
        method: resp.request().method(),
      });
    }
  });

  let navError = null;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
  } catch (e) {
    navError = e.message;
  }
  // Allow async hydration / data fetches to settle.
  await page.waitForTimeout(2_500);

  // Detect visible permission/empty patterns.
  const visibleSignals = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const hits = [];
    for (const needle of ["权限不足", "无权限", "Permission denied", "Forbidden", "403", "404", "Not Found", "无数据", "暂无数据", "No data", "Coming soon"]) {
      if (text.includes(needle)) hits.push(needle);
    }
    return {
      title: document.title,
      hits,
      bodyLen: text.length,
      h1: Array.from(document.querySelectorAll("h1")).map((h) => h.innerText.trim()).slice(0, 3),
    };
  }).catch(() => ({ title: "", hits: [], bodyLen: 0, h1: [] }));

  const screenshotPath = resolve(SHOT_DIR, `${role}-${slug(route)}.png`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (e) {
    navError = (navError ? navError + " | " : "") + `screenshot:${e.message}`;
  }

  const finalUrl = page.url();
  await page.close();

  return {
    role,
    route,
    finalUrl,
    navError,
    title: visibleSignals.title,
    h1: visibleSignals.h1,
    bodyLen: visibleSignals.bodyLen,
    visibleSignals: visibleSignals.hits,
    consoleErrors: consoleMsgs.filter((m) => m.type === "error"),
    consoleWarnings: consoleMsgs.filter((m) => m.type === "warning" || m.type === "warn"),
    pageErrors,
    failedRequests,
    httpErrors: responses,
    screenshotPath,
  };
}

async function run() {
  await mkdir(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = { customer: [], admin: [], loginCustomer: null, loginAdmin: null };

  // Customer pass.
  let ctx = await setupContext(browser);
  let page = await ctx.newPage();
  results.loginCustomer = await loginViaForm(page, "customer").catch((e) => ({ error: e.message }));
  await page.close();
  for (const route of CUSTOMER_ROUTES) {
    const r = await captureRoute(ctx, route, "customer").catch((e) => ({ route, error: e.message }));
    results.customer.push(r);
    console.log(`[customer] ${route} -> ${r.finalUrl || "ERR"} consoleErr=${r.consoleErrors?.length} httpErr=${r.httpErrors?.length}`);
  }
  await ctx.close();

  // Admin pass — fresh context.
  ctx = await setupContext(browser);
  page = await ctx.newPage();
  results.loginAdmin = await loginViaForm(page, "admin").catch((e) => ({ error: e.message }));
  await page.close();
  for (const route of ADMIN_ROUTES) {
    const r = await captureRoute(ctx, route, "admin").catch((e) => ({ route, error: e.message }));
    results.admin.push(r);
    console.log(`[admin] ${route} -> ${r.finalUrl || "ERR"} consoleErr=${r.consoleErrors?.length} httpErr=${r.httpErrors?.length}`);
  }
  await ctx.close();

  await browser.close();

  await writeFile(resolve(OUT_DIR, "A5-raw.json"), JSON.stringify(results, null, 2), "utf8");
  console.log("[done] wrote A5-raw.json");
}

run().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
