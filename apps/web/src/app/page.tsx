"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CategoryOverview } from "@/components/dashboard/category-overview";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />

        <MainContent>
          <Header />

          <div className="p-6">
            {/* Page Title */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-neutral-900">数据看板</h1>
              <p className="text-sm text-neutral-500">实时监控法律资讯动态与系统运行状态</p>
            </div>

            {/* Stats Grid */}
            <StatsCards />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Categories Overview */}
              <CategoryOverview />

              {/* Recent Articles */}
              <RecentArticles />
            </div>

            {/* System Status */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  系统状态
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">API 服务</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">运行正常</p>
                  </div>
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">采集服务</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">信息源正常</p>
                  </div>
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">AI 服务</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">LLM Gateway 在线</p>
                  </div>
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">数据库</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">PostgreSQL + Redis 正常</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </MainContent>
      </div>
    </ProtectedRoute>
  );
}
