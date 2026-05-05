# 修复计划 (2026-05-05)

> 输入：[`00-DIAGNOSTIC.md`](00-DIAGNOSTIC.md) / [`01-DESIGN-TOKENS.md`](01-DESIGN-TOKENS.md) / [`03-I18N-AUDIT.md`](03-I18N-AUDIT.md)。
> 范围：用户选 B（client + admin 同修），prd 改写后纳入 `04-29-ui-restore-prototype-1to1`。

---

## PR 切分总览

```
PR1  外壳收敛       (P0)  →  消除 settings/admin/* 双路由 + 双 chrome
PR2  详情页补全     (P0)  →  填空 admin/[id]、admin/.../new、feedback、reports/[id]
PR3  zh-strict      (P0)  →  补 503 条缺失翻译 + dev throw + CI 守卫
PR4  prototype 接线 (P1)  →  把已有的 components/*/prototype/* 切上 dashboard/articles/knowledge/reports/analytics
PR5  布局收纳       (P1)  →  knowledge/audit/dashboard 加 flex-1 min-h-0 overflow-y-auto
PR6  数据清洗       (P2)  →  替换 HackerNews seed → 中文样例；删 CRUD 测试残留
PR7  edge polish    (P2)  →  avatar 统一、login next 修、breadcrumb 间距对齐
```

每个 PR 由独立 team agent 并行执行（详见 `agents-brief.md`）。

---

## PR1 — 外壳收敛 (P0)

### 范围
- 删除 `apps/web/src/app/[locale]/settings/admin/**` 整个目录树（13 个 page.tsx）。
- 在 `apps/web/next.config.*` 增加 redirects：
  ```ts
  { source: '/:locale(zh|en)/settings/admin/:path*', destination: '/:locale/admin/:path*', permanent: true }
  ```
- 修 `apps/web/src/app/[locale]/admin/reports/runs/page.tsx` 与 `.../reports/new/page.tsx`：去掉 page 内自渲染的 `<Sidebar/>`+`<Header/>`+`<MainContent/>`，让 admin layout 提供 chrome（参考 `admin/users/page.tsx` 已 native 的写法）。
- 统一 admin breadcrumb 间距 `gap-2`、avatar 统一用 `<Avatar>`组件、logo 渐变统一 `bg-gradient-cta`。
- 修 `apps/web/src/app/[locale]/login/page.tsx` 的 `next` 参数透传：登录成功后 `router.push(searchParams.get('next') ?? '/${locale}/dashboard')`。

### 验收
- [ ] `/zh/settings/admin/audit` 直接 308 → `/zh/admin/audit`，浏览器 URL bar 一次切换，无 spinner。
- [ ] `/zh/settings/admin/sources` 与 `/zh/settings/admin/tenants` 不再 404。
- [ ] `/zh/admin/reports/runs` 只有一层 sidebar+topbar。
- [ ] `/zh/login?next=/admin` 登录后落到 `/zh/admin`，不是 `/zh`。
- [ ] Playwright 视觉回归 admin 14 个路由 chrome 一致。

### 文件清单
```
DEL apps/web/src/app/[locale]/settings/admin/(整个目录)
MOD apps/web/next.config.ts | next.config.mjs（重定向）
MOD apps/web/src/app/[locale]/admin/reports/runs/page.tsx
MOD apps/web/src/app/[locale]/admin/reports/new/page.tsx
MOD apps/web/src/app/[locale]/admin/reports/templates/[id]/page.tsx（同检查）
MOD apps/web/src/app/[locale]/login/page.tsx
MOD apps/web/src/components/admin/admin-breadcrumb.tsx（gap-2）
MOD apps/web/src/components/layout/sidebar.tsx（logo 渐变）
```

---

## PR2 — 详情页补全 (P0)

### 范围
逐个填实下列空白页（main 区目前 0 个 input/0 个 child）：

| 路由 | 改动 |
|---|---|
| `/zh/feedback` | 修 `app/[locale]/feedback/page.tsx` 的转发链 — 不要再 `export { default } from "../../feedback/page"`，直接把内容内联到 [locale]/feedback。或重写 `app/feedback/page.tsx` 不依赖外层 layout |
| `/zh/admin/banners/new` | 实装 banner 创建表单（fields: title / content_md / target_audience / start_at / end_at / is_dismissable / priority）；提交调 POST /admin/banners |
| `/zh/admin/channels/[id]` | 实装频道详情：基本信息卡 + 来源列表 + 发布日历 + 编辑/归档按钮 |
| `/zh/admin/sources/[id]` | 实装来源详情：抓取配置 + 最近 50 条抓取记录 + 失败统计 |
| `/zh/admin/feedbacks/[id]` | 实装反馈详情：用户消息 + 状态切换 + 管理员回复（关联 admin_reply 字段） |
| `/zh/admin/knowledge/[id]` | 实装实体详情：实体属性 + 引用文章列表 + 关联实体小图 |
| `/zh/admin/users/[id]` | 修 60s 超时 — 检查 `useUserDetail` 是否死循环 / API 是否要求 admin 角色但 hook 没传 token；timeout 改 5s 后显式报错 |
| `/zh/reports/[id]` | 路由 schema 改：支持 UUID 与 `RPT-yyyymmdd-NNNN` 两种格式；后者按报告号查询 |

### 验收
- [ ] 每个修复路由 docHeight > 1200，main 区 child 数 > 5。
- [ ] 表单页提交可走通 happy path（用 admin@qa.lawsaw.local 登录后实际创建）。
- [ ] `/zh/reports/RPT-20260505-0004` 不再报 UUID 解析错。
- [ ] `/zh/feedback` 渲染完整反馈 UI（类型选择 + 表单 + 我的反馈列表）。

### 文件清单
```
MOD apps/web/src/app/[locale]/feedback/page.tsx
MOD apps/web/src/app/feedback/page.tsx
NEW apps/web/src/app/[locale]/admin/banners/new/banner-form.tsx
NEW apps/web/src/app/[locale]/admin/channels/[id]/channel-detail.tsx
NEW apps/web/src/app/[locale]/admin/sources/[id]/source-detail.tsx
NEW apps/web/src/app/[locale]/admin/feedbacks/[id]/feedback-detail.tsx
NEW apps/web/src/app/[locale]/admin/knowledge/[id]/entity-detail.tsx
MOD apps/web/src/components/admin/user-detail-drawer.tsx（如属此页）
MOD apps/web/src/app/[locale]/reports/[id]/page.tsx（schema 兼容）
MOD apps/api/src/routes/reports.rs?（如需后端联调）
```

---

## PR3 — zh-strict (P0)

### 范围
1. 把 [`data/missing-zh-keys.txt`](data/missing-zh-keys.txt) 503 条全部翻译并补入 `apps/web/src/messages/zh.json` 与 `en.json`。
2. 修 `lib/i18n.ts::t()`：dev 环境 missing key 时 `console.error`（保留生产兜底）。
3. 新增 `apps/web/scripts/check-i18n-coverage.mjs`，挂到 `package.json::scripts.check`、`turbo.json::pipeline.check.outputs`、`.github/workflows/ci.yml`。
4. 修 `apps/web/src/components/admin/audit-log-table.tsx`：`event_type` 列改用映射 `auditEventLabels[event] ?? t(event)`。

### 验收
- [ ] `pnpm --filter web check` 退出码 0。
- [ ] `console.error([i18n] missing key)` 在 dev 跑 `/zh/admin/users` 时**不出现**。
- [ ] `/zh/admin/audit` 不再渲染 `user.login` 等枚举。
- [ ] zh.json 翻译通顺，无机翻痕迹（按 `03-I18N-AUDIT.md §7` 风格）。

### 文件清单
```
MOD apps/web/src/messages/zh.json   (+503 条)
MOD apps/web/src/messages/en.json   (确保 en 也有这些键)
MOD apps/web/src/lib/i18n.ts        (+dev throw)
NEW apps/web/scripts/check-i18n-coverage.mjs
MOD apps/web/package.json           (scripts.check)
MOD .github/workflows/ci.yml         (jobs: i18n-check)
MOD apps/web/src/components/admin/audit-log-table.tsx
NEW apps/web/src/lib/audit-event-labels.ts
```

---

## PR4 — prototype 接线 (P1)

### 范围
切上 `components/*/prototype/*` 已写好的视觉 1:1 组件：

| 路由 | 替换 |
|---|---|
| `/zh/dashboard` | `dashboard-page-content.tsx` 改 import：`DashboardHeroPrototype` + `DashboardStatsStripPrototype` + `DashboardCatFilter` + `DashboardGeoFilter` + `DashboardFeedGrid` + `WorldMapChart` + `DashboardTrendingStripPrototype` + `IndustryChart` |
| `/zh/articles` | `articles-page-content.tsx` 切到 `components/articles/prototype/articles-page.tsx` |
| `/zh/knowledge` | `knowledge-page-content.tsx` 切到 `components/knowledge/prototype/knowledge-page-content.tsx` |
| `/zh/reports` | `reports-page-content.tsx` 切到 `components/reports/prototype/reports-page-content.tsx` |
| `/zh/analytics` | `analytics/page-content.tsx` 切到 `components/analytics/prototype/*` 一整套（trend-area-chart / status-badge-grid / sentiment-bar-chart / industry-panel / region-panel / risk-bar-chart / importance-panel） |

确认 ECharts 依赖已在 package.json（如缺则补 `pnpm add echarts` to apps/web）。

### 验收
- [ ] `/zh/dashboard` 出现 KPI 条 + 世界地图（ECharts）+ 行业图。
- [ ] `/zh/articles` 出现分类 chip + 来源 chip + 分页。
- [ ] `/zh/knowledge` 用 ECharts 图谱（不是 21 个 SVG）。
- [ ] `/zh/analytics` 主区不再空白。
- [ ] 路由页面与 prototype/app.html 同 zoom 截图肉眼一致。

### 文件清单
```
MOD apps/web/src/components/dashboard/dashboard-page-content.tsx
MOD apps/web/src/components/articles/articles-page-content.tsx (or path)
MOD apps/web/src/components/knowledge/knowledge-page-content.tsx
MOD apps/web/src/components/reports/reports-page-content.tsx
MOD apps/web/src/app/[locale]/analytics/page.tsx (or content)
检查 apps/web/package.json 是否有 echarts、echarts-for-react
```

---

## PR5 — 布局收纳 (P1)

### 范围
给溢出页面加内部 scroll container：

| 路由 | 改动 |
|---|---|
| `/zh/knowledge` | knowledge-page-content 顶层 `<div class="grid h-full">` + 列表区 `flex-1 min-h-0 overflow-y-auto`，docH 应 ≤ 1.5×viewport |
| `/zh/admin/knowledge` | 同上 |
| `/zh/admin/audit` | 加表格虚拟滚动 + 分页（page size=50），docH ≤ 1.5×viewport |
| `/zh/dashboard` | 限制 RecentArticles 卡片数为 6，加"查看更多"link，剩余在 /articles |
| `/zh/articles` | 加 12-per-page 分页，docH ≤ 2×viewport |

### 验收
- [ ] 每个目标路由 docHeight / viewportHeight < 1.6（探针已写）。
- [ ] body scroll 不再吞 main scroll。
- [ ] 列表 / 图谱内部独立滚动。

### 文件清单
```
MOD apps/web/src/components/knowledge/prototype/knowledge-page-content.tsx
MOD apps/web/src/components/admin/audit-log-table.tsx
MOD apps/web/src/components/dashboard/recent-articles.tsx
MOD apps/web/src/components/articles/prototype/articles-page.tsx
```

---

## PR6 — 数据清洗 (P2)

### 范围
- 把 `scripts/dev_seed_*.sh` 中 HackerNews 抓取替换为本地中文 fixture（`apps/api/tests/fixtures/articles_zh.json`）。
- `scripts/dev_seed_qa_test.sh` 删除 CRUD 测试残留 ("test"、"qq"、"测试")。
- 在 article 模型加 `title_zh` / `title_en`字段（OPT — 短期方案是直接用中文 seed）。

### 验收
- [ ] `/zh/articles` 渲染中文标题。
- [ ] admin 列表无 "test"/"qq"/"测试"。

---

## PR7 — edge polish (P2)

### 范围
- avatar 统一 `<Avatar>` 组件（admin + client 一致）。
- breadcrumb 间距统一 `gap-2`。
- logo 渐变统一 `bg-gradient-cta`。
- focus-visible ring 统一 primary-500（globals.css 已有，检查覆盖）。
- skip-link 文本走 i18n。

---

## 总验收（autonomous 完成的 exit gate）

`/zh/{dashboard,feed,articles,me/feed,me/articles/[id],reports,reports/[id],analytics,knowledge,feedback,settings}` + `/zh/admin/{tenants,users,users/[id],relations,pins,channels,channels/[id],banners,banners/new,sources,sources/[id],feedbacks,feedbacks/[id],audit,apikeys,ai-usage,ai-governance,reports,reports/runs,reports/new,reports/templates/[id],knowledge,knowledge/[id]}` 共 ~32 路由：

- [ ] 所有路由零英文残留（grep `[A-Z][a-z]{4,}` 在 main innerText 不匹配 ≥ 5 个连续单词）。
- [ ] 所有路由 docHeight / viewportHeight < 1.8。
- [ ] 所有路由有 `<main>` 元素且 main innerText > 200 字符。
- [ ] 所有详情页 main 区 child > 5。
- [ ] 所有路由 5s 内首屏渲染（Playwright timeout 不再触发）。
- [ ] `pnpm --filter web check` 通过。
- [ ] Playwright 回归 32 路由全绿（视觉 + 功能探针）。

完成后进入 `task.py complete`。
