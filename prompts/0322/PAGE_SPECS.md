# LawSaw Page Specs

> Per-page implementation specs derived from `prototype/app.html`.
> Each section maps prototype elements to concrete React components and API endpoints.

---

## Page: Dashboard (态势感知仪表盘)

### Route: `/dashboard`

### Layout
Full-width page with two logical sections: a "hero" viewport-height top section (map + banner + stats) and a scrollable feed section below. Max-width 1600px centered.

### Sections
1. **DashHeader** — Title "感知态势与系统运行分析" with live-dot animation, subtitle "实时追踪全球法律法规动态，覆盖 86 个国家与地区", right-aligned time filter buttons (日/周/月/年) with animated sliding indicator
2. **DashGrid** — 2-column grid (`320px 1fr`):
   - Left: **BannerCard** — Gradient card (155deg, #FF7B59 -> #FF5A36 -> #E04520), tag "深度专报", large title, description, CTA button "阅读资讯"
   - Right: **VizCard** — Dark background (#0B1120), tab bar (地域分布 / 行业动能), back button for China drilldown
     - **WorldMap**: ECharts geo map with effectScatter hot spots (Beijing, Washington, Brussels, Tokyo, Singapore, London, Sao Paulo, Sydney) and animated line connections. Click China -> drilldown
     - **ChinaMap**: ECharts choropleth with visualMap (province-level data). Click province -> MapPopup
     - **IndustryChart**: ECharts dual-axis (line chart: 监管动向 + 业界资讯 weekly trend, horizontal bar: top 5 industries)
     - **MapPopup**: Absolute positioned card (340px wide) with region name, article count badge, article list, "查看该地区全部资讯" button
3. **StatsStrip** — 4-column grid of stat cards:
   - 今日采集 (127, +18.5% up)
   - 覆盖信息源 (2846, +12 sources)
   - 高风险预警 (8, -23% down)
   - AI 洞察生成 (56, neutral)
   - Each card: icon with colored background, large animated counter, trend indicator
4. **ScrollHint** — "向下浏览今日专属资讯流" with bouncing arrow icon
5. **FeedSection** — Below the fold:
   - **FeedHeader**: "最新资讯" + subtitle + "查看全部" button linking to /articles
   - **TrendingStrip**: Horizontal marquee scroll of trending items (rank number + title), pauses on hover
   - **GeoFilterBar**: Chip buttons (全球/亚太/中国/北美/欧洲/中东非洲/南美)
   - **CategoryFilterPills**: Active-state pills with counts (全部 127, 立法前沿 24, ...)
   - **FeedGrid**: 2-column grid with staggered reveal animation
     - First card: **HeroFeedCard** — Spans full width, 2-col grid (dark visual left + content right)
     - Remaining: **FeedCard** — Standard cards with risk pill, category label, title (2-line clamp), summary (2-line clamp), source avatar + name + time + read time, bookmark/share actions

### Components needed
- `DashHeader` (new)
- `BannerCard` (new)
- `VizCard` (new)
- `WorldMap` (new, ECharts)
- `ChinaMap` (new, ECharts)
- `IndustryChart` (new, ECharts)
- `MapPopup` (new)
- `StatsStrip` (modify existing `stats-cards.tsx`)
- `ScrollHint` (new)
- `TrendingStrip` (new)
- `GeoFilterBar` (new)
- `FeedGrid` (new)
- `FeedCard` / `HeroFeedCard` (modify existing `article-card.tsx`)

### API endpoints
```
GET /api/v1/articles/stats              → stat card values
GET /api/v1/articles?limit=6&sort=latest → feed grid articles
GET /api/v1/articles/trending           → trending strip items
GET /api/v1/articles/geo-stats          → map hot spot data
GET /api/v1/articles/geo-stats/china    → China province data
GET /health                              → system status
```

### ReBAC behavior
- `basic_user`: Category filter pills show only 3 base categories. Feed cards from restricted categories are hidden.
- `verified_user`: 6 categories visible. Industry/compliance/data categories appear.
- `premium_user`: All 10 categories. Full geo data access.

### Interactive features
- Time filter slider animation (CSS position transition on active button)
- Map zoom/pan (ECharts roam)
- Click world hot spot -> show MapPopup with regional articles
- Click China on world map -> drilldown to China choropleth
- Click China province -> show MapPopup with province articles
- "返回世界" button -> return to world map
- Tab switch map <-> industry chart
- Stat counter animation on scroll into view (IntersectionObserver)
- Feed card staggered reveal on scroll (IntersectionObserver + CSS transition)
- Trending strip auto-scroll marquee with hover pause
- Category pill toggle (exclusive selection)
- Geo chip toggle (exclusive selection)

### Matching prototype elements
- `.dashboard-hero`, `.dh-header`, `.dh-title-group`, `.dh-title`, `.dh-subtitle`
- `.time-filters`, `.time-btn`, `.time-slider`
- `.dash-grid`, `.banner-card`, `.viz-card`, `.viz-header`, `.view-tabs`, `.view-tab`
- `.map-view`, `#mapChart`, `.industry-view`, `#echartsContainer`
- `.map-popup`, `.popup-header`, `.popup-body`, `.popup-footer`
- `.stats-strip`, `.stat-card`, `.stat-value`, `.stat-trend`
- `.scroll-hint`
- `.feed-section`, `.trending-strip`, `.trending-track`
- `.geo-filter-bar`, `.geo-chip`
- `.feed-filters`, `.filter-pill`
- `.feed-grid`, `.feed-card`, `.hero-card`

---

## Page: My Feed (个人资讯流)

### Route: `/me/feed`

### Layout
Single-column, max-width 1200px, 32px padding. Vertical stack of sections.

### Sections
1. **PageHeader** — Icon + "我的资讯流", subtitle "基于您的角色和频道订阅的个性化资讯"
2. **InfoCardsRow** — 3-column grid:
   - Role tier card: shield icon (purple bg), role name, description "完整文章可见性和高级分析访问"
   - Article count card: article icon (primary bg), value "127", description "本周期内可阅读文章"
   - Channel count card: broadcast icon (green bg), value "8", description "已订阅频道数"
3. **PinnedArticles** — Section title with pin icon, 2-column grid of pinned cards. Each card: pin icon + title + category + time
4. **ActiveBanners** — Section title with megaphone icon, vertical stack of banner cards. Each banner: left border accent color, title, body text, CTA link
5. **PersonalizedFeed** — Section title "个性化资讯", 2-column grid of content cards. Each card: risk pill + category label, title, summary, source + time

### Components needed
- `InfoCard` (new)
- `InfoCardsRow` (new)
- `PinnedArticleCard` (new)
- `ActiveBannerCard` (new)
- `PersonalizedFeedGrid` (new, reuse content card pattern)

### API endpoints
```
GET /api/v1/me/profile                  → role tier, channel subscriptions
GET /api/v1/me/feed?limit=20            → personalized articles
GET /api/v1/pins                        → pinned articles
GET /api/v1/banners/active              → active banners
GET /api/v1/channels/subscriptions      → subscribed channel count
```

### ReBAC behavior
- InfoCardsRow: role card dynamically shows user's actual tier (普通用户/认证用户/高级用户) with tier-specific color
- Feed articles filtered server-side by user's channel subscriptions and role permissions
- Banner visibility may be tier-restricted (banner.target_roles field)

### Interactive features
- Click pinned card -> navigate to article reader
- Click banner CTA -> navigate to target
- Click feed card -> navigate to article reader
- Pull-to-refresh on mobile

### Matching prototype elements
- `.page-header`, `.page-title`, `.page-subtitle`
- `.info-cards-row`, `.info-card`, `.info-card-icon`, `.info-card-value`, `.info-card-label`
- `.pinned-card`, `.pin-icon`
- `.active-banner`, `.active-banner-title`, `.active-banner-body`, `.active-banner-cta`
- `.content-card`, `.fc-top`, `.risk-pill`, `.cat-label`

---

## Page: All Articles (全部资讯)

### Route: `/articles`

### Layout
Single-column, max-width 1200px, 32px padding.

### Sections
1. **PageHeader** — "全部资讯" with count badge "共 247 篇文章"
2. **Toolbar** — Left: list/grid toggle buttons, filter button. Right: search input
3. **CategoryFilterRow** — Horizontally scrollable row of 11 pills (全部 + 10 categories), each with colored dot
4. **ArticleList** — White card containing rows of articles:
   - Each row: risk badge (高/中/低, color-coded) + status badge (已发布/待处理/处理中/已归档) + title + summary (2-line clamp) + source + time
   - Hover: slight background shift + left/right padding animation
5. **Pagination** — Centered: "上一页" button + "第 1 / 25 页" + "下一页" button

### Components needed
- `ArticleToolbar` (new)
- `CategoryFilterRow` (new, shared with dashboard)
- `ArticleListRow` (new)
- `ArticlePagination` (new)
- `StatusBadge` (new shared component)
- `RiskBadge` (new shared component)

### API endpoints
```
GET /api/v1/articles?page=1&per_page=10&status=all&category=all&q=&sort=latest
GET /api/v1/categories               → category list for filter pills
```

### ReBAC behavior
- `basic_user`: Only sees articles from 3 base categories. Category pills for restricted categories are disabled/hidden.
- Articles from restricted categories return 403 or are filtered server-side.

### Interactive features
- List/grid view toggle (list view as default per prototype)
- Category pill exclusive toggle (clicking one deselects others, "全部" resets)
- Search input filters articles by title/keywords
- Pagination navigation
- Click article row -> navigate to article reader
- URL state: `?page=1&category=legislation&status=published&q=search` via nuqs

### Matching prototype elements
- `.page-header`, `.page-title`, `.count-badge`
- `.toolbar`, `.toolbar-left`, `.toolbar-right`, `.toolbar-btn`, `.toolbar-search`
- `.cat-filter-row`, `.cat-filter-pill`, `.cat-dot`
- `.content-card`, `.article-list-row`, `.article-list-badges`, `.article-list-info`
- `.risk-pill`, `.status-badge`
- `.pagination`, `.pagination-btn`, `.pagination-info`

---

## Page: Article Reader (文章阅读器)

### Route: `/articles/[id]`

### Layout
Centered single column (max-width 680px). Fixed elements on left (TOC) and right (actions) for large screens. Sticky nav bar at top.

### Sections
1. **ReaderProgressBar** — Fixed at top of main area (left offset by sidebar width). 2px height, gradient fill, width driven by scroll %
2. **ReaderNav** — Sticky 56px bar: left = back button "返回", right = read time "约 8 分钟阅读" + "查看原文" link
3. **ReaderTocFixed** — Fixed left (312px from left), vertically centered, visible only >1400px. Contains "目录" title + bordered list of section links. Active item has left border accent + background highlight
4. **ReaderActionsFixed** — Fixed right (24px from right), vertically centered, visible only >1200px. Circular buttons: bookmark (toggleable active state), share, reading settings, divider, back to top
5. **ReadingSettingsPanel** — Overlay + fixed panel (280px wide, right side):
   - Font size: 4 options (A small/A default/A medium/A large -> 14/16/18/20px)
   - Line height: 3 options (紧凑 1.6/标准 1.8/宽松 2.0)
   - Reading theme: 3 options (浅色 white/深色 #1A1A1A/护眼 #F4ECD8)
   - "恢复默认设置" reset button
6. **ArticleContainer** (max-width 680px centered, padding 40px 24px 80px):
   - **ArticleHeader**:
     - Category badge (pill with border)
     - Author line (source name + dot + date)
     - Title (32px, font-weight 800, letter-spacing -0.02em)
     - Summary (18px, neutral-500)
     - **SourceVisibilityCard** (rounded-3xl card):
       - Header: "信息来源可见性" label + description + visibility badge (完整可见/摘要可见/不可见)
       - Detail grid (2x2): source name, source type, health status, refresh schedule
   - **ArticleBody**: Prose content with `article-body` typography styles:
     - h2: 20px bold, 32px top margin
     - p: 16px, line-height 1.8, 16px bottom margin
     - blockquote: left border primary-400, primary-50 background, 15px text
   - **ArticleFooter**: Back button + "查看原文" link

### Components needed
- `ReaderProgressBar` (new)
- `ReaderNav` (new)
- `ReaderTocFixed` (new)
- `ReaderActionsFixed` (new)
- `ReadingSettingsPanel` (new)
- `SourceVisibilityCard` (modify existing `source-card.tsx` or `ai-insights.tsx`)
- `ArticleBody` (new, DOMPurify-sanitized HTML rendering)

### API endpoints
```
GET /api/v1/articles/:id            → full article + source_view
POST /api/v1/pins                   → pin article
DELETE /api/v1/pins/:articleId       → unpin article
```

### ReBAC behavior
- **Source visibility card**: Content determined by `article.source_view.visibility`:
  - `full`: All 4 detail items shown, green "完整可见" badge
  - `summary`: Only source name + type, yellow "摘要可见" badge
  - `hidden`: No details, gray "不可见" badge, message "升级账户查看完整来源信息"
- Article content itself is always visible (backend already filters by permission)

### Interactive features
- Scroll progress bar (scroll % of scroll container)
- TOC active item tracking (IntersectionObserver on h2 anchors)
- Click TOC item -> smooth scroll to section
- Bookmark toggle (icon fill + background change)
- Reading settings panel toggle (overlay click to close)
- Font size / line height / theme changes apply instantly to article body
- "恢复默认设置" resets all reading preferences
- Back button navigates to previous page (articles list)

### Matching prototype elements
- `.reader-progress`, `.reader-progress-bar`
- `.reader-nav`, `.reader-nav-left`, `.reader-nav-right`, `.reader-back`
- `.reader-toc-fixed`, `.toc-title`, `.toc-list`, `.toc-item`
- `.reader-actions-fixed`, `.reader-action-circle`, `.reader-action-divider`
- `.reading-settings-overlay`, `.reading-settings-panel`, `.rsp-*`
- `.article-container`, `.article-header`, `.article-category-badge`, `.article-author-line`, `.article-title`, `.article-summary`
- `.source-card`, `.source-card-header`, `.source-badge`, `.source-detail-grid`, `.source-detail-item`
- `.article-body`, `.article-footer`

---

## Page: Reports (报告中心)

### Route: `/reports`

### Layout
Single-column, max-width 1200px, 32px padding.

### Sections
1. **PageHeader** — Icon + "报告中心"
2. **Toolbar** — Left: status select (全部状态/草稿/生成中/已生成/审核中/已审批/已发布/已归档/失败), period select (全部周期/周报/月报/季报/自定义). Right: "创建报告" primary button
3. **SubscriptionPanel** — White card with:
   - Header: "定期订阅" title + "新建订阅" button
   - Subscription items (border card within card):
     - Title, template + period + delivery method
     - Status badge (活跃 green / 已暂停 gray)
     - Edit button
4. **ReportCards** — Vertical stack of report cards:
   - Header: report number (monospace, e.g. RPT-2024-001) + status badge + period badge
   - Title (15px bold)
   - Meta: calendar icon + date range, article icon + count, optional warning/info text
   - Actions: conditional buttons (导出 PDF, 导出 HTML, 审批, 删除, 重新生成, 预览, 恢复)
   - Status badge variants: 草稿 (gray), 生成中 (yellow + spinner), 已生成 (blue), 已审批 (green), 生成失败 (red), 审核中 (yellow + hourglass), 已归档 (gray + archive)
   - Period badge variants: 周报 (purple), 月报 (purple), 季报 (purple), 自定义 (teal)

### Components needed
- `ReportToolbar` (new)
- `SubscriptionPanel` (modify existing `report-subscription-panel.tsx`)
- `SubscriptionItem` (new)
- `ReportCard` (new)
- `ReportBadge` (new shared component)
- `PeriodBadge` (new shared component)

### API endpoints
```
GET /api/v1/reports?status=all&period=all          → report list
GET /api/v1/report-subscriptions                   → subscription list
POST /api/v1/report-subscriptions                  → create subscription
PUT /api/v1/report-subscriptions/:id               → update subscription
POST /api/v1/reports                               → create new report
POST /api/v1/reports/:id/export?format=pdf         → export PDF
POST /api/v1/reports/:id/export?format=html        → export HTML
POST /api/v1/reports/:id/approve                   → approve report
POST /api/v1/reports/:id/regenerate                → regenerate failed report
DELETE /api/v1/reports/:id                         → delete report
PUT /api/v1/reports/:id/archive                    → archive report
PUT /api/v1/reports/:id/restore                    → restore archived report
```

### ReBAC behavior
- `basic_user`: Can view reports, limited export (HTML only)
- `verified_user`: Can view + export PDF/HTML
- `premium_user`: Full access including create, approve, manage subscriptions

### Interactive features
- Filter by status and period (select dropdowns)
- Create report modal/flow
- Export triggers download
- Delete confirmation dialog
- Regenerate re-queues report generation
- Subscription create/edit modal

### Matching prototype elements
- `.page-header`, `.page-title`
- `.toolbar`, `.toolbar-select`, `.toolbar-btn.primary`
- `.content-card`, `.section-title`, `.report-action-btn`
- `.report-card`, `.report-card-header`, `.report-number`, `.report-card-title`, `.report-card-meta`
- `.report-badge.*`, `.period-badge`
- `.report-actions`

---

## Page: Analytics (统计分析)

### Route: `/analytics`

### Layout
Single-column, max-width 1200px, 32px padding. Tabbed interface.

### Sections
1. **PageHeader** — Icon + "统计分析"
2. **AnalyticsTabs** — Pill/segmented control bar (neutral-100 background, rounded, 4px padding): 概览 / 区域分析 / 行业分析 / 重要性分析 / 交叉分析. Active tab: white background, primary-700 text, shadow
3. **OverviewPanel** (default active):
   - **StatsRow** — 4-column grid: 全部文章 (247), 活跃信息源 (86), 分类板块 (10), 异常信息源 (2)
   - **ChartGrid** — 2x2 grid:
     - Risk distribution: vertical bar chart (5 levels: 未知/低/中/高/严重 with colors gray/green/orange/red/purple)
     - Sentiment analysis: vertical bar chart (3 levels: 积极/中性/消极 with colors green/gray/red)
     - Article status: badge grid (5 badges: 待处理 23/处理中 5/已发布 198/已归档 18/已拒绝 3)
     - 7-day trend: SVG area chart with gradient fill + polyline + data points
   - **CategoryStats** — 5-column grid of 10 category stat cards (icon + name + count)
4. **RegionPanel** — Placeholder with globe icon + "区域分析" + "按国家/地区维度分析法律资讯分布与趋势"
5. **IndustryPanel** — Placeholder with briefcase icon + "行业分析"
6. **ImportancePanel** — Placeholder with star icon + "重要性分析"
7. **CrossAnalysisPanel** — Placeholder with intersect icon + "交叉分析"

### Components needed
- `AnalyticsTabs` (new)
- `AnalyticsOverview` (new)
- `RiskDistributionChart` (new, Recharts or ECharts)
- `SentimentChart` (new)
- `ArticleStatusBadges` (new)
- `TrendLineChart` (new)
- `CategoryStatsGrid` (new)
- `RegionAnalysis` (new, future)
- `IndustryAnalysis` (new, future)
- `ImportanceAnalysis` (new, future)
- `CrossAnalysis` (new, future)

### API endpoints
```
GET /api/v1/articles/stats                       → stat card totals
GET /api/v1/articles/stats/risk-distribution      → risk chart data
GET /api/v1/articles/stats/sentiment              → sentiment chart data
GET /api/v1/articles/stats/status                 → status badge counts
GET /api/v1/articles/stats/trend?days=7           → trend line data
GET /api/v1/articles/stats/by-category            → category stat cards
GET /api/v1/articles/stats/by-region              → region analysis (future)
GET /api/v1/articles/stats/by-industry            → industry analysis (future)
```

### ReBAC behavior
- `basic_user`: Overview tab only. Other tabs show upgrade prompt.
- `verified_user`: Overview + Region + Industry tabs.
- `premium_user`: All 5 tabs accessible.

### Interactive features
- Tab switching (show/hide panels)
- Chart hover tooltips
- Category stat cards hover effect (border color change)

### Matching prototype elements
- `.analytics-tabs`, `.analytics-tab`
- `.analytics-panel`
- `.stat-card` (reused)
- `.content-card`, `.section-title`
- `.badge-grid`, `.badge-grid-item`
- `.cat-stat-card`, `.cat-stat-icon`, `.cat-stat-name`, `.cat-stat-count`

---

## Page: Knowledge Graph (知识图谱)

### Route: `/knowledge`

### Layout
3-column grid layout: 260px | 1fr | 280px. Max-width 1400px, 32px padding. Min-height 550px.

### Sections
1. **PageHeader** — Icon + "知识图谱", subtitle "探索法律实体之间的关联关系"
2. **KgLayout** — 3-column grid:
   - **Left: EntitySearchPanel** — White card with:
     - Search input "搜索实体..."
     - Section title "实体列表"
     - Entity items: badge (type-colored: 组织 blue / 概念 green / 法规 purple / 人物 amber) + name + "提及 N 次"
     - Click entity -> select it, highlight in canvas, show in inspector
   - **Center: KnowledgeCanvas** — White card with dot-grid background pattern (24px spacing):
     - SVG lines (dashed, gray) connecting entity nodes
     - Entity nodes: absolutely positioned colored pills with name, type label, mention count
     - Nodes: 国家网信办, 数据安全, 个人信息保护法, 数据安全法, 欧盟委员会, 张某某, 隐私保护
     - Hover: scale(1.05) + shadow increase
   - **Right: InspectorPanel** — White card with:
     - Section title with info icon "实体详情"
     - Labels/values: 名称, 类型 (badge), 提及次数, 关联实体 (list of related items with type badges)

### Components needed
- `EntitySearchPanel` (new)
- `EntityItem` (new)
- `KnowledgeCanvas` (modify existing `knowledge-canvas.tsx`)
- `EntityNode` (new)
- `InspectorPanel` (new)
- `EntityBadge` (new shared component)

### API endpoints
```
GET /api/v1/knowledge/entities?q=search         → entity list
GET /api/v1/knowledge/entities/:id              → entity details + related
GET /api/v1/knowledge/graph                     → nodes + edges for canvas
```

### ReBAC behavior
- All tiers can view the knowledge graph
- `basic_user`: Limited to top 20 entities
- `premium_user`: Full graph access + entity detail drill-down

### Interactive features
- Entity search (filter entity list as user types)
- Click entity in list -> highlight node in canvas + show details in inspector
- Click node in canvas -> select entity + scroll list + show inspector
- Node hover: scale + shadow animation
- Canvas pan/zoom (future: use a canvas library)

### Matching prototype elements
- `.kg-layout`, `.kg-panel`, `.kg-canvas`
- `.kg-search`
- `.kg-entity-item`, `.kg-entity-badge`, `.kg-entity-name`, `.kg-entity-meta`
- `.kg-lines` (SVG)
- `.kg-node`, `.kg-node-type`, `.kg-node-count`
- `.kg-inspector-label`, `.kg-inspector-value`
- `.kg-related-item`

---

## Page: Feedback (留言反馈)

### Route: `/feedback`

### Layout
2-column grid: 2fr (form) | 1fr (history). Max-width 1200px, 32px padding.

### Sections
1. **PageHeader** — Sparkle icon + "留言反馈", subtitle "提交您的建议、反馈或问题报告"
2. **FeedbackLayout** — 2-column grid:
   - **Left: FeedbackForm** — White card:
     - Section title "提交反馈"
     - **FeedbackTypeGrid** — 2x2 grid of type cards:
       - 信息源建议 (RSS icon, blue bg)
       - Bug 反馈 (bug icon, red bg)
       - 功能建议 (lightbulb icon, amber bg)
       - 其他 (question icon, gray bg)
       - Selected state: primary border + primary-50 background
     - Form fields:
       - 标题 (text input)
       - 详细说明 (textarea, min-height 120px)
       - 联系邮箱 (optional, email input)
     - Actions: 取消 (outlined) + 提交反馈 (primary gradient)
   - **Right: FeedbackHistory** — White card:
     - Section title "我的反馈"
     - History items:
       - Title
       - Status badge (已解决 green / 处理中 blue / 待处理 gray)
       - Date
       - Admin reply (if exists): left-border accent card with "管理员回复：" prefix

### Components needed
- `FeedbackTypeCard` (new)
- `FeedbackTypeGrid` (new)
- `FeedbackForm` (new)
- `FeedbackHistoryList` (new)
- `FeedbackHistoryItem` (new)
- `FeedbackStatusBadge` (new)

### API endpoints
```
GET /api/v1/feedback/mine                       → user's feedback history
POST /api/v1/feedback                           → submit new feedback
```

### ReBAC behavior
- All tiers can submit feedback and view their own history
- No tier-specific restrictions on this page

### Interactive features
- Type card selection (exclusive, border + background change)
- Form validation (title required, description required)
- Submit success notification
- History list with expandable admin replies

### Matching prototype elements
- `.feedback-layout`
- `.feedback-type-grid`, `.feedback-type-card`, `.feedback-type-icon`, `.feedback-type-name`
- `.form-group`, `.form-label`, `.form-input`, `.form-textarea`
- `.form-actions`, `.btn-cancel`, `.btn-submit`
- `.feedback-history-item`, `.feedback-history-title`, `.feedback-history-meta`
- `.feedback-status`, `.feedback-admin-reply`

---

## Page: Settings (系统设置)

### Route: `/settings`

### Layout
2-column grid: 220px (tab nav) | 1fr (content panels). Max-width 1200px, 32px padding. Min-height 500px.

### Sections
1. **PageHeader** — Gear icon + "系统设置"
2. **SettingsLayout** — 2-column grid:
   - **Left: SettingsTabNav** — White card (12px padding):
     - 6 vertical tabs with icons:
       - 个人资料 (user icon)
       - 通知偏好 (bell icon)
       - 外观 (moon icon)
       - 安全 (shield icon)
       - API 密钥 (key icon)
       - 系统信息 (database icon)
     - Active tab: primary-50 bg, primary-700 text, font-weight 600
   - **Right: Content Panels** — White card, one visible at a time:
     - **ProfilePanel**:
       - Section title "个人资料"
       - Avatar circle (80px, gradient, initial letter)
       - Display name input (pre-filled)
       - Email input (pre-filled)
       - "保存修改" submit button
     - **NotificationsPanel**:
       - Section title "通知偏好"
       - Toggle switches (checkbox with accent-color):
         - 邮件通知 (checked by default)
         - 高风险预警 (checked by default)
         - 周报推送
         - 新文章推送
       - Browser push notification section (card with "启用推送" button)
     - **AppearancePanel**:
       - Section title "外观设置"
       - Theme mode: 3 buttons (浅色/深色/跟随系统)
       - Language: select (简体中文/English)
       - Compact mode: checkbox toggle
     - **SecurityPanel**:
       - Section title "安全设置"
       - Password change: 3 inputs (current/new/confirm) + "更新密码" button
       - MFA section: status card showing "MFA 已启用" with last verification time + "禁用 MFA" button
     - **ApiKeysPanel**:
       - Section title "API 密钥管理"
       - "创建新密钥" button
       - Key cards:
         - Name + masked key (monospace)
         - Status badge (活跃 green / 已禁用 gray)
         - Permissions + rate limit + created date
     - **SystemInfoPanel**:
       - Section title "系统信息"
       - Key-value rows (border-bottom separated):
         - 应用版本: v2.4.1
         - API 版本: v1.8.0
         - 数据库状态: 正常 (green)
         - 最后同步: timestamp
         - 用户角色: role name

### Components needed
- `SettingsTabNav` (new)
- `ProfilePanel` (new)
- `NotificationsPanel` (new)
- `AppearancePanel` (new)
- `SecurityPanel` (new)
- `ApiKeysPanel` (new)
- `SystemInfoPanel` (new)
- `SettingsToggle` (new shared component)
- `ApiKeyCard` (new)

### API endpoints
```
GET /api/v1/me/profile                          → profile data
PUT /api/v1/me/profile                          → update profile
PUT /api/v1/me/password                         → change password
GET /api/v1/me/notification-preferences         → notification settings
PUT /api/v1/me/notification-preferences         → update notification settings
POST /api/v1/me/mfa/disable                     → disable MFA
GET /api/v1/me/api-keys                         → API key list
POST /api/v1/me/api-keys                        → create new key
DELETE /api/v1/me/api-keys/:id                  → revoke key
GET /health                                      → system info (version, DB status)
```

### ReBAC behavior
- All tiers can edit profile, notifications, appearance, security
- API keys: `verified_user` and above only
- System info: visible to all, but shows tier-specific role name

### Interactive features
- Tab switching (show/hide panels, URL state `?tab=profile`)
- Profile save with success toast
- Password change with validation (new == confirm)
- MFA disable confirmation dialog
- API key creation flow (modal with generated key shown once)
- API key revoke confirmation
- Theme mode toggle (instant preview)
- Locale switch (triggers page reload with new locale)

### Matching prototype elements
- `.settings-layout`, `.settings-tabs`, `.settings-tab`
- `.settings-panel`
- `.settings-avatar`
- `.form-group`, `.form-label`, `.form-input`
- `.btn-submit`, `.btn-cancel`
- `.toolbar-btn`, `.toolbar-select`
- `.report-action-btn.danger` (reused for MFA disable)
