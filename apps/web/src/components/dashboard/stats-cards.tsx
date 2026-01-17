"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FileText, Rss, Clock, AlertTriangle } from "lucide-react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";

export function StatsCards() {
  const { data: articlesData, isLoading: articlesLoading } = useArticles({ limit: 1 });
  const { data: sourcesData, isLoading: sourcesLoading } = useSources();

  const activeSources = sourcesData?.filter((s) => s.is_active).length ?? 0;
  const pendingArticles = articlesData?.data?.filter((a) => a.status === "pending").length ?? 0;
  const highRiskArticles = articlesData?.data?.filter((a) => (a.risk_score ?? 0) > 70).length ?? 0;

  const stats = [
    {
      title: "今日资讯",
      value: articlesLoading ? "-" : (articlesData?.total ?? 0).toString(),
      icon: FileText,
      color: "primary",
    },
    {
      title: "活跃信息源",
      value: sourcesLoading ? "-" : activeSources.toString(),
      icon: Rss,
      color: "success",
    },
    {
      title: "待处理",
      value: articlesLoading ? "-" : pendingArticles.toString(),
      icon: Clock,
      color: "warning",
    },
    {
      title: "风险预警",
      value: articlesLoading ? "-" : highRiskArticles.toString(),
      icon: AlertTriangle,
      color: "error",
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">{stat.title}</p>
                <p className="mt-2 text-3xl font-bold text-neutral-900">{stat.value}</p>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  stat.color === "primary"
                    ? "bg-primary-100 text-primary-600"
                    : stat.color === "success"
                    ? "bg-success-light text-success"
                    : stat.color === "warning"
                    ? "bg-warning-light text-warning"
                    : "bg-error-light text-error"
                }`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
