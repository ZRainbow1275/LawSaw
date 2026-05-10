# Wave 9-1 — Dashboard 1:1 Structural Refactor

**Status**: Complete — pending main-agent commit.
**Branch**: `0430-housekeeping`
**Date**: 2026-05-07

User feedback after wave 9 hot-fix #1: "still not good enough — the empty
band is reduced but the layout still doesn't match `prototype/app.html` 1:1."
Wave 9 was a padding tweak; the real fix needed a structural refactor.

---

## Root cause (carried over from task spec, confirmed)

`prototype/app.html` defines two **sibling sections** inside the dashboard
page:

```
.dashboard-hero  { padding: 24px 32px 0;  min-height: calc(100vh - 64px);
                   max-width: 1600px;     display: flex;
                   flex-direction: column; }
   ├─ .dh-header        (live-dot + title + time filters)
   ├─ .dash-grid        (banner-card 320px + viz-card; flex:1; min-height:420)
   ├─ .stats-strip      (4 stat cards)
   └─ .scroll-hint      (bounce-down anchor → feed-section)

.feed-section    { padding: 0 32px 80px;  max-width: 1200px; }
   ├─ .feed-header
   ├─ .trending-strip
   ├─ .geo-filter-bar
   ├─ .feed-filters
   └─ .feed-grid
```

Pre-refactor implementation in `dashboard-page-content.tsx` deviated in
three ways that produced the "empty band / loading-feel" regression:

1. **Wrapped hero in `<DashboardHeroParallax>`** — this added
   `relative isolate overflow-hidden rounded-3xl` which converted the
   full-bleed hero into a card, plus the parallax glow could not paint
   correctly inside the constrained `(shell-wide)` width.
2. **Wrapped every block in a `<motion.section variants=itemVariants>`** —
   `space-y-6` between motion sections plus a parent `staggerChildren`
   created (a) 24px gaps that don't exist in the prototype and (b) a
   perceived "still loading" feel because each block visibly faded in
   sequentially even though the data was already resolved.
3. **Stats strip was outside the hero section** — prototype puts the
   stats strip and scroll-hint **inside** `.dashboard-hero` so they share
   the same 100vh viewport budget. The pre-refactor code moved them out as
   independent siblings, which broke the "one viewport = hero + stats +
   scroll-hint" promise.

Additionally, the parent `(shell-wide)/layout.tsx` provides
`max-w-screen-2xl px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5` for sibling pages
(`knowledge/`, `reports/`, etc.). For dashboard we need to neutralise this
padding **without** mutating the layout (so siblings keep their behaviour).

---

## Refactor

### Files modified

- `apps/web/src/components/dashboard/dashboard-page-content.tsx` — full structural rewrite.
- `apps/web/src/components/dashboard/prototype/dashboard-hero-prototype.tsx` — root from `<section>` → `<div className="flex flex-1 flex-col">`; dash-grid gains `flex-1` so it expands to fill the hero section's vertical space.

Files **not** touched:

- `apps/web/src/app/[locale]/(shell-wide)/layout.tsx` — unchanged, so `knowledge/` / `reports/` keep working exactly as before.
- `apps/web/src/components/dashboard/dashboard-hero-parallax.tsx` — kept on disk (not deleted) but no longer imported by the dashboard. Other consumers may exist; safer to leave dormant than to risk a downstream import break, and it can be removed in a later cleanup pass.

### Key changes in `dashboard-page-content.tsx`

```tsx
// Wrapping `<div>` neutralises the parent (shell-wide) padding via
// negative margins. The layout is still applied (max-w-screen-2xl
// remains), but our content now flows edge-to-edge to the shell <main>.
<div className="-mx-4 -mb-6 -mt-4 flex flex-col md:-mx-6 md:-mb-8 md:-mt-5">

  {/* Section 1 — dashboard-hero (full viewport) */}
  <section
    className="mx-auto flex w-full max-w-[1600px] flex-col px-4 pt-6 md:px-8"
    style={{ minHeight: "calc(100vh - 6rem)" }}
  >
    <DashboardHeroPrototype onScrollToFeed={scrollToFeed} />
    <div className="mt-5"><DashboardStatsStripPrototype /></div>
    <button … className="… animate-bounce-gentle"> {/* scroll-hint */} </button>
  </section>

  {/* Section 2 — feed-section (sibling, narrower max-width) */}
  <section ref={feedSectionRef}
    className="mx-auto w-full max-w-[1200px] px-4 pb-20 md:px-8">
    {/* feed-header / trending / geo / cat / grid */}
  </section>
</div>
```

What was **removed**:

- `containerVariants` / `itemVariants` Framer Motion stagger.
- `<DashboardHeroParallax>` wrapper.
- `space-y-6` between sections.
- The wrapping `<motion.div>` and per-block `<motion.section>` variants.

What was **added**:

- The `min-height: calc(100vh - 6rem)` rule on the hero (matches
  prototype's `calc(100vh - 64px)` adjusted for our 96px topbar+breadcrumb).
- `flex-1` on dash-grid inside `DashboardHeroPrototype` so banner + viz
  cards expand to fill remaining vertical space.
- `animate-bounce-gentle` on the scroll-hint chevron (already defined in
  `globals.css`).

Per-component motion (banner-card, viz-card, stat cards, feed cards) is
**preserved** — those are local fade-in micro-animations that don't stack
into a "still loading" feel. Only the **page-level** stagger was removed.

---

## Real-data verification (NO MOCK)

All metrics, trending items, and feed cards consume live API data via
React Query. Confirmed by reading each component:

| Component | Hook(s) | Endpoint(s) |
|---|---|---|
| `DashboardStatsStripPrototype` | `useArticleStats`, `useArticleTrends`, `useSourceStats`, `useAiAvailability` | `/articles/stats`, `/articles/trends`, `/sources/stats`, `/search/ai/availability` |
| `DashboardHeroPrototype` | `useArticleTrends`, `useIndustryStats`, `useRegionalStats`, `useArticles` | `/articles/trends`, `/statistics/industry`, `/statistics/regional`, `/articles` |
| `DashboardTrendingStripPrototype` | `useArticles({status:"published", limit:10})` | `/articles` |
| `DashboardCatFilter` | `useCategories`, `useArticleCategoryCounts`, `useArticles` | `/categories`, `/articles/categories/counts`, `/articles` |
| `DashboardGeoFilter` | (pure UI; passes value to feed) | — |
| `DashboardFeedGrid` | `useArticles({limit:30, status:"published", category_id})`, `useCategories`, `useReactionSummariesBatch` | `/articles`, `/categories`, `/reactions/batch` |

Captured screenshots show real backend numbers (e.g. stats `0 / 2 / 0 / 95`)
and real region pins on the world map — confirming live data.

---

## Verification

### Static checks

```bash
pnpm --dir apps/web typecheck   # PASSED — no errors
pnpm --dir apps/web lint        # 4 pre-existing warnings, none in touched files
```

The 4 lint warnings are inherited (`auth/protected-route.tsx`,
`me/settings-appearance-tab.tsx`) — none are introduced by this refactor.

### Build

```bash
docker compose build web        # PASSED — image rebuilt
docker compose up -d --no-deps web
```

`http://localhost:18849/zh/dashboard` returns 200 after auth.

### Visual verification (Playwright)

Login: `admin@qa.lawsaw.local` / `Admin@Lawsaw2026`
Locale: `/zh/...` (default for project per `i18n.ts`)
Capture script: `prompts/0507/wave9-1-dashboard/capture.mjs`

Captured **24 screenshots** (4 pages × 3 viewports × 2 schemes):

```
screenshots/{light,dark}/{wide-1600,desktop-1440,laptop-1280}-{01..04}.png
```

Pages: `01-dashboard`, `02-knowledge`, `03-reports`, `04-me-feed`.

#### Dashboard verification (laptop-1280, light)

`screenshots/light/laptop-1280-01-dashboard.png` shows the prototype
layout exactly:

- Header (64px) + breadcrumb "数据看板" at top.
- Page title row: live-dot + "感知态势与系统运行分析" + 日/周/月/年 pills.
- Banner card (320px, orange) + Viz card (dark, world map) side-by-side
  filling the remaining vertical space.
- Stats strip (4 cards: 今日采集 / 覆盖信息源 / 高风险预警 / AI 洞察) at bottom.
- Scroll-hint "向下浏览今日专属资讯流" with bounce chevron.
- **No empty band** between header and content.

#### Dark-mode verification

`screenshots/dark/desktop-1440-01-dashboard.png` confirms the same
structure renders correctly in dark theme — banner card uses orange
gradient against deep-neutral page background, world map keeps its
dark canvas, stat cards use dark surface tokens.

#### Sibling-page integrity

`(shell-wide)/layout.tsx` was **not modified**. Confirmed sibling pages
still render correctly under that layout:

- `screenshots/light/desktop-1440-02-knowledge.png` — knowledge page has
  full sidebar/header chrome, three-column layout, normal padding.
- `screenshots/light/desktop-1440-03-reports.png` — reports page renders.
- `screenshots/light/wide-1600-04-me-feed.png` — me/feed has its
  `今日洞察` hero card and feed grid with normal margins.

---

## Impact analysis (per project CLAUDE.md)

`gitnexus_impact` was not invoked — the refactor is contained to
`dashboard-page-content.tsx` + `dashboard-hero-prototype.tsx`.
Both files are **leaf consumers** of upstream hooks; they have no
downstream callers other than `app/[locale]/(shell-wide)/dashboard/page.tsx`,
which simply mounts `<DashboardPageContent />` with no props.

`grep`-confirmed call graph:

```
DashboardPageContent  ← only used by dashboard/page.tsx
DashboardHeroPrototype ← only used by DashboardPageContent
DashboardHeroParallax ← still imported by ... nobody (now orphaned by design)
```

Risk level: **LOW** — sibling pages (knowledge, reports, me/feed) are
unaffected because we did not touch `(shell-wide)/layout.tsx`. All the
neutralisation lives inside `DashboardPageContent`'s own JSX.

---

## What I did not do (per task constraint)

- Did **not** commit. The main agent will create the commit per phase 3.4.
- Did **not** touch `(shell-default)/layout.tsx` or `(shell-wide)/layout.tsx`.
- Did **not** delete `dashboard-hero-parallax.tsx` (left dormant; safer
  for a later cleanup pass).

---

## Files changed

```
M apps/web/src/components/dashboard/dashboard-page-content.tsx
M apps/web/src/components/dashboard/prototype/dashboard-hero-prototype.tsx
A prompts/0507/wave9-1-dashboard/REPORT.md           (this file)
A prompts/0507/wave9-1-dashboard/capture.mjs         (verification script)
A prompts/0507/wave9-1-dashboard/screenshots/...     (24 captures)
A prompts/0507/wave9-1-dashboard/package.json
A prompts/0507/wave9-1-dashboard/package-lock.json
```

The `node_modules/` under `prompts/0507/wave9-1-dashboard/` is not staged.
