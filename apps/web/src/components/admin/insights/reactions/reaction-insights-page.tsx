"use client";

import { useT } from "@/lib/i18n-client";
import { Heart } from "lucide-react";
import { useState } from "react";
import { CategoryBreakdownBar } from "./category-breakdown-bar";
import { ColdStartList } from "./cold-start-list";
import { ControversyHeatmap } from "./controversy-heatmap";
import { InsightsHero } from "./insights-hero";
import { NegativeSignalAlerts } from "./negative-signal-alerts";
import { SourceHealthGrid } from "./source-health-grid";
import { TopReactiveUsers } from "./top-reactive-users";
import { TopScoreLeaderboard } from "./top-score-leaderboard";
import { TrendChart } from "./trend-chart";
import { DEFAULT_WINDOW, type ReactionInsightWindow } from "./types";

/**
 * Reaction insights admin dashboard.
 *
 * Layout (12-col grid, responsive):
 *   - Hero: 4 KPI tiles (full width)
 *   - Row 1: Trend (col-span 8) | Top score leaderboard (col-span 4)
 *   - Row 2: Category breakdown (col-span 6) | Controversy map (col-span 6)
 *   - Row 3: Source health (col-span 7) | Top reactive users (col-span 5)
 *   - Row 4: Cold-start (col-span 6) | Negative signal (col-span 6)
 *
 * Each panel manages its own React Query (60s staleTime). The top window
 * selector is owned by the page so trend / leaderboard / controversy /
 * category breakdown can react in unison; non-windowed panels are unaffected.
 */
export function ReactionInsightsPage() {
	const t = useT();
	const [window, setWindow] = useState<ReactionInsightWindow>(DEFAULT_WINDOW);

	const headingStyle = { color: "var(--field-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<div className="space-y-6 pb-12">
			<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1
						className="flex items-center gap-2 text-2xl font-bold tracking-tight"
						style={headingStyle}
					>
						<Heart
							aria-hidden="true"
							className="h-6 w-6"
							style={{ color: "var(--color-primary-500)" }}
						/>
						{t("Reaction insights")}
					</h1>
					<p className="mt-1 max-w-2xl text-sm" style={mutedStyle}>
						{t(
							"Live like / dislike telemetry across articles, sources, categories, and reactors. Each panel updates every 60 seconds.",
						)}
					</p>
				</div>
			</header>

			<InsightsHero />

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
				<div className="lg:col-span-8">
					<TrendChart window={window} onWindowChange={setWindow} />
				</div>
				<div className="lg:col-span-4">
					<TopScoreLeaderboard window={window} onWindowChange={setWindow} />
				</div>

				<div className="lg:col-span-6">
					<CategoryBreakdownBar
						window={window}
						onWindowChange={setWindow}
					/>
				</div>
				<div className="lg:col-span-6">
					<ControversyHeatmap window={window} onWindowChange={setWindow} />
				</div>

				<div className="lg:col-span-7">
					<SourceHealthGrid />
				</div>
				<div className="lg:col-span-5">
					<TopReactiveUsers />
				</div>

				<div className="lg:col-span-6">
					<ColdStartList />
				</div>
				<div className="lg:col-span-6">
					<NegativeSignalAlerts />
				</div>
			</div>
		</div>
	);
}
