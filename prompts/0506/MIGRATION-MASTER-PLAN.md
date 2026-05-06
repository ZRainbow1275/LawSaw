# Wave 5 Migration Master Plan — mp4 真值全路由迁移

> 计划日期：2026-05-05
> 输入文档：
> - `prompts/0506/design-system.md`（设计 token + 11 个组件模式手册）
> - `prompts/0506/route-inventory.md`（46 路由 × mp4 × 当前对账）
> - `prompts/0506/mp4-frames-deep/*.png` (149 帧)
> - `prompts/0506/current-routes/*.png` (38 截图)
>
> 总目标：让 mp4 中真实存在的客户端 + admin 后台路由全部按 mp4 风格落地为成熟页面，
> 消除 placeholder / mock 数据语义错乱 / 双 chrome / 大段 i18n 残留 / 渲染断裂。

---

## 0. 工作分批

| Batch | 名称                          | 负责 agent           | 文件白名单 (max)| 依赖          | 入手并行度 |
|-------|-------------------------------|----------------------|-----------------|---------------|------------|
| **B0**| Design tokens & i18n base     | shell-unifier        | 6               | 无 (基础)     | 串行先做   |
| **B1**| Dashboard 真值重写            | prototype-wirer      | 4               | B0 (token)    | B0 之后    |
| **B2**| 客户端 P0 路由组              | prototype-wirer      | 6               | B0            | 与 B1 并行 |
| **B3**| Admin top-level + KPI 化      | shell-unifier        | 8               | B0            | 与 B1/B2 并行 |
| **B4**| Admin 大量 i18n 残留          | i18n-cleaner         | 12              | B0            | 与 B1/B2/B3 并行 |
| **B5**| Detail / drawer / modal       | detail-page-fixer    | 9               | B0            | 与 B1/B2/B3/B4 并行 |
| **B6**| 渲染 bug / 双 chrome / schema | render-doctor (新)   | 6               | B3 之后       | B3 之后    |
| **B7**| Mock 数据语义 + 真实化        | data-realist (新)    | 5               | 无             | 全程并行   |
| **B8**| QA 回归                       | qa-final             | (验证)          | B0~B7         | 末尾       |

> 共 **8 batch + 8 agent**（含 2 新 agent：render-doctor 处理路由错位 / 双 chrome / schema mismatch；data-realist 处理 mock 数据语义错位）。

---

## 1. B0 — Design tokens & i18n base (shell-unifier)

### 文件白名单 (6)

```
apps/web/src/app/globals.css
apps/web/src/messages/zh-CN/common.json
apps/web/src/messages/en/common.json
apps/web/src/components/sidebar/*.tsx (统一 nav items)
apps/web/src/components/topbar/*.tsx
packages/ui/tokens.ts (如存在)
```

### 任务清单 (6)

| #  | 项                                                                                | 工时   |
|----|-----------------------------------------------------------------------------------|--------|
| 1  | 在 globals.css 校准 10 个分类色 token (`--cat-legislation` 至 `--cat-international`) | 轻     |
| 2  | 在 globals.css 添加 `--shadow-brand` 与 `--font-sans` 含 PingFang SC + Noto Sans SC | 轻     |
| 3  | 在 sidebar 统一 nav items 为 mp4 真值 10 项（**新增 sources、data 入项**）         | 中     |
| 4  | sidebar nav-link active 用 4px 左侧条 + primary-700 文字（去掉整行填色）           | 中     |
| 5  | 标准化 KPI 卡组件 → 4-up 响应式，4 个语义色，无装饰 gradient line                  | 中     |
| 6  | i18n 基础：扩展 zh-CN/common.json 含 status (published/draft/...) / risk-level / tier-level / role-name 标准翻译 | 中     |

---

## 2. B1 — Dashboard 真值重写 (prototype-wirer)

### 文件白名单 (4)

```
apps/web/src/app/[locale]/dashboard/page.tsx
apps/web/src/components/dashboard/*.tsx (现有可保留必要组件)
apps/web/src/messages/zh-CN/dashboard.json
apps/web/src/messages/en/dashboard.json
```

### 任务清单 (5)

> ⚠️ wave-4 frame-001 dashboard 风格**作废**。完全按 mp4 sec-001 重写。

| #  | 项                                                                          | 工时   |
|----|-----------------------------------------------------------------------------|--------|
| 7  | 删除/废弃 wave-4 dark hero "监管覆盖动态" + signal coverage rails          | 轻     |
| 8  | 主区改回浅色 (`neutral-50` bg) + 标题 "数据看板/Dashboard" 28/700           | 中     |
| 9  | 4-up KPI 卡：今日资讯 / 活跃信息源 / 待处理 / 风险预警（按 design-system.md §4.3 实现） | 中 |
| 10 | "分类概览" 左卡：累计采集统计 + 10 分类 list (icon + 名 + 数量) — 数据 hook `useCategoryStats` | 重 |
| 11 | "最新资讯" 右卡：list of article rows (risk chip + cat chip + 标题 + 摘要 + 时间) + "查看全部 ↗" 跳到 /articles | 重 |

---

## 3. B2 — 客户端 P0 路由组 (prototype-wirer)

### 文件白名单 (6)

```
apps/web/src/app/[locale]/reports/page.tsx
apps/web/src/app/[locale]/knowledge/page.tsx
apps/web/src/app/[locale]/category/[slug]/page.tsx
apps/web/src/app/[locale]/me/page.tsx
apps/web/src/messages/zh-CN/reports.json
apps/web/src/messages/zh-CN/knowledge.json
```

### 任务清单 (5)

| #  | 项                                                                                  | 工时   |
|----|-------------------------------------------------------------------------------------|--------|
| 12 | reports 主页：替换全部英文 ("Subscribed reports/Recommended reports/Historical archive/No * yet" → 中文) + 副标题中文 | 中 |
| 13 | knowledge KPI 4-up i18n + 副字段中文 ("TOTAL ENTITIES → 实体" 等) + canvas 默认显示 mp4 sec-035 风格 graph (至少 5 节点 demo) | 重 |
| 14 | category/[slug]：cat slug → 中文 mapping table (legislation→立法前沿)；channel slug 隐藏；status chip i18n (published→已发布) | 中 |
| 15 | me 主页：扩展 "未关注分类卡 / 订阅快照卡 / 最近活动" 三个新区，匹配 mp4 sec-040 me-style hero + 4 区布局 | 重 |
| 16 | 全部新增中文 messages 入 zh-CN/{reports,knowledge,me,category}.json，en 同步占位       | 中 |

---

## 4. B3 — Admin top-level + KPI 化 (shell-unifier)

### 文件白名单 (8)

```
apps/web/src/app/[locale]/admin/page.tsx
apps/web/src/app/[locale]/admin/users/page.tsx
apps/web/src/app/[locale]/admin/sources/page.tsx
apps/web/src/app/[locale]/admin/channels/page.tsx
apps/web/src/app/[locale]/admin/banners/page.tsx
apps/web/src/app/[locale]/admin/feedbacks/page.tsx
apps/web/src/app/[locale]/admin/audit/page.tsx
apps/web/src/components/admin/admin-shell.tsx
```

### 任务清单 (6)

| #  | 项                                                                                | 工时 |
|----|-----------------------------------------------------------------------------------|------|
| 17 | admin 主页 5-up KPI 全英文 caps → 中文 ("ACTIVE USERS 24H/ARTICLES 24H/AI TOKENS 24H/PENDING FEEDBACK/AI GATEWAY") | 中 |
| 18 | admin 主页卡片描述：替换 "Visualize roles, permissions.../Manage crawlers.../Tenant settings..." | 轻 |
| 19 | admin/users：替换 Hero ("User management"→"用户目录") + 描述 + 表头 + filter chip + 分页 ("Page 1/1 · Showing 2") | 中 |
| 20 | admin/sources：标题 + 描述 + 4-up KPI 副字段 + filter ("All status/All types") + 行内 ("Never fetched/Articles fetched/Updated:") | 中 |
| 21 | admin/channels：行内 button "Edit/关闭/开启" 统一中文；filter "All visibility" → "全部可见性" | 轻 |
| 22 | admin/banners 预览卡文字对比度修复 (添加 `text-shadow: 0 1px 2px rgba(0,0,0,0.3)` 或暗化 overlay) | 轻 |

---

## 5. B4 — Admin 大量 i18n 残留 (i18n-cleaner)

### 文件白名单 (12)

```
apps/web/src/app/[locale]/admin/permissions/page.tsx
apps/web/src/app/[locale]/admin/categories/page.tsx
apps/web/src/app/[locale]/admin/tenants/page.tsx
apps/web/src/app/[locale]/admin/relations/page.tsx
apps/web/src/app/[locale]/admin/feedbacks/page.tsx (行内 "Open ticket")
apps/web/src/messages/zh-CN/admin/permissions.json (新建/扩充)
apps/web/src/messages/zh-CN/admin/categories.json (新建/扩充)
apps/web/src/messages/zh-CN/admin/tenants.json
apps/web/src/messages/zh-CN/admin/relations.json
apps/web/src/messages/zh-CN/admin/feedbacks.json
apps/web/src/messages/zh-CN/admin.json (top-level 通用)
apps/web/src/messages/en/admin/* (同步)
```

### 任务清单 (5)

| #  | 项                                                                                | 工时 |
|----|-----------------------------------------------------------------------------------|------|
| 23 | admin/permissions：50+ 行 row name + slug 中文化 (Read articles → 阅读资讯 / articles:read 保留 slug 不译) + footer "Backend endpoints..." | 重 |
| 24 | admin/categories：标题 + 描述 + tree 操作 ("Bulk import CSV/New root category/Tree/Expand all/Collapse all/BASIC/Metadata.../SORT ORDER/ARTICLES IN BRANCH/AI CATEGORIZATION ACCURACY/Awaiting B.6b telemetry/Add child/Edit") | 重 |
| 25 | admin/tenants：access denied state ("Super-admin only.../Tenants management is restricted.../Switch to a super-admin account...") | 中 |
| 26 | admin/relations：3 form 卡 input 默认值与 placeholder 中文化                       | 中 |
| 27 | admin/feedbacks：行内 "Open ticket" → "处理工单"                                   | 轻 |

---

## 6. B5 — Detail / drawer / modal (detail-page-fixer)

### 文件白名单 (9)

```
apps/web/src/app/[locale]/admin/sources/[id]/page.tsx
apps/web/src/app/[locale]/admin/banners/new/page.tsx
apps/web/src/app/[locale]/admin/users/[id]/page.tsx
apps/web/src/app/[locale]/admin/channels/[id]/page.tsx
apps/web/src/app/[locale]/admin/feedbacks/[id]/page.tsx
apps/web/src/app/[locale]/admin/knowledge/[id]/page.tsx
apps/web/src/app/[locale]/admin/reports/templates/[id]/page.tsx
apps/web/src/messages/zh-CN/admin/source-detail.json
apps/web/src/messages/zh-CN/admin/banner-form.json
```

### 任务清单 (4)

| #  | 项                                                                                | 工时 |
|----|-----------------------------------------------------------------------------------|------|
| 28 | admin/sources/[id] drawer：tabs ("Run history/Article preview" → "运行历史/文章预览") + 字段 ("URL/SCHEDULE/RENDER MODE/ENCODING/ARTICLES FETCHED/CONSECUTIVE FAILURES/AVG FETCH DURATION/LAST FETCH/CONFIG/Test fetch/Trigger fetch/No structured config recorded/Triggers a one-off ingest run.../Worker default") | 重 |
| 29 | admin/banners/new drawer：表单 ("OPERATIONAL BANNER/BANNER CONTENT (MARKDOWN)/Audience tiers/Choose which user tiers.../Channel scope/Leave empty.../Schedule/STARTS AT/ENDS AT/Optional CTA label") | 重 |
| 30 | admin/users/[id]：详情页头 + 权限/审计 tab 中文化 + 缺则补 (mp4 无直接覆盖，参考 mp4 sidebar tier-name)  | 中 |
| 31 | admin/{channels,feedbacks,knowledge,reports/templates}/[id]：4 详情页统一 i18n + KPI 头 + 缺 hero 则补 | 中 |

---

## 7. B6 — 渲染 bug / 双 chrome / schema (render-doctor 新 agent)

### 文件白名单 (6)

```
apps/web/src/app/[locale]/admin/reports/new/page.tsx
apps/web/src/app/[locale]/admin/reports/runs/page.tsx
apps/web/src/app/[locale]/admin/reports/layout.tsx (如存在)
apps/web/src/app/[locale]/admin/categories/page.tsx (双 chrome 修复)
apps/web/src/lib/api/contracts/ai-governance.ts (schema relax)
apps/web/src/app/[locale]/admin/ai-usage/page.tsx (graceful fallback)
```

### 任务清单 (4)

| #  | 项                                                                                | 工时 |
|----|-----------------------------------------------------------------------------------|------|
| 32 | admin/reports/new + runs：诊断双渲染 — 是否同时渲染了 user shell layout + admin shell layout？修正 layout 链。**不能用 query alias 实现**，应用真实子路由 + admin layout group | 重 |
| 33 | admin/categories：双 chrome 移除 — 强制使用 admin/layout.tsx 的 chrome，不允许内嵌 user shell topbar/breadcrumb (检查 page.tsx 是否误导入 user 组件) | 中 |
| 34 | admin/ai-governance schema relax：experiment_key 字段从 enum 改为 `string` (向后兼容真实 + 测试 UUID 化数据)；或后端联调追加 enum 值 | 中 |
| 35 | admin/ai-usage graceful fallback：API 失败时显示模拟空状态 + 提示 "暂无数据" 而非 error；保留 retry 按钮 | 中 |

---

## 8. B7 — Mock 数据语义 + 真实化 (data-realist 新 agent)

### 文件白名单 (5)

```
apps/web/src/app/[locale]/me/feed/page.tsx (移除 HN 英文 mock)
apps/web/src/app/[locale]/me/notifications/page.tsx (audit → notification 转换)
apps/web/src/app/[locale]/articles/page.tsx (channel slug → cat 映射)
apps/web/src/app/[locale]/articles/[id]/page.tsx (正文渲染)
apps/web/src/lib/seed/zh-articles.ts (新建中文资讯种子)
```

### 任务清单 (5)

| #  | 项                                                                                | 工时 |
|----|-----------------------------------------------------------------------------------|------|
| 36 | 创建 `lib/seed/zh-articles.ts` — 10 篇真实中文 mock 资讯（标题+摘要+正文+cat+risk+source）；替代 HN/英文垃圾 | 重 |
| 37 | me/feed：移除"用户工作区"切换条 (双 chrome 起因)；list 用 zh-articles seed              | 中 |
| 38 | me/notifications：将 audit.login 事件**不**显示为通知；改为后端真实 notification API 或本地 mock notification (10 条 zh) | 中 |
| 39 | articles list：channel slug ("scroll-text/building-2/scale") **隐藏**；按 cat_id → 分类名 mapping 显示 | 中 |
| 40 | articles/[id]：正文 markdown 渲染（当前仅显示 URL）— 加 fallback "暂无正文，点击 ↗ 查看原文" | 中 |

---

## 9. B8 — QA 回归 (qa-final)

### 任务

| #  | 项                                                              | 工时 |
|----|-----------------------------------------------------------------|------|
| 41 | Playwright re-walk 全 46 路由 (zh + en + admin) + onboarding 流  | 重   |
| 42 | 对比 prompts/0506/current-routes/*.png 验证 P0 / P1 全部解决     | 中   |
| 43 | console error 全栈扫描 0 error 验收                             | 中   |
| 44 | 撰写 wave 5 final report，列出每条 fix item 的 before/after 截图 | 重   |

---

## 10. 总工时估算

| Batch | 工时数 | 估算总时（轻=0.5h / 中=1.5h / 重=4h） |
|-------|--------|---------------------------------------|
| B0    | 6      | 4h                                    |
| B1    | 5      | 14h                                   |
| B2    | 5      | 12h                                   |
| B3    | 6      | 6h                                    |
| B4    | 5      | 11h                                   |
| B5    | 4      | 11h                                   |
| B6    | 4      | 7h                                    |
| B7    | 5      | 12h                                   |
| B8    | 4      | 10h                                   |
| **合计** | **44 fix items** | **~87h** |

> 8 个 agent 并行 → 实际墙钟约 12-16 小时（B0 串行先行，B1-B7 大并行，B8 末尾）。

---

## 11. 验收标准

- [ ] 全部 46 路由按 design-system.md 风格落地，无 placeholder / 双 chrome / 渲染断裂
- [ ] zh 路由无大段英文残留（caption / footer / drawer 字段全部中文化）；保留代码 slug (例 `articles:read`) 不译
- [ ] dashboard 完全按 mp4 sec-001 风格（**废弃 wave-4 frame-001**），与 sec-001 像素差距 < 5%
- [ ] sidebar 含 mp4 真值 10 项 nav（含 sources、data）
- [ ] mock 数据语义对齐：me/feed 无 HN 英文，notifications 不显示 audit
- [ ] admin/ai-governance 不再 schema 报错 / admin/ai-usage 不再永久 error / admin/reports/new+runs 不再双渲染
- [ ] Playwright re-walk 0 console error
- [ ] 4 文档（design-system / route-inventory / 本 plan / wave-5 final report）入仓

---

## 12. 风险与对策

| 风险                                                          | 对策 |
|---------------------------------------------------------------|------|
| dashboard 重写删 wave-4 代码可能影响其他依赖该 hero 的组件     | B1 第一步先全局搜引用，必要时保留组件但不在 dashboard 用 |
| sidebar nav 新增 sources/data 导致已有 admin layout 排版抖动  | B0 第 3 步 sidebar 必须经过 admin layout + user layout 双场景 verify |
| schema relax 可能放过真实 bug                                  | B6 第 34 步 schema 改为 union (enum + uuid pattern)，避免完全 string |
| i18n 大批量 string 修改可能触发 type 错误                      | 使用 next-intl key 化，避免 inline ternary，B0 最先建 message tree |
| 双 chrome 修复改动 layout 文件可能波及全局                     | B6 第 32-33 步先 grep `useTopbar` / `<Topbar>` / `<Sidebar>` 全引用，再决定改哪一处 |

---

## 13. Agent 任务发车清单

| Agent              | 收到的 task 文件 / 文档段                                                                              |
|--------------------|--------------------------------------------------------------------------------------------------------|
| shell-unifier      | design-system.md §1-§3 + 本 plan §1 (B0) + §4 (B3)                                                     |
| prototype-wirer    | design-system.md §4 + 本 plan §2 (B1) + §3 (B2) + mp4-frames-deep/{sec-001,half-035,sec-040}.png       |
| i18n-cleaner       | route-inventory.md §E.2 + 本 plan §5 (B4)                                                              |
| detail-page-fixer  | route-inventory.md §E.14/§E.15 + 本 plan §6 (B5)                                                       |
| render-doctor (新) | route-inventory.md §E.3/§E.4/§E.5/§E.6 + 本 plan §7 (B6)                                               |
| data-realist (新)  | route-inventory.md §E.9 + design-system.md §6 + 本 plan §8 (B7)                                        |
| qa-final           | 全部 (验收准则)                                                                                        |
