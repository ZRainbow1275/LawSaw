"use client";

/**
 * DashboardCatFilter — `prototype/app.html:797` category filter pills (PR1).
 *
 * Pulls real category list via `useCategories()` and counts via
 * `useArticleCategoryCounts()`. The "All" pill aggregates total and is
 * always present. Active state mirrors prototype `.filter-pill.active`
 * (orange-500 background).
 */

import { useArticleCategoryCounts, useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface Props {
	value: string | null;
	onChange: (next: string | null) => void;
}

export function DashboardCatFilter({ value, onChange }: Props) {
	const t = useT();
	const categoriesQuery = useCategories();
	const countsQuery = useArticleCategoryCounts();
	// Used to render the "All" total without an extra dedicated stat call.
	const articlesQuery = useArticles({ limit: 1, status: "published" });

	const counts = useMemo(() => {
		const map = new Map<string, number>();
		for (const entry of countsQuery.data ?? []) {
			if (entry.category_id) map.set(entry.category_id, entry.count);
		}
		return map;
	}, [countsQuery.data]);

	const totalCount = articlesQuery.data?.total ?? 0;

	if (categoriesQuery.isPending) {
		return (
			<div className="mb-5 flex flex-wrap gap-2">
				{Array.from({ length: 6 }, (_, idx) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder list is fixed-size and stable
						key={`cat-skel-${idx}`}
						className="h-7 w-24 animate-pulse rounded-full"
						style={{ backgroundColor: "var(--color-neutral-100)" }}
					/>
				))}
			</div>
		);
	}

	const categories = categoriesQuery.data ?? [];

	return (
		<div
			className="mb-5 flex flex-wrap gap-2"
			role="tablist"
			aria-label={t("All ({count})", { count: totalCount })}
		>
			<button
				type="button"
				role="tab"
				aria-selected={value === null}
				onClick={() => onChange(null)}
				className={cn(
					"flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
				)}
				style={
					value === null
						? {
								backgroundColor: "var(--color-primary-500)",
								color: "white",
								borderColor: "var(--color-primary-500)",
							}
						: {
								backgroundColor: "white",
								color: "var(--color-neutral-600)",
								borderColor: "var(--color-neutral-200)",
							}
				}
			>
				{t("All ({count})", { count: totalCount })}
			</button>
			{categories.map((cat) => {
				const active = cat.id === value;
				const count = counts.get(cat.id) ?? 0;
				const dotColor = cat.color ?? "var(--color-neutral-400)";
				return (
					<button
						key={cat.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(cat.id)}
						className={cn(
							"flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
						)}
						style={
							active
								? {
										backgroundColor: "var(--color-primary-500)",
										color: "white",
										borderColor: "var(--color-primary-500)",
									}
								: {
										backgroundColor: "white",
										color: "var(--color-neutral-600)",
										borderColor: "var(--color-neutral-200)",
									}
						}
					>
						<span
							className="h-1.5 w-1.5 rounded-full"
							style={{
								backgroundColor: active ? "white" : dotColor,
							}}
							aria-hidden="true"
						/>
						{cat.name}
						<span
							className="text-[11px] font-bold opacity-80"
							aria-hidden="true"
						>
							{count}
						</span>
					</button>
				);
			})}
		</div>
	);
}
