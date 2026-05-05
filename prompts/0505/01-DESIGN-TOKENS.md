# 设计令牌差异 (2026-05-05)

> 数据来源：`prototype/app.html` (1-300 行) vs `apps/web/src/app/globals.css`。
> 关键结论：**令牌已 100% 对齐 — 缺的是组件没消费它们**。

---

## 1. 令牌层级（已就位 ✅）

`globals.css` 已经把 prototype 的所有 CSS 变量迁到 Tailwind v4 `@theme` block：

| 类别 | prototype 原值 | globals.css 落点 | 状态 |
|---|---|---|---|
| primary-50 .. 900 | `#fff4f1`–`#992a07` | `--color-primary-{50..900}` | ✅ 一致 |
| neutral-50 .. 900 | `#f8f9fa`–`#212529` | `--color-neutral-{50..900}` | ✅ 一致（多了 950 = `#0b0f17`） |
| 功能色 | success/warning/error/info | 同名 + `*-light` 变体 | ✅ 一致 |
| cat-* 分类色 | 10 色 | `--color-{legislation,regulation,...}` | ✅ 一致 |
| dash-bg / dash-bg-2 | `#0B1120` / `#111827` | `--color-dash-bg{,-2}` | ✅ 一致 |
| radius | `sm:0.5rem`–`xl:1rem` | `--radius-{sm,md,lg,xl,2xl,pill}` | ✅ 超集 |
| shadow | `sm` / `brand` | `--shadow-{sm,card,card-hover,brand,...}` | ✅ 超集 |
| font-sans | Inter+Noto Sans SC | `--font-sans` | ✅ 一致 |
| glassmorphism | sidebar 92% / topbar 88% | `--glass-{sidebar,topbar}-bg/blur` | ✅ 一致 |
| 渐变（hero/banner/cta/viz） | banner 155deg | `--gradient-{banner,cta,viz-card,...}` 与 `--surface-hero-*-gradient` | ✅ 完整 |
| 暗色 mode | （prototype 无） | `.dark { ... }` 完整 override | ✅ 增强 |

**结论**：globals.css 已完成 SPEC-06 §3 的 token 迁移。**不需要**新增/修改 token。

---

## 2. 组件消费缺口（真问题 ❌）

### 2.1 prototype-aligned 组件已写但未挂载

`components/{dashboard,articles,knowledge,reports,analytics}/prototype/` 下存在一套**已完成的、与 prototype/app.html 1:1 对齐的组件**，但**没有任何路由 import 它们**：

```
components/dashboard/prototype/
├── dashboard-hero-prototype.tsx
├── dashboard-stats-strip-prototype.tsx
├── dashboard-feed-grid.tsx
├── dashboard-cat-filter.tsx
├── dashboard-geo-filter.tsx
├── dashboard-trending-strip-prototype.tsx
├── world-map-chart.tsx          ← ECharts 世界地图
└── industry-chart.tsx
```

```
components/articles/prototype/articles-page.tsx
components/knowledge/prototype/{knowledge-page-content,knowledge-canvas-echarts,entity-inspector-panel,entity-list-panel}.tsx
components/reports/prototype/{reports-page-content,reports-toolbar,report-card,subscription-panel}.tsx
```

而当前路由 import 的是**旧版**：

| 路由 | 当前 import | prototype 替代 |
|---|---|---|
| `/zh/dashboard` | `DashboardHero` / `RecentArticles` / `StatsCards`（旧） | `DashboardHeroPrototype` + `DashboardStatsStripPrototype` + `DashboardFeedGrid` + `WorldMapChart` |
| `/zh/articles` | `ArticlesPage`（无 chip / 无 pagination） | `articles/prototype/articles-page.tsx` |
| `/zh/knowledge` | 自实现 SVG 图谱 | `KnowledgeCanvasEcharts` + `EntityListPanel` + `EntityInspectorPanel` |
| `/zh/reports` | 旧表格 | `reports/prototype/reports-page-content.tsx` |
| `/zh/analytics` | 普通 `<div>` 占位 | `analytics/prototype/*` 一整套 |

### 2.2 token 未被 Tailwind class 引用

15 个文件硬编码了 `#hex` 字面量，应改为 `bg-primary-500` / `text-neutral-700` 等 Tailwind 类（`@theme` 已暴露）。

主要污染源（按硬编码次数排序）：

| 文件 | hex 数 |
|---|---|
| `components/admin/ai-usage-dashboard.tsx` | 21 |
| `components/admin/admin-stats-strip.tsx` | 15 |
| `components/analytics/prototype/industry-panel.tsx` | 10 |
| `components/analytics/prototype/region-panel.tsx` | 9 |
| `components/analytics/prototype/status-badge-grid.tsx` | 8 |
| `components/admin/admin-categories-tree.tsx` | 6 |
| `components/admin/admin-permissions-matrix.tsx` | 5 |

---

## 3. Shell 视觉错位

| 项 | prototype | 当前实现 | 修正 |
|---|---|---|---|
| sidebar 宽度 | 280px (collapsed 64px) | 280px ✅ | — |
| topbar 高度 | 64px | 64px ✅ | — |
| sidebar bg | `rgba(255,255,255,0.92)` | `--glass-sidebar-bg` ✅ | — |
| topbar bg | `rgba(255,255,255,0.88)` | `--glass-topbar-bg` ✅ | — |
| logo 渐变 | `135deg primary-500→600` | `bg-gradient-to-br` 但不一致 | 统一用 `bg-gradient-cta` |
| breadcrumb 间距 | 8px gap | 6-10px 漂移 | 统一 `gap-2` |
| avatar | 34px circle + brand shadow | admin 用 initials、client 用 icon | 统一 `Avatar` 组件 |

---

## 4. 决策

**不动 globals.css。** 修复在组件层：

1. **PR1**：把 5 个客户端路由切到 `components/*/prototype/*` 已写好的实现。
2. **PR2**：admin shell 收敛 — 统一 breadcrumb / avatar / logo。
3. **PR3**：grep 清理硬编码 hex（15 个文件、93 处），改 Tailwind 类。

完整 PR 切分见 `02-FIX-PLAN.md`。
