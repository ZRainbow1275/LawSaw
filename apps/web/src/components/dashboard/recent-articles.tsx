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
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { fadeVariants } from "@/lib/motion";
import { motion } from "framer-motion";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";

export function RecentArticles() {
	const locale = useLocale();
	const t = useT();

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

	// Loading state
	if (articlesQuery.isLoading) {
		return (
			<Card className="lg:col-span-2">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<TrendingUp
							aria-hidden="true"
							className="h-5 w-5 text-primary-500"
						/>
						{t("Latest articles")}
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
				: t("Unknown error");

		return (
			<Card className="lg:col-span-2">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<TrendingUp
							aria-hidden="true"
							className="h-5 w-5 text-primary-500"
						/>
						{t("Latest articles")}
					</CardTitle>
					<CardDescription>{t("Load failed")}</CardDescription>
				</CardHeader>
				<CardContent>
					<EmptyState
						variant="error"
						title={t("Failed to load latest articles")}
						description={message}
						action={{
							label: t("Retry"),
							onClick: () => articlesQuery.refetch(),
						}}
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
							<TrendingUp
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("Latest articles")}
						</CardTitle>
						<CardDescription>
							{t("Important legal updates collected recently.")}
						</CardDescription>
					</div>
					<Link href={withLocalePath(locale, "/articles")}>
						<Button variant="outline" size="sm">
							{t("View all")}
							<ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" />
						</Button>
					</Link>
				</CardHeader>
				<CardContent>
					{articles.length === 0 ? (
						<NoDataState
							title={t("No articles")}
							description={t("No articles have been collected yet.")}
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
