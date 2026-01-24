"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  ScrollText,
  Building2,
  Scale,
  Briefcase,
  ShieldCheck,
  Shield,
  GraduationCap,
  Flame,
  Globe2,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { useCategories } from "@/hooks/use-categories";
import { cn } from "@/lib/utils";

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
          {categories?.map((category) => {
            const iconConfig = categoryIconMap[category.slug] ?? { Icon: FileText, style: "text-neutral-500 bg-neutral-50" };
            const IconComponent = iconConfig.Icon;
            return (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconConfig.style)}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-neutral-700">
                    {category.name}
                  </span>
                </div>
                <Badge variant="outline">
                  {category.sort_order}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
