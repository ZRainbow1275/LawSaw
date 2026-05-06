"use client";

/**
 * AnalyticsPagePrototype — 1:1 content-level shell mirroring
 * `prototype/app.html:1242-1423`. Page chrome (Sidebar/Header) is provided
 * by the outer UserShell wrapper at the route boundary.
 */

import { useT } from "@/lib/i18n-client";
import { TrendingUp } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { type AnalyticsTabId, AnalyticsTabsBar } from "./analytics-tabs";
import { CrossPanel } from "./cross-panel";
import { ImportancePanel } from "./importance-panel";
import { IndustryPanel } from "./industry-panel";
import { OverviewPanel } from "./overview-panel";
import { RegionPanel } from "./region-panel";

const headerStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	marginBottom: 24,
};

const titleStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	fontSize: 22,
	fontWeight: 700,
	color: "var(--color-neutral-900)",
};

const iconStyle: CSSProperties = {
	color: "var(--color-primary-500)",
};

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
			<div style={headerStyle}>
				<h1 style={titleStyle}>
					<TrendingUp aria-hidden="true" size={22} style={iconStyle} />
					{t("Analytics")}
				</h1>
			</div>

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
