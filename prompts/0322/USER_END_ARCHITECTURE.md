# LawSaw User-End Architecture Spec

> Converting the HTML prototype (`prototype/app.html`) into production Next.js 16 + React 19 pages.

---

## 1. Overview

The prototype defines a complete **user-facing** SPA with 9 page views + an article reader, connected by a sidebar navigation system. This spec maps every prototype element to a concrete Next.js implementation plan, aligned with the existing `apps/web` codebase.

**Goal**: Pixel-faithful reproduction of the prototype, backed by real API data, with ReBAC-driven visibility per role tier (`basic_user`, `verified_user`, `premium_user`).

---

## 2. Tech Stack Alignment

| Layer | Current (package.json) | Usage |
|-------|----------------------|-------|
| Framework | Next.js 16.1.6 (App Router) | File-based routing under `apps/web/src/app/[locale]/` |
| UI | React 19 + Tailwind CSS 4 | Utility-first styling, `@theme` tokens in `globals.css` |
| Components | Lucide React 0.469 | Icons (sidebar, header, pages) |
| Charts | ECharts 6 + echarts-for-react 3 | World map, China drilldown, industry charts |
| Additional Charts | Recharts 2.15 | Simpler trend/bar/pie charts on Analytics page |
| State | Zustand 5 | `auth-store` (auth, roles, permissions, roleTier) |
| Server State | TanStack React Query 5 | All API fetching hooks (`use-articles`, `use-reports`, etc.) |
| Animation | Framer Motion 11 | Page transitions, card reveal, hover effects |
| URL State | nuqs 2.2 | Filter/pagination state in URL search params |
| Sanitization | DOMPurify 3 | Article HTML content rendering |
| Styling Utils | clsx + tailwind-merge + CVA | Conditional class composition |
| Lint/Format | Biome 1.9 | Replaces ESLint + Prettier |
| Type Check | TypeScript 5.7 (strict) | `pnpm typecheck` |
| Testing | Vitest 4 + Playwright 1.50 | Unit + E2E |

---

## 3. Routing Structure

All user-facing routes live under `apps/web/src/app/[locale]/`. The `[locale]` segment supports `zh` and `en`.

| Route | Page Name | Prototype ID | Notes |
|-------|-----------|-------------|-------|
| `/` | Root | — | Redirects: admin roles -> dashboard, end-user tiers -> `/me/feed` |
| `/dashboard` | Dashboard | `page-dashboard` | World map + stats + feed (admin overlay for system status) |
| `/me/feed` | My Feed | `page-feed` | Role tier card, pinned articles, banners, personalized feed |
| `/articles` | All Articles | `page-articles` | Filters, search, category pills, list/grid toggle, pagination |
| `/articles/[id]` | Article Reader | `page-article-detail` | Centered reader, fixed TOC, fixed actions, reading settings |
| `/reports` | Reports | `page-reports` | Subscriptions panel, report cards with status/period badges |
| `/analytics` | Analytics | `page-analytics` | 5 tabs (overview, region, industry, importance, cross) |
| `/knowledge` | Knowledge Graph | `page-knowledge` | 3-column: entity list, canvas, inspector |
| `/feedback` | Feedback | `page-feedback` | Type selector grid, form, history with admin replies |
| `/settings` | Settings | `page-settings` | 6 tab sidebar (profile, notifications, appearance, security, API keys, system info) |
| `/category/[slug]` | Category View | — | Reuse Articles page with pre-selected category filter |

---

## 4. Component Hierarchy

```
RootLayout (locale, providers, fonts)
  +-- QueryClientProvider (TanStack)
  +-- AuthProvider (Zustand hydration)
  +-- ProtectedRoute
        +-- AppShell (flex row, full height)
              +-- Sidebar (280px / 64px collapsed)
              |     +-- SidebarBrand (logo + title)
              |     +-- SidebarNav (nav links + category links)
              |     +-- SidebarFooter (collapse btn + role selector + role popup)
              |
              +-- MainWrapper (flex-1, flex column)
                    +-- Topbar (64px)
                    |     +-- SearchBox (Ctrl+K trigger)
                    |     +-- TopActions (locale, notifications, user menu)
                    |     +-- ScrollProgressBar
                    |
                    +-- ScrollContainer (flex-1, overflow-y auto)
                          +-- <Page Component />
```

### Page-level component breakdown:

**Dashboard**
```
DashboardPage
  +-- DashHeader (title + time filters with animated slider)
  +-- DashGrid (2-col: banner card + viz card)
  |     +-- BannerCard (gradient hero CTA)
  |     +-- VizCard
  |           +-- VizTabs (map / industry)
  |           +-- WorldMap (ECharts geo + effectScatter + lines)
  |           +-- ChinaMap (ECharts map with visualMap)
  |           +-- IndustryChart (ECharts line + bar combo)
  |           +-- MapPopup (article cards per region)
  +-- StatsStrip (4 stat cards with animated counters)
  +-- ScrollHint (animated bounce)
  +-- FeedSection
        +-- TrendingStrip (marquee scroll)
        +-- GeoFilterBar (chip buttons)
        +-- CategoryFilterPills
        +-- FeedGrid (2-col, hero card + normal cards)
              +-- FeedCard / HeroFeedCard
```

**My Feed**
```
FeedPage
  +-- InfoCardsRow (3 cards: role tier, article count, channel count)
  +-- PinnedArticles (2-col grid of pinned cards)
  +-- ActiveBanners (vertical stack of banner cards)
  +-- PersonalizedFeed (2-col grid of content cards)
```

**All Articles**
```
ArticlesPage
  +-- PageHeader (title + count badge)
  +-- Toolbar (list/grid toggle, filter button, search input)
  +-- CategoryFilterRow (10 category pills)
  +-- ArticleList (article rows with risk + status badges)
  +-- Pagination (prev/next + page info)
```

**Article Reader**
```
ArticleReaderPage
  +-- ReaderProgressBar (fixed top, scroll-driven)
  +-- ReaderNav (sticky, back button + read time + original link)
  +-- ReaderTocFixed (fixed left, vertically centered, >1400px)
  +-- ReaderActionsFixed (fixed right, >1200px)
  |     +-- BookmarkButton, ShareButton, SettingsButton, BackToTopButton
  +-- ReadingSettingsPanel (overlay + panel: font size, line height, theme)
  +-- ArticleContainer (max-width 680px centered)
        +-- ArticleHeader (category badge, author line, title, summary)
        +-- SourceVisibilityCard (ReBAC-driven source details)
        +-- ArticleBody (prose content with h2 anchors)
        +-- ArticleFooter (back button + original link)
```

**Reports**
```
ReportsPage
  +-- PageHeader
  +-- Toolbar (status select, period select, create button)
  +-- SubscriptionPanel (subscription list items)
  +-- ReportCards (list of report cards with badges + actions)
```

**Analytics**
```
AnalyticsPage
  +-- PageHeader
  +-- AnalyticsTabs (5 tabs with pill/segmented control)
  +-- OverviewPanel
  |     +-- StatsRow (4 stat cards)
  |     +-- ChartGrid (2x2: risk distribution, sentiment, article status, 7-day trend)
  |     +-- CategoryStatsGrid (5-col, 10 category stat cards)
  +-- RegionPanel (ECharts geo chart)
  +-- IndustryPanel (ECharts charts)
  +-- ImportancePanel (charts)
  +-- CrossAnalysisPanel (cross-dimensional charts)
```

**Knowledge Graph**
```
KnowledgePage
  +-- PageHeader
  +-- KgLayout (3-col grid: 260px | 1fr | 280px)
        +-- EntitySearchPanel (search input + entity list)
        +-- KnowledgeCanvas (SVG lines + positioned nodes)
        +-- InspectorPanel (entity details + related entities)
```

**Feedback**
```
FeedbackPage
  +-- PageHeader
  +-- FeedbackLayout (2-col: 2fr form | 1fr history)
        +-- FeedbackForm
        |     +-- FeedbackTypeGrid (4 type cards)
        |     +-- FormFields (title, description, email)
        |     +-- FormActions (cancel + submit)
        +-- FeedbackHistory (list of history items with status + admin reply)
```

**Settings**
```
SettingsPage
  +-- PageHeader
  +-- SettingsLayout (2-col: 220px tabs | 1fr content)
        +-- SettingsTabNav (6 vertical tabs)
        +-- ProfilePanel (avatar, display name, email)
        +-- NotificationsPanel (toggle switches)
        +-- AppearancePanel (theme buttons, locale select, compact toggle)
        +-- SecurityPanel (password change, MFA status)
        +-- ApiKeysPanel (key list + create button)
        +-- SystemInfoPanel (version, API version, DB status, sync time, role)
```

---

## 5. State Management Strategy

### Zustand Stores

| Store | File | Purpose |
|-------|------|---------|
| `auth-store` | `stores/auth-store.ts` | User session, roles, roleTier, permissions, token |
| `ui-store` (new) | `stores/ui-store.ts` | Sidebar collapsed state, active reading theme, font size |

### React Query Hooks

| Hook | File | API Endpoint | Purpose |
|------|------|-------------|---------|
| `useArticles` | `hooks/use-articles.ts` | `GET /api/v1/articles` | Paginated article list with filters |
| `useArticle` | `hooks/use-articles.ts` | `GET /api/v1/articles/:id` | Single article with source view |
| `useReports` | `hooks/use-reports.ts` | `GET /api/v1/reports` | Report list |
| `useKnowledge` | `hooks/use-knowledge.ts` | `GET /api/v1/knowledge/*` | Entities, relations, graph data |
| `useFeedback` | `hooks/use-feedback.ts` | `GET/POST /api/v1/feedback` | Submit + list feedback |
| `useSources` | `hooks/use-sources.ts` | `GET /api/v1/sources` | Source stats |
| `useAuth` | `hooks/use-auth.ts` | `POST /api/v1/auth/*` | Login, register, refresh |
| `useAuthz` | `hooks/use-authz.ts` | `GET /api/v1/authz/*` | ReBAC permission checks |
| `useMeFeed` | `hooks/use-me-feed.ts` | `GET /api/v1/me/feed` | Personalized feed for role tier |
| `usePins` | `hooks/use-pins.ts` | `GET/POST /api/v1/pins` | Pinned articles |
| `useBanners` | `hooks/use-banners.ts` | `GET /api/v1/banners` | Active system banners |
| `useChannels` | `hooks/use-channels.ts` | `GET /api/v1/channels` | Channel subscriptions |

### URL State (nuqs)

Pages that need URL-persisted state use `nuqs` for query params:

- `/articles` — `?page=1&status=published&category=legislation&q=search`
- `/reports` — `?status=all&period=all`
- `/analytics` — `?tab=overview`
- `/knowledge` — `?entity=xxx`

---

## 6. API Integration Points

### Dashboard Page
```
GET /api/v1/articles/stats          → StatsStrip (today count, sources, high risk, AI insights)
GET /api/v1/articles?limit=6        → FeedGrid (latest articles)
GET /api/v1/articles/trending       → TrendingStrip
GET /api/v1/articles/geo-stats      → WorldMap / ChinaMap data
GET /health                          → System status (existing)
GET /api/v1/ai/available            → AI status (existing)
```

### My Feed Page
```
GET /api/v1/me/feed                 → Personalized feed cards
GET /api/v1/me/profile              → InfoCardsRow (role tier info)
GET /api/v1/pins                    → PinnedArticles
GET /api/v1/banners/active          → ActiveBanners
GET /api/v1/channels/subscriptions  → Channel count
```

### All Articles Page
```
GET /api/v1/articles?page&status&category&q&sort   → ArticleList + Pagination
GET /api/v1/categories                              → Category filter pills
```

### Article Reader
```
GET /api/v1/articles/:id            → Full article with source_view
POST /api/v1/pins                   → Pin/unpin article
```

### Reports Page
```
GET /api/v1/reports?status&period                   → ReportCards
GET /api/v1/report-subscriptions                    → SubscriptionPanel
POST /api/v1/reports                                → Create report
POST /api/v1/reports/:id/export?format=pdf|html     → Export
DELETE /api/v1/reports/:id                          → Delete
POST /api/v1/reports/:id/approve                    → Approve
POST /api/v1/reports/:id/regenerate                 → Regenerate
```

### Analytics Page
```
GET /api/v1/articles/stats                     → Overview stat cards
GET /api/v1/articles/stats/risk-distribution   → Risk distribution chart
GET /api/v1/articles/stats/sentiment           → Sentiment chart
GET /api/v1/articles/stats/status              → Article status badges
GET /api/v1/articles/stats/trend?days=7        → 7-day trend line
GET /api/v1/articles/stats/by-category         → Category statistics
GET /api/v1/articles/stats/by-region           → Region analysis
GET /api/v1/articles/stats/by-industry         → Industry analysis
```

### Knowledge Graph
```
GET /api/v1/knowledge/entities?q=search        → Entity list
GET /api/v1/knowledge/entities/:id             → Entity details + relations
GET /api/v1/knowledge/graph                    → Canvas data (nodes + edges)
```

### Feedback Page
```
GET /api/v1/feedback/mine                      → FeedbackHistory
POST /api/v1/feedback                          → Submit feedback
```

### Settings Page
```
GET /api/v1/me/profile                         → Profile panel data
PUT /api/v1/me/profile                         → Update profile
PUT /api/v1/me/password                        → Change password
GET /api/v1/me/notifications-preferences       → Notification toggles
PUT /api/v1/me/notifications-preferences       → Update notifications
GET /api/v1/me/api-keys                        → API key list
POST /api/v1/me/api-keys                       → Create key
DELETE /api/v1/me/api-keys/:id                 → Revoke key
GET /health                                     → System info panel
```

---

## 7. ReBAC-Aware Rendering

The prototype implements a 3-tier role system (`normal` / `verified` / `premium`) that controls visibility. In the actual app, these map to `basic_user` / `verified_user` / `premium_user` stored in `auth-store.roleTier`.

### Sidebar Navigation

All 8 nav items are visible to all tiers. The **category links** vary:

| Category | basic_user | verified_user | premium_user |
|----------|-----------|---------------|-------------|
| legislation | Yes | Yes | Yes |
| regulation | Yes | Yes | Yes |
| enforcement | Yes | Yes | Yes |
| industry | No | Yes | Yes |
| compliance | No | Yes | Yes |
| data | No | Yes | Yes |
| security | No | No | Yes |
| academic | No | No | Yes |
| events | No | No | Yes |
| international | No | No | Yes |

### Article Source Visibility

The `ArticleSourceView.visibility` field controls source card rendering in the article reader:

| Visibility | Rendering |
|-----------|-----------|
| `full` | Show all 4 source detail items (name, type, health, schedule) with green "完整可见" badge |
| `summary` | Show source name and type only, with yellow "摘要可见" badge |
| `hidden` | Show "信息来源不可见" with gray "不可见" badge |

### Feed Personalization

- `basic_user`: Sees articles from 3 base categories only
- `verified_user`: Sees articles from 6 categories
- `premium_user`: Sees all 10 categories + advanced analytics + full source visibility

### Info Cards Row (My Feed)

The role tier card dynamically shows:
- `basic_user`: "普通用户" with gray badge
- `verified_user`: "认证用户" with purple badge
- `premium_user`: "高级用户" with amber badge

---

## 8. Design System Token Alignment

The prototype CSS variables are already mapped 1:1 to `globals.css` `@theme` tokens:

| Prototype Variable | Tailwind Class | globals.css Token |
|-------------------|---------------|-------------------|
| `--primary-500` | `bg-primary-500` | `--color-primary-500: #ff6b35` |
| `--neutral-50` | `bg-neutral-50` | `--color-neutral-50: #f8f9fa` |
| `--cat-legislation` | `text-legislation` | `--color-legislation: #3498db` |
| `--radius-xl` | `rounded-xl` | `--radius-xl: 1rem` |
| `--shadow-sm` | `shadow-sm` | `--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)` |
| `--shadow-brand` | Custom class | `0 4px 14px -2px rgba(255,107,53,0.25)` |
| `--dash-bg` | Custom class | `#0B1120` (viz card background) |
| `--font-sans` | `font-sans` | `Inter, PingFang SC, Noto Sans SC, ...` |

All category colors, risk level colors, and status badge colors from the prototype are already defined in `globals.css`. No additional tokens needed.

---

## 9. Key Implementation Patterns

### Scroll-Driven Progress Bar

```tsx
// Use mainScroll ref + onScroll handler
const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
```

### Animated Counter (Stats)

```tsx
// IntersectionObserver + requestAnimationFrame + easeOutCubic
// Trigger on viewport entry, animate from 0 to target value
```

### Card Reveal Animation

```tsx
// IntersectionObserver with rootMargin: '0px 0px -60px 0px'
// Staggered delay: index * 80ms
// Transition: opacity 0.5s + translateY(24px -> 0)
```

### Map Click -> Article Popup

```tsx
// ECharts 'click' event handler
// effectScatter click -> show popup with region articles
// geo click on China -> drilldown to China map
// Province click -> show popup with province articles
```

### Sidebar Collapse

```tsx
// Toggle width 280px <-> 64px with CSS transition
// Hide text labels, center icons
// Persist state in ui-store (Zustand)
```

### Reading Settings Panel

```tsx
// Fixed overlay + side panel
// Controls: font size (14/16/18/20), line height (1.6/1.8/2.0), theme (light/dark/sepia)
// Apply changes to article body element styles
```

---

## 10. Shared Overlay Components

These components are rendered at the top level (AppShell) and controlled via state:

| Component | Trigger | Content |
|-----------|---------|---------|
| SearchOverlay | Ctrl+K or click search box | Full-screen overlay with search input + results |
| NotificationDropdown | Click bell icon | Dropdown with notification items + mark all read |
| UserMenu | Click avatar | Dropdown with profile, settings, logout |
| LocaleDropdown | Click globe icon | zh / en language switcher |
| RolePopup | Click role selector in sidebar | Role selection popup (prototype only, real app uses backend roles) |

---

## 11. File Organization

```
apps/web/src/
  app/
    [locale]/
      page.tsx                    # Root redirect logic
      dashboard/page.tsx          # Dashboard (map + stats + feed)
      me/feed/page.tsx            # My Feed
      articles/page.tsx           # All Articles
      articles/[id]/page.tsx      # Article Reader
      reports/page.tsx            # Reports
      analytics/page.tsx          # Analytics (5 tabs)
      knowledge/page.tsx          # Knowledge Graph
      feedback/page.tsx           # Feedback
      settings/page.tsx           # Settings (6 tabs)
      category/[slug]/page.tsx    # Category filtered articles
    globals.css                   # Design tokens
    layout.tsx                    # Root layout with providers
  components/
    layout/
      sidebar.tsx                 # Sidebar with nav + categories + role selector
      header.tsx                  # Topbar with search, notifications, user menu
      main-content.tsx            # Main wrapper
      notification-panel.tsx      # Notification dropdown
    dashboard/
      banner-card.tsx             # Gradient hero CTA card
      viz-card.tsx                # Map + industry chart container
      world-map.tsx               # ECharts world map
      china-map.tsx               # ECharts China drilldown
      industry-chart.tsx          # ECharts industry chart
      map-popup.tsx               # Region article popup
      stats-strip.tsx             # 4 animated stat cards
      feed-section.tsx            # Trending + geo filters + feed grid
      feed-card.tsx               # Article feed card (normal + hero)
    article/
      article-reader.tsx          # Main reader layout
      reader-toc.tsx              # Fixed left TOC
      reader-actions.tsx          # Fixed right action buttons
      reading-settings.tsx        # Settings overlay panel
      source-card.tsx             # Source visibility card
    reports/
      report-card.tsx             # Report card with badges + actions
      report-subscription-panel.tsx # Subscription list
    analytics/
      analytics-tabs.tsx          # Tab bar component
      overview-panel.tsx          # Overview panel (stats + charts)
      risk-chart.tsx              # Risk distribution bar chart
      sentiment-chart.tsx         # Sentiment bar chart
      trend-chart.tsx             # 7-day trend line
      category-stats.tsx          # Category stat cards grid
    knowledge/
      knowledge-canvas.tsx        # Node + edge canvas
      entity-list.tsx             # Left panel entity search + list
      entity-inspector.tsx        # Right panel entity details
    feedback/
      feedback-form.tsx           # Type selector + form
      feedback-history.tsx        # History list
    settings/
      profile-panel.tsx
      notifications-panel.tsx
      appearance-panel.tsx
      security-panel.tsx
      apikeys-panel.tsx
      system-info-panel.tsx
    ui/                           # Shared primitives (card, badge, button, etc.)
  hooks/
    use-articles.ts
    use-reports.ts
    use-knowledge.ts
    use-feedback.ts
    use-sources.ts
    use-auth.ts
    use-authz.ts
    use-me-feed.ts
    use-pins.ts
    use-banners.ts
    use-channels.ts
  stores/
    auth-store.ts                 # Existing
    ui-store.ts                   # New: sidebar + reading preferences
  lib/
    api/
      client.ts                   # Existing API client
      types.ts                    # Existing type definitions
```
