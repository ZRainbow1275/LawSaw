"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowUpRight, Clock } from "lucide-react";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import Link from "next/link";

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
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function RecentArticles() {
  const { data: articlesData, isLoading } = useArticles({ limit: 5, status: "published" });
  const { data: categories } = useCategories();

  const articles = articlesData?.data ?? [];

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId || !categories) return null;
    return categories.find((c) => c.id === categoryId);
  };

  if (isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary-500" />
            最新资讯
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-neutral-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
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
        <div className="space-y-4">
          {articles.length === 0 ? (
            <p className="text-center text-neutral-500 py-8">暂无资讯</p>
          ) : (
            articles.map((article) => {
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
                          {category.name}
                        </Badge>
                      )}
                      <Badge variant={riskColors[riskLevel]}>
                        {riskLabels[riskLevel]}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600">
                      {article.title}
                    </h4>
                    <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
                      {article.author && <span>来源：{article.author}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(article.published_at)}
                      </span>
                    </div>
                  </div>
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Button variant="ghost" size="icon">
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
