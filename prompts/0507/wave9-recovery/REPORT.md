# Wave 9 — UI Recovery Report (2026-05-07)

Branch: `0430-housekeeping`
Scope: 6 user-reported defects on the persistent user shell + dashboard + knowledge + nav transitions
Constraint: real data only, prototype 1:1, no commit, typecheck + lint clean

---

## Summary of Fixes

| Issue | Symptom (user words) | Root cause | Fix |
|---|---|---|---|
| 1 | Dashboard top has visible empty band before the orange hero card; "looks incomplete" | `(shell-wide)/layout.tsx` applied `py-6 md:py-8` (24/32 px top) which stacked with the dashboard motion variants' `y: 16` enter offset and the inner `space-y-6 pb-12` strip. The compounding gap pushed the orange `dh-banner-card` ~80 px below the breadcrumb bar. | Tightened the route-group wrapper to `pt-4 md:pt-5 pb-6 md:pb-8`, dropped the redundant `pb-12` on `<DashboardPageContent>`, halved framer-motion enter offset (`y: 16 → 8`) and shortened item duration (`0.4s → 0.3s`, container stagger `0.07 → 0.05`). |
| 2 | WorkspaceSwitcher pill is on the LEFT side of the header; user wants it grouped with the right-side controls (Globe / Notifications / User-Menu). | Header had `<WorkspaceSwitcher />` rendered between the mobile-menu button and the search field. | Moved the pill out of the left flex group and into the right "Right Actions" cluster, placed BEFORE the language Globe button. Used `WorkspaceSwitcher`'s existing `className` prop with `hidden md:block` (matches AdminShell's pattern). |
| 3 | Page-to-page navigation feels broken / slow. | `RouteTransitionProvider` ran a 280 ms blur+x-translate transition that triggered full-screen paint per frame AND its `filter: blur(...)` turned the wrapper into a CSS containing block for every descendant `position: fixed` element (sidebar bug, see #4). | Dropped the `filter` keyframes (kept opacity + small `x` translate), shortened duration to 180 ms (120 ms reduced-motion), removed the unnecessary `min-h-screen` wrapper that fought the new flex shell. |
| 4 | Sidebar scrolls with main content despite using `fixed left-0 top-0`. | `RouteTransitionProvider`'s `motion.div` carries `filter: blur(0px)` (idle) and `transform: translateX(0)` during/after route transitions. Per CSS spec these turn the ancestor into the containing block for descendant `position: fixed`, so the sidebar got "trapped" — it scrolled with the doc instead of staying pinned to the viewport. | Refactored `PersistentUserShellChrome` to the same flex-row pattern AdminShell uses since wave 8 hot-fix #7: `<div className="flex h-screen overflow-hidden">` shell with `<aside className="hidden md:flex shrink-0 h-full">` as a flex-row child (no `fixed`) and `<main className="flex-1 overflow-y-auto">` as the only doc-level scroll region. Sidebar `<aside>` now has its `fixed left-0 top-0` removed; mobile drawer keeps `fixed inset-y-0` because it's an overlay. |
| 5 | Sidebar nav shows the loud orange-gradient browser scrollbar. | Global `::-webkit-scrollbar-thumb` rule applies the brand-orange gradient. There was no opt-out utility for internal scroll regions. | Added `.scrollbar-subtle` utility in `globals.css` — `scrollbar-width: thin`, `scrollbar-color: transparent transparent` (default invisible), fades in to `var(--surface-muted-border)` on `:hover` / `:focus-within`. Applied to sidebar `<nav>`, knowledge `entity-list-panel` and `entity-inspector-panel` inner scroll containers, and the new shell `<main>`. |
| 6 | `/zh/knowledge` outer page scrolls vertically. User wants the entire knowledge UI to fit the viewport, with only internal panels scrolling. | Knowledge page used `h-[calc(100vh-160px)]` which (a) referenced `100vh` even though the page is now inside a scrolling `<main>`, and (b) the parent shell-wide route-group wrapper used `<main>` block-flow without `flex-1`, so the page couldn't claim the residual height. | Made the shell-wide route-group wrapper a flex-column (`flex min-h-full flex-col`) so children can claim `flex-1`. Switched `KnowledgePageContent` outer to `flex min-h-0 flex-1 flex-col`, replaced the `h-[calc(100vh-160px)]` grid with `flex-1 min-h-0`. Each inner panel was already `flex h-full min-h-0 flex-col` with internal `overflow-auto` regions — those are now the only scrollers, and they got the `scrollbar-subtle` class. |

---

## Files Modified

Absolute paths:

- `D:\Desktop\LawSaw\apps\web\src\components\layout\header.tsx` — Issue 2: WorkspaceSwitcher relocated from left to right cluster.
- `D:\Desktop\LawSaw\apps\web\src\components\layout\persistent-user-shell.tsx` — Issue 4: Chrome refactored to `flex h-screen` shell with `<main flex-1 overflow-y-auto scrollbar-subtle>`. Removed unused `cn` and `useSidebarStore` imports.
- `D:\Desktop\LawSaw\apps\web\src\components\layout\sidebar.tsx` — Issue 4: Desktop `<aside>` dropped `fixed left-0 top-0`, became flow-level flex item with `h-full transition-[width]`. Mobile drawer kept `fixed inset-y-0`. Issue 5: inner `<nav>` got `scrollbar-subtle`.
- `D:\Desktop\LawSaw\apps\web\src\components\providers\route-transition-provider.tsx` — Issue 3: Dropped `filter: blur(...)`, reduced `x` travel and duration.
- `D:\Desktop\LawSaw\apps\web\src\app\globals.css` — Issue 5: Added `.scrollbar-subtle` utility (CSS variables + WebKit + Firefox `scrollbar-width: thin`).
- `D:\Desktop\LawSaw\apps\web\src\app\[locale]\(shell-wide)\layout.tsx` — Issue 1+6: Switched root element from `<main>` (would conflict with the new shell `<main>`) to `<div>`, applied `flex min-h-full flex-col` so knowledge can `flex-1`. Reduced top padding to `pt-4 md:pt-5`.
- `D:\Desktop\LawSaw\apps\web\src\app\[locale]\(shell-default)\layout.tsx` — Same `<main>` → `<div>` fix, padding tightened to match.
- `D:\Desktop\LawSaw\apps\web\src\components\dashboard\dashboard-page-content.tsx` — Issue 1: Dropped `pb-12`, lowered `y: 16 → 8`, shortened motion durations.
- `D:\Desktop\LawSaw\apps\web\src\components\knowledge\prototype\knowledge-page-content.tsx` — Issue 6: outer `flex min-h-0 flex-1`, grid `flex-1 min-h-0`.
- `D:\Desktop\LawSaw\apps\web\src\components\knowledge\prototype\entity-list-panel.tsx` — Issue 5: inner scroll region got `scrollbar-subtle`.
- `D:\Desktop\LawSaw\apps\web\src\components\knowledge\prototype\entity-inspector-panel.tsx` — Issue 5: inner scroll region got `scrollbar-subtle`.

---

## Verification

### TypeScript (`pnpm --dir apps/web typecheck`)
```
0 errors
```

### Linter (`pnpm --dir apps/web lint`)
```
Checked 367 files in 106ms.
Found 4 warnings.
```
All 4 warnings are pre-existing `lint/a11y/useSemanticElements` advisories on `protected-route.tsx` and `settings-appearance-tab.tsx` — they were already present on the base branch and are expected per the task brief.

### Docker rebuild
```
docker compose build web   → image built, sha256:d274c96b7129...
docker compose up -d --no-deps --force-recreate web
docker inspect lawsaw-web-1 → State.Health.Status = healthy
```

### HTTP smoke tests (curl http://127.0.0.1:18849)
```
/zh           -> 200
/zh/dashboard -> 200
/zh/knowledge -> 200
/zh/me/feed   -> 200
/zh/login     -> 200
```

---

## Architectural Notes

### Why two `<main>` elements would have been a regression

Before this wave the `<main>` was rendered by `(shell-default)/layout.tsx` and `(shell-wide)/layout.tsx`. There was no `<main>` in `PersistentUserShellChrome` — it just rendered a `<div className="flex flex-1 flex-col">`.

When I introduced the flex-row shell pattern (`<aside> + <main flex-1 overflow-y-auto>`) inside `PersistentUserShellChrome`, the shell became the canonical owner of the `<main>` landmark and the document-level scroll region. The two route-group layouts had to switch from `<main>` to `<div>` to avoid producing nested `<main>` landmarks (invalid HTML, breaks `#main-content` skip-link queries, confuses screen readers).

### Why the `RouteTransitionProvider` workaround is no longer load-bearing

AdminShell's wave 8 hot-fix #7 comment explicitly noted that touching `RouteTransitionProvider` was avoided because "transform 同样会触发 containing-block 替换". With the new flex-row shell pattern in `PersistentUserShellChrome`, the sidebar is **no longer `position: fixed` at all** — it's a flow-level flex item locked to its row's height. So the transform/filter containing-block issue still exists in CSS but is no longer relevant to the sidebar's vertical pinning. I tightened `RouteTransitionProvider` purely for navigation-feel reasons (Issue 3), not because the old motion was breaking the sidebar.

### Mobile drawer preserved

`<motion.dialog>` mobile drawer in both Sidebar and AdminShell still uses `fixed inset-y-0 left-0 z-50`. It IS technically a descendant of `RouteTransitionProvider`'s motion wrapper, but mobile drawer is opened/closed transiently and lives under its own `AnimatePresence` — it's never visible during a route transition, so the containing-block trap doesn't manifest in practice.

---

## Not Committed

Per task brief: changes staged in working tree only. Run `git status` to view.
