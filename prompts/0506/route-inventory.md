# Route Inventory — mp4 真值 × 当前实现对账

> 评估日期：2026-05-05
> 视频源：`prototype/27c693ebed1bb8a13893d6f2511e8b0b_raw.mp4` (45s, 149 deep frames)
> 当前截图根目录：`prompts/0506/current-routes/`
> 视频帧根目录：`prompts/0506/mp4-frames-deep/`
> 登录身份：admin@qa.lawsaw.local (tenant_admin role)

## 评分含义

- **mp4 覆盖**：mp4 是否展示该路由 → 直接证据 / 间接证据 (推断) / 无
- **状态**：native (原生 React 页) / placeholder (空壳) / re-export (转发到旧路由) / missing (404 / 未实现)
- **视觉差距**：
  - 高：双 chrome / 渲染断裂 / API 失败 / 大段 i18n 残留 / 完全偏离 mp4 风格
  - 中：单点 i18n 残留 / KPI 缺失 / mock 数据语义错误 / 局部布局
  - 低：纯文字 polish / icon 微调
- **修复优先级**：P0 (本轮必修) / P1 (本轮必修) / P2 (次要 / 拓展)

---

## A. 客户端路由（不含 admin）

| # | 路由                              | mp4 覆盖 | 当前截图                     | 当前状态 | 视觉差距 | 关键问题                                                         | 优先级 |
|---|-----------------------------------|----------|------------------------------|----------|----------|------------------------------------------------------------------|--------|
| 1 | `/zh/dashboard`                   | sec-001  | 01-dashboard.png             | native   | **高**   | 完全错配 — wave-4 frame-001 hero 风格，mp4 真值是浅色 4-up KPI + 分类概览 + 最新资讯 | **P0** |
| 2 | `/zh/me/feed`                     | sec-001 (类似) | 08-me-feed.png       | native   | 中       | 双 chrome (用户工作区切换条 + topbar 重叠)；mock 全英文 HN 文章；橙色 hero 卡 OK    | P1     |
| 3 | `/zh/articles`                    | half-035 | 02-articles.png              | native   | 中       | cat chip OK，但 list item 显示原始 channel slug (building-2/scroll-text)，缺真实 cat 映射 | P1     |
| 4 | `/zh/articles/[id]`               | sec-008/012 | 32-article-detail.png    | native   | 低       | 沉浸式视图 100% 匹配 mp4，正文内容数据问题 (仅显示 URL，缺正文 markdown)         | P1 (数据)|
| 5 | `/zh/sources`                     | sec-001 (sidebar 项) | 03-sources.png | native | 低       | 3 KPI + list 接近 mp4，仅缺 status filter chip                                 | P2     |
| 6 | `/zh/reports`                     | 间接 (sec-001 nav) | 04-reports.png   | native   | **高**   | 大量英文残留 ("Subscribed reports/Recommended reports/Historical archive/No subscribed reports yet") | **P0** |
| 7 | `/zh/reports/[id]`                | 无       | 未抓 (动态)                  | native   | 中 (推断)| 详情页应有标题 + meta + chapters + 正文                                      | P1     |
| 8 | `/zh/analytics`                   | sec-045  | 05-analytics.png             | native   | 低       | **几乎完美匹配 mp4**：5 tabs + 4-up KPI + 风险/情感分布 + 7 天趋势 + 分类统计  | P2 (polish)|
| 9 | `/zh/knowledge`                   | sec-020/035 | 06-knowledge.png          | native   | 中       | 4-up KPI 全英文残留 ("TOTAL ENTITIES/RELATIONS/VECTOR READY ENTITIES"); canvas 默认空 (mp4 是有 graph) | **P0** |
|10 | `/zh/feedback`                    | sec-040  | 07-feedback.png              | native   | 低       | **完美匹配 mp4** 提交反馈卡 + 4 chip + 我的反馈卡                              | P2     |
|11 | `/zh/settings`                    | 间接 (sec-005 nav) | 09-settings.png  | native   | 低       | 8 tabs (个人/通知/外观/安全/API/系统/租户/Webhook) — 比 mp4 多 2 tab，扩展 OK   | P2     |
|12 | `/zh/me`                          | 间接     | 31-me.png                    | native   | 中       | 完整橙色 hero + 账户信息 + 阅读统计 + 快捷操作；缺：未关注分类/订阅/最近活动     | P1     |
|13 | `/zh/me/notifications`            | half-005 (popover) | 27-me-notifications.png | native | 中  | 视觉 OK；但内容是 audit.login 事件而非真实通知 (语义错位)                      | P1     |
|14 | `/zh/me/reading-history`          | 间接     | 28-me-reading-history.png    | native   | 低       | filter chip + empty state OK；缺真实 mock 数据展示                            | P2     |
|15 | `/zh/me/articles/[id]`            | sec-008/012 | 未抓 (与 articles/[id] 同) | native | 低     | 同 articles/[id]                                                              | P1 (数据)|
|16 | `/zh/me/settings`                 | 重定向到 /zh/settings | (重定向)          | native   | —        | 路由别名                                                                       | P2     |
|17 | `/zh/data`                        | sec-001 (sidebar 项) | 29-data.png    | native   | 中       | breadcrumb "Data Sources" 英文残留；table 风格 OK                              | P1     |
|18 | `/zh/category/[slug]`             | half-035 (类似) | 30-category-legislation.png | native | 中  | breadcrumb "Legislation" / channel slug "scroll-text" / status "published" 全英文残留 | **P0** |
|19 | `/zh/search`                      | half-005 (search popover) | 33-search.png | native | 低 | search input + 关键词搜索/AI 问答 toggle OK；空态 "Please enter at least 3 characters" 英文 | P1 |
|20 | `/zh/login`                       | 无       | (流程已用，未单独抓)         | native   | 低 (推断)| 标准登录表单                                                                   | P2     |
|21 | `/zh/register`                    | 无       | 未抓                         | native   | 低 (推断)| 标准注册表单                                                                   | P2     |
|22 | `/zh` (locale 根)                 | 无       | (重定向 dashboard)           | native   | —        | 路由别名                                                                       | P2     |

> 裸根路由 (无 [locale])：`/dashboard`, `/articles`, `/me/...` 等**不应直接暴露**，应通过 locale 中间件强制重定向到 `/zh` 或 `/en`。
> 此项已通过 P1.x 任务部分修复，本轮验证。

## B. Admin 路由 (26 项)

| # | 路由                                    | mp4 覆盖 | 当前截图                       | 当前状态 | 视觉差距 | 关键问题                                                            | 优先级 |
|---|-----------------------------------------|----------|--------------------------------|----------|----------|---------------------------------------------------------------------|--------|
| 23| `/zh/admin`                             | 无       | 10-admin.png                   | native   | **高**   | KPI 全英文 caps ("ACTIVE USERS 24H/ARTICLES 24H/AI TOKENS 24H/PENDING FEEDBACK/AI GATEWAY/Visualize roles/Manage crawlers/Tenant settings") | **P0** |
| 24| `/zh/admin/users`                       | 无       | 11-admin-users.png             | native   | **高**   | 标题 + 描述 + 表头全英文 ("User management/Browse tenant.../Tenant users/Search email or display name/Invite user/All tiers/Page 1/1 · Showing 2") | **P0** |
| 25| `/zh/admin/users/[id]`                  | 无       | 未抓 (动态)                    | native   | 中 (推断)| 用户详情页通常英文残留 + 缺权限/审计 tab                              | P1     |
| 26| `/zh/admin/sources`                     | 无       | 12-admin-sources.png           | native   | **高**   | 4-up KPI 异色卡 OK，但全英 ("Source management/Configure RSS.../New source/All status/All types/ARTICLES FETCHED/AVG FETCH DURATION/Cumulative.../Average...") | **P0** |
| 27| `/zh/admin/sources/[id]`                | 无       | 37-admin-source-detail.png     | native   | **高**   | drawer 风格 OK；标签 + 字段全英文 ("INGESTION SOURCE/Run history/Article preview/SCHEDULE/RENDER MODE/ENCODING/CONFIG/Test fetch/Trigger fetch/No structured config recorded") | **P0** |
| 28| `/zh/admin/channels`                    | 无       | 13-admin-channels.png          | native   | 中       | 标题 zh OK，但行内 button "Edit/关闭/开启" 混用，filter "All visibility/公开/受限/认证/高级" 混用 | P1 |
| 29| `/zh/admin/channels/[id]`               | 无       | 未抓                           | native   | 中 (推断)| 编辑表单                                                              | P1     |
| 30| `/zh/admin/banners`                     | 无       | 14-admin-banners.png           | native   | 中       | 标题 zh OK；行内 "Edit banner/Duplicate/Always on" 英文                  | P1     |
| 31| `/zh/admin/banners/new`                 | 无       | 35-admin-banners-new.png       | native   | **高**   | drawer 表单全英 ("OPERATIONAL BANNER/BANNER CONTENT (MARKDOWN)/Audience tiers/Choose which user tiers.../Channel scope/Schedule/STARTS AT/ENDS AT/Optional CTA label") | **P0** |
| 32| `/zh/admin/categories`                  | 无       | 25-admin-categories.png        | native   | **高**   | **双 chrome 严重** (admin orange top + 内嵌 user shell topbar/breadcrumb)；全英 ("Categories taxonomy/Manage the multi-level.../Bulk import CSV/New root category/Tree/Expand all/Collapse all/BASIC/Metadata.../SORT ORDER/ARTICLES IN BRANCH/AI CATEGORIZATION ACCURACY/Awaiting B.6b telemetry/Add child/Edit") | **P0** |
| 33| `/zh/admin/pins`                        | 无       | 15-admin-pins.png              | native   | **高**   | 纵向 dump 极长 (40+ 行无分页/filter/KPI)；缺顶层 hero 与 chip 过滤；很多 chip 被裁切显示 "..." | **P0** |
| 34| `/zh/admin/feedbacks`                   | 无       | 16-admin-feedbacks.png         | native   | 低       | 状态 chip + 2x grid card OK；行内 "Open ticket" 英文残留              | P1     |
| 35| `/zh/admin/feedbacks/[id]`              | 无       | 未抓                           | native   | 中 (推断)| 详情页 + 回复表单                                                      | P1     |
| 36| `/zh/admin/audit`                       | 无       | 17-admin-audit.png             | native   | 低       | 中文化基本完成；breadcrumb 残留 "设置 / 管理 / 审计" 老路径痕迹         | P1     |
| 37| `/zh/admin/ai-usage`                    | 无       | 18-admin-ai-usage.png          | native   | **高**   | API 失败显示 error state，但**实际数据无法加载** — 需后端联调或 fallback mock | **P0** |
| 38| `/zh/admin/ai-governance`               | 无       | 19-admin-ai-governance.png     | native   | **高**   | API 契约校验失败 (feedExperimentConfigListResponse — experiment_key 期望 feed_ranking|banner_delivery 实际收到 crud_experiment_xxx) — schema 与后端不匹配，整页 error 无任何 fallback | **P0** |
| 39| `/zh/admin/apikeys`                     | 无       | 20-admin-apikeys.png           | native   | 低       | 中文化基本完成；3 输入 + list                                          | P2     |
| 40| `/zh/admin/permissions`                 | 无       | 24-admin-permissions.png       | native   | **高**   | 权限矩阵几乎全英 (50+ 行 "Write articles/Pin articles/Read sources/Mutate knowledge graph/..."); footer 长英文 "Backend endpoints..."。**i18n 残留量最大** | **P0** |
| 41| `/zh/admin/relations`                   | 无       | 23-admin-relations.png         | native   | 中       | 3 form 卡 OK；input 默认值 "source/tenant/admin/role/tenant_admin" 英文 | P1     |
| 42| `/zh/admin/reports`                     | 无       | 21-admin-reports.png           | native   | 低       | **最完整丰富**：4-up KPI + 状态总览 + 最近投递 + 模板库 + 新建模板表单 — 几乎完美 | P2     |
| 43| `/zh/admin/reports/new`                 | 无       | 36-admin-reports-new.png       | native   | **高**   | **双渲染 bug** — 顶部出现裸 reports 内容 + 又叠 admin shell 完整页面 + "跳到主要内容" a11y 链接残留 | **P0** |
| 44| `/zh/admin/reports/runs`                | 无       | 34-admin-reports-runs.png      | native   | **高**   | **同 reports/new 双渲染 bug**                                          | **P0** |
| 45| `/zh/admin/reports/templates/[id]`      | 无       | 未抓                           | native   | 中 (推断)| 模板编辑器                                                              | P1     |
| 46| `/zh/admin/tenants`                     | 无       | 22-admin-tenants.png           | native   | 中       | access denied state；i18n 残留 ("Super-admin only.../Tenants management is restricted...") | P1 |
| 47| `/zh/admin/knowledge`                   | sec-020 (类似 user) | 26-admin-knowledge.png | native   | 低       | **极完整**：orange hero + 3-up KPI + 治理检索 + 类型分布 + 重复候选 + 中心性榜单 + 共现网络 — zh 化完成 | P2 |
| 48| `/zh/admin/knowledge/[id]`              | 无       | 未抓                           | native   | 中 (推断)| entity 详情 + 合并候选                                                 | P1     |

## C. Settings/admin 旧路由家族 (re-export)

> apps/web/src/app/[locale]/settings/admin/* (14 项) 当前是 re-export 指向 admin/* 主路由。
> 这是 **legacy alias**，不影响 master plan 主路径。但需确保 sidebar/navigation 不再引用旧路径。

| 路由                                   | 状态   | 说明 |
|----------------------------------------|--------|------|
| `/zh/settings/admin/...` (14 项)       | re-export | wave 1-2 已迁移到 admin/* 主路由，本轮 verify 不再出现新链接 |

## D. 裸根路由家族 (无 [locale])

> apps/web/src/app/{dashboard,articles,me,...}/page.tsx 共 18 项。
> 已通过 locale middleware 强制 SSR redirect 到 `/zh/...`，不进入用户视野。
> 本轮不修改裸根，仅作记录。

---

## E. 关键证据表 — Top 15 P0 问题

### E.1 dashboard 风格错配（最高优先级）

- **mp4 真值**：`prompts/0506/mp4-frames-deep/sec-001.png` — 浅色背景 / sidebar (10 项) / 4-up KPI 卡 (今日资讯/活跃信息源/待处理/风险预警) / "分类概览" 左卡 (10 分类 + 数量) + "最新资讯" 右卡 (article rows with risk chip)
- **当前实现**：`prompts/0506/current-routes/01-dashboard.png` — wave-4 frame-001 风格 (深色 hero "监管覆盖动态" + 大 badge calendar + signal coverage rails) — 完全偏离
- **像素级差距**：
  - 主区背景 mp4 = `#f8f9fa` neutral-50；当前 = 深色 `#0B1120`
  - mp4 标题 "数据看板" 28px black on white；当前 "监管覆盖动态" white on black
  - mp4 KPI 4-up 卡，当前是嵌入 dark hero 的 stats
  - mp4 "分类概览" 左 / "最新资讯" 右两卡 50/50；当前替代为 dark hero + 不同布局
- **修复方向**：dashboard/page.tsx 必须**完全重写**为 mp4 sec-001 风格；frame-001 残留废弃。

### E.2 admin/permissions 全英文权限矩阵

- mp4：无（mp4 不覆盖 admin）
- 当前：`prompts/0506/current-routes/24-admin-permissions.png`
- 50+ 行 `Read articles/Write articles/Pin articles/Export articles/Read sources/Write sources/Read knowledge graph/Mutate knowledge graph/Knowledge canvas/Read reports/Generate reports/Analytics overview/Regional analytics/Industry analytics/Cross-dimensional analytics/Read users/Manage users/Read tenants/Manage tenants/Read audit log/Resolve feedback/Manage banners/Read API keys/Issue API keys/Invoke AI gateway` + 顶部 caps `READ-ONLY` + footer "Backend endpoints /api/v1/rbac and /api/v1/admin/permissions are reserved for B.6a..."
- 修复：messages/zh-CN/admin/permissions.json 与 source code 中 hardcoded 文案

### E.3 admin/reports/new + /runs 双渲染 bug

- 当前：`prompts/0506/current-routes/34-admin-reports-runs.png`、`36-admin-reports-new.png`
- 现象：顶部裸 reports 内容 (无 admin top chrome) + 下方又叠 admin shell + "跳到主要内容" a11y 链接残留
- 推测：`/admin/reports/new` 与 `/admin/reports/runs` 路由实际是 query alias (页面 URL 显示 `?create=1` / `?tab=runs`)，但 layout.tsx 渲染了 root layout 又渲染 admin layout。
- 修复方向：检查 admin/reports/{new,runs}/page.tsx 是否正确包含在 admin/layout.tsx 之下，移除多余 chrome。

### E.4 admin/categories 双 chrome

- 当前：`prompts/0506/current-routes/25-admin-categories.png`
- 现象：顶部一条深橙 admin top chrome + 下方又一条 user-shell topbar + breadcrumb 重复
- 修复方向：admin/categories/page.tsx 应使用 admin layout 的 chrome 而非自带 user shell 包装

### E.5 admin/ai-governance schema 错位

- 当前：`prompts/0506/current-routes/19-admin-ai-governance.png`
- 现象：API 契约校验失败 — `experiment_key` 字段期望枚举 `feed_ranking | banner_delivery`，实际收到 `crud_experiment_1777952097318` (UUID 化测试值)
- 修复方向：要么放宽 client schema (allow string)，要么后端返回符合 enum 的真实数据。task #15 wave 2 已尝试 schema relax，仍残留。

### E.6 admin/ai-usage 数据加载失败

- 当前：`prompts/0506/current-routes/18-admin-ai-usage.png`
- 现象：error state 设计 OK，但实际 API 调用失败导致**永远** error
- 修复方向：要么后端实现 endpoint，要么前端添加 graceful empty fallback

### E.7 admin/pins 缺分页 + 内容裁切

- 当前：`prompts/0506/current-routes/15-admin-pins.png`
- 现象：40+ 行纵向 dump，每行内容裁切显示 "..."，无分页 / 无 filter / 无 KPI
- 修复方向：限制 `?limit=20` + 添加 status/scope filter chip + 添加顶部 "已置顶 N 篇" 简易统计

### E.8 admin/banners 预览 banner 文字对比度不足

- 当前：`prompts/0506/current-routes/14-admin-banners.png`
- 现象：白色文字叠在浅橙 gradient 上，几乎不可读
- 修复方向：banner card 添加文字 shadow 或暗化 gradient overlay

### E.9 me/feed 双 chrome + mock 全英 HN 文章

- 当前：`prompts/0506/current-routes/08-me-feed.png`
- 现象：顶部"用户工作区"切换条与下方 user-shell topbar 共存 (双 chrome)；列表 mock 全是英文 HN content (Tesla, OpenClaw, JASSM-ER...)
- 修复方向：移除"用户工作区"切换 (admin user 在 admin namespace 切换)；mock 切换为真实 zh 文章

### E.10 knowledge 4-up KPI 全英文 caps

- 当前：`prompts/0506/current-routes/06-knowledge.png`
- 现象：4 个 KPI 顶部小字全是 "TOTAL ENTITIES / TOTAL RELATIONS / 文章关联 (本身已 zh) / VECTOR READY ENTITIES" + 副字段全英描述
- 修复方向：messages/zh-CN/knowledge.json 补齐

### E.11 reports 主页大段英文残留

- 当前：`prompts/0506/current-routes/04-reports.png`
- 现象：标题 zh OK，但 "Subscribed reports / Recommended reports / Historical archive / No subscribed reports yet / No recommended reports right now / No archived reports yet / Reports published in the last 30 days based on your subscription cadence./Reports older than 90 days are archived for long-term reference."
- 修复方向：messages/zh-CN/reports.json + page.tsx hardcoded 替换

### E.12 category/[slug] 多重英文残留

- 当前：`prompts/0506/current-routes/30-category-legislation.png`
- 现象：breadcrumb "Legislation"、子标题 "scroll-text"、status chip "published"、source slug 全英
- 修复方向：cat slug → 中文 mapping (legislation → 立法前沿) + status chip i18n

### E.13 search empty state 英文

- 当前：`prompts/0506/current-routes/33-search.png`
- 现象："Please enter at least 3 characters"
- 修复方向：messages/zh-CN/search.json

### E.14 admin/banners/new drawer 表单全英

- 当前：`prompts/0506/current-routes/35-admin-banners-new.png`
- 现象：8+ 字段标签全英
- 修复方向：messages/zh-CN/admin/banners.json

### E.15 admin/sources/[id] drawer 表单全英

- 当前：`prompts/0506/current-routes/37-admin-source-detail.png`
- 现象：10+ 字段标签全英
- 修复方向：messages/zh-CN/admin/sources.json

---

## F. 比对汇总

- 总路由数：**46** (含 [locale] 客户端 22 + admin 26 — re-export/重定向不计)
- mp4 直接覆盖：**12 客户端路由**（dashboard, me/feed, articles, articles/[id], analytics, knowledge, feedback, settings, me/notifications popover, sources, search popover, reading settings modal）
- 当前 native 实现：**46 / 46** (100%) — wave 1-4 已无 placeholder
- 视觉差距高 (P0)：**13 项** (dashboard, reports, knowledge, category, admin, admin/users, admin/sources, admin/sources/[id], admin/banners/new, admin/categories, admin/pins, admin/ai-usage, admin/ai-governance, admin/permissions, admin/reports/new, admin/reports/runs)
- 视觉差距中 (P1)：**~14 项**
- 视觉差距低 (P2)：**~19 项**
