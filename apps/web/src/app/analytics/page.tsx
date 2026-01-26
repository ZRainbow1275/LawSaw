"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useArticleCategoryCounts,
	useArticleAnalyticsSummary,
	useArticleTrends,
} from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useSources } from "@/hooks/use-sources";
import type { ArticleRiskLevel, ArticleSentimentLabel } from "@/lib/api/types";
import {
	Activity,
	AlertTriangle,
	BarChart3,
	Briefcase,
	Building2,
	CheckCircle,
	FileText,
	Flame,
	Globe2,
	GraduationCap,
	type LucideIcon,
	PieChart,
	Rss,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
	TrendingUp,
} from "lucide-react";

// 分类图标映射 (替代 emoji)
const categoryIconMap: Record<string, { Icon: LucideIcon; color: string }> = {
	legislation: { Icon: ScrollText, color: "text-blue-500" },
	regulation: { Icon: Building2, color: "text-purple-500" },
	enforcement: { Icon: Scale, color: "text-rose-500" },
	industry: { Icon: Briefcase, color: "text-amber-500" },
	compliance: { Icon: ShieldCheck, color: "text-emerald-500" },
	data: { Icon: BarChart3, color: "text-cyan-500" },
	security: { Icon: Shield, color: "text-red-500" },
	academic: { Icon: GraduationCap, color: "text-indigo-500" },
	events: { Icon: Flame, color: "text-orange-500" },
	international: { Icon: Globe2, color: "text-teal-500" },
};

export default function AnalyticsPage() {
	const {
		data: analyticsSummary,
		isLoading: analyticsSummaryLoading,
		isError: analyticsSummaryError,
	} = useArticleAnalyticsSummary();
	const {
		data: categories,
		isLoading: categoriesLoading,
		isError: categoriesError,
		error: categoriesErrorDetail,
		refetch: refetchCategories,
	} = useCategories();
	const {
		data: sources,
		isLoading: sourcesLoading,
		isError: sourcesError,
		refetch: refetchSources,
	} = useSources();
	const {
		data: trendPoints,
		isLoading: trendsLoading,
		isError: trendsError,
		error: trendsErrorDetail,
		refetch: refetchTrends,
	} = useArticleTrends(7);
	const {
		data: categoryCountRows,
		isLoading: categoryCountsLoading,
		isError: categoryCountsError,
		refetch: refetchCategoryCounts,
	} = useArticleCategoryCounts();

	const infraErrors: string[] = [];
	if (sourcesError) infraErrors.push("信息源");
	if (categoriesError) infraErrors.push("分类");
	const hasInfraError = infraErrors.length > 0;

	const categoriesCount =
		categories && !categoriesLoading && !categoriesError ? categories.length : null;

	const analyticsReady =
		!!analyticsSummary && !analyticsSummaryLoading && !analyticsSummaryError;
	const totalArticles = analyticsReady ? (analyticsSummary?.total ?? null) : null;
	const riskTotalForChart = analyticsReady ? (analyticsSummary?.total ?? 0) : 0;
	const riskRows: Array<{ key: ArticleRiskLevel; label: string; color: string }> = [
		{ key: "unknown", label: "未评估", color: "bg-neutral-400" },
		{ key: "low", label: "低风险", color: "bg-success" },
		{ key: "medium", label: "中风险", color: "bg-warning" },
		{ key: "high", label: "高风险", color: "bg-orange-500" },
		{ key: "critical", label: "严重", color: "bg-destructive" },
	];

	const sentimentTotalForChart = analyticsReady ? (analyticsSummary?.total ?? 0) : 0;
	const sentimentRows: Array<{
		key: ArticleSentimentLabel;
		label: string;
		color: string;
	}> = [
		{ key: "unknown", label: "未分析", color: "bg-neutral-300" },
		{ key: "positive", label: "正面", color: "bg-success" },
		{ key: "neutral", label: "中性", color: "bg-neutral-400" },
		{ key: "negative", label: "负面", color: "bg-destructive" },
		{ key: "mixed", label: "混合", color: "bg-warning" },
	];

	const categoryCountsById = new Map<string, number>();
	let uncategorizedCount = 0;
	for (const row of categoryCountRows ?? []) {
		if (!row.category_id) {
			uncategorizedCount = row.count;
			continue;
		}
		categoryCountsById.set(row.category_id, row.count);
	}

	const activeSources =
		sources && !sourcesLoading && !sourcesError
			? sources.filter((s) => s.is_active).length
			: null;
	const errorSources =
		sources && !sourcesLoading && !sourcesError
			? sources.filter((s) => s.last_error).length
			: null;

	const last7Days =
		trendPoints?.map((point) => ({
			date: formatZhMonthDay(point.date),
			count: point.count,
		})) ?? [];
	const maxTrendCount = Math.max(1, ...last7Days.map((day) => day.count));

	const statusRows = [
		{
			key: "pending",
			label: "待处理",
			variant: "outline" as const,
		},
		{
			key: "processing",
			label: "处理中",
			variant: "warning" as const,
		},
		{
			key: "published",
			label: "已发布",
			variant: "success" as const,
		},
		{
			key: "archived",
			label: "已归档",
			variant: "outline" as const,
		},
		{
			key: "rejected",
			label: "已拒绝",
			variant: "destructive" as const,
		},
	] as const;

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6">
							<h1 className="text-2xl font-bold text-neutral-900">统计分析</h1>
							<p className="text-sm text-neutral-500">数据统计与趋势分析</p>
						</div>

						{/* Overview Stats */}
						<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
											<FileText className="h-5 w-5 text-primary-600" />
										</div>
										<div>
											<p className="text-2xl font-bold">
												{totalArticles ?? "—"}
											</p>
											<p className="text-sm text-neutral-500">总资讯数</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
											<Rss className="h-5 w-5 text-success" />
										</div>
										<div>
											<p className="text-2xl font-bold">
												{activeSources ?? "—"}
											</p>
											<p className="text-sm text-neutral-500">活跃信息源</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
											<Activity className="h-5 w-5 text-warning" />
										</div>
										<div>
											<p className="text-2xl font-bold">
												{categoriesCount ?? "—"}
											</p>
											<p className="text-sm text-neutral-500">分类板块</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
											<AlertTriangle className="h-5 w-5 text-destructive" />
										</div>
										<div>
											<p className="text-2xl font-bold">
												{errorSources ?? "—"}
											</p>
											<p className="text-sm text-neutral-500">异常信息源</p>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{hasInfraError ? (
							<div className="mb-6 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
								<p className="text-xs text-red-700">
									基础数据加载失败：{infraErrors.join(" / ")}（已隐藏不可靠数值）
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										refetchSources();
										refetchCategories();
									}}
								>
									重试
								</Button>
							</div>
						) : null}

						<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
							{/* 风险分布 */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<PieChart className="h-5 w-5 text-primary-500" />
										风险分布
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{riskRows.map(({ key, label, color }) => (
											<div
												key={key}
												className="flex items-center justify-between"
											>
												<div className="flex items-center gap-2">
													<div className={`h-3 w-3 rounded-full ${color}`} />
													<span className="text-sm">{label}</span>
												</div>
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">
														{analyticsReady
															? (analyticsSummary?.risk?.[key] ?? 0)
															: "—"}
													</span>
													<div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-100">
														<div
															className={`h-full ${color}`}
															style={{
																width: `${riskTotalForChart ? ((analyticsSummary?.risk?.[key] ?? 0) / riskTotalForChart) * 100 : 0}%`,
															}}
														/>
													</div>
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>

							{/* 情感分析 */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<BarChart3 className="h-5 w-5 text-primary-500" />
										情感分析
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{sentimentRows.map(({ key, label, color }) => (
											<div
												key={key}
												className="flex items-center justify-between"
											>
												<div className="flex items-center gap-2">
													<div className={`h-3 w-3 rounded-full ${color}`} />
													<span className="text-sm">{label}</span>
												</div>
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">
														{analyticsReady
															? (analyticsSummary?.sentiment?.[key] ?? 0)
															: "—"}
													</span>
													<div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-100">
														<div
															className={`h-full ${color}`}
															style={{
																width: `${sentimentTotalForChart ? ((analyticsSummary?.sentiment?.[key] ?? 0) / sentimentTotalForChart) * 100 : 0}%`,
															}}
														/>
													</div>
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>

							{/* 状态分布 */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<CheckCircle className="h-5 w-5 text-primary-500" />
										资讯状态
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-2 gap-4">
										{statusRows.map(({ key, label, variant }) => (
											<div
												key={key}
												className="flex items-center justify-between rounded-lg border border-neutral-100 p-3"
											>
												<Badge variant={variant}>{label}</Badge>
												<span className="text-lg font-semibold">
													{analyticsReady
														? (analyticsSummary?.status?.[key] ?? 0)
														: "—"}
												</span>
											</div>
										))}
									</div>
								</CardContent>
							</Card>

							{/* 近7天趋势 */}
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<TrendingUp className="h-5 w-5 text-primary-500" />
										近7天趋势
									</CardTitle>
								</CardHeader>
								<CardContent>
									{trendsLoading ? (
										<div className="flex h-40 items-end justify-between gap-2">
											{Array.from({ length: 7 }, (_, idx) => `trend-skel-${idx}`).map(
												(key) => (
													<div
														key={key}
														className="flex flex-1 flex-col items-center gap-2"
													>
														<div className="h-full w-full animate-pulse rounded-t bg-neutral-100" />
														<div className="h-3 w-10 animate-pulse rounded bg-neutral-100" />
													</div>
												),
											)}
										</div>
									) : trendsError ? (
										<EmptyState
											variant="error"
											title="趋势数据加载失败"
											description={
												trendsErrorDetail instanceof Error
													? trendsErrorDetail.message
													: "未知错误"
											}
											action={{ label: "重试", onClick: () => refetchTrends() }}
											className="py-10"
										/>
									) : last7Days.length === 0 ? (
										<EmptyState
											title="暂无趋势数据"
											description="近 7 天没有可展示的数据"
											className="py-10"
										/>
									) : (
										<div className="flex h-40 items-end justify-between gap-2">
											{last7Days.map((day) => (
												<div
													key={day.date}
													className="flex flex-1 flex-col items-center gap-1"
												>
													<div
														className="w-full rounded-t bg-primary-500 transition-all hover:bg-primary-600"
														style={{
															height: `${(day.count / maxTrendCount) * 100}%`,
														}}
													/>
													<span className="text-xs text-neutral-500">
														{day.date}
													</span>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						</div>

						{/* 分类统计 */}
						<Card className="mt-6">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<BarChart3 className="h-5 w-5 text-primary-500" />
									分类统计
								</CardTitle>
							</CardHeader>
							<CardContent>
								{categoriesError ? (
									<EmptyState
										variant="error"
										title="分类数据加载失败"
										description={
											categoriesErrorDetail instanceof Error
												? categoriesErrorDetail.message
												: "未知错误"
										}
										action={{
											label: "重试",
											onClick: () => {
												refetchCategories();
												refetchCategoryCounts();
											},
										}}
										className="py-10"
									/>
								) : categoryCountsLoading || categoriesLoading ? (
									<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
										{Array.from(
											{ length: Math.min(10, categories?.length ?? 10) },
											(_, idx) => `cat-stats-skel-${idx}`,
										).map((key) => (
											<div
												key={key}
												className="h-[124px] rounded-lg border border-neutral-100 bg-neutral-50 animate-pulse"
											/>
										))}
									</div>
								) : (
									<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
										{categoryCountsError ? (
											<div className="col-span-2 flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 sm:col-span-3 lg:col-span-5">
												<p className="text-xs text-amber-800">
													分类统计加载失败（已隐藏不可靠数值）
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={() => refetchCategoryCounts()}
												>
													重试
												</Button>
											</div>
										) : null}
										{uncategorizedCount > 0 && (
											<div className="flex flex-col items-center rounded-lg border border-neutral-100 p-4 text-center">
												<FileText className="h-6 w-6 text-neutral-500" />
												<span className="mt-2 text-sm font-medium">
													未分类
												</span>
												<span className="mt-1 text-2xl font-bold text-primary-600">
													{categoryCountsError ? "—" : uncategorizedCount}
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
													className="flex flex-col items-center rounded-lg border border-neutral-100 p-4 text-center"
												>
													{IconComponent ? (
														<IconComponent
															className={`h-6 w-6 ${iconInfo.color}`}
														/>
													) : (
														<BarChart3 className="h-6 w-6 text-neutral-400" />
													)}
													<span className="mt-2 text-sm font-medium">
														{category.name}
													</span>
													<span className="mt-1 text-2xl font-bold text-primary-600">
														{categoryCountsError ? "—" : count}
													</span>
												</div>
											);
										})}
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}

function formatZhMonthDay(dateIso: string) {
	const parts = dateIso.split("-");
	if (parts.length !== 3) return dateIso;

	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!Number.isFinite(month) || !Number.isFinite(day)) return dateIso;
	return `${month}月${day}日`;
}
