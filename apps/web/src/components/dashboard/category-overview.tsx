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
	type LucideIcon,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
} from "lucide-react";

const categoryIconMap: Record<string, { Icon: LucideIcon; style: string }> = {
	legislation: { Icon: ScrollText, style: "text-blue-500 bg-blue-50" },
	regulation: { Icon: Building2, style: "text-purple-500 bg-purple-50" },
	enforcement: { Icon: Scale, style: "text-rose-500 bg-rose-50" },
	industry: { Icon: Briefcase, style: "text-amber-500 bg-amber-50" },
	compliance: { Icon: ShieldCheck, style: "text-emerald-500 bg-emerald-50" },
	data: { Icon: BarChart3, style: "text-cyan-500 bg-cyan-50" },
	security: { Icon: Shield, style: "text-red-500 bg-red-50" },
	academic: { Icon: GraduationCap, style: "text-indigo-500 bg-indigo-50" },
	events: { Icon: Flame, style: "text-orange-500 bg-orange-50" },
	international: { Icon: Globe2, style: "text-teal-500 bg-teal-50" },
};

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
						<BarChart3 aria-hidden="true" className="h-5 w-5 text-primary-500" />
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
						<BarChart3 aria-hidden="true" className="h-5 w-5 text-primary-500" />
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
						const iconConfig = categoryIconMap[category.slug] ?? {
							Icon: FileText,
							style: "text-neutral-500 bg-neutral-50",
						};
						const IconComponent = iconConfig.Icon;
						const count = countByCategoryId.get(category.id) ?? 0;
						return (
							<div
								key={category.id}
								className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-neutral-50"
							>
								<div className="flex items-center gap-3">
									<div
										className={cn(
											"flex h-8 w-8 items-center justify-center rounded-lg",
											iconConfig.style,
										)}
									>
										<IconComponent aria-hidden="true" className="h-4 w-4" />
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
