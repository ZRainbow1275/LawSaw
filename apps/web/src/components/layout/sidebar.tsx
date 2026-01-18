"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Database,
  Settings,
  Rss,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar-store";

const categories = [
  { slug: "legislation", name: "立法前沿", icon: "📜", color: "legislation" },
  { slug: "regulation", name: "监管动向", icon: "🏛️", color: "regulation" },
  { slug: "enforcement", name: "执法案例", icon: "⚖️", color: "enforcement" },
  { slug: "industry", name: "业界资讯", icon: "🏢", color: "industry" },
  { slug: "compliance", name: "合规前沿", icon: "✅", color: "compliance" },
  { slug: "data", name: "数据动态", icon: "📊", color: "data" },
  { slug: "security", name: "安全前哨", icon: "🛡️", color: "security" },
  { slug: "academic", name: "学术文章", icon: "📚", color: "academic" },
  { slug: "events", name: "重大事件", icon: "🔥", color: "events" },
  { slug: "international", name: "国际视野", icon: "🌍", color: "international" },
];

const navigation = [
  { name: "数据看板", href: "/", icon: LayoutDashboard },
  { name: "全部资讯", href: "/articles", icon: FileText },
  { name: "信息源", href: "/sources", icon: Rss },
  { name: "统计分析", href: "/analytics", icon: TrendingUp },
  { name: "数据管理", href: "/data", icon: Database },
  { name: "系统设置", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-neutral-200 bg-white transition-all duration-300",
        collapsed ? "w-16" : "w-[280px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-neutral-200 px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-brand">
          <Eye className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-bold text-neutral-900">法眼</span>
            <span className="text-xs text-neutral-500">Law Eye</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <div className="mb-4">
          {!collapsed && (
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
              导航
            </p>
          )}
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-to-r from-primary-50 to-primary-100 text-primary-700 shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                  collapsed && "justify-center"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-primary-500" : "text-neutral-400"
                  )}
                />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </div>

        {/* Categories */}
        {!collapsed && (
          <div className="pt-4 border-t border-neutral-100">
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
              10 板块
            </p>
            <div className="space-y-0.5">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/category/${category.slug}`}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                    pathname === `/category/${category.slug}`
                      ? "bg-neutral-100 text-neutral-900 font-medium"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  )}
                >
                  <span className="text-base">{category.icon}</span>
                  <span>{category.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Collapse Button */}
      <div className="border-t border-neutral-200 p-3">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-50 py-2 text-sm text-neutral-600 transition-all hover:bg-neutral-100 hover:text-neutral-900"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>收起菜单</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
