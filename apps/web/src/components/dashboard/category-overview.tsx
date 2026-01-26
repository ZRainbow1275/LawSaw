"use client";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useArticleCategoryCounts } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
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
	const { data: categories, isLoading } = useCategories();
	const {
		data: categoryCounts,
		isLoading: countsLoading,
		isError: countsError,
	} = useArticleCategoryCounts();

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

	if (isLoading || countsLoading) {
		return (
			<Card className="lg:col-span-1">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3 className="h-5 w-5 text-primary-500" />
						板块概览
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="animate-pulse space-y-3">
						{Array.from({ length: 5 }, (_, idx) => `cat-overview-skel-${idx}`).map(
							(key) => (
								<div key={key} className="h-10 rounded bg-neutral-100" />
							),
						)}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="lg:col-span-1">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<BarChart3 className="h-5 w-5 text-primary-500" />
					板块概览
				</CardTitle>
				<CardDescription>
					{countsError
						? "资讯分布统计暂不可用"
						: `按采集总量统计：${totalCount} 条（含未分类 ${uncategorizedCount} 条）`}
				</CardDescription>
			</CardHeader>
			<CardContent>
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
									<FileText className="h-4 w-4" />
								</div>
								<span className="text-sm font-medium text-neutral-700">
									未分类
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
										<IconComponent className="h-4 w-4" />
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
