"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import {
  FileText,
  Clock,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

type RiskLevel = "low" | "medium" | "high";

const riskColors: Record<RiskLevel, "success" | "warning" | "destructive"> = {
  low: "success",
  medium: "warning",
  high: "destructive",
};

const riskLabels: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

function getRiskLevel(score: number | null): RiskLevel {
  if (!score || score <= 30) return "low";
  if (score <= 70) return "medium";
  return "high";
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "未知时间";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const PAGE_SIZE = 20;

export default function ArticlesPage() {
  const [page, setPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: articlesData, isLoading: articlesLoading } = useArticles({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    category_id: selectedCategory ?? undefined,
  });

  const { data: categories } = useCategories();

  const articles = articlesData?.data ?? [];
  const total = articlesData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId || !categories) return null;
    return categories.find((c) => c.id === categoryId);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />

        <main className="ml-[280px] flex-1">
          <Header />

          <div className="p-6">
            {/* Page Title */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">资讯列表</h1>
                <p className="text-sm text-neutral-500">
                  共 {total} 条资讯
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                筛选
              </Button>
            </div>

            {/* Category Filters */}
            <div className="mb-6 flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedCategory(null);
                  setPage(0);
                }}
              >
                全部
              </Badge>
              {categories?.map((category) => (
                <Badge
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setPage(0);
                  }}
                >
                  {category.icon} {category.name}
                </Badge>
              ))}
            </div>

            {/* Articles List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-500" />
                  资讯列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {articlesLoading ? (
                  <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-24 rounded-lg bg-neutral-100" />
                    ))}
                  </div>
                ) : articles.length === 0 ? (
                  <p className="py-12 text-center text-neutral-500">暂无资讯</p>
                ) : (
                  <div className="space-y-4">
                    {articles.map((article) => {
                      const category = getCategoryName(article.category_id);
                      const riskLevel = getRiskLevel(article.risk_score);

                      return (
                        <div
                          key={article.id}
                          className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
                        >
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              {category && (
                                <Badge variant="outline">
                                  {category.icon} {category.name}
                                </Badge>
                              )}
                              <Badge variant={riskColors[riskLevel]}>
                                {riskLabels[riskLevel]}
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
                              {article.author && <span>来源：{article.author}</span>}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(article.published_at)}
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
                                <ArrowUpRight className="h-4 w-4" />
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
                      第 {page + 1} / {totalPages} 页
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
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
