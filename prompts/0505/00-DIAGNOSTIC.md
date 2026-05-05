# LawSaw 前端诊断报告 (2026-05-05)

> 任务：`.trellis/tasks/04-29-ui-restore-prototype-1to1`
> 状态：第二轮，扩展范围至 admin（用户选 B）。
> 数据来源：50+ 张 Playwright 截图 + 直接 DOM 探针（`document.querySelector` / `getComputedStyle`）+ 源码 grep。
> 截图位置：`.playwright-mcp/scan-XX-*.png` 与 `snap-XX-*.png`。

---

## TL;DR — 必修硬伤（按严重度排序）

| # | 问题 | 路由数 | 严重度 |
|---|------|-------|-------|
| **D1** | admin 多个 `[id]` / `new` 详情页 main 区域完全空白（仅 shell 渲染） | 5+ | 🔴 阻断 |
| **D2** | `/zh/feedback` 整页缺失 `<main>`，body 仅"跳到主要内容"链接 | 1 | 🔴 阻断 |
| **D3** | `/zh/admin/users/[id]` 60s 超时未渲染 | 1 | 🔴 阻断 |
| **D4** | `/zh/reports/[id]` 路由把报告号 `RPT-yyyymmdd-NNNN` 当 UUID 解析报错 | 1 | 🔴 阻断 |
| **C1** | `/zh/settings/admin/*` 平行路由独立 200 渲染，仅 spinner 后软重定向到 `/admin/*`；`sources` / `tenants` 因目标缺失 404 | 13 | 🟠 高 |
| **C2** | `/zh/admin/reports/runs` 与 `/zh/admin/reports/new` 嵌套了第二层 chrome（双 topbar、双 padding） | 2 | 🟠 高 |
| **A1** | zh locale 选中态下，admin 列表/统计区/枚举值/表单仍大面积渲染英文 | 20+ | 🟠 高 |
| **A2** | seed 数据为英文 HackerNews 标题，污染 `/zh/articles`、`/zh/dashboard`、`/zh/me/feed` | 3+ | 🟡 中 |
| **B1** | `/zh/knowledge` (docH=2271) / `/zh/admin/knowledge` (docH=2635) / `/zh/admin/audit` (docH≈3000) 长内容无内部 scroll container，整页跟着 body 滚 | 3 | 🟡 中 |
| **F1** | `/zh/articles` 无筛选 chip / 无分页（仅搜索可用）| 1 | 🟡 中 |
| **F2** | 登录 `next` 参数被丢弃（`/zh/login?next=/admin` 登录后跳到 `/zh`） | 全局 | 🟡 中 |
| **E1** | admin 列表残留 CRUD 测试条目（"test", "qq", "测试"）| 多处 | 🟢 低 |
| **E2** | avatar fallback 不一致（admin initials vs client icon）| 全局 | 🟢 低 |

---

## A — 中英混排（zh locale 下泄漏英文）

### A1. admin 列表 / 统计区硬编码英文

| 路由 | 硬编码英文样本 |
|---|---|
| `/zh/admin/users` | "User management" / "Browse tenant members" / "manage role memberships review permission history" / "Invite user" / "Page" / "Showing" |
| `/zh/admin/audit` | event_type 列直出 `user.login` / `tenant.create` 等枚举字面量 |
| `/zh/admin/ai-usage` | "Total tokens" / "Avg latency" / "Tokens" 图例 |
| `/zh/admin/banners/new` | 字段标签英文（如 placeholder） |
| `/zh/knowledge` 统计区 | "TOTAL" / "ENTITIES" / "RELATIONS" / "VECTOR" / "READY" / "Entities that have semantic embeddings hybrid search" |
| `/zh/feedback` 类型选项 | `labelKey: "Source suggestion"` / `"Bug report"` / `"Feature request"` / `"Other"` 实际是英文字面量当 key 用，未走 `useT()` |
| `/zh/feedback` 状态枚举 | `"Pending"` / `"Reviewing"` / `"Resolved"` / `"Closed"` 同上 |
| toast / error | 直接渲染后端 `error.message`（英文） |

### A2. seed 数据全英

来源：`scripts/dev_seed_*.sh` 灌入的是 HackerNews 公开抓取数据。

样本：
- "Mbodi AI (YC P25) Is Hiring"
- "A new gene therapy is giving people born deaf the chance to hear"
- "Tesla Is Sitting on a Record 50k Unsold EVs"
- "How many products does Microsoft have named 'Copilot'?"
- "Why the most valuable things you know are things you cannot..."

影响路由：`/zh/articles`、`/zh/dashboard`（"最新资讯"区）、`/zh/me/feed`、`/zh/me/articles/[id]`（详情）。

### A3. 错误页直出后端原文

`/zh/reports/RPT-20260505-0004` 错误内容：

```
Invalid URL: Cannot parse `id` with value `RPT-20260505-0004`:
UUID parsing failed: invalid character: expected an optional prefix of `urn:uuid:`
followed by [0-9a-fA-F-], found `R` at 1
(request_id=31572909-49ba-4175-b951-f25f46abde3a)
```

---

## B — 布局溢出（无内部 scroll container）

| 路由 | docHeight | viewportHeight | 内部 scroll 容器数 | 状况 |
|---|---|---|---|---|
| `/zh/knowledge` | 2271px | 900px | **0** | 图谱画布 + 节点列表纵向堆叠，整页滚 |
| `/zh/admin/knowledge` | 2635px | 900px | **0** | 同上 + 多了筛选条 |
| `/zh/admin/audit` | ~3000px | 900px | **0** | 长事件列表无虚拟滚动、无分页 chip 收纳 |
| `/zh/dashboard` | 4355px | 900px | **0** | KPI 缺、最新资讯一直延伸到底 |
| `/zh/articles` | 3832px | 900px | **0** | 仅 3 张卡，docH 仍 4倍 viewport |
| `/zh/analytics` | 显示不全 | — | — | ECharts 容器 height:auto，世界地图未渲染 |

**根因**：列表 / 图谱组件没用 `flex-1 min-h-0 overflow-y-auto` 包装，导致内容直接撑出 main 区域。

---

## C — 外壳不一致（破坏统一感）

### C1. `/zh/settings/admin/*` 平行路由

通过 fetch 探测，`settings/admin/{ai-usage, apikeys, banners, channels, feedbacks, pins, relations, reports, audit, knowledge, users}` 都返回 200，**不是**重定向。但页面只渲染 `<div class="loading-spinner" />`，然后客户端执行 `router.push('/zh/admin/...')`。

后果：
- URL 闪烁（`settings/admin/audit` → `/admin/audit`）
- 双重 SSR 浪费
- `settings/admin/sources` 与 `settings/admin/tenants` 因 `/admin/sources` 与 `/admin/tenants` 路径上目标错配 → 返回 404

**修复**：删除整套 `apps/web/src/app/[locale]/settings/admin/**`，在 `next.config.*` 加一条 308 真重定向 `/settings/admin/:path*` → `/admin/:path*`。

### C2. 双 chrome 嵌套

`/zh/admin/reports/runs` 与 `/zh/admin/reports/new` 在 admin layout 已经提供 sidebar+topbar 的情况下，自己 page 里又渲染了一层 sidebar+topbar，导致：
- 280px 侧栏 × 2 = 560px 占用
- 64px topbar × 2 = 128px 顶部
- 主内容被挤到右下角

### C3. 客户端 / admin shell 视觉错位

logo 字号、breadcrumb 间距、avatar 大小在 `/admin/*` 与 `/dashboard` / `/articles` 等客户端路由之间有 1-2px 漂移，跨页切换肉眼可感。

---

## D — 详情页损坏

| 路由 | 现象 | 推断原因 |
|---|---|---|
| `/zh/admin/banners/new` | shell 完整、main 区 0 个 input、textLen=203 | 表单 component 未实现或 import 失败 |
| `/zh/admin/channels/[id]` | main 完全空白 | 同上 |
| `/zh/admin/sources/[id]` | main 完全空白 | 同上 |
| `/zh/admin/feedbacks/[id]` | main 完全空白 | 同上 |
| `/zh/admin/knowledge/[id]` | main 完全空白 | 同上 |
| `/zh/admin/users/[id]` | 60s 超时未渲染主区，仅抽屉部分露出 | 上游 API 阻塞或 useEffect 死循环 |
| `/zh/reports/[id]` | UUID 解析报错（D4） | 路由 schema 误用 UUID，应支持 RPT-* 报告号 |
| `/zh/feedback` | 整页无 `<main>`、body 仅 skip-link | `[locale]/feedback/page.tsx` 通过 `export { default } from "../../feedback/page"` 转发到非 locale 路径，与 `[locale]` 守卫冲突 |

---

## E — 数据质量

- **E1**：admin 列表残留 CRUD 测试条目（"test", "测试", "qq" 等）。
- **E2**：avatar fallback admin 用 initials、客户端用 `<UserCircle />` 图标。
- **E3**：admin/audit 时间列同时存在 ISO 字符串与本地化字符串两种格式。

---

## F — 功能交互缺陷（本轮新增）

| ID | 路由 | 缺陷 |
|---|---|---|
| F1 | `/zh/articles` | 0 个筛选 chip、0 个分页按钮（搜索可用） |
| F2 | 登录流程 | `?next=/admin` 参数被吞掉，回到 `/zh` |
| F3 | `/zh/dashboard` | 0 个语义化 KPI 组件（`[class*="kpi"]` 全 miss） |
| F4 | `/zh/feedback` | 反馈类型枚举没走 i18n（labelKey 直接是英文字面量） |
| F5 | 知识图谱 | 21 个 SVG 但 0 个 canvas — 性能可接受但拖拽 / 缩放未测（main 阻塞过长无法交互） |

---

## 路由覆盖清单（本轮已扫）

### 客户端（`/zh/*`）
- `/zh` (登录后落地)
- `/zh/dashboard`
- `/zh/feed` / `/zh/me/feed`
- `/zh/articles` / `/zh/articles/[id]`
- `/zh/me/articles/[id]`
- `/zh/reports` / `/zh/reports/[id]` (D4)
- `/zh/analytics`
- `/zh/knowledge`
- `/zh/feedback` (D2)
- `/zh/settings`
- `/zh/login` / `/zh/register`

### Admin（`/zh/admin/*`）
- 列表：`tenants` / `users` / `relations` / `pins` / `channels` / `banners` / `sources` / `feedbacks` / `audit` / `apikeys` / `ai-usage` / `ai-governance` / `reports` / `reports/runs` / `reports/templates` / `knowledge`
- 详情/新建：`users/[id]` (D3) / `channels/[id]` (D1) / `feedbacks/[id]` (D1) / `sources/[id]` (D1) / `knowledge/[id]` (D1) / `banners/new` (D1) / `reports/new` (C2) / `reports/templates/[id]`

### Settings/Admin 平行路由（C1 — 全部为客户端软重定向，2 个 404）
- `ai-usage` / `apikeys` / `banners` / `channels` / `feedbacks` / `pins` / `relations` / `reports` / `audit` / `knowledge` / `users` → 200 后跳转
- `sources` / `tenants` → 404

---

## 复现矩阵

完整 Playwright 探针脚本位于 `prompts/0505/scripts/`（写完计划后落地）。
