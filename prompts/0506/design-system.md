# LawSaw Design System — mp4 真值版

> 本文档基于 `prototype/27c693ebed1bb8a13893d6f2511e8b0b_raw.mp4` (45.27s, 149 帧 deep extract) +
> `prototype/app.html` (2504 行 reference) 双源对账抽取。
> mp4 是设计真值 (SoT)。下游 agent 必须以本文档为基准，禁止再回溯 frame-001 风格。
>
> 所有 hex 与数值均来自 `prototype/app.html` 第 17-50 行 `:root` 与逐帧像素采样校准。

---

## 1. 色板 (Color tokens)

### 1.1 品牌 / Primary（warm orange — LawSaw 标识）

> 来源：prototype/app.html:18-21；mp4 sec-001 LawSaw logo / sec-005 active nav line / sec-040 提交反馈卡 icon。

| Token         | Hex      | 用途                                   | mp4 帧证据 |
|---------------|----------|----------------------------------------|-----------|
| `primary-50`  | #fff4f1  | hero soft wash / banner peach gradient | sec-001 hero |
| `primary-100` | #ffe6dc  | active nav background subtle           | sec-001 sidebar |
| `primary-200` | #ffccb8  | chip / pill active background          | sec-040 反馈 chip |
| `primary-300` | #ffb394  | (reserved)                             | — |
| `primary-400` | #ff9970  | hover state                            | half-035 hover |
| `primary-500` | #ff6b35  | **brand primary** — logo / CTA / link  | sec-001 logo |
| `primary-600` | #e55a2b  | logo gradient end / button hover       | sec-001 logo |
| `primary-700` | #cc4a1f  | active nav text                        | sec-005 sidebar active |
| `primary-800` | #b23a13  | (reserved)                             | — |
| `primary-900` | #992a07  | (reserved)                             | — |

### 1.2 中性灰

> 来源：prototype/app.html:23-27；mp4 sec-005 sidebar / topbar / breadcrumb 文字。

| Token          | Hex      | 用途 |
|----------------|----------|------|
| `neutral-50`   | #f8f9fa  | body 背景 |
| `neutral-100`  | #f1f3f4  | sidebar separator / 表头 hover |
| `neutral-200`  | #e9ecef  | 边框 / 分割线 |
| `neutral-300`  | #dee2e6  | input border |
| `neutral-400`  | #ced4da  | secondary border |
| `neutral-500`  | #adb5bd  | placeholder / icon |
| `neutral-600`  | #6c757d  | secondary text |
| `neutral-700`  | #495057  | body text |
| `neutral-800`  | #343a40  | heading |
| `neutral-900`  | #212529  | primary text / sidebar title |

### 1.3 状态 (Semantic)

> 来源：prototype/app.html:29；mp4 sec-001 chip / sec-045 风险柱状图。

| Token      | Hex      | 用途 |
|------------|----------|------|
| `success`  | #28a745  | 健康 / 已采集 / risk=低 |
| `warning`  | #ffc107  | 待处理 KPI |
| `error`    | #dc3545  | 风险预警 / 异常 |
| `info`     | #17a2b8  | (reserved) |

### 1.4 分类色 (10 个内容板块)

> 来源：prototype/app.html:31-35 + 1966-1976。每个分类配独立色 + Phosphor icon。

| slug          | name 中文 | name en       | hex     | icon                 |
|---------------|-----------|---------------|---------|----------------------|
| legislation   | 立法前沿  | Legislation   | #3498db | ph-scroll            |
| regulation    | 监管动向  | Regulation    | #9b59b6 | ph-building          |
| enforcement   | 执法案例  | Enforcement   | #e74c3c | ph-scales            |
| industry      | 业界资讯  | Industry      | #f39c12 | ph-briefcase         |
| compliance    | 合规前沿  | Compliance    | #27ae60 | ph-shield-check      |
| data          | 数据动态  | Data          | #1abc9c | ph-chart-bar         |
| security      | 安全资讯  | Security      | #e91e63 | ph-shield            |
| academic      | 学术研究  | Academic      | #795548 | ph-graduation-cap    |
| events        | 行业活动  | Events        | #ff5722 | ph-flame             |
| international | 国际动态  | International | #2196f3 | ph-globe-hemisphere-east |

> 在 chip 上呈现：背景 = `${color}1F` (~12% alpha)，文本 = `${color}`。
> 见 mp4 half-035 articles cat chip / sec-020 knowledge entity chip。

### 1.5 暗色模式 (Reading mode)

> 来源：prototype/app.html:37-39；mp4 sec-010 阅读设置 modal。

| Token       | Hex      | 用途 |
|-------------|----------|------|
| `dash-bg`   | #0B1120  | 阅读"深色"主题背景 |
| `dash-bg-2` | #111827  | 阅读"深色"主题次背景 |

> mp4 sec-010 阅读设置 modal 提供 3 个 reading theme：Default(light) / 深色(dark / `#0B1120`) / Sepia(暖米黄)。
> **不是**整站暗色，仅文章详情页可切换。

---

## 2. 字号 / 字重

> 字体栈：`'Inter', 'PingFang SC', 'Noto Sans SC', -apple-system, ...`（prototype/app.html:46）。
> Inter 用于英文 + 数字，Noto Sans SC + PingFang SC 用于中文。

### 2.1 字号 scale（px / line-height / weight）

| token  | 用途              | px / lh        | weight | mp4 证据 |
|--------|-------------------|----------------|--------|-----------|
| H1     | 页面标题"数据看板"| 28 / 1.3       | 700    | sec-001 "数据看板" |
| H2     | 区块标题"分类概览"| 20 / 1.4       | 600    | sec-001 "分类概览" |
| H3     | 卡内子标题        | 16 / 1.5       | 600    | sec-040 "提交反馈" |
| body-lg| KPI 数值         | 32 / 1.2       | 700    | sec-001 KPI "0/2/0/4" |
| body   | 正文/列表         | 14 / 1.6       | 400    | sec-001 article rows |
| caption| 辅助说明          | 12 / 1.4       | 400    | sec-001 "累计采集 43 条" |
| nav    | sidebar item     | 14 / 1.4       | 500    | sec-001 nav |
| nav-group| sidebar 分组    | 11 / 1.4 caps  | 500    | sec-005 "NAVIGATION/10 CATEGORIES" |
| chip   | tag/filter chip  | 12 / 1.0       | 500    | half-035 cat chip |

### 2.2 字重档位

仅使用 4 档：400 (body), 500 (nav/chip), 600 (heading-md), 700 (heading-lg)。
**禁止** 800 / 900 重权重（mp4 sec-001 "数据看板" 视觉密度判定为 700 而非 800）。

---

## 3. 间距 / 圆角 / 阴影

### 3.1 spacing scale (px)

> 4 / 8 / 12 / 16 / 24 / 32 / 48 — 严格 4 倍数。

| token  | px | mp4 用途 |
|--------|----|---------|
| sp-1   | 4  | chip icon-text 内距 |
| sp-2   | 8  | chip 内边距 |
| sp-3   | 12 | sidebar 行间距 |
| sp-4   | 16 | 卡片 padding |
| sp-5   | 24 | 卡片间隔 / section padding |
| sp-6   | 32 | 区块间隔 |
| sp-7   | 48 | hero padding |

### 3.2 圆角 scale (rem / px)

> 来源：prototype/app.html:40-41。

| token       | rem    | px | 用途 |
|-------------|--------|----|------|
| `radius-sm` | 0.5rem | 8  | 输入 / 小 chip |
| `radius-md` | 0.625rem | 10 | button |
| `radius-lg` | 0.75rem | 12 | 卡片 / KPI 卡 |
| `radius-xl` | 1rem | 16 | hero / banner / logo 容器 |

> mp4 sec-001 KPI 卡测量 = 12px rounded → `radius-lg`。
> Logo 16px → `radius-xl`。
> chip 8px → `radius-sm`。

### 3.3 阴影层级

| token              | css                                          | 用途 |
|--------------------|----------------------------------------------|------|
| `shadow-sm`        | `0 1px 2px rgba(0,0,0,0.05)`                  | 浅卡片 |
| `shadow-md`        | `0 4px 6px -1px rgba(0,0,0,0.1)` + secondary | 浮动按钮 / 弹层 |
| `shadow-lg`        | `0 10px 15px -3px rgba(0,0,0,0.1)`           | modal / drawer |
| `shadow-brand`     | `0 4px 14px -2px rgba(255,107,53,0.25)`      | primary CTA / logo |

> mp4 sec-001 KPI 卡观察到极轻 shadow（≈shadow-sm），sec-040 反馈类型 chip 卡用 shadow-md，sec-010 阅读设置 modal 用 shadow-lg。

---

## 4. 组件模式手册

### 4.1 Sidebar (LEFT NAV)

> 来源：prototype/app.html:55-117 + mp4 sec-001/sec-005。

- 宽度：280px (展开) / 64px (collapsed)，过渡 `300ms cubic-bezier(0.25,0.8,0.25,1)`
- 背景：`rgba(255,255,255,0.92)` + `backdrop-filter: blur(20px) saturate(180%)`
- 右边框：`1px solid rgba(233,236,239,0.6)` + 右侧 box-shadow
- Logo 区：高 64px，logo 40×40 圆角 16，gradient `135deg, primary-500 → primary-600`
- nav-link active 状态：
  - 文字色：`primary-700`
  - 左侧 4px 高亮条：`linear-gradient(to bottom, primary-500, primary-600)` (使用 `::before`)
  - **不是**整行背景填色（mp4 sec-005 验证）
- 分组：导航(NAVIGATION) + 10 个分类(10 CATEGORIES)，分组 label 用 `nav-group` 字号 11px caps

**mp4 真实 nav 项 (10 项)**:

```
导航/Navigation:
1. 数据看板 / Dashboard      (ph-fill ph-squares-four)
2. 我的资讯流 / My feed      (ph-newspaper)
3. 全部资讯 / All articles   (ph-file-text)
4. 信息源管理 / Sources      (ph-rss)        ← prototype/app.html 缺
5. 报告 / Reports            (ph-clipboard-text)
6. 统计分析 / Analytics      (ph-trend-up)
7. 知识图谱 / Knowledge Graph(ph-share-network)
8. 数据管理 / Data           (ph-database)   ← prototype/app.html 缺
9. 留言反馈 / Feedback       (ph-chat-centered-text)
10. 系统设置 / Settings      (ph-gear)
```

> **关键差异**：mp4 sec-001 sidebar 有 sources(信息源管理) 与 data(数据管理) 项，
> prototype/app.html 第 1956-1965 行 `allNavItems` 仅 9 项。
> mp4 是真值 → web 端 sidebar 必须为 10 项。

### 4.2 Topbar

> 来源：prototype/app.html:711-740 + mp4 sec-001 顶栏。

- 高度：64px
- 子区：search box + 顶部操作组（locale globe / notification bell + badge / user avatar）
- locale 切换：globe icon → popover 含 "中文 / English" 两个 option（active 用 `primary-100` 背景）
- 通知 popover：宽 ≈360px，含 4 个功能按钮（消息中心 / 暂无消息 / 通知偏好 / 打开消息中心 / 查看任务）
  - mp4 half-005 验证

### 4.3 KPI 卡 (4-up)

> mp4 sec-001 真值 — 卡片纯白，**无 dark hero**。

- 容器：`background: white; border-radius: 12px; padding: 24px; shadow-sm`
- 4-up 网格：`grid-template-columns: repeat(4, 1fr); gap: 24px`
- 左侧 (主区)：
  - label (caption 12px / neutral-500)
  - value (32px / 700 / neutral-900)
- 右侧 (icon 区)：
  - 圆形容器 48×48 圆角 16
  - 背景：`${semantic-color}1F` (~12% alpha)
  - icon 颜色：`${semantic-color}`
- 4 个语义色对应：
  1. 今日资讯 → primary (`#fff4f1` bg / `#ff6b35` icon)
  2. 活跃信息源 → success (`#dcfce7` bg / `#16a34a` icon)
  3. 待处理 → warning (`#fef3c7` bg / `#f59e0b` icon)
  4. 风险预警 → error (`#fee2e2` bg / `#dc2626` icon)

> sec-001 KPI 顶部**无** "1px gradient line" 装饰（与 wave 4 的 frame-001 误判区分）。

### 4.4 表格 (Table)

> mp4 half-035 articles list / sec-045 analytics 资讯状态。

- 表头：`background: white; padding: 16px 24px; font-size: 12px; weight: 500; color: neutral-500; uppercase: false (中文场景)`
- 行：`padding: 16px 24px; border-bottom: 1px solid neutral-100`
- hover：`background: neutral-50`
- 紧凑型可选：行 padding 12px

### 4.5 Chip / Pill

> mp4 sec-040 反馈类型 / sec-020 entity chip / half-035 cat chip。

3 类 chip：

**a. risk chip**（圆形 + outline）：
- mp4 半 sec-001 "低风险" 绿色 — 描边 1px `success`，文字 `success`，padding `4px 10px`，radius pill (full)，icon 加 8px gap。

**b. category chip**（subtle）：
- 背景 `${cat-color}1F`，文字 `${cat-color}`，radius `radius-sm` (8px)。

**c. filter pill**（active/inactive）：
- inactive: `background: white; border: 1px solid neutral-200; color: neutral-700`
- active: `background: primary-500; color: white; border-color: primary-500`
- 圆角 pill (full)；padding `8px 16px`；mp4 half-035 cat-filter-pill。

### 4.6 Button

| variant   | bg                       | text         | border                    | 用途 |
|-----------|--------------------------|--------------|---------------------------|------|
| primary   | primary-500              | white        | none                      | 主 CTA |
| secondary | white                    | neutral-900  | 1px neutral-200           | 取消 / 次要 |
| ghost     | transparent              | neutral-700  | none                      | 行内操作 |
| danger    | error                    | white        | none                      | 删除 |
| icon-only | neutral-50               | neutral-600  | 1px neutral-200           | toolbar |

padding 标准：`10px 16px`，radius `radius-md` (10px)。

### 4.7 Modal / Drawer

> mp4 sec-010 阅读设置 modal。

- modal: 居中 / 最大宽 480px / radius `radius-xl` (16px) / shadow-lg / backdrop `rgba(0,0,0,0.4)`
- drawer: 右侧滑入 / 宽 ≈400px / shadow-lg / 头部带 X close
- 内部 padding: 24px

### 4.8 Tab

> mp4 sec-045 analytics tabs (5 个)。

- 容器：`display: flex; gap: 32px; border-bottom: 1px solid neutral-100`
- inactive tab: `color: neutral-600; padding: 12px 0`
- active tab: `color: primary-700; font-weight: 600; border-bottom: 2px solid primary-500`
- 不使用背景填充（区别于 chip）

### 4.9 Breadcrumb

> mp4 sec-008/sec-020 顶栏 breadcrumb。

- 格式：`<home icon> > 知识图谱`
- 分隔符 `>` 用 `neutral-400`，文字 `neutral-700`，hover `primary-700`
- 字号 14px

### 4.10 Empty / Error / Loading state

- **Empty**：图标（neutral-300）+ 主文字 `neutral-700` + 副文字 `neutral-500`，居中。mp4 sec-040 我的反馈卡 "暂无反馈记录"。
- **Error**：红色 `!` 图标 + 标题 + (request_id) + 重试按钮。当前 admin/ai-usage 已实现。
- **Loading**：橙色圆环 spinner（border `primary-500`），居中。mp4 sec-022 analytics loading。

### 4.11 Reading 沉浸视图

> mp4 sec-008/sec-012 文章详情。

- **不显示** sidebar
- 仅一条极简 topbar：`← 返回 [中间空白] 阅读时间 / Markdown / 原文 ↗`
- 主区最大宽 720px 居中
- 右侧浮动 actions 圆形 48×48：收藏 / 分享 / 字号 / 回顶部
- 左侧浮动 TOC：章节链接（active 用 primary-700 + 左侧 2px 条）
- 右上 "阅读设置" 按钮 → 浮窗（字号 4 档 / 行距 3 档 / 主题 3 档 / 内容宽度 3 档 / 字体 2 档）

---

## 5. 与当前 globals.css 的差异

### 5.1 新增 token (apps/web/src/app/globals.css)

需新增/校准（如不存在）：
- `--cat-legislation` 至 `--cat-international` (10 个)
- `--shadow-brand`
- `--font-sans` 含 Noto Sans SC + PingFang SC

### 5.2 必须保持

- primary 色板与 prototype/app.html 完全一致 (#ff6b35 brand)
- radius scale (8/10/12/16)
- spacing scale (4/8/12/16/24/32/48)

---

## 6. 真实数据规则 (开发工序：数据绝对真实)

> 当前明显的 mock 数据问题（route-inventory.md 中详列）：
> - me/feed 出现英文 mock 文章（"Tesla is Sitting on a Record 50k Unsold EVs" 等 HN content）
> - me/notifications 显示的是 audit.login 事件，非用户通知
> - articles list 的 categories 全是 building-2 / scroll-text / scale 这种 channel-slug，缺真实 cat 映射

mp4 真值数据语义：
- 资讯卡 = `risk chip + 分类 chip + 标题 + 摘要 + 时间`
- 知识图谱 entity = `名称 + 类型 chip(organization/concept/location/event/law/person) + 提及次数`
- 反馈类型 = `信息源建议 / 问题反馈 / 功能建议 / 其他` (4 卡)

---

## 7. 适用边界

- ✅ 全部客户端路由（dashboard / articles / sources / reports / analytics / knowledge / feedback / settings / me/* / data / category / search / article-detail）
- ✅ 全部 admin 子路由（admin/users / admin/sources / ...）
- ⚠️ admin 命名空间允许在 user 端基础上叠加 admin top chrome（深橙色 banner 顶栏 mp4 未直接覆盖，沿用现有），但 sidebar 必须保持 user 端 mp4 风格 → 需修复"双 chrome" bug。

---

## 附录 A — mp4 帧到组件映射速查

| 组件                  | 主要 mp4 帧                          |
|-----------------------|--------------------------------------|
| Sidebar (zh)          | sec-001 / sec-015 / sec-040          |
| Sidebar (en)          | sec-005                              |
| Topbar + locale popup | sec-005                              |
| Notification popover  | half-005                             |
| Dashboard 4-up KPI    | sec-001                              |
| Dashboard 分类概览    | sec-001                              |
| Dashboard 最新资讯    | sec-001                              |
| Articles list         | half-035                             |
| Article detail        | sec-008 / sec-012 / half-015 / half-025 |
| Reading settings modal| sec-010                              |
| Analytics tabs        | sec-045                              |
| Analytics charts      | sec-045                              |
| Knowledge entity list | sec-020 / half-055                   |
| Knowledge graph view  | sec-035 / half-075                   |
| Knowledge entity panel| half-065                             |
| Feedback page         | sec-040                              |
| Loading state         | sec-022                              |
