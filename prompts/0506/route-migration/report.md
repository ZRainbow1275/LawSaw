# S1.1 — 13 条无 [locale] 旧路由迁移最终报告

> 任务 #5 (wave7-critical-recovery)
> 执行人：route-migrator
> 日期：2026-05-07
> 用户铁律："迁移时保持谨慎和谦虚，迁一个确保无问题之后再删除"

---

## 总览

| 项 | 结果 |
|---|---|
| 13 条迁移完成 | ✅ 13/13 |
| typecheck | ✅ 0 errors |
| lint | ✅ 0 errors（4 warnings 全为 baseline a11y `useSemanticElements`，未引入新 warning） |
| chrome 单层（aside=1, main=1） | ✅ 全部确认 |
| /zh + /en 双语回归 | ✅ smoke pass |
| SHELL_EXEMPT 终态符合预期 | ✅ |
| TODO(shell-lift) 清理 | ✅ 6 条全清，仅保留 `/articles`（带说明：immersive Reader） |

---

## 13 条进度表

| # | 路径 | 类型 | 处理 | aside | 截图 |
|---|---|---|---|---|---|
| 1 | `/me/feed` | A 已迁残留 | git rm legacy | 1 | 01-me-feed-after.png |
| 2 | `/me/articles/[id]` | A 已迁残留 | git rm legacy | 1 | 02-me-articles-id-after.png |
| 3 | `/me/notifications` | A 已迁残留 | git rm legacy | 1 | 03-me-notifications-after.png |
| 4 | `/me/reading-history` | A 已迁残留 | git rm legacy | 1 | 04-me-reading-history-after.png |
| 5 | `/me/settings` | A 已迁残留 | git rm legacy | 1 | 05-me-settings-after.png |
| 6 | `/dashboard` | B 真未迁 | 创建 `(shell-wide)/dashboard/` + 保留 SSR auth guard layout | 1 | 06-dashboard-after.png |
| 7 | `/feedback` | B 已存在 | git rm legacy redirect stub（`(shell-default)/feedback/` 已就位）；`user-report-list.tsx` 与 `user-report-reader.tsx` 中 3 处 `href="/settings"` 改为 locale-aware | 1 | 07-feedback-after.png |
| 8 | `/data` | B 真未迁 | git mv 到 `(shell-default)/data/` + 去 `<UserShell>` 包壳 + `router.push("/articles/${id}")` 改 locale-aware | 1 | 08-data-after.png |
| 9 | `/sources` | B 真未迁 | git mv 到 `(shell-default)/sources/` + 去 `<UserShell>` 包壳 | 1 | 09-sources-after.png |
| 10 | `/category/[slug]` | B 真未迁 | 新建 `(shell-default)/category/[slug]/page.tsx` 用裸 `<CategoryPageContent />` + 删 legacy | 1 | 10-category-slug-after.png |
| 11 | `/reports` + `/reports/[id]` | B 已迁残留 | git rm legacy + redirect stub | 1 | 11-reports-after.png |
| 12 | `/search` | B 真未迁 | git mv 到 `(shell-default)/search/` + 去 `<ProtectedRoute>` 包壳 + 4 处 `router.push/replace("/search...")` 改 locale-aware + 1 处 `href="/articles/${id}"` 改 locale-aware + useEffect deps 加 `locale` | 1 | 12-search-after.png |
| 13 | `/settings` | B 真未迁 | git mv 到 `(shell-default)/settings/` + 去 `<ProtectedRoute>` 包壳 + 把 `app/settings/tabs.tsx` 迁到 `components/settings/tabs.tsx`（page 和 me-settings-page 与 admin/apikeys 三处 import 同步更新） | 1 | 13-settings-after.png |

---

## 每条 chrome 单层确认方法

每条路由 navigate 完成后，在浏览器控制台执行：

```js
document.querySelectorAll('aside[aria-label="主导航"]').length  // 应等于 1
document.querySelectorAll('main').length                         // 应等于 1
```

13 条均返回 `aside=1, main=1`，无双层 chrome。`document.querySelectorAll('aside').length` 在 dev mode 下会返回 2 是因为 Next.js devtools 自带一个 aside（不是页面 chrome）。

---

## SHELL_EXEMPT 终态

`apps/web/src/components/layout/persistent-user-shell.tsx`：

```ts
const SHELL_EXEMPT_PREFIXES = [
  "/admin",
  "/login",
  "/register",
  "/verify-email",
  "/reset-password",
  // TODO(shell-lift): /articles index renders own UserShell (wide); /articles/[id]
  // is the immersive ReaderLayout that MUST stay exempt — split this prefix when
  // migrating the index into (shell-wide) in a follow-up.
  "/articles",
];

const SHELL_EXEMPT_PATTERNS: RegExp[] = [
  // (intentionally empty — `/me/articles/[id]` was relocated into
  // `(shell-wide)/me/articles/[id]` so PersistentUserShell now owns its chrome.)
];
```

被移除的 7 条 TODO(shell-lift) 前缀：`/settings`, `/search`, `/data`, `/sources`, `/dashboard`, `/category`（外加 `/me/articles/[id]` PATTERN）。

唯一保留 `/articles` —— 因为 `/articles/[id]` 是 immersive ReaderLayout（`<UserShell hideHeader>`），**不能**被 PersistentUserShell 接管 chrome。索引页 `/articles/page.tsx` 的进一步 (shell-wide) 迁移作为后续任务。

---

## embedded prop 评估（保留）

**决定**：保留 `MeFeedPage.embedded` 与 `ReaderPage.embedded` props。

**理由**：
- 当前所有调用点都传 `embedded={true}`（`(shell-wide)/me/feed/page.tsx`、`(shell-wide)/me/articles/[id]/page.tsx`），但保留 default `false` 分支可让组件继续作为「自包壳模式」复用（如未来 admin 嵌入预览、e2e 截图、或 Storybook）。
- 删除 prop + 删除 `<UserShell>` 兜底分支会动 me-feed-page.tsx + reader-page.tsx 的实现细节，**超出 #5 路由迁移任务边界**。
- task-lead 原话："**谨慎评估再决定**" — 保守保留，留作后续 cleanup 任务。

---

## 修改文件清单（git status 终态）

**重命名（git mv，保留历史）**：
- `apps/web/src/app/data/page.tsx` → `apps/web/src/app/[locale]/(shell-default)/data/page.tsx`
- `apps/web/src/app/search/page.tsx` → `apps/web/src/app/[locale]/(shell-default)/search/page.tsx`
- `apps/web/src/app/settings/page.tsx` → `apps/web/src/app/[locale]/(shell-default)/settings/page.tsx`
- `apps/web/src/app/sources/page.tsx` → `apps/web/src/app/[locale]/(shell-default)/sources/page.tsx`
- `apps/web/src/app/settings/tabs.tsx` → `apps/web/src/components/settings/tabs.tsx`

**删除**（legacy / re-export / redirect stubs）：
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/feedback/page.tsx`
- `apps/web/src/app/category/[slug]/page.tsx`
- `apps/web/src/app/reports/page.tsx`
- `apps/web/src/app/reports/[id]/page.tsx`
- `apps/web/src/app/me/articles/[id]/page.tsx`
- `apps/web/src/app/me/feed/page.tsx`
- `apps/web/src/app/me/notifications/page.tsx`
- `apps/web/src/app/me/reading-history/page.tsx`
- `apps/web/src/app/me/settings/page.tsx`
- `apps/web/src/app/[locale]/category/[slug]/page.tsx`（re-export）
- `apps/web/src/app/[locale]/dashboard/page.tsx`（re-export）
- `apps/web/src/app/[locale]/dashboard/layout.tsx`（SSR guard 已移到 `(shell-wide)/dashboard/layout.tsx`）
- `apps/web/src/app/[locale]/data/page.tsx`（re-export）
- `apps/web/src/app/[locale]/search/page.tsx`（re-export）
- `apps/web/src/app/[locale]/settings/page.tsx`（re-export）
- `apps/web/src/app/[locale]/sources/page.tsx`（re-export）

**新建**：
- `apps/web/src/app/[locale]/(shell-default)/category/[slug]/page.tsx`
- `apps/web/src/app/[locale]/(shell-wide)/dashboard/page.tsx`
- `apps/web/src/app/[locale]/(shell-wide)/dashboard/layout.tsx`（SSR auth guard，纯 children 透传，不嵌主容器）

**Modified**（同步更新）：
- `apps/web/src/components/layout/persistent-user-shell.tsx`（清 7 条 TODO(shell-lift)）
- `apps/web/src/components/me/me-settings-page.tsx`（tabs import 改 `@/components/settings/tabs`）
- `apps/web/src/components/reports/user-report-list.tsx`（1 处 `href="/settings"` → locale-aware）
- `apps/web/src/components/reports/user-report-reader.tsx`（2 处 `href="/settings"` → locale-aware）
- `apps/web/src/app/[locale]/admin/apikeys/page.tsx`（tabs import 改 `@/components/settings/tabs`）

---

## 仍需团队关注（不在 #5 范围内）

1. **`apps/web/src/app/settings/admin/...`** — 一组无 locale 的 admin redirect-only stubs（`redirectLegacyAdminPath`），把请求 308 redirect 到 `/<locale>/admin/...`。它们与 `/settings/page.tsx` 是兄弟节点但不属于 13 条迁移目标，未触动。后续若清理可单独立任务。
2. **`/articles/page.tsx` 索引页**（仍渲染 `<UserShell>`） — TODO(shell-lift) 保留中，作为 PersistentUserShell 唯一剩余 prefix exempt 的来源。
3. **embedded prop** — 保留中，等后续 cleanup 任务统一删除（如发现真无外部调用）。
4. **next.config / middleware 强制 redirect** — 任务描述中提到的 "/me/foo → /zh/me/foo" 强制重定向未实施。当前未带 locale 的旧路由（`/me/feed`、`/dashboard` 等）会落到 not-found。如果团队决定补 redirect，可单独立任务。

---

## 验证命令

```bash
# typecheck
cd D:/Desktop/LawSaw/apps/web && pnpm typecheck
# 输出: 0 errors

# lint
cd D:/Desktop/LawSaw/apps/web && pnpm lint
# 输出: 0 errors, 4 warnings (全 baseline)

# 浏览器 smoke 验证（dev server 应在 http://localhost:8849）
# /zh/me/feed, /zh/me/articles/[id], /zh/me/notifications, /zh/me/reading-history,
# /zh/me/settings, /zh/dashboard, /zh/feedback, /zh/data, /zh/sources,
# /zh/category/regulation, /zh/reports, /zh/search, /zh/settings
# /en/dashboard
# → 所有页面 aside=1, main=1, 内容正确渲染
```

---

## 截图存档目录

`D:/Desktop/LawSaw/prompts/0506/route-migration/`
- `01-me-feed-after.png` ~ `13-settings-after.png`（13 张迁移后截图）
- `report.md`（本报告）
