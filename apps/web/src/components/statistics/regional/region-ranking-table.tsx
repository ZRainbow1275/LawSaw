"use client";

import type { RegionalCount } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";

interface RegionRankingTableProps {
	items: RegionalCount[];
}

export function RegionRankingTable({ items }: RegionRankingTableProps) {
	const t = useT();
	const maxCount = Math.max(...items.map((item) => item.count), 1);

	return (
		<div className="space-y-3">
			<h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
				{t("Region Ranking")}
			</h4>
			<div className="space-y-2">
				{items.map((item, index) => (
					<div key={item.region_code} className="flex items-center gap-3">
						<span
							className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
								index < 3
									? "bg-primary-500 text-white"
									: "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
							}`}
						>
							{index + 1}
						</span>
						<div className="flex-1">
							<div className="mb-1 flex items-center justify-between">
								<span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
									{item.region_name}
								</span>
								<span className="text-xs text-neutral-500 dark:text-neutral-400">
									{item.count} ({item.percentage.toFixed(1)}%)
								</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
								<div
									className="h-full rounded-full bg-primary-500 transition-all"
									style={{
										width: `${(item.count / maxCount) * 100}%`,
									}}
								/>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
