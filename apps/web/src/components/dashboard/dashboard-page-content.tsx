"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { ContinueReadingCard } from "@/components/dashboard/continue-reading-card";
import { DashboardCatFilter } from "@/components/dashboard/prototype/dashboard-cat-filter";
import { DashboardFeedGrid } from "@/components/dashboard/prototype/dashboard-feed-grid";
import {
	DashboardGeoFilter,
	type GeoRegion,
} from "@/components/dashboard/prototype/dashboard-geo-filter";
import { DashboardHeroPrototype } from "@/components/dashboard/prototype/dashboard-hero-prototype";
import { DashboardStatsStripPrototype } from "@/components/dashboard/prototype/dashboard-stats-strip-prototype";
import { DashboardTrendingStripPrototype } from "@/components/dashboard/prototype/dashboard-trending-strip-prototype";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08, delayChildren: 0.05 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 16 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const dashboardPageShellStyle = {
	backgroundColor: "var(--color-background)",
	backgroundImage: "none",
} as const;

export function DashboardPageContent() {
	const [geoRegion, setGeoRegion] = useState<GeoRegion>("global");
	const [categoryId, setCategoryId] = useState<string | null>(null);
	const feedRef = useRef<HTMLDivElement | null>(null);

	const scrollToFeed = useCallback(() => {
		feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, []);

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen" style={dashboardPageShellStyle}>
				<Sidebar />

				<MainContent>
					<Header />

					<motion.div
						className="space-y-6 p-6"
						variants={containerVariants}
						initial="hidden"
						animate="visible"
					>
						<motion.div variants={itemVariants}>
							<DashboardHeroPrototype onScrollToFeed={scrollToFeed} />
						</motion.div>

						<motion.div variants={itemVariants}>
							<DashboardStatsStripPrototype />
						</motion.div>

						<motion.div variants={itemVariants}>
							<ContinueReadingCard />
						</motion.div>

						<motion.div variants={itemVariants}>
							<DashboardTrendingStripPrototype />
						</motion.div>

						<motion.div ref={feedRef} variants={itemVariants} className="space-y-4">
							<DashboardGeoFilter value={geoRegion} onChange={setGeoRegion} />
							<DashboardCatFilter value={categoryId} onChange={setCategoryId} />
							<DashboardFeedGrid geoRegion={geoRegion} categoryId={categoryId} />
						</motion.div>
					</motion.div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
