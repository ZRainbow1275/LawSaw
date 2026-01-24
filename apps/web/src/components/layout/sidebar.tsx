"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  ScrollText,
  Building2,
  Scale,
  Briefcase,
  ShieldCheck,
  BarChart3,
  Shield,
  GraduationCap,
  Flame,
  Globe2,
  MessageSquarePlus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar-store";

const categoryStyles: Record<string, string> = {
  legislation: "text-blue-500 bg-blue-50",
  regulation: "text-purple-500 bg-purple-50",
  enforcement: "text-rose-500 bg-rose-50",
  industry: "text-amber-500 bg-amber-50",
  compliance: "text-emerald-500 bg-emerald-50",
  data: "text-cyan-500 bg-cyan-50",
  security: "text-red-500 bg-red-50",
  academic: "text-indigo-500 bg-indigo-50",
  events: "text-orange-500 bg-orange-50",
  international: "text-teal-500 bg-teal-50",
};

const categories: { slug: string; name: string; Icon: LucideIcon; color: string }[] = [
  { slug: "legislation", name: "立法前沿", Icon: ScrollText, color: "legislation" },
  { slug: "regulation", name: "监管动向", Icon: Building2, color: "regulation" },
  { slug: "enforcement", name: "执法案例", Icon: Scale, color: "enforcement" },
  { slug: "industry", name: "业界资讯", Icon: Briefcase, color: "industry" },
  { slug: "compliance", name: "合规前沿", Icon: ShieldCheck, color: "compliance" },
  { slug: "data", name: "数据动态", Icon: BarChart3, color: "data" },
  { slug: "security", name: "安全前哨", Icon: Shield, color: "security" },
  { slug: "academic", name: "学术文章", Icon: GraduationCap, color: "academic" },
  { slug: "events", name: "重大事件", Icon: Flame, color: "events" },
  { slug: "international", name: "国际视野", Icon: Globe2, color: "international" },
];

const navigation = [
  { name: "数据看板", href: "/", icon: LayoutDashboard },
  { name: "全部资讯", href: "/articles", icon: FileText },
  { name: "信息源", href: "/sources", icon: Rss },
  { name: "统计分析", href: "/analytics", icon: TrendingUp },
  { name: "数据管理", href: "/data", icon: Database },
  { name: "留言反馈", href: "/feedback", icon: MessageSquarePlus },
  { name: "系统设置", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 280 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col",
        "bg-white/90 backdrop-blur-xl",
        "border-r border-neutral-200/60",
        "shadow-lg shadow-neutral-200/20"
      )}
    >
      {/* Logo - 带呼吸动画 */}
      <div className="flex h-16 items-center gap-3 border-b border-neutral-100 px-4">
        <motion.div
          className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-brand"
          whileHover={{ scale: 1.08, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <Eye className="h-5 w-5" />
          <motion.div
            className="absolute -right-0.5 -top-0.5"
            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-3 w-3 text-yellow-300" />
          </motion.div>
        </motion.div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="flex flex-col overflow-hidden"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-lg font-bold text-neutral-900">法眼</span>
              <span className="text-xs text-neutral-500">Law Eye</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <div className="mb-4">
          <AnimatePresence>
            {!collapsed && (
              <motion.p
                className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-neutral-400"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                导航
              </motion.p>
            )}
          </AnimatePresence>
          {navigation.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                    "transition-all duration-200",
                    isActive
                      ? "text-primary-700"
                      : "text-neutral-600 hover:text-neutral-900",
                    collapsed && "justify-center"
                  )}
                >
                  {/* 活跃状态背景 */}
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary-50 to-primary-100 shadow-sm"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}

                  <motion.div
                    className="relative z-10"
                    whileHover={{ scale: 1.1, rotate: isActive ? 0 : 5 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isActive ? "text-primary-500" : "text-neutral-400 group-hover:text-primary-400"
                      )}
                    />
                  </motion.div>

                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        className="relative z-10"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                      >
                        {item.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Categories */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="pt-4 border-t border-neutral-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.p
                className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-neutral-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                10 板块
              </motion.p>
              <div className="space-y-0.5">
                {categories.map((category, index) => {
                  const isActive = pathname === `/category/${category.slug}`;
                  return (
                    <motion.div
                      key={category.slug}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + index * 0.03 }}
                    >
                      <Link
                        href={`/category/${category.slug}`}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
                          "transition-all duration-200",
                          isActive
                            ? "bg-neutral-100 text-neutral-900 font-medium"
                            : "text-neutral-600 hover:bg-neutral-50/80 hover:text-neutral-900"
                        )}
                      >
                        <motion.div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg",
                            categoryStyles[category.color]
                          )}
                          whileHover={{ scale: 1.15, rotate: 10 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <category.Icon className="h-4 w-4" />
                        </motion.div>
                        <span>{category.name}</span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Collapse Button */}
      <div className="border-t border-neutral-100 p-3">
        <motion.button
          onClick={toggle}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm",
            "bg-gradient-to-r from-neutral-50 to-neutral-100/80 text-neutral-600",
            "border border-neutral-200/50",
            "hover:from-primary-50 hover:to-primary-100/50 hover:text-primary-600 hover:border-primary-200/50"
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronRight className="h-4 w-4" />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
              >
                收起菜单
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  );
}
