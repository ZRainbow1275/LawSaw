"use client";

import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CategoryOverview } from "@/components/dashboard/category-overview";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Zap, Activity, Server, Database } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

const systemServices = [
  { name: "API 服务", desc: "运行正常", icon: Server },
  { name: "采集服务", desc: "信息源正常", icon: Activity },
  { name: "AI 服务", desc: "LLM Gateway 在线", icon: Zap },
  { name: "数据库", desc: "PostgreSQL + Redis 正常", icon: Database },
];

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-gradient-to-br from-neutral-50 via-white to-primary-50/20">
        <Sidebar />

        <MainContent>
          <Header />

          <motion.div
            className="p-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Page Title - 带渐变装饰 */}
            <motion.div className="mb-8 relative" variants={itemVariants}>
              <div className="absolute -left-3 top-0 h-full w-1 rounded-full bg-gradient-to-b from-primary-500 to-primary-300" />
              <h1 className="text-2xl font-bold text-neutral-900">数据看板</h1>
              <p className="mt-1 text-sm text-neutral-500">
                实时监控法律资讯动态与系统运行状态
              </p>
            </motion.div>

            {/* Stats Grid */}
            <motion.div variants={itemVariants}>
              <StatsCards />
            </motion.div>

            <motion.div
              className="grid grid-cols-1 gap-6 lg:grid-cols-3"
              variants={itemVariants}
            >
              {/* Categories Overview */}
              <CategoryOverview />

              {/* Recent Articles */}
              <RecentArticles />
            </motion.div>

            {/* System Status - 增强版 */}
            <motion.div variants={itemVariants}>
              <Card className="mt-6 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-green-50/80 to-emerald-50/50 border-b border-green-100/50">
                  <CardTitle className="flex items-center gap-2">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </motion.div>
                    系统状态
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      全部正常
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {systemServices.map((service, index) => (
                      <motion.div
                        key={service.name}
                        className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-green-50 to-emerald-50/50 p-4 border border-green-100/50"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + index * 0.1 }}
                        whileHover={{ scale: 1.02, y: -2 }}
                      >
                        {/* 背景装饰 */}
                        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-green-200/30 blur-xl transition-all group-hover:scale-150" />

                        <div className="relative flex items-center gap-3">
                          <motion.div
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-green-100"
                            whileHover={{ rotate: 10 }}
                          >
                            <service.icon className="h-5 w-5 text-green-500" />
                          </motion.div>
                          <div>
                            <div className="flex items-center gap-2">
                              <motion.div
                                className="h-2 w-2 rounded-full bg-green-500"
                                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              />
                              <span className="text-sm font-medium text-green-700">
                                {service.name}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-600">
                              {service.desc}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </MainContent>
      </div>
    </ProtectedRoute>
  );
}
