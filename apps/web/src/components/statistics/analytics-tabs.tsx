"use client";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";

export type AnalyticsTab =
	| "overview"
	| "regional"
	| "industry"
	| "importance"
	| "cross";

interface AnalyticsTabsProps {
	activeTab: AnalyticsTab;
	onTabChange: (tab: AnalyticsTab) => void;
}

const TAB_DEFINITIONS: Array<{ key: AnalyticsTab; labelKey: string }> = [
	{ key: "overview", labelKey: "Overview" },
	{ key: "regional", labelKey: "Regional Analysis" },
	{ key: "industry", labelKey: "Industry Analysis" },
	{ key: "importance", labelKey: "Importance & Authority" },
	{ key: "cross", labelKey: "Cross Analysis" },
];

export function AnalyticsTabs({ activeTab, onTabChange }: AnalyticsTabsProps) {
	const t = useT();

	return (
		<div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
			{TAB_DEFINITIONS.map(({ key, labelKey }) => (
				<button
					key={key}
					type="button"
					onClick={() => onTabChange(key)}
					className={cn(
						"rounded-lg px-4 py-2 text-sm font-medium transition-all",
						activeTab === key
							? "bg-white text-primary-700 shadow-sm"
							: "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
					)}
				>
					{t(labelKey)}
				</button>
			))}
		</div>
	);
}
