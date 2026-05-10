# Wave 9 Recovery — UserShell flex regression hotfix (2026-05-09)

**Trigger**: User reported `/zh/articles` and several other routes showing sidebar collapsed top-left + content shifted right with empty band; `/zh/knowledge` no longer constrained to one viewport.

## Root cause

Wave 9 hot-fix #4 changed `<Sidebar>` from `position: fixed` to a flex-row child to bypass `RouteTransitionProvider`'s `filter`-induced containing-block trap. `PersistentUserShellChrome` was updated to a `flex h-screen overflow-hidden` shell so sidebar + main sit side-by-side.

**BUT** the legacy `<UserShell>` component at `apps/web/src/components/layout/user-shell.tsx` was NOT updated. It still used the old `relative min-h-screen` + `<div md:ml-[280px]>` push pattern that expected a fixed sidebar. With sidebar now a flex child but parent NOT a flex container, sidebar took natural block flow and `md:ml-[280px]` left a gaping 280px empty band.

This affected every route in `SHELL_EXEMPT_PREFIXES` that internally renders its own `<UserShell>`:
- `/zh/articles`, `/zh/sources`, `/zh/settings`, `/zh/search`, `/zh/data`, `/zh/feedback`, `/zh/analytics`, `/zh/category/[slug]`

Knowledge graph viewport: `(shell-wide)/layout.tsx` used `min-h-full flex flex-col`, which allows the layout div to grow beyond viewport height when `flex-1` children claim natural sizes that don't propagate cleanly. Switching to `h-full` (exact) forces the chain `<main flex-1 overflow-y-auto>` -> `<div h-full flex flex-col>` -> `<knowledge flex-1 min-h-0>` to fit the viewport, with internal panel `overflow-auto` handling scroll.

## Files changed

| File | Change |
| --- | --- |
| `apps/web/src/components/layout/user-shell.tsx` | `UserShellContent` rewritten to mirror `PersistentUserShellChrome`: `flex h-screen w-full overflow-hidden` outer, `<Sidebar>` as flex-row child, `<main flex-1 overflow-y-auto scrollbar-subtle>` with inner padded `<div>` for `containerByVariant` width control. Dropped `useSidebarStore` + `md:ml-[280px]` push. |
| `apps/web/src/app/[locale]/(shell-wide)/layout.tsx` | `min-h-full` -> `h-full`. Forces deterministic viewport-fit for knowledge while keeping dashboard's natural overflow behavior (its hero uses `min-h:calc(100vh-6rem)` + outer negative margins to force main scroll). |

## Verification

- `pnpm --dir apps/web typecheck` -> 0 errors
- `pnpm --dir apps/web lint` -> 0 errors, 4 pre-existing a11y warnings (acceptable)
- `docker compose build web && docker compose up -d --no-deps --force-recreate web` -> image rebuilt, `lawsaw-web-1` healthy
- HTTP smoke (curl): all 14 user-facing routes return 200
- Playwright capture (1440x900 light) for all 14 routes -> `screenshots/light/`

## Route matrix

| # | Route | Shell | Result |
| --- | --- | --- | --- |
| 01 | `/zh/dashboard` | PersistentUserShell + (shell-wide) | OK Hero + stats + feed |
| 02 | `/zh/me` | PersistentUserShell + (shell-default) | OK |
| 03 | `/zh/me/feed` | PersistentUserShell + (shell-wide) | OK |
| 04 | `/zh/knowledge` | PersistentUserShell + (shell-wide) | OK 3-col fits viewport |
| 05 | `/zh/reports` | PersistentUserShell + (shell-wide) | OK |
| 06 | `/zh/articles` | Legacy UserShell (exempt) | OK Sidebar 280px + content |
| 07 | `/zh/sources` | (shell-default) page imports UserShell | OK |
| 08 | `/zh/settings` | Legacy UserShell | OK Tabs + form |
| 09 | `/zh/search?q=test` | Legacy UserShell | OK |
| 10 | `/zh/data` | Legacy UserShell (exempt) | OK Data table |
| 11 | `/zh/feedback` | Legacy UserShell | OK |
| 12 | `/zh/analytics` | Legacy UserShell | OK |
| 13 | `/zh/admin` | AdminShell | OK Workspace tiles |
| 14 | `/zh/admin/insights/reactions` | AdminShell | OK Reaction insights |

All 14 routes show: sidebar at expected 280px on left, header sticky atop main scroll region, content fills remaining width with no white empty band. Sidebar stays in place when main scrolls. Knowledge graph fits one viewport with internal panel scroll only.
