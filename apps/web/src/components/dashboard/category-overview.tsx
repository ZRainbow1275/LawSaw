"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useArticleCategoryCounts } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	BarChart3,
	Briefcase,
	Building2,
	FileText,
	Flame,
	Globe2,
	GraduationCap,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
	type LucideIcon,
} from "lucide-react";

const categoryIconMap: Record<string, LucideIcon> = {
	legislation: ScrollText,
	regulation: Building2,
	enforcement: Scale,
	industry: Briefcase,
	compliance: ShieldCheck,
	data: BarChart3,
	security: Shield,
	academic: GraduationCap,
	events: Flame,
	international: Globe2,
};

function parseHexColor(
	input: string,
): { r: number; g: number; b: number } | null {
	const hex = input.trim();
	if (!hex.startsWith("#")) return null;
	const value = hex.slice(1);
	if (!/^[0-9a-fA-F]{3}$/.test(value) && !/^[0-9a-fA-F]{6}$/.test(value))
		return null;

	const expanded =
		value.length === 3
			? value
					.split("")
					.map((char) => `${char}${char}`)
					.join("")
			: value;

	const r = Number.parseInt(expanded.slice(0, 2), 16);
	const g = Number.parseInt(expanded.slice(2, 4), 16);
	const b = Number.parseInt(expanded.slice(4, 6), 16);
	if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
		return null;
	}

	return { r, g, b };
}

function getCategoryBadgeStyle(
	color: string | null,
): React.CSSProperties | undefined {
	if (!color) return undefined;
	const parsed = parseHexColor(color);
	if (!parsed) return undefined;

	return {
		color: `rgb(${parsed.r} ${parsed.g} ${parsed.b})`,
		backgroundColor: `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.12)`,
	};
}

export function CategoryOverview() {
	const t = useT();
	const categoriesQuery = useCategories();
	const countsQuery = useArticleCategoryCounts();

	const categories = categoriesQuery.data;
	const categoryCounts = countsQuery.data;
	const isLoading = categoriesQuery.isLoading || countsQuery.isLoading;
	const countsError = countsQuery.isError;

	const countByCategoryId = new Map<string, number>();
	let uncategorizedCount = 0;
	let totalCount = 0;
	for (const row of categoryCounts ?? []) {
		totalCount += row.count;
		if (!row.category_id) {
			uncategorizedCount = row.count;
			continue;
		}
		countByCategoryId.set(row.category_id, row.count);
	}

	if (isLoading) {
		return (
			<Card className="lg:col-span-1">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3
							aria-hidden="true"
							className="h-5 w-5 text-primary-500"
						/>
						{t("Category overview")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="animate-pulse space-y-3">
						{Array.from(
							{ length: 5 },
							(_, idx) => `cat-overview-skel-${idx}`,
						).map((key) => (
							<div key={key} className="h-10 rounded bg-neutral-100" />
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (categoriesQuery.isError) {
		const message =
			categoriesQuery.error instanceof Error
				? categoriesQuery.error.message
				: t("Unknown error");

		return (
			<Card className="lg:col-span-1">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3
							aria-hidden="true"
							className="h-5 w-5 text-primary-500"
						/>
						{t("Category overview")}
					</CardTitle>
					<CardDescription>{t("Load failed")}</CardDescription>
				</CardHeader>
				<CardContent>
					<EmptyState
						variant="error"
						title={t("Failed to load categories")}
						description={message}
						action={{
							label: t("Retry"),
							onClick: () => {
								categoriesQuery.refetch();
								countsQuery.refetch();
							},
						}}
						className="py-10"
					/>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="lg:col-span-1">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<BarChart3 aria-hidden="true" className="h-5 w-5 text-primary-500" />
					{t("Category overview")}
				</CardTitle>
				<CardDescription>
					{countsError
						? t("Article distribution stats are currently unavailable.")
						: t(
								"Total collected: {total} (including {uncategorized} uncategorized)",
								{
									total: totalCount,
									uncategorized: uncategorizedCount,
								},
							)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{countsError ? (
					<div className="mb-3 flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
						<p className="text-xs text-amber-800">
							{t("Failed to load distribution stats")}
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => countsQuery.refetch()}
						>
							{t("Retry")}
						</Button>
					</div>
				) : null}
				<div className="space-y-3">
					{uncategorizedCount > 0 && (
						<div className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-neutral-50">
							<div className="flex items-center gap-3">
								<div
									className={cn(
										"flex h-8 w-8 items-center justify-center rounded-lg",
										"text-neutral-500 bg-neutral-50",
									)}
								>
									<FileText aria-hidden="true" className="h-4 w-4" />
								</div>
								<span className="text-sm font-medium text-neutral-700">
									{t("Uncategorized")}
								</span>
							</div>
							<Badge variant="outline">
								{countsError ? "—" : uncategorizedCount}
							</Badge>
						</div>
					)}
					{categories?.map((category) => {
						const CategoryIcon = categoryIconMap[category.slug];
						const iconText =
							category.icon?.trim() ||
							category.name.trim().slice(0, 1) ||
							"#";
						const badgeStyle = getCategoryBadgeStyle(category.color);
						const count = countByCategoryId.get(category.id) ?? 0;
						return (
							<div
								key={category.id}
								className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-neutral-50"
							>
								<div className="flex items-center gap-3">
									<div
										className={cn(
											"flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold",
											badgeStyle
												? ""
												: "text-neutral-500 bg-neutral-50",
										)}
										style={badgeStyle}
									>
										{CategoryIcon ? (
											<CategoryIcon aria-hidden="true" className="h-4 w-4" />
										) : (
											<span aria-hidden="true">{iconText}</span>
										)}
									</div>
									<span className="text-sm font-medium text-neutral-700">
										{category.name}
									</span>
								</div>
								<Badge variant="outline">{countsError ? "—" : count}</Badge>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
