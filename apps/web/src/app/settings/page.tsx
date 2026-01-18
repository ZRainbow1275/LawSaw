"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/hooks/use-auth";
import {
  Settings,
  User,
  Bell,
  Shield,
  Database,
  Key,
  Globe,
  Moon,
  Sun,
  Save,
  RefreshCw,
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({
    displayName: user?.display_name ?? "",
    email: user?.email ?? "",
  });

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    riskAlerts: true,
    weeklyDigest: false,
    newArticles: true,
  });

  const [appearance, setAppearance] = useState({
    theme: "light" as "light" | "dark" | "system",
    compactMode: false,
  });

  const handleSave = async () => {
    setSaving(true);
    // 模拟保存
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
  };

  const tabs = [
    { id: "profile", label: "个人资料", icon: User },
    { id: "notifications", label: "通知设置", icon: Bell },
    { id: "appearance", label: "外观设置", icon: Moon },
    { id: "security", label: "安全设置", icon: Shield },
    { id: "api", label: "API 密钥", icon: Key },
    { id: "system", label: "系统信息", icon: Database },
  ];

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />

        <MainContent>
          <Header />

          <div className="p-6">
            {/* Page Title */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-neutral-900">系统设置</h1>
              <p className="text-sm text-neutral-500">管理您的账户和系统配置</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
              {/* Sidebar Tabs */}
              <Card className="h-fit">
                <CardContent className="p-2">
                  <nav className="space-y-1">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          activeTab === tab.id
                            ? "bg-primary-50 text-primary-700 font-medium"
                            : "text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </CardContent>
              </Card>

              {/* Content Area */}
              <div className="lg:col-span-3">
                {/* Profile Settings */}
                {activeTab === "profile" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>个人资料</CardTitle>
                      <CardDescription>管理您的账户信息</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          显示名称
                        </label>
                        <Input
                          value={profile.displayName}
                          onChange={(e) =>
                            setProfile({ ...profile, displayName: e.target.value })
                          }
                          placeholder="您的名称"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          邮箱地址
                        </label>
                        <Input
                          type="email"
                          value={profile.email}
                          onChange={(e) =>
                            setProfile({ ...profile, email: e.target.value })
                          }
                          placeholder="your@email.com"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                          {saving ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          保存更改
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Notification Settings */}
                {activeTab === "notifications" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>通知设置</CardTitle>
                      <CardDescription>配置您希望接收的通知类型</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[
                        { key: "emailAlerts", label: "邮件提醒", desc: "接收重要更新的邮件通知" },
                        { key: "riskAlerts", label: "风险预警", desc: "当检测到高风险资讯时通知" },
                        { key: "weeklyDigest", label: "周报摘要", desc: "每周发送资讯摘要" },
                        { key: "newArticles", label: "新资讯通知", desc: "有新资讯入库时通知" },
                      ].map(({ key, label, desc }) => (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-lg border border-neutral-100 p-4"
                        >
                          <div>
                            <p className="font-medium">{label}</p>
                            <p className="text-sm text-neutral-500">{desc}</p>
                          </div>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={notifications[key as keyof typeof notifications]}
                              onChange={(e) =>
                                setNotifications({
                                  ...notifications,
                                  [key]: e.target.checked,
                                })
                              }
                              className="peer sr-only"
                            />
                            <div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full" />
                          </label>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                          {saving ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          保存设置
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Appearance Settings */}
                {activeTab === "appearance" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>外观设置</CardTitle>
                      <CardDescription>自定义界面外观</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium">主题</label>
                        <div className="flex gap-3">
                          {[
                            { value: "light", label: "浅色", icon: Sun },
                            { value: "dark", label: "深色", icon: Moon },
                            { value: "system", label: "跟随系统", icon: Globe },
                          ].map(({ value, label, icon: Icon }) => (
                            <button
                              key={value}
                              onClick={() =>
                                setAppearance({
                                  ...appearance,
                                  theme: value as typeof appearance.theme,
                                })
                              }
                              className={`flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                                appearance.theme === value
                                  ? "border-primary-500 bg-primary-50"
                                  : "border-neutral-200 hover:bg-neutral-50"
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                              <span className="text-sm">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-neutral-100 p-4">
                        <div>
                          <p className="font-medium">紧凑模式</p>
                          <p className="text-sm text-neutral-500">减小间距，显示更多内容</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={appearance.compactMode}
                            onChange={(e) =>
                              setAppearance({
                                ...appearance,
                                compactMode: e.target.checked,
                              })
                            }
                            className="peer sr-only"
                          />
                          <div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full" />
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Security Settings */}
                {activeTab === "security" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>安全设置</CardTitle>
                      <CardDescription>管理账户安全选项</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border border-neutral-100 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">修改密码</p>
                            <p className="text-sm text-neutral-500">定期更换密码以保护账户安全</p>
                          </div>
                          <Button variant="outline">修改</Button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-neutral-100 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">两步验证</p>
                            <p className="text-sm text-neutral-500">为账户添加额外的安全保护</p>
                          </div>
                          <Badge variant="outline">未启用</Badge>
                        </div>
                      </div>
                      <div className="rounded-lg border border-neutral-100 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">登录记录</p>
                            <p className="text-sm text-neutral-500">查看最近的登录活动</p>
                          </div>
                          <Button variant="outline">查看</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* API Keys */}
                {activeTab === "api" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>API 密钥</CardTitle>
                      <CardDescription>管理您的 API 访问密钥</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg bg-neutral-50 p-4">
                        <p className="text-sm text-neutral-600">
                          API 密钥用于程序化访问法眼系统。请妥善保管您的密钥，不要分享给他人。
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button>
                          <Key className="mr-2 h-4 w-4" />
                          创建新密钥
                        </Button>
                      </div>
                      <p className="py-8 text-center text-neutral-500">暂无 API 密钥</p>
                    </CardContent>
                  </Card>
                )}

                {/* System Info */}
                {activeTab === "system" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>系统信息</CardTitle>
                      <CardDescription>查看系统运行状态和版本信息</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {[
                          { label: "系统版本", value: "v1.0.0" },
                          { label: "前端框架", value: "Next.js 15.5" },
                          { label: "后端框架", value: "Axum (Rust)" },
                          { label: "数据库", value: "PostgreSQL 16" },
                          { label: "缓存", value: "Redis 7" },
                          { label: "AI 引擎", value: "OpenAI GPT-4" },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between border-b border-neutral-50 py-2 last:border-0"
                          >
                            <span className="text-sm text-neutral-500">{label}</span>
                            <span className="text-sm font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </MainContent>
      </div>
    </ProtectedRoute>
  );
}
