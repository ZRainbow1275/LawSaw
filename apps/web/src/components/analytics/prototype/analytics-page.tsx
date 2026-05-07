"use client";

/**
 * AnalyticsPagePrototype — 1:1 content-level shell mirroring
 * `prototype/app.html:1242-1423`. Page chrome (Sidebar/Header) is provided
 * by the outer UserShell wrapper at the route boundary.
 */

import { useT } from "@/lib/i18n-client";
import { TrendingUp } from "lucide-react";
import { useState } from "react";
import { type AnalyticsTabId, AnalyticsTabsBar } from "./analytics-tabs";
import { CrossPanel } from "./cross-panel";
import { ImportancePanel } from "./importance-panel";
import { IndustryPanel } from "./industry-panel";
import { OverviewPanel } from "./overview-panel";
import { RegionPanel } from "./region-panel";

export function AnalyticsPagePrototype() {
	const t = useT();
	const [active, setActive] = useState<AnalyticsTabId>("overview");

	const labels: Record<AnalyticsTabId, string> = {
		overview: t("Overview"),
		region: t("Regional Analysis"),
		industry: t("Industry Analysis"),
		importance: t("Importance & Authority"),
		cross: t("Cross Analysis"),
	};

	return (
		<div className="w-full">
			<header className="mb-6 flex items-center gap-2">
				<h1 className="m-0 flex items-center gap-2.5 text-2xl font-bold text-[color:var(--color-neutral-900)]">
					<TrendingUp
						aria-hidden="true"
						size={22}
						className="text-[color:var(--color-primary-500)]"
					/>
					{t("Analytics")}
				</h1>
			</header>

			<AnalyticsTabsBar
				active={active}
				onChange={setActive}
				labels={labels}
			/>

			{active === "overview" ? <OverviewPanel /> : null}
			{active === "region" ? <RegionPanel /> : null}
			{active === "industry" ? <IndustryPanel /> : null}
			{active === "importance" ? <ImportancePanel /> : null}
			{active === "cross" ? <CrossPanel /> : null}
		</div>
	);
}
