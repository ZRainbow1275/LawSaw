"use client";

/**
 * DashboardPageContent — 1:1 with `prototype/app.html:750-805` dashboard.
 *
 * Layout (top → bottom):
 *   1. DashboardHeroPrototype  → dh-header + banner-card + viz-card grid
 *   2. DashboardStatsStripPrototype → 4 stat cards (today / sources / risk / AI)
 *   3. scroll-hint  → click anchors to feed section (matches prototype 783)
 *   4. feed-section:
 *      - feed-header → "最新资讯" + "查看全部"
 *      - DashboardTrendingStripPrototype  → marquee
 *      - DashboardGeoFilter  → 7 region chips
 *      - DashboardCatFilter  → category pills
 *      - DashboardFeedGrid   → hero + 5 standard cards
 *
 * Real-data legacy widgets (`category-overview`, `recent-articles`,
 * `continue-reading-card`, `stats-cards`, `dashboard-hero`) were the prior
 * shell. They remain on disk as fallback components and are not imported
 * here on purpose — the prototype path is the single source of truth.
 */

import { DashboardHeroParallax } from "@/components/dashboard/dashboard-hero-parallax";
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
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.07, delayChildren: 0.04 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 16 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

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
		<motion.div
			className="space-y-6 pb-12"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			{/* dashboard-hero — prototype/app.html:750
			    Wrapped with DashboardHeroParallax (P3#9) for scroll-driven backdrop. */}
			<motion.section variants={itemVariants}>
				<DashboardHeroParallax>
					<DashboardHeroPrototype onScrollToFeed={scrollToFeed} />
				</DashboardHeroParallax>
			</motion.section>

			{/* stats-strip — prototype/app.html:777-782 */}
			<motion.section variants={itemVariants}>
				<DashboardStatsStripPrototype />
			</motion.section>

			{/* scroll-hint — prototype/app.html:783 */}
			<motion.button
				type="button"
				variants={itemVariants}
				onClick={scrollToFeed}
				className="group mx-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
				style={{ color: "var(--surface-card-faint-fg)" }}
			>
				{t("Scroll for today's curated feed")}
				<span
					aria-hidden="true"
					className="flex h-5 w-5 items-center justify-center rounded-full transition-transform group-hover:translate-y-0.5"
					style={{
						backgroundColor: "var(--surface-card-tint-bg)",
						color: "var(--color-primary-500)",
					}}
				>
					<ChevronDown className="h-3 w-3" />
				</span>
			</motion.button>

			{/* feed-section — prototype/app.html:785 */}
			<motion.section
				variants={itemVariants}
				ref={feedSectionRef}
				className="space-y-4 pt-4"
			>
				<header className="flex items-center justify-between">
					<div>
						<h2
							className="text-[20px] font-extrabold leading-tight"
							style={{ color: "var(--field-foreground)" }}
						>
							{t("Latest articles")}
						</h2>
						<p
							className="mt-1 text-xs"
							style={{ color: "var(--surface-card-faint-fg)" }}
						>
							{t("Recent legal updates curated for you")}
						</p>
					</div>
					<Link
						href={withLocalePath(locale, "/articles")}
						className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-neutral-50"
						style={{
							borderColor: "var(--surface-card-border-strong)",
							color: "var(--surface-card-muted-fg)",
						}}
					>
						{t("View all")}
						<ArrowUpRight aria-hidden="true" className="h-3 w-3" />
					</Link>
				</header>

				<DashboardTrendingStripPrototype />
				<DashboardGeoFilter value={geoRegion} onChange={setGeoRegion} />
				<DashboardCatFilter value={categoryId} onChange={setCategoryId} />
				<DashboardFeedGrid geoRegion={geoRegion} categoryId={categoryId} />
			</motion.section>
		</motion.div>
	);
}
