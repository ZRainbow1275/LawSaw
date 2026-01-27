"use client";

import {
	ArticleCard,
	ArticleCardSkeleton,
} from "@/components/article/article-card";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { AnimatedList } from "@/components/ui/animated-list";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoDataState, NoSearchResultState } from "@/components/ui/empty-state";
import {
	SwipeHint,
	SwipeableCard,
	swipeActionPresets,
} from "@/components/ui/swipeable-card";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { fadeVariants, staggerContainerVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useReadingStore } from "@/stores/reading-store";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	BarChart3,
	Briefcase,
	Building2,
	ChevronLeft,
	ChevronRight,
	FileText,
	Filter,
	Flame,
	Globe2,
	GraduationCap,
	LayoutGrid,
	List,
	type LucideIcon,
	Scale,
	ScrollText,
	Shield,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";
import { useCallback, useState } from "react";

// ============================================
// 常量
// ============================================

const PAGE_SIZE = 20;

const statusOptions = [
	{ value: "all", label: "全部状态" },
	{ value: "pending", label: "待处理" },
	{ value: "processing", label: "处理中" },
	{ value: "published", label: "已发布" },
	{ value: "archived", label: "已归档" },
	{ value: "rejected", label: "已驳回" },
] as const;

type StatusFilter = (typeof statusOptions)[number]["value"];

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

// ============================================
// 视图模式
// ============================================

type ViewMode = "list" | "grid";

// ============================================
// 主组件
// ============================================

export default function ArticlesPage() {
	const [page, setPage] = useState(0);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("list");
	const [showMobileHint, setShowMobileHint] = useState(true);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

	const { success: showSuccess } = useToast();
	const bookmarks = useReadingStore((s) => s.bookmarks);
	const toggleBookmark = useReadingStore((s) => s.toggleBookmark);

	const { data: articlesData, isLoading: articlesLoading } = useArticles({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
		category_id: selectedCategory ?? undefined,
		status: statusFilter === "all" ? undefined : statusFilter,
	});

	const { data: categories } = useCategories();

	const articles = articlesData?.data ?? [];
	const total = articlesData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const activeStatusLabel =
		statusOptions.find((option) => option.value === statusFilter)?.label ??
		"全部状态";

	const getCategoryInfo = useCallback(
		(categoryId: string | null) => {
			if (!categoryId || !categories)
				return { name: undefined, icon: undefined };
			const cat = categories.find((c) => c.id === categoryId);
			return { name: cat?.name, icon: cat?.icon };
		},
		[categories],
	);

	// 收藏处理
	const handleBookmark = useCallback(
		(articleId: string) => {
			const newState = toggleBookmark(articleId);
			showSuccess(
				newState ? "已添加收藏" : "已取消收藏",
				newState ? "文章已添加到收藏夹" : "文章已从收藏夹移除",
			);
		},
		[toggleBookmark, showSuccess],
	);

	// 分享处理
	const handleShare = useCallback(
		(articleId: string) => {
			const url = `${window.location.origin}/articles/${articleId}`;
			navigator.clipboard.writeText(url);
			showSuccess("链接已复制", "文章链接已复制到剪贴板");
		},
		[showSuccess],
	);

	// 渲染文章卡片（带滑动操作，仅移动端）
	const renderArticleCard = useCallback(
		(article: (typeof articles)[0], index: number) => {
			const { name, icon } = getCategoryInfo(article.category_id);
			const isBookmarked = bookmarks.includes(article.id);

			const card = (
				<ArticleCard
					article={article}
					categoryName={name ?? undefined}
					categoryIcon={icon ?? undefined}
					variant={viewMode === "grid" ? "compact" : "default"}
					showSummary={viewMode === "list"}
					isBookmarked={isBookmarked}
					onBookmark={handleBookmark}
					animationDelay={index * 0.03}
				/>
			);

			// 移动端显示滑动操作
			return (
				<div key={article.id} className="md:contents">
					{/* 移动端：带滑动 */}
					<div className="md:hidden">
						<SwipeableCard
							rightActions={[
								swipeActionPresets.bookmark(
									() => handleBookmark(article.id),
									isBookmarked,
								),
								swipeActionPresets.share(() => handleShare(article.id)),
							]}
							onSwipeStart={() => setShowMobileHint(false)}
						>
							{card}
						</SwipeableCard>
					</div>
					{/* 桌面端：直接显示 */}
					<div className="hidden md:block">{card}</div>
				</div>
			);
		},
		[getCategoryInfo, viewMode, bookmarks, handleBookmark, handleShare],
	);

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<motion.div
						variants={fadeVariants}
						initial="hidden"
						animate="visible"
						className="p-6"
					>
						{/* 页面标题 */}
						<div className="mb-6 flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-neutral-900">
									资讯列表
								</h1>
								<p className="text-sm text-neutral-500">
									共{" "}
									<AnimatedNumber
										value={total}
										duration={800}
										numberClassName="font-semibold text-neutral-700"
									/>{" "}
									条资讯
								</p>
							</div>
							<div className="flex items-center gap-2">
								{/* 视图切换 */}
								<div className="hidden sm:flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
									<Button
										variant={viewMode === "list" ? "secondary" : "ghost"}
										size="icon"
										className="h-8 w-8"
										onClick={() => setViewMode("list")}
									>
										<List className="h-4 w-4" />
									</Button>
									<Button
										variant={viewMode === "grid" ? "secondary" : "ghost"}
										size="icon"
										className="h-8 w-8"
										onClick={() => setViewMode("grid")}
									>
										<LayoutGrid className="h-4 w-4" />
									</Button>
								</div>
								<Button
									variant="outline"
									size="sm"
									aria-expanded={filtersOpen}
									aria-controls="articles-filters"
									onClick={() => setFiltersOpen((open) => !open)}
								>
									<SlidersHorizontal className="mr-2 h-4 w-4" />
									筛选
								</Button>
							</div>
						</div>

						{/* 状态筛选（真实过滤：GET /api/v1/articles?status=...） */}
						<AnimatePresence initial={false}>
							{filtersOpen && (
								<motion.div
									id="articles-filters"
									variants={fadeVariants}
									initial="hidden"
									animate="visible"
									exit="hidden"
									className="mb-6"
								>
									<Card className="border border-neutral-200/60 bg-white/80 backdrop-blur">
										<CardContent className="p-4">
											<div className="flex flex-wrap items-center gap-2">
												<span className="text-sm font-medium text-neutral-700">
													状态
												</span>
												{statusOptions.map((option) => (
													<Badge
														key={option.value}
														variant={
															statusFilter === option.value
																? "default"
																: "outline"
														}
														className="cursor-pointer transition-all hover:scale-105"
														onClick={() => {
															setStatusFilter(option.value);
															setPage(0);
														}}
													>
														{option.label}
													</Badge>
												))}
												<div className="ml-auto flex items-center gap-2">
													<span className="text-xs text-neutral-500">
														当前：{activeStatusLabel}
													</span>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => {
															setStatusFilter("all");
															setPage(0);
														}}
													>
														重置
													</Button>
												</div>
											</div>
										</CardContent>
									</Card>
								</motion.div>
							)}
						</AnimatePresence>

						{/* 分类筛选 */}
						<motion.div
							variants={staggerContainerVariants}
							initial="hidden"
							animate="visible"
							className="mb-6 flex flex-wrap gap-2"
						>
							<motion.div variants={fadeVariants}>
								<Badge
									variant={selectedCategory === null ? "default" : "outline"}
									className="cursor-pointer transition-all hover:scale-105"
									onClick={() => {
										setSelectedCategory(null);
										setPage(0);
									}}
								>
									全部
								</Badge>
							</motion.div>
							{categories?.map((category, index) => {
								const iconInfo = categoryIconMap[category.slug];
								const IconComponent = iconInfo?.Icon;
								return (
									<motion.div key={category.id} variants={fadeVariants}>
										<Badge
											variant={
												selectedCategory === category.id ? "default" : "outline"
											}
											className="cursor-pointer transition-all hover:scale-105 flex items-center gap-1.5"
											onClick={() => {
												setSelectedCategory(category.id);
												setPage(0);
											}}
										>
											{IconComponent && (
												<IconComponent
													className={cn("h-3.5 w-3.5", iconInfo.color)}
												/>
											)}
											{category.name}
										</Badge>
									</motion.div>
								);
							})}
						</motion.div>

						{/* 移动端滑动提示 */}
						<AnimatePresence>
							{showMobileHint && articles.length > 0 && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									className="md:hidden mb-4"
								>
									<SwipeHint direction="left" />
								</motion.div>
							)}
						</AnimatePresence>

						{/* 文章列表 */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<FileText className="h-5 w-5 text-primary-500" />
									资讯列表
								</CardTitle>
							</CardHeader>
							<CardContent>
								{articlesLoading ? (
									// 加载骨架屏
									<div
										className={cn(
											viewMode === "grid"
												? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
												: "space-y-4",
										)}
									>
										{Array.from({ length: 6 }, (_, idx) => `article-skel-${idx}`).map(
											(key) => (
												<ArticleCardSkeleton
													key={key}
													variant={viewMode === "grid" ? "compact" : "default"}
												/>
											),
										)}
									</div>
								) : articles.length === 0 ? (
									// 空状态
									selectedCategory ? (
										<NoSearchResultState
											title="该分类暂无资讯"
											description="尝试选择其他分类或查看全部资讯"
											actionLabel="查看全部"
											onAction={() => setSelectedCategory(null)}
										/>
									) : (
										<NoDataState
											title="暂无资讯"
											description="系统尚未采集到任何资讯"
										/>
									)
								) : (
									// 文章列表
									<div
										className={cn(
											viewMode === "grid"
												? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
												: "space-y-4",
										)}
									>
										<AnimatedList
											staggerDelay={0.04}
											direction="up"
											gap={viewMode === "grid" ? "gap-4" : "space-y-4"}
											className={
												viewMode === "grid"
													? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
													: ""
											}
										>
											{articles.map((article, index) =>
												renderArticleCard(article, index),
											)}
										</AnimatedList>
									</div>
								)}

								{/* 分页 */}
								{totalPages > 1 && (
									<motion.div
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: 0.3 }}
										className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4"
									>
										<p className="text-sm text-neutral-500">
											第{" "}
											<span className="font-medium text-neutral-700">
												{page + 1}
											</span>{" "}
											/{" "}
											<span className="font-medium text-neutral-700">
												{totalPages}
											</span>{" "}
											页
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPage((p) => Math.max(0, p - 1))}
												disabled={page === 0}
											>
												<ChevronLeft className="h-4 w-4" />
												上一页
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setPage((p) => Math.min(totalPages - 1, p + 1))
												}
												disabled={page >= totalPages - 1}
											>
												下一页
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</motion.div>
								)}
							</CardContent>
						</Card>
					</motion.div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
