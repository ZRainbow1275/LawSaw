"use client";

/**
 * DashboardPageContent — 1:1 with `prototype/app.html:750-806` dashboard.
 *
 * STRUCTURAL CONTRACT (wave 9-1 refactor — supersedes wave 9 hot-fix #1):
 *
 *   page-dashboard
 *   ├─ section.dashboard-hero        (max-w 1600, min-h calc(100vh - 6rem), flex-col)
 *   │  ├─ dh-header                  (live-dot + title + time filters)
 *   │  ├─ dash-grid (flex-1)         (banner-card 320px + viz-card)
 *   │  ├─ stats-strip                (4 stat cards)
 *   │  └─ scroll-hint                (anchor → feed-section)
 *   └─ section.feed-section          (max-w 1200, pb-20)
 *      ├─ feed-header                ("最新资讯" + "查看全部")
 *      ├─ trending-strip             (marquee)
 *      ├─ geo-filter-bar
 *      ├─ feed-filters               (category pills)
 *      └─ feed-grid                  (hero card + 5 standard cards)
 *
 * Layout neutralization: this page is mounted under `(shell-wide)/layout.tsx`
 * which adds `mx-auto max-w-screen-2xl px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5`.
 * Those rules are correct for `knowledge/`, `reports/` etc. but the dashboard
 * needs to extend edge-to-edge inside the persistent shell `<main>`. We
 * neutralize the parent padding via negative margins on the outer `<div>` so
 * each section can manage its own width / padding exactly like the prototype.
 *
 * NO motion-stagger wrapper: the prototype is a static page (sections fade in
 * individually within their own components). A page-level `staggerChildren`
 * created the impression of "still loading" between sections — we removed it
 * intentionally. Per-component motion (banner-card, viz-card, stat cards,
 * feed cards) is preserved.
 *
 * NO DashboardHeroParallax wrapper: the parallax wrapped the hero in
 * `relative isolate overflow-hidden rounded-3xl`, turning the full-bleed hero
 * into a card. The prototype hero is full-bleed within the shell, so we drop
 * the wrapper and rely on per-card backgrounds inside DashboardHeroPrototype.
 *
 * Real-data only: every metric, trending item, article and chart point is
 * served by live React Query hooks. No hardcoded `127 / 2846 / 8 / 56`
 * placeholders; see `DashboardStatsStripPrototype`, `DashboardFeedGrid`, etc.
 */

import { DashboardCatFilter } from "@/components/dashboard/prototype/dashboard-cat-filter";
import { DashboardFeedGrid } from "@/components/dashboard/prototype/dashboard-feed-grid";
import {
	DashboardGeoFilter,
	type GeoRegion,
} from "@/components/dashboard/prototype/dashboard-geo-filter";
import { DashboardHeroPrototype } from "@/components/dashboard/prototype/dashboard-hero-prototype";
import { DashboardStatsStripPrototype } from "@/components/dashboard/prototype/dashboard-stats-strip-prototype";
import { DashboardTrendingStripPrototype } from "@/components/dashboard/prototype/dashboard-trending-strip-prototype";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

export function DashboardPageContent() {
	const t = useT();
	const locale = useLocale();
	const feedSectionRef = useRef<HTMLElement | null>(null);
	const [geoRegion, setGeoRegion] = useState<GeoRegion>("global");
	const [categoryId, setCategoryId] = useState<string | null>(null);

	const scrollToFeed = useCallback(() => {
		feedSectionRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	return (
		// Negative-margin neutralizer — see header comment. Keeps `(shell-wide)`
		// layout intact for sibling pages while letting the dashboard extend to
		// the shell `<main>` edges (matches prototype/app.html dashboard model).
		<div className="-mx-4 -mb-6 -mt-4 flex flex-col md:-mx-6 md:-mb-8 md:-mt-5">
			{/* dashboard-hero — prototype/app.html:206 → padding: 24px 32px 0;
			    min-height: calc(100vh - 64px); max-width: 1600px; flex-col. */}
			<section
				className="mx-auto flex w-full max-w-[1600px] flex-col px-4 pt-6 md:px-8"
				style={{ minHeight: "calc(100vh - 6rem)" }}
			>
				<DashboardHeroPrototype onScrollToFeed={scrollToFeed} />

				{/* stats-strip — prototype/app.html:777-782 (sits inside dashboard-hero). */}
				<div className="mt-5">
					<DashboardStatsStripPrototype />
				</div>

				{/* scroll-hint — prototype/app.html:259-261 / 783. Vertical bounce
				    icon below the strip; clicking anchors to the feed section. */}
				<button
					type="button"
					onClick={scrollToFeed}
					className="mx-auto flex flex-col items-center gap-2 px-4 py-5 text-[13px] font-medium transition-colors hover:text-[var(--color-primary-500)]"
					style={{ color: "var(--surface-card-faint-fg)" }}
				>
					{t("Scroll for today's curated feed")}
					<span
						aria-hidden="true"
						className="animate-bounce-gentle flex h-8 w-8 items-center justify-center rounded-full border-[1.5px]"
						style={{ borderColor: "var(--surface-card-border-strong)" }}
					>
						<ChevronDown className="h-4 w-4" />
					</span>
				</button>
			</section>

			{/* feed-section — prototype/app.html:264 → padding: 0 32px 80px;
			    max-width: 1200px. */}
			<section
				ref={feedSectionRef}
				className="mx-auto w-full max-w-[1200px] px-4 pb-20 md:px-8"
			>
				{/* feed-header — prototype/app.html:265-268 + 273. */}
				<div className="mb-5 flex items-center justify-between pt-2">
					<div className="flex items-baseline gap-2.5">
						<h2
							className="text-[18px] font-bold leading-tight"
							style={{ color: "var(--field-foreground)" }}
						>
							{t("Latest articles")}
						</h2>
						<span
							className="text-[13px]"
							style={{ color: "var(--surface-card-faint-fg)" }}
						>
							{t("Recent legal updates curated for you")}
						</span>
					</div>
					<Link
						href={withLocalePath(locale, "/articles")}
						className="inline-flex items-center gap-1 rounded-md border bg-white px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:border-[var(--color-primary-500)] hover:text-[var(--color-primary-500)]"
						style={{
							borderColor: "var(--surface-card-border-strong)",
							color: "var(--surface-card-muted-fg)",
						}}
					>
						{t("View all")}
						<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
					</Link>
				</div>

				<div className="mb-5">
					<DashboardTrendingStripPrototype />
				</div>
				<div className="mb-3">
					<DashboardGeoFilter value={geoRegion} onChange={setGeoRegion} />
				</div>
				<div className="mb-5">
					<DashboardCatFilter value={categoryId} onChange={setCategoryId} />
				</div>
				<DashboardFeedGrid geoRegion={geoRegion} categoryId={categoryId} />
			</section>
		</div>
	);
}
