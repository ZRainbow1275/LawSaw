"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { type ArticleRiskLevel, getArticleRiskLevel } from "@/lib/api/types";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import {
	ArrowLeft,
	ArrowUpRight,
	ChevronLeft,
	ChevronRight,
	Clock,
	FileText,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

type RiskBadgeVariant = "success" | "warning" | "destructive" | "outline";

const riskColors: Record<ArticleRiskLevel, RiskBadgeVariant> = {
	unknown: "outline",
	low: "success",
	medium: "warning",
	high: "destructive",
	critical: "destructive",
};

const riskLabels: Record<ArticleRiskLevel, string> = {
	unknown: "Unrated",
	low: "Low risk",
	medium: "Medium risk",
	high: "High risk",
	critical: "Critical",
};

function formatTime(
	locale: Locale,
	dateStr: string | null,
	unknownLabel: string,
): string {
	if (!dateStr) return unknownLabel;
	const date = new Date(dateStr);
	return formatDateTime(locale, date, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

const PAGE_SIZE = 20;

export default function CategoryPage() {
	const params = useParams();
	const locale = useLocale();
	const t = useT();
	const slug = params.slug as string;
	const [page, setPage] = useState(0);

	const { data: categories, isLoading: categoriesLoading } = useCategories();

	// Find category by slug.
	const category = categories?.find((c) => c.slug === slug);

	const { data: articlesData, isLoading: articlesLoading } = useArticles({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
		category_id: category?.id,
	});

	const articles = articlesData?.data ?? [];
	const total = articlesData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);

	const isLoading = categoriesLoading || articlesLoading;

	// Not found.
	if (!categoriesLoading && !category) {
		return (
			<ProtectedRoute>
				<div className="flex min-h-screen bg-neutral-50">
					<Sidebar />
					<MainContent>
						<Header />
						<div className="flex flex-col items-center justify-center p-12">
							<p className="text-lg text-neutral-500">
								{t("Category not found")}
							</p>
							<Link href="/articles" className="mt-4">
								<Button variant="outline">
									<ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
									{t("Back to articles")}
								</Button>
							</Link>
						</div>
					</MainContent>
				</div>
			</ProtectedRoute>
		);
	}

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Breadcrumb */}
						<div className="mb-4">
							<Link
								href="/articles"
								className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-900"
							>
								<ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
								{t("Back to all articles")}
							</Link>
						</div>

						{/* Page Title */}
						<div className="mb-6 flex items-center gap-4">
							{category && (
								<>
									<span className="text-4xl">{category.icon}</span>
									<div>
										<h1 className="text-2xl font-bold text-neutral-900">
											{category.name}
										</h1>
										{category.description && (
											<p className="text-sm text-neutral-500">
												{category.description}
											</p>
										)}
									</div>
									<Badge variant="outline" className="ml-auto">
										{t("{count} articles", { count: total })}
									</Badge>
								</>
							)}
						</div>

						{/* Articles List */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<FileText
										aria-hidden="true"
										className="h-5 w-5 text-primary-500"
									/>
									{t("{name} articles", { name: category?.name ?? "" })}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{isLoading ? (
									<div className="animate-pulse space-y-4">
										{Array.from(
											{ length: 5 },
											(_, idx) => `cat-skel-${idx}`,
										).map((key) => (
											<div
												key={key}
												className="h-24 rounded-lg bg-neutral-100"
											/>
										))}
									</div>
								) : articles.length === 0 ? (
									<p className="py-12 text-center text-neutral-500">
										{t("No articles in this category")}
									</p>
								) : (
									<div className="space-y-4">
										{articles.map((article) => {
											const riskLevel = getArticleRiskLevel(article.risk_score);

											return (
												<div
													key={article.id}
													className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
												>
													<div className="flex-1">
														<div className="mb-2 flex items-center gap-2">
															<Badge variant={riskColors[riskLevel]}>
																{t(riskLabels[riskLevel])}
															</Badge>
															<Badge variant="outline">{article.status}</Badge>
														</div>
														<h4 className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600">
															{article.title}
														</h4>
														{article.summary && (
															<p className="mt-1 line-clamp-2 text-xs text-neutral-500">
																{article.summary}
															</p>
														)}
														<div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
															{article.author && (
																<span>
																	{t("Source: {name}", {
																		name: article.author,
																	})}
																</span>
															)}
															<span className="flex items-center gap-1">
																<Clock aria-hidden="true" className="h-3 w-3" />
																{formatTime(
																	locale,
																	article.published_at,
																	t("Unknown time"),
																)}
															</span>
														</div>
													</div>
													<div className="flex items-center gap-2">
														{article.link && (
															<a
																href={article.link}
																target="_blank"
																rel="noopener noreferrer"
																className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-700 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-900 group-hover:opacity-100"
															>
																<ArrowUpRight
																	aria-hidden="true"
																	className="h-4 w-4"
																/>
															</a>
														)}
													</div>
												</div>
											);
										})}
									</div>
								)}

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="mt-6 flex items-center justify-between">
										<p className="text-sm text-neutral-500">
											{t("Page {current} / {total}", {
												current: page + 1,
												total: totalPages,
											})}
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPage((p) => Math.max(0, p - 1))}
												disabled={page === 0}
											>
												<ChevronLeft aria-hidden="true" className="h-4 w-4" />
												{t("Previous")}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setPage((p) => Math.min(totalPages - 1, p + 1))
												}
												disabled={page >= totalPages - 1}
											>
												{t("Next")}
												<ChevronRight aria-hidden="true" className="h-4 w-4" />
											</Button>
										</div>
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
