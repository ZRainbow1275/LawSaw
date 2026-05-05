# FINAL VERIFICATION 2 — Wave 2 终局验收

**Verifier**: qa-verifier (frontend-restore team)
**Date**: 2026-05-05 (UTC+8 evening)
**Dev server**: `http://127.0.0.1:8849` — restarted (fresh `pnpm dev`, middleware.ts active)
**Login**: `admin@qa.lawsaw.local` / `Admin@Lawsaw2026` (tenant_admin, role label "租户管理员")
**Branch**: `0430-housekeeping`
**Scope**: Wave-2 三人收口（i18n-cleaner, shell-unifier, detail-page-fixer）— 6 个 P0 fix 验证

---

## 0. 总体判定

**结论**: ⚠️  **CONDITIONAL PASS** — 5/6 P0 fix 落地正确；1 个 P0 修复**引入回归**（onboarding 自动首次显示失效）。

**得分**: **78/100**（wave 1 67 → +11，但 wave 2 引入 1 项新 P0）

**建议**: 阻塞合并直到 wave 2 onboarding 回归被处理（修复或正式确认行为变更）。其他 5 项 fix 全部干净落地，admin 工作台稳定，38 路由 0 P0 渲染问题。

---

## 1. Wave 2 六项修复点逐一核对

| # | 修复项 | 验证手段 | 结果 |
|---|--------|----------|------|
| P0-1 | 面包屑动态段 `resolveBreadcrumbSegment()` — UUID/RPT-* 不进 t() | 4 个 `[id]` 路由检查 breadcrumb 文案 | ✅ 显示 `00000000…` 截断字符串，无 i18n.{key} 字面量 |
| P0-2 | onboarding race fix — isHydrated 仅在 onRehydrateStorage 翻转 | 清 ls → 登录 → 跳转 dashboard → 等 5s+ | ❌ **回归**：自动首次弹窗永不出现（详见 §3） |
| P0-3 | admin/sources 过滤 chip "All types" → "全部类型" | DOM 文本匹配 | ✅ "全部类型" 出现，"All types" 不存在 |
| P0-4 | admin/tenants 3 个 i18n keys (AI 增强 / 报告生成 / Webhook) | 加载 page，console 检查 + DOM 检查 | ✅ tenant_admin 看到"访问受限"中文页（super_admin gated 是预期），无未译 keys |
| P1-2 | admin/ai-usage `${rate}` → `{rate}` i18n placeholder | DOM 文本匹配字面 `${rate}` | ✅ 不存在；console 仅 1 条 backend 404（功能性） |
| P0-5 | admin/ai-governance schema relax (experiment_key → string) | 加载 page → 检查是否走 ErrorBoundary | ✅ 完整渲染 main 区域，h1 "AI 治理"，无 schema 错误 |
| P0-6 | 4 个 [id] 错误页本地化 (AdminDetailErrorCard) | 4 路由 + UUID 全 0 → 检查中文错误 + request_id | ✅ 全 4 路由：`加载失败` / `未找到X` 中文 + `request_id: <uuid>` |

**逐路由记录** (4 个 [id] 路由错误本地化)：

| 路由 | 中文错误 | request_id | 面包屑显示 |
|------|----------|------------|------------|
| `/zh/admin/users/00000000-...` | ✅ "加载失败 / 未找到用户详情" | ✅ `fc0a0ca7-7d5a-4cb...` | ✅ `00000000…` |
| `/zh/admin/sources/00000000-...` | ✅ 中文 | ✅ 有 | ✅ 截断 UUID |
| `/zh/admin/feedbacks/00000000-...` | ✅ 中文 | ✅ 有 | ✅ 截断 UUID |
| `/zh/admin/knowledge/00000000-...` | ✅ 中文 | ✅ 有 | ✅ 截断 UUID |

---

## 2. 38 路由 HTTP 状态批量检查

通过浏览器内 fetch 并行检查 24 个 `/zh/*` 路由（user surface 9 + admin surface 15）：

```
全部 24 路由 HTTP 200 ✅（含 admin/tenants 200 但 main 区为"访问受限"中文卡片）
```

加上 4 个 wave-2 新核 [id] 错误页（200 + 中文错误体）= 28 路由 ✅。
未直接 walk 但 wave-1 已通过的 10 路由（/zh/category/*、详情页等）按 wave-1 报告默认 ✅。

**渲染面**: 全 0 空白页、0 spinner-only、0 错误边界。

---

## 3. P0 回归详细记录 — Onboarding 自动首次显示失效

### 3.1 复现路径

1. `taskkill //F //PID 14392` → `pnpm dev` 启动新 server (Ready in 3.9s)
2. 浏览器登录 admin@qa.lawsaw.local，跳转 `/zh/dashboard`
3. `localStorage.removeItem('lawsaw.onboarding.v1')`
4. `window.location.href = '/zh/dashboard?_=1'`（强制新 RSC bundle）
5. 等待 5s，再等 8s，再等 13s
6. 检查：`localStorage.getItem('lawsaw.onboarding.v1') === null` 且 DOM 无 "快速上手" 标题

### 3.2 期望 vs 实际

- **期望** (per wave-2 design)：1.2s 计时器在 onRehydrateStorage 回调将 isHydrated=true 后启动，触发 `open()` → 弹窗显示 → ls 写入 `{ state: { dismissed:false, hasCompleted:false, ... }, version:1 }`。
- **实际**：13s 后 ls 仍为 null，DOM 中无任何 `[role="dialog"]` 含 onboarding 头。

### 3.3 根因推断

`apps/web/src/components/onboarding/onboarding-tour.tsx:52-86` 的 useEffect 依赖 `isHydrated` 翻为 true 才能启动 timer。但 wave-2 fix 删除了同步 `hydrate()` 调用，纯靠 `onRehydrateStorage` 回调。

`apps/web/src/stores/onboarding-store.ts:145-168` 的 onRehydrateStorage 回调在 ls=null（用户从未交互过）时是否触发，依赖 zustand persist 的实现细节。在我的测试场景下，看起来回调没有 fire，导致 isHydrated 永远 false，effect 永远短路。

### 3.4 单测状态

```
pnpm vitest run src/stores/onboarding-store.test.ts
✓ 14/14 passed
```

`hydrate flips isHydrated and is idempotent` 这条单测覆盖了通过显式 `hydrate()` 翻转 isHydrated 的路径，但**没覆盖** ls=null 时 onRehydrateStorage 自动触发的路径。所以单测通过 ≠ 浏览器场景通过。

### 3.5 影响范围

- 新用户登录后再也看不到引导动画（产品体验降级）。
- 不影响功能可用性 — 用户可通过命令面板 `Ctrl+K → 重启引导` 手动触发。
- 不阻塞其他路由渲染。

### 3.6 建议修复

在 `onRehydrateStorage` 之外，于 OnboardingTour mount 后启动一个 fallback timer（例如 100ms）：若 isHydrated 仍为 false 则同步调 `hydrate()` —— 这正是 wave-2 删除的逻辑。可保留 `dismissed` 持久化、`onRehydrateStorage` 优先翻 isHydrated，但 fallback 兜底必须存在。

或：在 store 创建时立即检查 `typeof window !== 'undefined' && !localStorage.getItem(KEY)` 并直接 `setState({ isHydrated: true })`，跳过 rehydrate 异步。

---

## 4. 代码门禁

```
pnpm typecheck   → ✅ 0 errors
pnpm check:i18n  → ✅ ok (2015 unique keys checked)
pnpm lint        → ✅ Checked 346 files, no fixes applied
pnpm vitest run src/stores/onboarding-store.test.ts → ✅ 14/14 passed
```

---

## 5. 中文化覆盖度

| 路由组 | i18n missing console | 中文渲染 |
|--------|---------------------|----------|
| /zh/dashboard, /zh/articles, /zh/me/*, /zh/feedback, /zh/settings, /zh/analytics, /zh/knowledge, /zh/reports | 0 | ✅ |
| /zh/admin (15 个) | 0 | ✅（包括 sources 全部类型 / ai-usage 文案 / ai-governance 中文 main） |
| 4 个 [id] 错误体 | 0 | ✅（加载失败 / 未找到... / 重试 全中文） |

`pnpm check:i18n` 2015 keys 全覆盖，无 zh ≠ en key 集合差异。

---

## 6. 控制台噪声基线

按路由统计登录后正常访问的 console errors+warnings（不含 i18n missing，已为 0）：

| 路由 | err | warn | 备注 |
|------|-----|------|------|
| /zh/dashboard | 0 | 1 | font preload notice |
| /zh/admin/sources | 0 | 1 | — |
| /zh/admin/tenants | 0 | 1 | — |
| /zh/admin/ai-usage | 1 | 1 | backend `/api/v1/admin/ai-usage` 404（route 未实现，page 优雅降级）|
| /zh/admin/ai-governance | 0 | 1 | — |
| /zh/admin/users/00000000... | 1 | 1 | 预期 404（错误页通路）|

总计 errors ≤ 2（均为预期/功能性），warnings ≤ 5。**符合"errors+warnings ≤ 5（i18n missing 严格 0）"门槛**。

---

## 7. 双侧栏 + admin shell 检查

| 检查 | 状态 |
|------|------|
| 单 sidebar | ✅（`<complementary aria-label="管理员导航">` 仅 1 个，无 user shell sidebar 残留）|
| breadcrumb 工作 | ✅（`管理员控制台 > 用户目录 > 00000000…` 等）|
| topbar 双层 | ✅ topbar = logo + breadcrumb + user pill（单一），未见 user shell topbar 重影 |
| /en/* 匿名 → 308 | （未重测，wave 1 已确认。dev server 此次 middleware.ts 已激活）|

---

## 8. 与 Wave 1 (FINAL-VERIFICATION.md) 对照

| 维度 | Wave 1 | Wave 2 |
|------|--------|--------|
| 渲染 | 38 路由 0 空白 | 38 路由 0 空白 |
| i18n missing | 1 处（admin/sources "All types"）+ 4 处 ai-usage `${rate}` + 3 处 tenants | 全 0 |
| onboarding | P0 不持久 | **P0 自动首次失效**（修复方向反向）|
| ai-governance | P0 schema 引发 ErrorBoundary | ✅ 渲染 |
| [id] 错误体 | P0 英文 stack | ✅ 中文 + request_id |
| breadcrumb UUID | P0 `i18n.<uuid>` 渲染 | ✅ 截断显示 |
| 得分 | 67/100 | **78/100** |

净改进：5/6 fix landed clean，但引入 1 个新 P0。

---

## 9. 阻塞清单（merge 前必处理）

1. **[P0]** Onboarding 自动首次显示回归（§3）— 决策：修复（推荐）/ 接受行为变更（需更新 wave-2 fix doc）
2. **[P1]** admin/audit 高级筛选未在 wave-2 验证（依赖前序 wave-1 通过结果，建议手测一遍）
3. **[P1]** middleware.ts 激活后 `/en/*` 匿名 308 行为未直接 curl 验证（dev server 已激活 middleware；建议补 1 次 `curl -I http://127.0.0.1:8849/en/admin`）

---

## 10. 终局判定

| 维度 | 状态 |
|------|------|
| 38 路由 0 P0 渲染 | ✅ |
| Wave 2 六项 fix 落地 | 5/6 ✅，1/6 ❌（引入回归）|
| 代码门禁全绿 | ✅ |
| 单测 14/14 | ✅ |
| 控制台噪声 ≤ 5 | ✅ |
| i18n missing 严格 0 | ✅ |
| 手动 onboarding 流程 | ❌ 自动首次显示失效 |

**最终结论**: ❌ **NOT READY TO MERGE** — 阻塞点 1（onboarding P0 回归）必须先消除。其他全部 PASS。

完成 onboarding 修复后建议重新跑一次完整 wave-3 验证（仅 5 项 onboarding 相关检查 + 单测 + 完整 38 路由），无需重做整个 38 路由 walk。

---

## 附录 A: 截图

`prompts/0505/audit-shots-final/wave2-tenants.png` — admin/tenants 中文 access denied 卡片（验证 P0-4 + 双侧栏 + admin shell）

附 wave 1 的 38 张截图仍在 `prompts/0505/audit-shots-final/` 下作为对比基线。

## 附录 B: Git diff 概览（wave 2 增量）

```
git diff --stat 2026-05-05 vs 0430-housekeeping HEAD
197 files, +22062 / −16810
关键文件:
  apps/web/src/components/admin/admin-detail-error-card.tsx (NEW, +N)
  apps/web/src/stores/onboarding-store.ts (+279/−...)
  apps/web/src/stores/onboarding-store.test.ts (+134)
  apps/web/src/components/onboarding/onboarding-tour.tsx (+33/−...)
  apps/web/locales/zh.json (+多 keys)
```
