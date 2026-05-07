"use client";

import type { IssuerCount } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";

interface IssuerRankingProps {
	items: IssuerCount[];
}

export function IssuerRanking({ items }: IssuerRankingProps) {
	const t = useT();
	const maxCount = Math.max(...items.map((item) => item.count), 1);

	if (items.length === 0) {
		return (
			<div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
				{t("No issuer data available")}
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{items.map((item, index) => (
				<div key={item.issuer} className="flex items-center gap-3">
					<span
						className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
							index < 3
								? "bg-primary-500 text-white"
								: "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
						}`}
					>
						{index + 1}
					</span>
					<div className="flex-1 min-w-0">
						<div className="mb-1 flex items-center justify-between gap-2">
							<span className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
								{item.issuer}
							</span>
							<span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
								{item.count} ({item.percentage.toFixed(1)}%)
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
							<div
								className="h-full rounded-full bg-primary-400 transition-all"
								style={{
									width: `${(item.count / maxCount) * 100}%`,
								}}
							/>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
