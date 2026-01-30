"use client";

import {
	ArticleCard,
	ArticleCardSkeleton,
} from "@/components/article/article-card";
import { AnimatedList } from "@/components/ui/animated-list";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState, NoDataState } from "@/components/ui/empty-state";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { fadeVariants } from "@/lib/motion";
import { motion } from "framer-motion";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";

export function RecentArticles() {
	const articlesQuery = useArticles({
		limit: 5,
		status: "published",
	});
	const { data: categories } = useCategories();

	const articles = articlesQuery.data?.data ?? [];

	const getCategoryInfo = (categoryId: string | null) => {
		if (!categoryId || !categories) return { name: undefined, icon: undefined };
		const cat = categories.find((c) => c.id === categoryId);
		return { name: cat?.name, icon: cat?.icon };
	};

	// 加载状态
	if (articlesQuery.isLoading) {
		return (
			<Card className="lg:col-span-2">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<TrendingUp className="h-5 w-5 text-primary-500" />
						最新资讯
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{Array.from({ length: 5 }, (_, idx) => `recent-skel-${idx}`).map(
							(key) => (
								<ArticleCardSkeleton key={key} variant="compact" />
							),
						)}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (articlesQuery.isError) {
		const message =
			articlesQuery.error instanceof Error
				? articlesQuery.error.message
				: "未知错误";

		return (
			<Card className="lg:col-span-2">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<TrendingUp className="h-5 w-5 text-primary-500" />
						最新资讯
					</CardTitle>
					<CardDescription>数据加载失败</CardDescription>
				</CardHeader>
				<CardContent>
					<EmptyState
						variant="error"
						title="最新资讯加载失败"
						description={message}
						action={{ label: "重试", onClick: () => articlesQuery.refetch() }}
						className="py-10"
					/>
				</CardContent>
			</Card>
		);
	}

	return (
		<motion.div
			variants={fadeVariants}
			initial="hidden"
			animate="visible"
			className="lg:col-span-2"
		>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<TrendingUp className="h-5 w-5 text-primary-500" />
							最新资讯
						</CardTitle>
						<CardDescription>近期采集的重要法律资讯</CardDescription>
					</div>
					<Link href="/articles">
						<Button variant="outline" size="sm">
							查看全部
							<ArrowUpRight className="ml-1 h-4 w-4" />
						</Button>
					</Link>
				</CardHeader>
				<CardContent>
					{articles.length === 0 ? (
						<NoDataState
							title="暂无资讯"
							description="系统尚未采集到任何资讯"
						/>
					) : (
						<AnimatedList staggerDelay={0.06} direction="up">
							{articles.map((article) => {
								const { name, icon } = getCategoryInfo(article.category_id);
								return (
									<ArticleCard
										key={article.id}
										article={article}
										categoryName={name ?? undefined}
										categoryIcon={icon ?? undefined}
										variant="compact"
										showSummary={false}
									/>
								);
							})}
						</AnimatedList>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}
