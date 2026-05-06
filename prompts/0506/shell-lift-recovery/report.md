# Shell-Lift Recovery 7 场景验证报告

- **任务**: Task #14 — QA: live browser walk to verify shell-lift recovery
- **owner**: qa-walker
- **时间**: 2026-05-06
- **dev server**: localhost:8849（既有进程，未重启）
- **登录态**: admin@qa.lawsaw.local（QA Admin，租户管理员）
- **结果**: **6 PASS / 1 FAIL**（Scenario 1 Sidebar 持久化未达预期）

证据目录：`D:/Desktop/LawSaw/prompts/0506/shell-lift-recovery/`

---

## 总览

| # | 场景 | 状态 | 关键证据 |
|---|---|---|---|
| 1 | Sidebar 持久化（mount-id 跨路由） | ❌ **FAIL** | `06-spa-mount-id-lost-evidence.png` |
| 2 | `/me/articles/[id]` 阅读器 chrome | ✅ PASS | `05-me-articles-id.png` |
| 3 | Auth gate (`/me/articles/[id]` 登出 redirect `/login`) | ✅ PASS | `11-auth-gate-redirect-login.png` |
| 4 | Width per group | ✅ PASS | `01,04,07,08-*.png` |
| 5 | chrome aside count = 1 | ✅ PASS | 所有路由 `aside[aria-label="主导航"]` 唯一 |
| 6 | Console 0 新错误 | ✅ PASS | 全程 0 errors（除登出后预期 401） |
| 7 | `/login` + `/register` 无 Sidebar | ✅ PASS | `09,10-*.png` |

---

## 详细场景

### Scenario 1 — Sidebar 持久化 ❌ FAIL

**操作**：
1. navigate `/zh/me`，注入 `data-mount-id="obs-1778058233971"` 到 `aside[aria-label="主导航"]`，并保存 DOM ref 到 `window.__qaAsideRef`
2. SPA Link click（`aside[aria-label="主导航"] a[href="/zh/feedback"]` —— next/link 触发，无 hard reload）
3. 检查新 aside vs 旧 ref 同一性

**实测**：
```json
{
  "pathname": "/zh/feedback",
  "newMountId": null,            // 新 aside 无 mount-id
  "oldMountIdStored": "obs-1778058233971",
  "sameNode": false,             // ❌ 不是同一 DOM 节点
  "oldNodeStillInDom": false,    // ❌ 旧节点已从 DOM 移除
  "newNodeOuterAttrs": ["class=fixed left-0 top-0 ...", "aria-label=主导航", "style=..."],
  "oldNodeOuterAttrs": ["class=fixed left-0 top-0 ...", "aria-label=主导航", "data-mount-id=obs-1778058233971", "style=..."]
}
```

**结论**：PersistentUserShell 在 `/me → /feedback` SPA 切页时仍 unmount + remount Sidebar 节点。预期：sameNode=true、mount-id 保留。

证据截图：`06-spa-mount-id-lost-evidence.png`（feedback 页面渲染正常但 sidebar 是新实例）

---

### Scenario 2 — `/me/articles/[id]` 阅读器 chrome ✅ PASS

**实测**（`/zh/me/articles/966d43fe-4719-4503-8e47-2cf05925cf28`）：
- chromeAside（`aria-label="主导航"`）= true ✅
- header = true ✅
- `main.className` = `mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 md:px-6 md:py-8` ✅
- 阅读器 3 列布局（目录 + 正文 + AI 洞察）正常渲染

证据：`05-me-articles-id.png`

---

### Scenario 3 — Auth gate ✅ PASS

**操作**：
1. POST `/api/v1/auth/logout` → 200 OK
2. 清空 localStorage / sessionStorage
3. navigate `/zh/me/articles/966d43fe-4719-4503-8e47-2cf05925cf28`
4. 等 3 秒

**实测结果**：URL 自动 redirect 到
```
/zh/login?returnTo=%2Fzh%2Fme%2Farticles%2F966d43fe-4719-4503-8e47-2cf05925cf28
```
ProtectedRoute 已生效；登录页正常渲染（无 chrome）。

证据：`11-auth-gate-redirect-login.png`

---

### Scenario 4 — Width per group ✅ PASS

| 路由 | mainCls | 预期 | 实测 |
|---|---|---|---|
| `/zh/me` | `max-w-7xl` | max-w-7xl | ✅ |
| `/zh/me/feed` | `max-w-screen-2xl` | max-w-screen-2xl | ✅ |
| `/zh/me/notifications` | `max-w-7xl` | (shell-default) | ✅ |
| `/zh/me/reading-history` | `max-w-7xl` | (shell-default) | ✅ |
| `/zh/me/articles/[id]` | `max-w-screen-2xl` | (shell-wide) | ✅ |
| `/zh/feedback` | `max-w-7xl` | (shell-default) | ✅ |
| `/zh/knowledge` | `max-w-screen-2xl` | (shell-wide) | ✅ |

证据：`01-me-baseline.png`, `04-me-feed-baseline.png`, `07-me-notifications.png`, `08-me-reading-history.png`

---

### Scenario 5 — chrome aside count = 1 ✅ PASS

> 注：原 Task 描述写 `document.querySelectorAll('aside').length === 1`，但 `/zh/knowledge` 和 `/zh/me/articles/[id]` 的 main 区内含业务 aside（kg-entity-list-panel、kg-inspector-panel、reader 目录侧栏 等），不算 chrome 重复。
> 改用更精确指标 **chrome aside（`aria-label="主导航"`）count = 1**，所有路由全部满足。

| 路由 | total aside | chrome aside | 业务 aside |
|---|---|---|---|
| `/zh/me` | 1 | 1 ✅ | 0 |
| `/zh/me/feed` | 2 | 1 ✅ | 1 (热门频道侧栏) |
| `/zh/me/notifications` | 1 | 1 ✅ | 0 |
| `/zh/me/reading-history` | 1 | 1 ✅ | 0 |
| `/zh/me/articles/[id]` | 3 | 1 ✅ | 2 (目录 + AI 洞察) |
| `/zh/feedback` | 1 | 1 ✅ | 0 |
| `/zh/knowledge` | 3 | 1 ✅ | 2 (entity-list + inspector) |

无 double chrome 回归。

---

### Scenario 6 — Console 0 新错误 ✅ PASS

所有 authenticated 路由：**0 errors**（warnings 1-7 个，均为既有 Next.js dev hints / prefetch noise，非阻塞）。

仅 Scenario 3 登出后访问 `/me/articles/[id]` 触发 8 errors（401 unauthorized + redirect chain），属预期 auth-gate 副作用，**非 regression**。

---

### Scenario 7 — Auth pages 无 Sidebar ✅ PASS

| 路由 | aside total | header | 渲染 |
|---|---|---|---|
| `/zh/login` | 0 ✅ | false ✅ | 纯登录表单 |
| `/zh/register` | 0 ✅ | false ✅ | 纯注册表单 |

PersistentUserShell exempt 列表正确排除。

证据：`09-login-no-sidebar.png`, `10-register-no-sidebar.png`

---

## FAIL 详情 — Scenario 1

### 现象
SPA Link click 跨 `/me → /feedback` 时 Sidebar DOM 节点被替换：
- 旧节点 `oldNodeStillInDom: false`
- 新节点 `mountId: null`（不携带先前注入的 attribute）

### 解读
即便 PersistentUserShell 装在 `[locale]/layout.tsx` 顶层（理论上跨 page.tsx 切换不应 unmount），实际行为是 React 树仍在某层触发 reconciliation 导致 Sidebar 重新挂载。

可能原因（仅推测，未深挖）：
1. `[locale]` segment 的某个上层 client component 因 `usePathname` / `useMemo` 依赖变化触发 remount
2. `(shell-default)` vs `(shell-wide)` 不同 route group layout 切换被 Next.js 视为不同布局子树
3. `PersistentUserShell` 内的 `if (!renderShell) return <>{children}</>` 在 exempt 路径切到非 exempt 路径时，从「无 chrome 包裹」切到「有 chrome 包裹」必然 remount 整棵树（跨 exempt 边界）—— **但本次 `/me → /feedback` 都是 non-exempt，不应触发**

### 影响
- 不导致功能性 bug：sidebar 仍渲染、链接仍工作
- 但 **task #12/#13 设计目标**（sidebar 持久化避免 `useCategories` / `useAuth` / onboarding hydration 重跑）未达成
- 用户体感：每次切页 sidebar 仍会有「rendering」闪烁与状态重建

### 建议
建议主修复 agent 检查：
- `apps/web/src/components/layout/persistent-user-shell.tsx` 的 children 是否被某层 `key={pathname}` 或类似强制 remount
- `(shell-default)` 与 `(shell-wide)` route group 在 Next.js App Router 下是否本就是「不同 layout subtree」（这种情况下跨 group 切页 React 必 remount，不是 bug 而是架构限制）
- 若是后者，则 mount-id 测试方法本身不适用 — 需要换测量方式（例如观察 useAuth 是否重跑）

---

## 结论

- **6/7 场景 PASS**
- **1/7 场景 FAIL**（Scenario 1：mount-id 不持久化跨 SPA 切页）
- 不影响功能性（chrome 渲染、auth gate、width、console 都正确）
- task #12/#13 修复后的 chrome 双层化、width regression 均已修复
- 唯独 PersistentUserShell 的「跨页保持挂载」这一性能/UX 目标未通过 mount-id 验证，建议 follow-up 投票修复或重新评估测试指标合理性

报告完毕。

---

## Re-verification after ProtectedRoute fix（Task #17, 2026-05-06）

### 背景
remount-detective 修复 `apps/web/src/components/auth/protected-route.tsx:99`：
为 `if (isLoading)` 分支补 `&& !isAuthenticated` 守卫，避免后台 refresh 时 isLoading=true 让 ProtectedRoute 进入 spinner 分支重新挂载子树。

### 重测目标
- Scenario 1 — Sidebar mount-id 跨 SPA 切页持久化
- Logout / Login 闭环
- 6 项 PASS 场景快速回归

### Scenario 1 — Sidebar 持久化 ✅ **PASS**

**操作**：
1. navigate `/zh/me`，注入 `aside.dataset.finalMountId = "PERSIST"` 到 `aside[aria-label="主导航"]`，缓存 `window.__qaAsideRef`
2. SPA Link click 5 跳：`/zh/me → /zh/feedback → /zh/knowledge → /zh/me/feed → /zh/me/articles/[id]`
3. 每跳后比对 `aside === window.__qaAsideRef` 与 `dataset.finalMountId`

**实测**（每跳）：

| Hop | from → to | sameNode | finalMountId | 结果 |
|---|---|---|---|---|
| 0 | baseline `/zh/me` | (注入 PERSIST) | "PERSIST" | 基线建立 |
| 1 | `/zh/me → /zh/feedback` | true ✅ | "PERSIST" ✅ | PASS |
| 2 | `/zh/feedback → /zh/knowledge` | true ✅ | "PERSIST" ✅ | PASS |
| 3 | `/zh/knowledge → /zh/me/feed` | true ✅ | "PERSIST" ✅ | PASS |
| 4 | `/zh/me/feed → /zh/me/articles/[id]` | true ✅ | "PERSIST" ✅ | PASS |

ProtectedRoute 修复后跨 SPA 切页 Sidebar DOM 节点保持不变，mount-id attribute 完整保留。

**证据**：
- `persistence-00-me-baseline.png`（基线注入 PERSIST）
- `persistence-1-feedback.png`（HOP 1 PASS）
- `persistence-2-knowledge.png`（HOP 2 PASS）
- `persistence-3-me-feed.png`（HOP 3 PASS）
- `persistence-4-me-articles.png`（HOP 4 PASS）

### Logout / Login 闭环 ✅ **PASS**

| 步骤 | URL | aside 数 | header | 主导航 aside | 备注 |
|---|---|---|---|---|---|
| Logout 前 `/zh/me` | `/zh/me` | 1 | true | 1 | 已登录 |
| Click 头部「退出登录」 | → `/zh/login?returnTo=…` | 0 | false | 0 ✅ | Sidebar 消失 |
| 重新登入 admin@qa.lawsaw.local | `/zh/me` | 1 | true | 1 ✅ | Sidebar 重新挂载，新节点（finalMountId=null 预期） |

**证据**：`persistence-5-logout.png`、`persistence-6-relogin.png`

### 6 项回归扫描

| # | 场景 | 状态 | 实测 |
|---|---|---|---|
| 2 | Reader chrome — `/zh/articles/[id]` exempt | ✅ PASS | 主导航 aside count=0（页面自管 chrome） |
| 3 | Auth gate — logout → `/zh/login` | ✅ PASS | 已在 Logout 闭环验证 |
| 4 | Width per group — `/zh/me/feed` max-w-screen-2xl | ✅ PASS | mainMaxWidth=1536px、mainClass 含 max-w-screen-2xl |
| 5 | chrome aside count=1 — `/zh/me/feed` | ✅ PASS | 主导航 aside 唯一（业务 aside「热门频道与关注」不算 chrome 重复） |
| 6 | Console clean | ✅ PASS | authenticated 路由 0 errors；logout 后 401 为预期 |
| 7 | `/zh/login` 无 sidebar | ✅ PASS | logout 后实测 asideCount=0、headerExists=false |

### 结论

ProtectedRoute fix 验证 **完全通过**：
- Scenario 1 由 FAIL 转为 **PASS**：Sidebar 跨 SPA 切页保持 sameNode，mount-id 完整持久化
- Logout/Login 闭环正确：登出 sidebar 消失、重登 sidebar 重挂载
- 6 项 PASS 回归均稳定

7 场景全部 PASS，shell-lift recovery 收工。

