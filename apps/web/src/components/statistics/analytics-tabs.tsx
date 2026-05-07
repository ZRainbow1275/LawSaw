"use client";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

export type AnalyticsTab =
	| "overview"
	| "regional"
	| "industry"
	| "importance"
	| "cross";

interface AnalyticsTabsProps {
	activeTab: AnalyticsTab;
	onTabChange: (tab: AnalyticsTab) => void;
	/**
	 * Tab keys that are gated by tier. Gated tabs render a lock icon and still
	 * fire `onTabChange` so the page can swap to an upgrade CTA in place of
	 * the panel content.
	 */
	lockedTabs?: ReadonlySet<AnalyticsTab>;
}

const TAB_DEFINITIONS: Array<{ key: AnalyticsTab; labelKey: string }> = [
	{ key: "overview", labelKey: "Overview" },
	{ key: "regional", labelKey: "Regional Analysis" },
	{ key: "industry", labelKey: "Industry Analysis" },
	{ key: "importance", labelKey: "Importance & Authority" },
	{ key: "cross", labelKey: "Cross Analysis" },
];

export function AnalyticsTabs({
	activeTab,
	onTabChange,
	lockedTabs,
}: AnalyticsTabsProps) {
	const t = useT();

	return (
		<div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1 dark:border-white/10 dark:bg-white/5">
			{TAB_DEFINITIONS.map(({ key, labelKey }) => {
				const locked = lockedTabs?.has(key) ?? false;
				return (
					<button
						key={key}
						type="button"
						onClick={() => onTabChange(key)}
						aria-disabled={locked || undefined}
						data-locked={locked || undefined}
						className={cn(
							"flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
							activeTab === key
								? "bg-white text-primary-700 shadow-sm dark:bg-neutral-900 dark:text-primary-200"
								: locked
									? "text-neutral-400 hover:bg-white/40 dark:text-neutral-500 dark:hover:bg-white/10"
									: "text-neutral-600 hover:bg-white/60 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-neutral-50",
						)}
					>
						{locked && (
							<Lock
								aria-hidden="true"
								className="h-3.5 w-3.5"
								style={{ color: "var(--surface-muted-text)" }}
							/>
						)}
						<span>{t(labelKey)}</span>
					</button>
				);
			})}
		</div>
	);
}
