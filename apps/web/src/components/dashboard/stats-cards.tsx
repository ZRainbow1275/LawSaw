"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useArticleStats } from "@/hooks/use-articles";
import { useSourceStats } from "@/hooks/use-sources";
import { useT } from "@/lib/i18n-client";
import {
	cardHoverEffect,
	fadeVariants,
	staggerContainerVariants,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	Clock,
	FileText,
	type LucideIcon,
	Rss,
} from "lucide-react";

// ============================================
// Type definitions
// ============================================

interface StatConfig {
	title: string;
	value: number | null;
	icon: LucideIcon;
	color: "primary" | "success" | "warning" | "error";
	isLoading: boolean;
	isError: boolean;
}

// ============================================
// Colors
// ============================================

const colorConfig = {
	primary: {
		bg: "bg-primary-100",
		text: "text-primary-600",
		gradient: "from-primary-500 to-primary-600",
	},
	success: {
		bg: "bg-green-100",
		text: "text-green-600",
		gradient: "from-green-500 to-green-600",
	},
	warning: {
		bg: "bg-amber-100",
		text: "text-amber-600",
		gradient: "from-amber-500 to-amber-600",
	},
	error: {
		bg: "bg-red-100",
		text: "text-red-600",
		gradient: "from-red-500 to-red-600",
	},
};

// ============================================
// StatCard
// ============================================

function StatCard({ stat, index }: { stat: StatConfig; index: number }) {
	const colors = colorConfig[stat.color];
	const Icon = stat.icon;
	const t = useT();

	return (
		<motion.div
			variants={fadeVariants}
			whileHover={cardHoverEffect}
			className="h-full"
		>
			<Card className="relative overflow-hidden h-full group">
				{/* Top gradient bar */}
				<div
					className={cn(
						"absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity",
						colors.gradient,
					)}
				/>

				<CardContent className="p-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium text-neutral-500">
								{t(stat.title)}
							</p>
							<div className="mt-2">
								{stat.isLoading ? (
									<div className="h-9 w-16 rounded bg-neutral-100 animate-pulse" />
								) : stat.isError || stat.value === null ? (
									<span className="text-3xl font-bold text-neutral-400">—</span>
								) : (
									<AnimatedNumber
										value={stat.value}
										duration={1200}
										animateOnView
										numberClassName="text-3xl font-bold text-neutral-900"
									/>
								)}
							</div>
						</div>

						{/* Icon container */}
						<motion.div
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
							className={cn(
								"flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
								colors.bg,
								colors.text,
							)}
						>
							<Icon aria-hidden="true" className="h-6 w-6" />
						</motion.div>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}

// ============================================
// StatsCards
// ============================================

export function StatsCards() {
	const statsQuery = useArticleStats();
	const sourceStatsQuery = useSourceStats();
	const t = useT();

	const activeSources =
		sourceStatsQuery.isError || !sourceStatsQuery.data
			? null
			: sourceStatsQuery.data.active_count;

	const handleRetry = () => {
		statsQuery.refetch();
		sourceStatsQuery.refetch();
	};

	const hasError = statsQuery.isError || sourceStatsQuery.isError;

	const stats: StatConfig[] = [
		{
			title: "Today's articles",
			value:
				statsQuery.isError || !statsQuery.data
					? null
					: statsQuery.data.today_count,
			icon: FileText,
			color: "primary",
			isLoading: statsQuery.isLoading,
			isError: statsQuery.isError,
		},
		{
			title: "Active sources",
			value: activeSources,
			icon: Rss,
			color: "success",
			isLoading: sourceStatsQuery.isLoading,
			isError: sourceStatsQuery.isError,
		},
		{
			title: "Pending",
			value:
				statsQuery.isError || !statsQuery.data
					? null
					: statsQuery.data.pending_count,
			icon: Clock,
			color: "warning",
			isLoading: statsQuery.isLoading,
			isError: statsQuery.isError,
		},
		{
			title: "Risk alerts",
			value:
				statsQuery.isError || !statsQuery.data
					? null
					: statsQuery.data.high_risk_count,
			icon: AlertTriangle,
			color: "error",
			isLoading: statsQuery.isLoading,
			isError: statsQuery.isError,
		},
	];

	return (
		<div className="mb-8">
			<motion.div
				variants={staggerContainerVariants}
				initial="hidden"
				animate="visible"
				className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
			>
				{stats.map((stat, index) => (
					<StatCard key={stat.title} stat={stat} index={index} />
				))}
			</motion.div>

			{hasError ? (
				<div className="mt-3 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
					<p className="text-xs text-red-700">
						{t("Some stats failed to load; unreliable values are hidden.")}
					</p>
					<Button variant="outline" size="sm" onClick={handleRetry}>
						{t("Retry")}
					</Button>
				</div>
			) : null}
		</div>
	);
}
