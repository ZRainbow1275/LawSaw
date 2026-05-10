"use client";

/**
 * DashboardHeroPrototype — 1:1 hero shell from `prototype/app.html:750-784`.
 *
 * Layout:
 *   - dh-header: live-dot + title + subtitle (left), time filter pills (right)
 *   - dash-grid: 320px banner-card (orange) + 1fr viz-card (dark)
 *   - viz-card has tabs (geo / industry) and back button (china drill-down only)
 *
 * Feeds real data into world map + industry chart. Time filter mutates the
 * trend window so the industry chart reflects the selected period.
 */

import { useArticleTrends, useArticles } from "@/hooks/use-articles";
import { useIndustryStats, useRegionalStats } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { ArrowRight, ChartPie, Globe2 } from "lucide-react";
import { useMemo, useState } from "react";
import { IndustryChart } from "./industry-chart";
import { WorldMapChart } from "./world-map-chart";

type Timeframe = "day" | "week" | "month" | "year";
type VizTab = "map" | "industry";

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
	day: 1,
	week: 7,
	month: 30,
	year: 365,
};

interface DashboardHeroPrototypeProps {
	onScrollToFeed?: () => void;
}

export function DashboardHeroPrototype({
	onScrollToFeed,
}: DashboardHeroPrototypeProps) {
	const t = useT();
	const [timeframe, setTimeframe] = useState<Timeframe>("week");
	const [tab, setTab] = useState<VizTab>("map");

	const days = TIMEFRAME_DAYS[timeframe];
	const trendsQuery = useArticleTrends(days);
	const industryQuery = useIndustryStats();
	const regionalQuery = useRegionalStats();
	// Pre-warm articles cache for popular content (used elsewhere too)
	useArticles({ limit: 1, status: "published" });

	const trendPoints = useMemo(() => trendsQuery.data ?? [], [trendsQuery.data]);
	const industries = useMemo(
		() => industryQuery.data?.items ?? [],
		[industryQuery.data],
	);
	const regions = useMemo(
		() => regionalQuery.data?.items ?? [],
		[regionalQuery.data],
	);

	const timeButtons: Array<{ id: Timeframe; label: string }> = [
		{ id: "day", label: t("Day") },
		{ id: "week", label: t("Week") },
		{ id: "month", label: t("Month") },
		{ id: "year", label: t("Year") },
	];

	return (
		<div className="flex flex-1 flex-col">
			{/* dh-header */}
			<div className="mb-5 flex flex-wrap items-center justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1
						className="flex items-center gap-2.5 text-xl font-bold"
						style={{ color: "var(--field-foreground)" }}
					>
						<span
							className="animate-pulse-live h-2 w-2 rounded-full"
							style={{ backgroundColor: "var(--color-success)" }}
							aria-hidden="true"
						/>
						{t("Situational awareness & system pulse")}
					</h1>
					<p
						className="text-[13px]"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{t(
							"Tracks legal & regulatory shifts across 86 jurisdictions in real time",
						)}
					</p>
				</div>

				{/* time filters */}
				<div
					role="tablist"
					aria-label={t("Day")}
					className="relative flex overflow-hidden rounded-lg border"
					style={{
						backgroundColor: "var(--color-card)",
						borderColor: "var(--surface-card-border-strong)",
					}}
				>
					{timeButtons.map((btn) => {
						const active = btn.id === timeframe;
						return (
							<button
								key={btn.id}
								type="button"
								role="tab"
								aria-selected={active}
								onClick={() => setTimeframe(btn.id)}
								className="relative z-10 px-5 py-1.5 text-[13px] font-medium transition-colors"
								style={{
									color: active ? "white" : "var(--surface-card-faint-fg)",
								}}
							>
								<span className="relative z-10">{btn.label}</span>
								{active ? (
									<motion.span
										layoutId="time-slider"
										className="absolute inset-0 -z-0 rounded-md"
										style={{ backgroundColor: "var(--color-primary-500)" }}
										transition={{ type: "spring", stiffness: 400, damping: 32 }}
									/>
								) : null}
							</button>
						);
					})}
				</div>
			</div>

			{/* dash-grid — prototype/app.html:219 → `display:grid; flex:1; min-height:420px;` */}
			<div
				className="grid flex-1 gap-5 md:grid-cols-[320px_1fr]"
				style={{ minHeight: 420 }}
			>
				{/* banner-card */}
				<motion.article
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					className="relative flex flex-col justify-between overflow-hidden rounded-2xl px-6 py-8 text-white"
					style={{
						background: "var(--gradient-banner)",
						boxShadow:
							"0 8px 32px color-mix(in srgb, var(--color-primary-500) 25%, transparent)",
					}}
				>
					<span
						aria-hidden="true"
						className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full"
						style={{
							background:
								"radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)",
						}}
					/>
					<span
						className="self-start rounded-full px-3.5 py-1 text-xs font-semibold backdrop-blur-md"
						style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
					>
						{t("Featured analysis")}
					</span>
					<div className="relative my-6">
						<h2 className="text-[22px] font-extrabold leading-tight">
							{t("2024 Antitrust & Compliance Global Regulatory White Paper")}
						</h2>
						<p className="mt-3 text-sm leading-relaxed opacity-90">
							{t(
								"Distills 3,000+ core case files to illuminate the evolution of platform antitrust and cross-border data rules.",
							)}
						</p>
					</div>
					<button
						type="button"
						onClick={() => onScrollToFeed?.()}
						className="relative inline-flex items-center gap-1.5 self-start rounded-full bg-white px-5 py-2.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
						style={{ color: "var(--color-primary-500)" }}
					>
						{t("Read articles")}
						<ArrowRight aria-hidden="true" className="h-4 w-4" />
					</button>
				</motion.article>

				{/* viz-card */}
				<motion.article
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, delay: 0.05, ease: "easeOut" }}
					className="relative flex flex-col overflow-hidden rounded-2xl"
					style={{
						background: "var(--gradient-viz-card)",
						boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
					}}
				>
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-0"
						style={{ background: "var(--gradient-viz-halo)" }}
					/>

					{/* viz-header */}
					<div
						className="relative z-10 flex items-center justify-between border-b px-5"
						style={{ borderColor: "rgba(255,255,255,0.06)" }}
					>
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => setTab("map")}
								className="flex items-center gap-1.5 border-b-2 px-4 py-3.5 text-[13px] font-semibold transition-colors"
								style={{
									color:
										tab === "map"
											? "var(--color-primary-500)"
											: "rgba(255,255,255,0.45)",
									borderColor:
										tab === "map" ? "var(--color-primary-500)" : "transparent",
								}}
							>
								<Globe2 aria-hidden="true" className="h-3.5 w-3.5" />
								{t("Geographic distribution")}
							</button>
							<button
								type="button"
								onClick={() => setTab("industry")}
								className="flex items-center gap-1.5 border-b-2 px-4 py-3.5 text-[13px] font-semibold transition-colors"
								style={{
									color:
										tab === "industry"
											? "var(--color-primary-500)"
											: "rgba(255,255,255,0.45)",
									borderColor:
										tab === "industry"
											? "var(--color-primary-500)"
											: "transparent",
								}}
							>
								<ChartPie aria-hidden="true" className="h-3.5 w-3.5" />
								{t("Industry momentum")}
							</button>
						</div>
					</div>

					{/* viz-body */}
					<div className="relative z-10 flex-1">
						<div
							className="absolute inset-0 transition-opacity duration-300"
							style={{
								opacity: tab === "map" ? 1 : 0,
								pointerEvents: tab === "map" ? "auto" : "none",
							}}
						>
							<WorldMapChart regionalCounts={regions} active={tab === "map"} />
						</div>
						<div
							className="absolute inset-0 transition-opacity duration-300"
							style={{
								opacity: tab === "industry" ? 1 : 0,
								pointerEvents: tab === "industry" ? "auto" : "none",
							}}
						>
							<IndustryChart
								trends={trendPoints}
								industries={industries}
								loading={trendsQuery.isPending || industryQuery.isPending}
							/>
						</div>
					</div>
				</motion.article>
			</div>
		</div>
	);
}
