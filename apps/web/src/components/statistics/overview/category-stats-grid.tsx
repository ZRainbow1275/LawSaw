"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArticleCategoryCount, Category } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import {
	BarChart3,
	Briefcase,
	Building2,
	FileText,
	Flame,
	Globe2,
	GraduationCap,
	type LucideIcon,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
} from "lucide-react";

const categoryIconMap: Record<string, { Icon: LucideIcon; color: string }> = {
	legislation: { Icon: ScrollText, color: "#3b82f6" },
	regulation: { Icon: Building2, color: "#8b5cf6" },
	enforcement: { Icon: Scale, color: "#f43f5e" },
	industry: { Icon: Briefcase, color: "var(--color-warning)" },
	compliance: { Icon: ShieldCheck, color: "var(--color-success)" },
	data: { Icon: BarChart3, color: "#06b6d4" },
	security: { Icon: Shield, color: "var(--color-error)" },
	academic: { Icon: GraduationCap, color: "#6366f1" },
	events: { Icon: Flame, color: "#f97316" },
	international: { Icon: Globe2, color: "#14b8a6" },
};

const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
const accentTextStyle = { color: "var(--surface-accent-strong)" } as const;
const cardBorderStyle = {
	borderColor: "var(--surface-muted-border)",
} as const;
const warningSurfaceStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-warning-light) 84%, transparent)",
	borderColor: "color-mix(in srgb, var(--color-warning) 22%, transparent)",
} as const;
const warningTextStyle = {
	color:
		"color-mix(in srgb, var(--color-warning) 76%, var(--field-foreground) 24%)",
} as const;

export interface CategoryStatsGridProps {
	categories: Category[] | undefined;
	categoryCounts: ArticleCategoryCount[] | undefined;
	isLoading: boolean;
	isError: boolean;
	hasCountsError: boolean;
	errorMessage?: string;
	onRetry: () => void;
}

export function CategoryStatsGrid({
	categories,
	categoryCounts,
	isLoading,
	isError,
	hasCountsError,
	errorMessage,
	onRetry,
}: CategoryStatsGridProps) {
	const t = useT();

	if (isError) {
		return (
			<EmptyState
				variant="error"
				title={t("Failed to load category data")}
				description={errorMessage ?? t("Unknown error")}
				action={{ label: t("Retry"), onClick: onRetry }}
				className="py-10"
			/>
		);
	}

	if (isLoading) {
		return (
			<div
				className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
				data-testid="category-stats-grid-loading"
			>
				{Array.from(
					{ length: Math.min(10, categories?.length ?? 10) },
					(_, idx) => `cat-stats-skel-${idx}`,
				).map((key) => (
					<div
						key={key}
						className="rounded-lg border p-4 text-center"
						style={{
							backgroundColor: "var(--surface-muted-bg)",
							borderColor: "var(--surface-muted-border)",
						}}
					>
						<div
							className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl"
							style={{ backgroundColor: "var(--control-hover-bg)" }}
						>
							<Skeleton variant="circular" width={20} height={20} />
						</div>
						<Skeleton
							variant="text"
							width="72%"
							height={14}
							className="mx-auto mt-3"
						/>
						<Skeleton
							variant="text"
							width="36%"
							height={28}
							className="mx-auto mt-2"
						/>
					</div>
				))}
			</div>
		);
	}

	const categoryCountsById = new Map<string, number>();
	let uncategorizedCount = 0;
	for (const row of categoryCounts ?? []) {
		if (!row.category_id) {
			uncategorizedCount = row.count;
			continue;
		}
		categoryCountsById.set(row.category_id, row.count);
	}

	return (
		<div
			className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
			data-testid="category-stats-grid"
		>
			{hasCountsError ? (
				<div
					className="col-span-2 flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-3 lg:col-span-5"
					style={warningSurfaceStyle}
				>
					<p className="text-xs" style={warningTextStyle}>
						{t("Failed to load category stats (unreliable values are hidden.)")}
					</p>
					<Button variant="outline" size="sm" onClick={onRetry}>
						{t("Retry")}
					</Button>
				</div>
			) : null}
			{uncategorizedCount > 0 && (
				<div
					className="flex flex-col items-center rounded-lg border p-4 text-center"
					style={cardBorderStyle}
				>
					<FileText
						aria-hidden="true"
						className="h-6 w-6"
						style={mutedTextStyle}
					/>
					<span className="mt-2 text-sm font-medium">{t("Uncategorized")}</span>
					<span className="mt-1 text-2xl font-bold" style={accentTextStyle}>
						{hasCountsError ? "\u2014" : uncategorizedCount}
					</span>
				</div>
			)}
			{categories?.map((category) => {
				const iconInfo = categoryIconMap[category.slug];
				const IconComponent = iconInfo?.Icon;
				const count = categoryCountsById.get(category.id) ?? 0;
				return (
					<div
						key={category.id}
						className="flex flex-col items-center rounded-lg border p-4 text-center transition-colors hover:border-[var(--surface-accent-border)]"
						style={cardBorderStyle}
					>
						{IconComponent ? (
							<IconComponent
								aria-hidden="true"
								className="h-6 w-6"
								style={{ color: iconInfo.color }}
							/>
						) : (
							<BarChart3
								aria-hidden="true"
								className="h-6 w-6"
								style={mutedTextStyle}
							/>
						)}
						<span className="mt-2 text-sm font-medium">{category.name}</span>
						<span className="mt-1 text-2xl font-bold" style={accentTextStyle}>
							{hasCountsError ? "\u2014" : count}
						</span>
					</div>
				);
			})}
		</div>
	);
}
