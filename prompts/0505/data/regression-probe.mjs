// Frontend regression probe — runs in browser context via Playwright evaluate.
// Usage: node prompts/0505/data/regression-probe.mjs
// Or: paste into Playwright evaluate() to test all routes.

export const ROUTES_CLIENT = [
  "/zh/dashboard",
  "/zh/feed",
  "/zh/me/feed",
  "/zh/articles",
  "/zh/reports",
  "/zh/analytics",
  "/zh/knowledge",
  "/zh/feedback",
  "/zh/settings",
];

export const ROUTES_ADMIN_LIST = [
  "/zh/admin",
  "/zh/admin/tenants",
  "/zh/admin/users",
  "/zh/admin/relations",
  "/zh/admin/pins",
  "/zh/admin/channels",
  "/zh/admin/banners",
  "/zh/admin/sources",
  "/zh/admin/feedbacks",
  "/zh/admin/audit",
  "/zh/admin/apikeys",
  "/zh/admin/ai-usage",
  "/zh/admin/ai-governance",
  "/zh/admin/reports",
  "/zh/admin/reports/runs",
  "/zh/admin/knowledge",
];

export const ROUTES_ADMIN_DETAIL = [
  "/zh/admin/banners/new",
  "/zh/admin/reports/new",
];

// Acceptance probe — designed to run on the open page after navigate
export function probePage() {
  const main = document.querySelector("main") || document.querySelector("[role='main']") || document.querySelector("#main-content");
  if (!main) {
    return { ok: false, reason: "no main element", url: location.pathname };
  }
  const text = main.innerText || "";
  const docHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;

  // Detect english residue: any sequence of 4+ english words separated by spaces
  const englishRun = text.match(/(?:[A-Z][a-z]+|[a-z]+){4,}|(?:[A-Z]+\b\s+){3,}[A-Z]+/);
  const englishWords = (text.match(/\b[A-Za-z]{4,}\b/g) || []);

  // Internal scroll containers
  const scrollContainers = Array.from(main.querySelectorAll("*")).filter(el => {
    const cs = getComputedStyle(el);
    return (cs.overflow === "auto" || cs.overflowY === "auto" || cs.overflow === "scroll" || cs.overflowY === "scroll")
      && el.clientHeight > 0 && el.scrollHeight > el.clientHeight;
  }).length;

  return {
    ok: true,
    url: location.pathname,
    textLen: text.length,
    childCount: main.children.length,
    docHeight,
    viewportHeight,
    overflowRatio: +(docHeight / viewportHeight).toFixed(2),
    englishWordCount: englishWords.length,
    englishWordsSample: englishWords.slice(0, 10),
    hasInternalScroll: scrollContainers > 0,
    scrollContainers,
  };
}

// Acceptance criteria (per PR final exit gate in 02-FIX-PLAN.md)
export function evaluatePage(probe) {
  const issues = [];
  if (!probe.ok) issues.push("NO_MAIN");
  if (probe.textLen < 200) issues.push("EMPTY_MAIN");
  if (probe.overflowRatio > 1.8) issues.push("OVERFLOW");
  if (probe.englishWordCount > 20) issues.push("ENGLISH_RESIDUE");
  if (probe.childCount < 3) issues.push("TOO_FEW_CHILDREN");
  return { url: probe.url, issues, ...probe };
}
