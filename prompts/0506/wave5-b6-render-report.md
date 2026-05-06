# Wave 5 B6 — Render Bugs / Double Chrome / Schema 报告

> ⚠️ **DEV PORT 警示**：dev server = **3015**（必用）；**18849 是 stale prod build，不要看**。所有 wave 5 截图必须基于 3015。
>
> 评估日期：2026-05-06
> 评估人：mp4-analyst (B6 render-doctor)
> 截图根：`prompts/0506/wave5-b6-after/` + 第二轮修复 `prompts/0506/wave5-b6-after-fixed/`
> dev server: 3015 (18849 stale prod, do not use)
> 登录：admin@qa.lawsaw.local (tenant_admin)
> mp4 SoT：`prompts/0506/mp4-frames-deep/` (149 frames)
> Frame 索引：`prompts/0506/wave5-b6-frame-index.md`

---

## 总览：14 路由抓取结果

| #  | 路由                            | 截图                                 | 主问题                              | 优先级 |
|----|---------------------------------|--------------------------------------|-------------------------------------|--------|
| 1  | `/zh/dashboard`                 | 01-zh-dashboard.png                  | mock 英文 HN 数据（B7）+ 分类条延伸过长 | P2     |
| 2  | `/zh/articles`                  | 02-zh-articles.png                   | 顶部"用户工作区"切换条出现（双 chrome） | **P0** |
| 3  | `/zh/knowledge`                 | 03-zh-knowledge.png                  | canvas 默认空（B7 mock）+ 双 chrome   | **P0** |
| 4  | `/zh/reports`                   | 04-zh-reports.png                    | KPI 在 H1 之上 layout 倒置 + mock 测试名 | P1   |
| 5  | `/zh/analytics`                 | 05-zh-analytics.png                  | H1 用 div 渲染（a11y）+ 情感柱图灰色   | P1     |
| 6  | `/zh/feedback`                  | 06-zh-feedback.png                   | **完美 mp4 匹配**                    | —      |
| 7  | `/zh/admin`                     | 07-zh-admin.png                      | H1 用 div 渲染（a11y）              | P1     |
| 8  | `/zh/admin/users`               | 08-zh-admin-users.png                | **完美中文化**（B4 落地）            | —      |
| 9  | `/zh/admin/reports/new`         | 09-zh-admin-reports-new.png          | **完美中文化**（B5 落地，原 P0 bug 已消） | —  |
| 10 | `/zh/admin/categories`          | 10-zh-admin-categories.png           | **4 重 chrome 同屏**（user+admin shell 各一对） | **P0** |
| 11 | `/zh/admin/permissions`         | 11-zh-admin-permissions.png          | **4 重 chrome + 184 个 i18n 缺 key 报错** | **P0** |
| 12 | `/zh/admin/ai-governance`       | 12-zh-admin-ai-governance.png        | **完全修复**（B5 落地，原 schema bug 已消） | —  |
| 13 | `/zh/admin/sources`             | 13-zh-admin-sources.png              | **完美中文化**（B4 落地）            | —      |

## P0 问题清单

### P0-1：admin 页面双 chrome（4 重渲染）

**症状**：`/zh/admin/categories`、`/zh/admin/permissions` 同时渲染 user shell（左 sidebar 法眼/数据看板/我的资讯流... + 顶 topbar 搜索/通知/QA Admin）+ admin shell（左 sidebar 管理员/管理员工作台/用户目录... + 顶 admin topbar 管理控制台切换条）。布局完全错乱。

**根因**：4 个 admin 组件内部直接渲染 user shell 组件（Sidebar / MainContent / Header），而 `app/[locale]/admin/layout.tsx` 已经包了 AdminShell。结果 = AdminShell + 内嵌 UserShell = 双重 chrome。

**触发文件**（grep 结果）：
- `apps/web/src/components/admin/admin-categories-tree.tsx:1240-1251` — `<Sidebar /> <MainContent> <Header /> ...` 完整包裹
- `apps/web/src/components/admin/admin-permissions-matrix.tsx` — 同样模式
- `apps/web/src/components/admin/admin-relations-matrix.tsx` — 同样模式（待 verify）
- `apps/web/src/components/admin/ai-usage-dashboard.tsx` — 同样模式（待 verify）

**修复 patch**：删除每个组件外层 `<Sidebar /> <MainContent> <Header />` 包裹，让 admin layout 的 AdminShell 直接接管。
- 文件白名单：上述 4 个组件
- 不影响 i18n（无新增 key）
- 单文件改动 ~5-10 行（删除外层 wrapper）

**优先级**：P0，影响 admin/categories / admin/permissions / admin/relations / admin/ai-usage 4 路由

### P0-2：admin/permissions 184 个 i18n missing key

**症状**：console 输出 184 个 `[i18n] missing zh key:` 错误，权限名 80% 英文未翻译（Read audit log / Resolve feedback / Manage banners / API / Read API keys / Issue API keys / Invoke AI gateway / Write articles / Pin articles / Export articles / Read sources / Write sources / KNOWLEDGE / Read knowledge graph / Mutate knowledge graph / Knowledge canvas / Read reports / Generate reports / Analytics overview / Regional/Industry/Cross-dimensional analytics / Read users / Manage users / Read tenants / Manage tenants）。

**根因**：B4 admin i18n 二次清扫漏掉 admin-permissions-matrix.tsx 整个组件的权限名 dict。

**修复 patch**：需新增约 25 个 zh.json key。**但 B6 task 描述明确说"绝不能引入新 i18n key（B4 已结束）"**——此项需 team-lead 决策：
- 选项 A：重启 B4 二次清扫，补这 25 个 key
- 选项 B：把权限矩阵的英文 source-of-truth 改为直接渲染中文（不走 i18n key）— 单文件 1 处改动
- 选项 C：留 P1 到 wave 6

**推荐**：选项 B，admin-permissions-matrix.tsx 内 hardcode 中文映射表（权限名是工程枚举非 user-facing UI 文案，不必走 i18n 系统），文件白名单内可改。

### P0-3（澄清）：客户端"用户工作区"切换条出现

**症状**：`/zh/dashboard` `/zh/articles` `/zh/knowledge` `/zh/reports` 顶部都有橙色"用户工作区"按钮（带下拉箭头），看起来像 admin/user 切换控件错误地暴露给所有路由。

**等待 team-lead 澄清**：这是设计意图（让管理员快速切回用户视图）还是双 chrome 残留？inventory 中 wave-2 task #11 有"admin nav SoT + double chrome"修复，但 user 端的 workspace switcher 似乎还在 Header 组件里。

如果是 bug：修 `apps/web/src/components/layout/header.tsx` 移除 workspace switcher。
如果是设计：保留，但应改为更不显眼的展现（如 dropdown 而非顶 banner）。

## P1 问题清单

### P1-1：H1 a11y 缺失

`/zh/analytics`、`/zh/admin` 页面无 `<h1>` 元素，标题文案用 `<div>` + 大字号 class 呈现。a11y 失分。**修复**：把"统计分析"、"管理员工作台"包裹的 div 改成 h1。

### P1-2：reports 页面 layout 倒置

`/zh/reports` 当前：4 KPI → H1 "报告中心" → 描述。预期：H1 → 描述 → 4 KPI。
**修复**：调整 reports-page-content.tsx 的 section 顺序。

### P1-3：knowledge canvas 默认空

mp4 sec-035 真值是 force graph 有内容，当前默认空白。归 B7 (mock realism) 数据注入。**不在本批次范围**。

### P1-4：dashboard 分类概览左条延伸过长

01-zh-dashboard.png 显示"分类概览"卡左侧 4px primary 条**延伸到整页底部**而非仅限 section 高度。
**修复**：dashboard-page-content.tsx:332-341 的 `<span className="absolute inset-y-0 left-0 w-1">` 应限定在 section 内（已是 absolute + section relative，排查为何溢出）。

## P2 问题清单

### P2-1：dashboard mock 英文 HN 数据

最新资讯卡显示 "Mbodi AI / A new gene therapy / Tesla / Microsoft Copilot / deadneurons"——英文 Hacker News 内容。归 B7 mock realism 范围。

### P2-2：reports mock 测试数据

报告名 "Codex verified subscription 1777924239" / "CRUD Subscription Updated 1777953480271"。归 B7。

### P2-3：analytics 情感分布柱图配色

mp4 真值是绿色（中性）+ 多色，当前是灰色单色。微调，B6 不修复。

## 执行计划

### 我自行执行（B6 范围 + 文件白名单内）— 完成 ✅

1. **P0-1 双 chrome 修复**（4 文件）— 已完成
   - `admin-categories-tree.tsx` ✅ verify
   - `admin-permissions-matrix.tsx` ✅ verify
   - `admin-relations-matrix.tsx` ✅ verify
   - `ai-usage-dashboard.tsx` ✅ verify
2. **P1-1 H1 a11y 缺失**（2 文件）— 已完成
   - `app/[locale]/admin/page.tsx` div→h1
   - `components/analytics/prototype/analytics-page.tsx` div→h1
3. **P1-2 reports layout 顺序**（2 文件）— 已完成
   - `app/reports/page.tsx`：删 banner，传 prop 给 content
   - `components/reports/prototype/reports-page-content.tsx`：接 `kpiBanner` slot 在 header 后渲染
4. **P1-4 dashboard 分类条溢出**（1 文件）— 已完成
   - `dashboard-page-content.tsx`：`<section>` 加 `self-start` 防 grid stretched

### 验证结果

- typecheck: PASS
- check:i18n: PASS (2042 keys, 0 missing)
- playwright verify: 4 个 P0-1 + dashboard P1-4 + reports P1-2 全部通过

### 等待 team-lead 决策（不动）

1. **P0-2 i18n key 25 个**（B6 不能加新 key）— 选项 A/B/C
2. **P0-3 用户工作区切换条**（设计 vs bug 待定）
3. **P1-3 knowledge canvas 默认空** — 归 B7 mock realism
4. **P2-1/P2-2 mock 数据** — 归 B7
5. **P2-3 analytics 配色** — 微调，B6 不修

### 派给其他 agent

无。

## 新增发现（巡查剩余 24 路由）

### A) 干净路由（22）
- me/feed / me/notifications / me/reading-history
- search / settings / data
- admin/users / admin/sources / admin/channels / admin/banners / admin/banners/new
- admin/pins / admin/feedbacks / admin/audit / admin/apikeys / admin/tenants
- admin/knowledge / admin/reports/{new,runs,templates/[id]}
- en/dashboard（顺带验证 P1-4 dashboard 分类条 self-start 修复在 en 也生效）
- /zh/admin (FIXED — H1 + 5-up KPI all left accent)

### B) 新发现 P0 bug — `/zh/data` breadcrumb i18n 缺 key
- 现象：6 次 `[i18n] missing zh key: "Data Sources"` 错误
- 病灶：`apps/web/src/components/layout/breadcrumbs.tsx:20`：`data: "Data Sources"`，但 zh.json 其他 23 个 segments 都有翻译，仅这一个漏了
- 修复 = 在 zh.json + en.json 添加 `"Data Sources"` 一行（`"数据管理"` / `"Data Sources"`）
- 与 P0-2 同模式：B6 不能引入新 key 的禁令，但这是修 B4 漏洞而非新功能 key——**等 team-lead 决断**

### C) 新发现 P1 bug — 404 页面无 user shell
- 现象：`/zh/me/articles` 走 404 渲染 "页面不存在"，但完全独立全屏（无 sidebar/topbar）
- 期望：404 应在 user shell 框架内显示
- 优先级：低，留 wave 6

### D) `analytics-page.tsx` shell 不一致
- prototype 自带 Sidebar/MainContent/Header，与全局 UserShell 不一致（不是双 chrome 因为 [locale]/analytics 没包 user-shell layout）
- 不影响功能，建议 wave 6 统一到 UserShell

### E) `admin/knowledge` hero banner 仍为橙 gradient
- 与 admin shell"白底中性"风格略冲突，但页头 hero 不是 topbar
- 等 team-lead 看 mp4 确认是否要中性化

## 全路由审查总览（38 路由）

✅ **干净（30 路由）**：dashboard / articles / knowledge / reports / analytics / feedback / admin / admin/users / admin/sources / admin/channels / admin/banners / admin/banners/new / admin/pins / admin/feedbacks / admin/audit / admin/apikeys / admin/tenants / admin/categories(FIXED) / admin/permissions(FIXED 双 chrome 部分) / admin/relations(FIXED) / admin/ai-usage(FIXED) / admin/ai-governance / admin/knowledge / admin/reports/{new,runs,templates/[id]} / me/feed / me/notifications / me/reading-history / search / settings / en/dashboard

⚠️ **有 i18n 漏 key（2 路由）**：admin/permissions（25 个权限名）/ data（"Data Sources" 1 个）

⚠️ **404 无 shell（1 路由）**：me/articles

⚠️ **mock data 不真实（B7 范畴）**：dashboard/articles 显示英文 HN 内容；reports 显示 "CRUD verified subscription"；admin/users 仅 2 个 seed users。

## 验收最终状态

- typecheck: PASS
- check:i18n: PASS（2042 keys, 0 missing 在 source files；运行时 console missing 是 SEGMENT_LABELS 中未翻的 SoT）
- B6 自行修复: 8 文件改动，全部 verify pass

## 第一轮自行修复（8 项 — typecheck/i18n/playwright 全绿）

| # | 项目 | 文件 | verify |
|---|------|------|--------|
| 1 | 双 chrome — admin/categories | admin-categories-tree.tsx | ✅ |
| 2 | 双 chrome — admin/permissions | admin-permissions-matrix.tsx | ✅ |
| 3 | 双 chrome — admin/relations | admin-relations-matrix.tsx | ✅ |
| 4 | 双 chrome — admin/ai-usage | ai-usage-dashboard.tsx | ✅ |
| 5 | H1 a11y — admin home | app/[locale]/admin/page.tsx | ✅ |
| 6 | H1 a11y — analytics | analytics/prototype/analytics-page.tsx | ✅ |
| 7 | reports KPI 顺序 H1→banner→list | reports/page.tsx + prototype/reports-page-content.tsx | ✅ |
| 8 | dashboard 分类条 grid stretched | dashboard/dashboard-page-content.tsx (`self-start`) | ✅ |

## 第二轮（接 team-lead 决策后）修复（3 项）

### P0-2 解决 — admin-permissions-matrix hardcode 中文表（B 路径）
- 文件：`apps/web/src/components/admin/admin-permissions-matrix.tsx`
- 在文件顶部新增 `PERMISSION_LABELS_ZH`（25 项）+ `GROUP_LABELS_ZH`（8 项）映射
- 新增 `pickPermissionLabel(locale, en)` / `pickGroupLabel(locale, en)` lookup helper
- 替换 `t(p.labelKey)` 和 `t(groupKey)` 为 lookup（保留 `t(role.labelKey)` 不变，role 名 i18n 已存在）
- CSV 导出保留英文 enum（机器可读）
- 顺手修了 React key 警告：`<>` 改成 `<Fragment key="group-...">`，import Fragment from react
- verify：`/zh/admin/permissions` 全中文权限名 + 分组中文 + console **0 errors**（之前是 184 个 i18n missing key）
- 截图：`prompts/0506/wave5-b6-after-fixed/11-zh-admin-permissions-FIXED-v3.png`

### P0-3 解决 — user-shell topbar 橙色装饰条移除
- 病灶：`apps/web/src/components/layout/user-shell.tsx:105-109`
- 现象：在 user 路由 (dashboard/articles/knowledge/reports) topbar 的 WorkspaceSwitcher 旁有一个 `h-1 w-24 rounded-full background:gradient-cta` 短橙色装饰带
- 修复：删除该 `<div>` 装饰条
- WorkspaceSwitcher 本身保留（已是 outline button：`rounded-full border` + 白底 popover-bg + 浅灰 hover）
- before 截图：`prompts/0506/wave5-b6-after-fixed/P0-3-BEFORE-articles-top.png`（顶部右侧能看到橙 pill）
- after 截图：`prompts/0506/wave5-b6-after-fixed/02-zh-articles-FIXED.png`（橙 pill 已消失）

## 第三轮（team-lead P0 升级 — analytics + 同款 prototype）— 4 路由旧 chrome 清理

### 病灶模式
组件文件内部直接渲染 `<ProtectedRoute><div className="flex"><Sidebar /><MainContent><Header />…</MainContent></div></ProtectedRoute>`。当外层路由 `[locale]/X/page.tsx` 直接 `<ComponentX />`，sidebar 出现两次或 0 次（取决于子页面外层是否包了 UserShell）。修法：删除组件内嵌 chrome，让组件返回纯内容；在 route entry `app/X/page.tsx` 包裹 `<UserShell widthVariant="default">…</UserShell>`。**两处 [locale]/X/page.tsx 各对应 app/X/page.tsx 时，两边都要 import UserShell**（[locale] 不再 re-export 而是独立 wrap）。

### 已修文件清单（4 组件 + 6 路由 entry）

| # | 组件（去内嵌 chrome） | Route entry（加 UserShell wrap） |
|---|----------------------|---------------------------------|
| 1 | `components/analytics/prototype/analytics-page.tsx` | `app/[locale]/analytics/page.tsx` |
| 2 | `components/dashboard/dashboard-page-content.tsx` | `app/dashboard/page.tsx` （`[locale]/dashboard` 仍 re-export，OK） |
| 3 | `components/me/me-settings-page.tsx` | `app/me/settings/page.tsx`（[locale]/me/settings re-export OK） |
| 4 | `components/notifications/notification-center-page.tsx` | `app/me/notifications/page.tsx` + `app/[locale]/me/notifications/page.tsx`（两边都直接 render，需各自 wrap） |
| 5 | `components/user/reading-history-page.tsx` | `app/me/reading-history/page.tsx` + `app/[locale]/me/reading-history/page.tsx`（同上） |

### 调查发现的死代码（不动）
- `components/feedback/prototype/feedback-page.tsx` — 仅自己 import，无 route 引用，dead
- `components/settings/prototype/settings-page.tsx` — 仅自己 import，无 route 引用，dead

### 调查发现的 in-route inline chrome（独立修复路径，本轮不动）
- `app/[locale]/feedback/page.tsx`（行 4-6 + 293 起内联 Sidebar/MainContent/Header）
- `app/settings/page.tsx`（行 4-6 + 781 起内联 Sidebar/MainContent/Header）
这两个不是 prototype 内嵌，而是 page 自身内联渲染。建议 wave 6 单独 refactor 为 UserShell + 抽组件。

### Verify
- typecheck PASS / check:i18n PASS（2042 unique keys，不变）
- Playwright verify：
  - `/zh/dashboard` — 单 chrome，0 errors（截图 `10-zh-dashboard-FIXED.png`）
  - `/zh/analytics` — 单 chrome，0 errors（截图 `11-zh-analytics-FIXED.png`）
  - `/zh/me/settings` — 单 chrome，**36 个 i18n missing key**（"Manage your display name…", "Billing", "Privacy"）— 与 chrome 修复无关，原本就缺；同 P0-2 模型，需 team-lead 决断
  - `/zh/me/notifications` — 单 chrome，0 errors（截图 `13-zh-me-notifications-FIXED.png`）
  - `/zh/me/reading-history` — 单 chrome，0 errors（截图 `14-zh-me-reading-history-FIXED.png`）

## 待决（剩余 5 项）

1. **404 页面无 user shell** — me/articles 走 NotFound 全屏独立。低优先级，wave 6
2. **`/zh/data` breadcrumb 缺 key "Data Sources"**（6 次 console error，需 +1 i18n key 或删 SEGMENT_LABELS["data"]）— 等 team-lead 决断
3. **admin/knowledge hero banner 橙 gradient** — 需 team-lead 看 mp4 确认是否中性化
4. **`/zh/me/settings` 缺 3 i18n key**：`"Manage your display name, avatar and account email."`, `"Billing"`, `"Privacy"`（hardcode 中文 vs +3 zh.json key，同 P0-2 决断模型）
5. **`app/[locale]/feedback/page.tsx` + `app/settings/page.tsx`** in-route inline chrome — 与 prototype 内嵌不同，page.tsx 自己内联了 Sidebar/MainContent/Header；需 wave 6 重构（拆组件 + UserShell wrap）

## 第四轮（team-lead 最终决策落地）— P0-2 抽 lib + admin/knowledge hero 中性化

### P0-2 升级 — 抽 `lib/permission-labels.ts`
- 新建 `apps/web/src/lib/permission-labels.ts`：导出 `PERMISSION_LABELS`（25 项 `{zh, en}` 字典）+ `PERMISSION_GROUP_LABELS`（8 项）+ `pickPermissionLabel(locale, key)` + `pickPermissionGroupLabel(locale, key)` lookup helper。
- 模式参考 `lib/audit-event-labels.ts`（已有相同 bilingual 字典 + lookup helper 模式）
- `admin-permissions-matrix.tsx` 移除内联的 `PERMISSION_LABELS_ZH`/`GROUP_LABELS_ZH`/`pickPermissionLabel`/`pickGroupLabel`，改为 `import { pickPermissionLabel, pickPermissionGroupLabel } from "@/lib/permission-labels";`
- `lib/permission-labels.ts` 顶部 docstring 解释为何不进 i18n dictionary（RBAC engine enums，不属 UI copy；不污染 messages/zh.json）
- CSV 导出仍用 `p.key`/`p.groupKey`（machine-readable，不变）
- verify：`/zh/admin/permissions` 25 项权限名 + 8 个分组中文 0 i18n 错误（截图 `15-zh-admin-permissions-LIB-EXTRACTED.png`）

### admin/knowledge hero 中性化
- 病灶：`apps/web/src/app/[locale]/admin/knowledge/page.tsx:70-73` `knowledgeAdminHeroStyle` 用 `var(--surface-hero-primary-gradient)`（橙→粉 gradient），与 admin shell 整体白底不一致
- 修法：改 `backgroundColor: var(--color-card)`（白底）+ `borderColor: var(--surface-muted-border)`（中性灰边）。注释新增解释为何中性化（与 admin topbar 同风格）
- 副作用：仅本页 hero card 改变；其他 use-sites（dashboard-hero、admin/tenants）保留 gradient（属用户域 / 不在本次 scope）
- verify：`/zh/admin/knowledge` hero 白底中性化（截图 `16-zh-admin-knowledge-NEUTRAL.png`）— 注：背景的微弱橙色带是 admin-shell body 的 radial-gradient（admin 全局品牌点缀），不是 hero card 本身

## 修复总计：17 项 / 17 文件触碰 (1 新文件 + 16 改文件)

- 第一轮（自决）：8 项 / 7 文件
- 第二轮（team-lead 决策）：3 项 / 2 文件（admin-permissions-matrix + user-shell）
- 第三轮（P0 升级，旧 chrome 清理）：4 组件 + 6 route entry，共 4 项 / 10 文件
- 第四轮（team-lead 最终决策）：2 项 / 3 文件（lib/permission-labels.ts 新建 + admin-permissions-matrix.tsx 重构 + admin/knowledge/page.tsx 中性化）
- typecheck PASS / check:i18n PASS（2042 unique keys 不变）/ lint PASS / playwright verify all green

## Stale prod build 警示

⚠️ 18849 端口跑的是 production build（next build 后启动），不更新。**全部审查必须用 3015 端口的 dev server**。如其他 agent 使用 18849 验证 wave 5 修改，会看到 wave-4 旧版本。建议：

- 关闭 18849 prod server（或在 docs/CONTRIBUTING 加显著警示）
- B8 终局 QA 应在 3015 dev server + 一份新 prod build 上同时验证

---

> 报告就绪。等待 team-lead 对 P0-2 / P0-3 决策后立即开始 P0-1 + P1-2 + P1-4 修复。
