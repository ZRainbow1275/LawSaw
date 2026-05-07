# Dark Mode 预扫描报告 (Phase 1)

**时间**: 2026-05-07
**审计范围**: `apps/web/src/**/*.{tsx,ts}`
**扫描方式**: Grep 正则 4 类硬编码模式

## 总体命中数（修复前）

| 模式 | 文件数 | 命中数 |
|------|--------|--------|
| 硬编码 hex (`#xxxxxx` / `#xxx`) | 62 | 354 |
| `bg-(white\|black\|gray-\d+\|...)` 无 dark: 前缀 | 80 | 257 |
| `text-(white\|black\|gray-\d+\|...)` | 70 | 469 |
| `border-(white\|black\|gray-\d+\|...)` | 39 | 132 |
| inline `style={{ color: ... }}` 硬色 | 4 | 4 |
| `rgba?(...)` 内联 | 26 | ~50 |
| **合计（去重前）** | — | **~1212 处** |

> 注：相同文件可能多模式命中。`globals.css` 已有完整 dark token 体系（`@theme` + `.dark` 双套，覆盖 status / category / shadow / admin / brand-gradient / surface / feedback / risk）。本次任务**不需要重做 token，只补全消费者侧引用**。

## 按优先级分类

### P0 — UI primitives (`apps/web/src/components/ui/*`)
**必须全审一遍**：
- `badge.tsx` — bg-1 / text-5 / border-1
- `button.tsx` — bg-3 / text-5 / border-1
- `card.tsx` — bg-1 / text-2 / border-1
- `input.tsx` — bg-2 / text-1 / border-1 / hex-1
- `modal.tsx` — bg-4 / text-2 / border-3
- `toast.tsx` — bg-1 / text-3
- `skeleton.tsx` — bg-5 / border-7
- `empty-state.tsx` — bg-1 / text-3
- `swipeable-card.tsx` — bg-2 / text-6
- `security-indicator.tsx` — bg-2 / text-6 / border-1
- `animated-number.tsx` — text-3
- `tilt-card.tsx` — rgba 内联
- `kpi-card.tsx`, `confirm-action-modal.tsx` — 复审

### P1 — Layout 容器
- `components/layout/header.tsx` — bg / text / border 多处
- `components/layout/breadcrumbs.tsx`
- `components/layout/notification-bell.tsx`
- `components/layout/reader-layout.tsx`
- `components/layout/search-overlay.tsx`
- `components/layout/persistent-user-shell.tsx`（Diff M 中）
- `components/auth/protected-route.tsx`（Diff M 中）

### P2 — 业务组件
- `components/article/article-card.tsx` — bg / text / border 12+5+2
- `components/article/article-actions.tsx`
- `components/article/ai-insights.tsx` — text-16
- `components/article/reading-settings.tsx` — text-17
- `components/article/reading-progress.tsx`
- `components/article/selection-toolbar.tsx`
- `components/article/table-of-contents.tsx`
- `components/article/media-preview.tsx`
- `components/article/markdown-source-view.tsx`
- `components/article/paragraph-anchor.tsx`
- `components/dashboard/dashboard-page-content.tsx`
- `components/dashboard/category-overview.tsx`
- `components/dashboard/stats-cards.tsx`
- `components/me/me-settings-page.tsx`（Diff M 中）
- `components/me/settings-billing-tab.tsx`
- `components/me/settings-notifications-tab.tsx`
- `components/user/me-feed-page.tsx`
- `components/user/feed-hero.tsx`
- `components/reports/user-report-list.tsx`（Diff M 中）
- `components/reports/user-report-reader.tsx`（Diff M 中）
- `components/reports/report-detail.tsx`
- `components/reports/report-export-dialog.tsx`
- `components/reports/create-report-dialog.tsx`
- `components/reports/subscription-panel.tsx`
- `components/notifications/notification-drawer.tsx`
- `components/notifications/notification-center-page.tsx`
- `components/notifications/notifications-modal.tsx`
- `components/auth/login-form.tsx`
- `components/auth/register-form.tsx`
- `components/settings/tabs.tsx` — text-61!
- `components/knowledge/*` — text 大量
- `components/feedback/prototype/feedback-page.tsx`（Diff M 中）

### P3 — Admin 页面（不含 reactions/）
- `components/admin/admin-permissions-matrix.tsx`
- `components/admin/admin-relations-matrix.tsx`
- `components/admin/admin-categories-tree.tsx`
- `components/admin/ai-usage-dashboard.tsx`
- `components/admin/banner-preview.tsx`
- `components/admin/banner-form.tsx`
- `components/admin/source-detail-drawer.tsx`
- `components/admin/tenant-detail-drawer.tsx`
- `components/admin/user-detail-drawer.tsx`
- `components/admin/entity-detail-drawer.tsx`
- `components/admin/channel-detail-drawer.tsx`
- `components/admin/feedback-reply-drawer.tsx`
- `components/admin/report-template-drawer.tsx`

### Page-level / shell-default
- `app/[locale]/(shell-default)/me/page.tsx`
- `app/[locale]/(shell-default)/data/page.tsx`
- `app/[locale]/(shell-default)/search/page.tsx`
- `app/[locale]/(shell-default)/settings/page.tsx`
- `app/[locale]/(shell-default)/sources/page.tsx`
- `app/login/page.tsx`, `app/register/page.tsx`
- `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx`

## 排除范围（禁触）

- `apps/web/src/app/[locale]/admin/insights/reactions/**`
- `apps/web/src/components/admin/insights/reactions/**`

## 修复策略

1. **硬编码 hex** → CSS token (`var(--color-*)` / `var(--surface-*)` 等)
2. **Tailwind 单色阶** → 加 `dark:` 修饰 或 改用 token
3. **inline color** → className + token
4. **chart 轴文字** → `var(--field-foreground)` / `var(--surface-muted-text)`
5. **必要时新增 token** 到 `globals.css`

> Phase 2 修复明细见各组件 diff，Phase 4 报告中汇总。
