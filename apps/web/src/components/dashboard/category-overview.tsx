"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { useCategories } from "@/hooks/use-categories";

export function CategoryOverview() {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
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
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-neutral-100" />
            ))}
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
        <CardDescription>{categories?.length ?? 0} 大分类资讯分布</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories?.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{category.icon}</span>
                <span className="text-sm font-medium text-neutral-700">
                  {category.name}
                </span>
              </div>
              <Badge variant="outline">
                {category.sort_order}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
