"use client";

/**
 * AnalyticsTabsBar — 5-tab pill switcher mirroring `prototype/app.html:1249-1255`.
 *
 * Plain CSS-driven tabs (no framer-motion) so the visual is identical to
 * prototype `analytics-tabs` (segmented control with primary border on the
 * active tab, dividing whole header from panels).
 */

import type { CSSProperties } from "react";

export type AnalyticsTabId =
	| "overview"
	| "region"
	| "industry"
	| "importance"
	| "cross";

interface AnalyticsTabsBarProps {
	active: AnalyticsTabId;
	onChange: (tab: AnalyticsTabId) => void;
	labels: Record<AnalyticsTabId, string>;
}

const containerStyle: CSSProperties = {
	display: "flex",
	gap: 4,
	marginBottom: 24,
	borderBottom: "1px solid var(--surface-card-border-strong)",
};

const tabBaseStyle: CSSProperties = {
	padding: "10px 18px",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--surface-card-faint-fg)",
	background: "transparent",
	border: "none",
	borderBottom: "2px solid transparent",
	cursor: "pointer",
	transition: "color 0.15s ease, border-color 0.15s ease",
	marginBottom: -1,
};

const activeTabStyle: CSSProperties = {
	color: "var(--color-primary-500)",
	borderBottomColor: "var(--color-primary-500)",
};

export function AnalyticsTabsBar({
	active,
	onChange,
	labels,
}: AnalyticsTabsBarProps) {
	const tabs: AnalyticsTabId[] = [
		"overview",
		"region",
		"industry",
		"importance",
		"cross",
	];

	return (
		<div style={containerStyle} role="tablist" aria-label="Analytics tabs">
			{tabs.map((id) => {
				const isActive = id === active;
				return (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => onChange(id)}
						style={{
							...tabBaseStyle,
							...(isActive ? activeTabStyle : {}),
						}}
					>
						{labels[id]}
					</button>
				);
			})}
		</div>
	);
}
