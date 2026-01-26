"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api";
import {
	assertApiKeyListResponse,
	assertArticleStats,
	assertCreateApiKeyResponse,
	assertDeleteResponse,
	assertHealthResponse,
	assertUserDetailResponse,
	assertUserProfile,
	type ApiKey,
} from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
	Bell,
	Copy,
	Database,
	Globe,
	Key,
	Moon,
	RefreshCw,
	Save,
	Shield,
	Sun,
	Trash2,
	User,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type NotificationsPreferences = {
	emailAlerts: boolean;
	riskAlerts: boolean;
	weeklyDigest: boolean;
	newArticles: boolean;
};

type AppearancePreferences = {
	theme: Theme;
	compactMode: boolean;
};

const DEFAULT_NOTIFICATIONS: NotificationsPreferences = {
	emailAlerts: true,
	riskAlerts: true,
	weeklyDigest: false,
	newArticles: true,
};

const DEFAULT_APPEARANCE: AppearancePreferences = {
	theme: "light",
	compactMode: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function pickTheme(value: unknown, fallback: Theme): Theme {
	return value === "light" || value === "dark" || value === "system" ? value : fallback;
}

function parseCsv(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function SettingsContent() {
	const { user } = useAuth();
	const setUser = useAuthStore((s) => s.setUser);
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();
	const searchParams = useSearchParams();

	const [activeTab, setActiveTab] = useState("profile");
	const [loadedFromServer, setLoadedFromServer] = useState(false);

	useEffect(() => {
		const tab = searchParams.get("tab");
		if (!tab) return;

		const allowedTabs = [
			"profile",
			"notifications",
			"appearance",
			"security",
			"api",
			"system",
		];
		if (allowedTabs.includes(tab)) {
			setActiveTab(tab);
		}
	}, [searchParams]);

	const [profile, setProfile] = useState({
		displayName: "",
		email: "",
	});

	const [notifications, setNotifications] = useState<NotificationsPreferences>(
		DEFAULT_NOTIFICATIONS,
	);

	const [appearance, setAppearance] =
		useState<AppearancePreferences>(DEFAULT_APPEARANCE);

	const userId = user?.id;

	const userDetailQuery = useQuery({
		queryKey: ["users", userId],
		enabled: Boolean(userId),
		queryFn: async () => {
			if (!userId) {
				throw new Error("缺少用户信息");
			}
			return apiClient.get(`/api/v1/users/${userId}`, assertUserDetailResponse);
		},
	});

	useEffect(() => {
		if (!userId) {
			setLoadedFromServer(false);
			return;
		}
		setLoadedFromServer(false);
	}, [userId]);

	useEffect(() => {
		if (!user) return;
		setProfile({
			displayName: user.display_name ?? "",
			email: user.email ?? "",
		});
	}, [user]);

	useEffect(() => {
		const data = userDetailQuery.data;
		if (!data || loadedFromServer) return;

		setProfile({
			displayName: data.user.display_name ?? "",
			email: data.user.email ?? "",
		});

		const preferences = data.user.preferences;
		if (isRecord(preferences)) {
			const notif = preferences.notifications;
			if (isRecord(notif)) {
				setNotifications({
					emailAlerts: pickBoolean(notif.emailAlerts, DEFAULT_NOTIFICATIONS.emailAlerts),
					riskAlerts: pickBoolean(notif.riskAlerts, DEFAULT_NOTIFICATIONS.riskAlerts),
					weeklyDigest: pickBoolean(
						notif.weeklyDigest,
						DEFAULT_NOTIFICATIONS.weeklyDigest,
					),
					newArticles: pickBoolean(notif.newArticles, DEFAULT_NOTIFICATIONS.newArticles),
				});
			}

			const app = preferences.appearance;
			if (isRecord(app)) {
				setAppearance({
					theme: pickTheme(app.theme, DEFAULT_APPEARANCE.theme),
					compactMode: pickBoolean(app.compactMode, DEFAULT_APPEARANCE.compactMode),
				});
			}
		}

		setLoadedFromServer(true);
	}, [loadedFromServer, userDetailQuery.data]);

	const updateUserMutation = useMutation({
		mutationFn: async () => {
			if (!userId) {
				throw new Error("缺少用户信息");
			}

			const payload = {
				display_name: profile.displayName.trim() || null,
				preferences: {
					notifications,
					appearance,
				},
			};

			return apiClient.patch(`/api/v1/users/${userId}`, payload, assertUserProfile);
		},
		onSuccess: (updated) => {
			toastSuccess("保存成功");
			if (user) {
				setUser({
					...user,
					display_name: updated.display_name,
					avatar_url: updated.avatar_url,
				});
			}
			queryClient.invalidateQueries({ queryKey: ["users", userId] });
		},
		onError: (err) => {
			const message = err instanceof Error ? err.message : "未知错误";
			toastError("保存失败", message);
		},
	});

	const saving = updateUserMutation.isPending;

	const [apiKeyName, setApiKeyName] = useState("");
	const [apiKeyPermissions, setApiKeyPermissions] = useState("");
	const [apiKeyRateLimit, setApiKeyRateLimit] = useState("");
	const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

	const apiKeysQuery = useQuery({
		queryKey: ["apikeys"],
		enabled: activeTab === "api",
		queryFn: () => apiClient.get("/api/v1/apikeys", assertApiKeyListResponse),
	});

	const createApiKeyMutation = useMutation({
		mutationFn: async () => {
			const name = apiKeyName.trim();
			if (!name) {
				throw new Error("请输入密钥名称");
			}

			const permissions = parseCsv(apiKeyPermissions);
			const rateLimitRaw = apiKeyRateLimit.trim();
			let rateLimit: number | undefined;
			if (rateLimitRaw) {
				const parsed = Number(rateLimitRaw);
				if (!Number.isFinite(parsed) || parsed <= 0) {
					throw new Error("rate_limit 需为正数");
				}
				rateLimit = Math.floor(parsed);
			}

			const payload: Record<string, unknown> = { name };
			if (permissions.length > 0) payload.permissions = permissions;
			if (rateLimit !== undefined) payload.rate_limit = rateLimit;

			return apiClient.post("/api/v1/apikeys", payload, assertCreateApiKeyResponse);
		},
		onSuccess: (res) => {
			toastSuccess("API 密钥已创建", `前缀：${res.key.key_prefix}`);
			setCreatedRawKey(res.raw_key);
			setApiKeyName("");
			setApiKeyPermissions("");
			setApiKeyRateLimit("");
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			const message = err instanceof Error ? err.message : "未知错误";
			toastError("创建失败", message);
		},
	});

	const revokeApiKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.post(`/api/v1/apikeys/${id}/revoke`, undefined, assertDeleteResponse),
		onSuccess: () => {
			toastSuccess("已撤销 API 密钥");
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			const message = err instanceof Error ? err.message : "未知错误";
			toastError("撤销失败", message);
		},
	});

	const deleteApiKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.delete(`/api/v1/apikeys/${id}`, assertDeleteResponse),
		onSuccess: () => {
			toastSuccess("已删除 API 密钥");
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			const message = err instanceof Error ? err.message : "未知错误";
			toastError("删除失败", message);
		},
	});

	const healthQuery = useQuery({
		queryKey: ["health"],
		enabled: activeTab === "system",
		queryFn: () => apiClient.get("/health", assertHealthResponse),
	});

	const statsQuery = useQuery({
		queryKey: ["articleStats"],
		enabled: activeTab === "system",
		queryFn: () => apiClient.get("/api/v1/articles/stats", assertArticleStats),
	});

	const handleSave = async () => {
		await updateUserMutation.mutateAsync();
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
												type="button"
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
												<label
													htmlFor="profile-display-name"
													className="mb-1 block text-sm font-medium"
												>
													显示名称
												</label>
												<Input
													id="profile-display-name"
													value={profile.displayName}
													onChange={(e) =>
														setProfile((prev) => ({
															...prev,
															displayName: e.target.value,
														}))
													}
													placeholder="您的名称"
												/>
											</div>

											<div>
												<label
													htmlFor="profile-email"
													className="mb-1 block text-sm font-medium"
												>
													邮箱地址
												</label>
												<Input
													id="profile-email"
													type="email"
													value={profile.email}
													disabled
													readOnly
												/>
												<p className="mt-1 text-xs text-neutral-500">
													邮箱作为登录账号，当前不支持在线修改。
												</p>
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
											<CardDescription>
												配置您希望接收的通知类型
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											{[
												{
													key: "emailAlerts",
													label: "邮件提醒",
													desc: "接收重要更新的邮件通知",
												},
												{
													key: "riskAlerts",
													label: "风险预警",
													desc: "当检测到高风险资讯时通知",
												},
												{
													key: "weeklyDigest",
													label: "周报摘要",
													desc: "每周发送资讯摘要",
												},
												{
													key: "newArticles",
													label: "新资讯通知",
													desc: "有新资讯入库时通知",
												},
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
															checked={
																notifications[key as keyof typeof notifications]
															}
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
													<p
														id="appearance-theme-label"
														className="mb-2 block text-sm font-medium"
													>
														主题
													</p>
													<div
														className="flex gap-3"
														role="radiogroup"
														aria-labelledby="appearance-theme-label"
													>
														{[
															{ value: "light", label: "浅色", icon: Sun },
															{ value: "dark", label: "深色", icon: Moon },
															{ value: "system", label: "跟随系统", icon: Globe },
													].map(({ value, label, icon: Icon }) => (
														<button
															key={value}
															type="button"
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
													<p className="text-sm text-neutral-500">
														减小间距，显示更多内容
													</p>
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
											<div className="rounded-lg bg-neutral-50 p-4">
												<p className="text-sm text-neutral-600">
													安全相关能力（修改密码 / 两步验证 / 登录记录）需要补齐后端闭环（旧密码校验、审计留痕、通知等）后开放，避免出现“看起来能点但实际无效”的假实现。
												</p>
											</div>
											<div className="rounded-lg border border-neutral-100 p-4 opacity-70">
												<div className="flex items-center justify-between">
													<div>
														<p className="font-medium">修改密码</p>
														<p className="text-sm text-neutral-500">
															尚未开放
														</p>
													</div>
													<Button variant="outline" disabled>
														修改
													</Button>
												</div>
											</div>
											<div className="rounded-lg border border-neutral-100 p-4 opacity-70">
												<div className="flex items-center justify-between">
													<div>
														<p className="font-medium">两步验证</p>
														<p className="text-sm text-neutral-500">
															尚未开放
														</p>
													</div>
													<Badge variant="outline">未启用</Badge>
												</div>
											</div>
											<div className="rounded-lg border border-neutral-100 p-4 opacity-70">
												<div className="flex items-center justify-between">
													<div>
														<p className="font-medium">登录记录</p>
														<p className="text-sm text-neutral-500">
															尚未开放
														</p>
													</div>
													<Button variant="outline" disabled>
														查看
													</Button>
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
													API 密钥用于程序化访问法眼系统。请妥善保管密钥，不要分享给他人。
												</p>
											</div>

											{createdRawKey && (
												<div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
													<p className="text-sm font-medium text-amber-900">
														新密钥（仅显示一次，请立即复制保存）
													</p>
													<div className="mt-3 flex flex-col gap-2 sm:flex-row">
														<Input value={createdRawKey} readOnly />
														<Button
															variant="outline"
															onClick={async () => {
																try {
																	await navigator.clipboard.writeText(createdRawKey);
																	toastSuccess("已复制到剪贴板");
																} catch (err) {
																	const message =
																		err instanceof Error
																			? err.message
																			: "复制失败";
																	toastError("复制失败", message);
																}
															}}
														>
															<Copy className="mr-2 h-4 w-4" />
															复制
														</Button>
														<Button
															variant="outline"
															onClick={() => setCreatedRawKey(null)}
														>
															关闭
														</Button>
													</div>
												</div>
											)}

											<div className="rounded-lg border border-neutral-100 p-4">
												<p className="text-sm font-medium">创建新密钥</p>
												<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
													<div className="sm:col-span-1">
														<label
															htmlFor="apikey-name"
															className="mb-1 block text-xs font-medium text-neutral-600"
														>
															名称
														</label>
														<Input
															id="apikey-name"
															value={apiKeyName}
															onChange={(e) => setApiKeyName(e.target.value)}
															placeholder="例如：CI / 集成服务"
														/>
													</div>
													<div className="sm:col-span-1">
														<label
															htmlFor="apikey-permissions"
															className="mb-1 block text-xs font-medium text-neutral-600"
														>
															权限（可选，逗号分隔）
														</label>
														<Input
															id="apikey-permissions"
															value={apiKeyPermissions}
															onChange={(e) =>
																setApiKeyPermissions(e.target.value)
															}
															placeholder="例如：read, articles:read"
														/>
													</div>
													<div className="sm:col-span-1">
														<label
															htmlFor="apikey-rate-limit"
															className="mb-1 block text-xs font-medium text-neutral-600"
														>
															限流（可选）
														</label>
														<Input
															id="apikey-rate-limit"
															value={apiKeyRateLimit}
															onChange={(e) => setApiKeyRateLimit(e.target.value)}
															placeholder="例如：100"
															inputMode="numeric"
														/>
													</div>
												</div>
												<div className="mt-3 flex justify-end">
													<Button
														onClick={() => createApiKeyMutation.mutate()}
														disabled={createApiKeyMutation.isPending}
													>
														{createApiKeyMutation.isPending ? (
															<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
														) : (
															<Key className="mr-2 h-4 w-4" />
														)}
														创建
													</Button>
												</div>
											</div>

											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<p className="text-sm font-medium">已创建的密钥</p>
													<Button
														variant="outline"
														onClick={() => apiKeysQuery.refetch()}
														disabled={apiKeysQuery.isFetching}
													>
														<RefreshCw
															className={`mr-2 h-4 w-4 ${
																apiKeysQuery.isFetching ? "animate-spin" : ""
															}`}
														/>
														刷新
													</Button>
												</div>

												{apiKeysQuery.isLoading && (
													<p className="py-6 text-center text-sm text-neutral-500">
														加载中...
													</p>
												)}

												{apiKeysQuery.isError && (
													<p className="py-6 text-center text-sm text-neutral-500">
														加载失败：
														{apiKeysQuery.error instanceof Error
															? apiKeysQuery.error.message
															: "未知错误"}
													</p>
												)}

												{apiKeysQuery.data && apiKeysQuery.data.keys.length === 0 && (
													<p className="py-6 text-center text-sm text-neutral-500">
														暂无 API 密钥
													</p>
												)}

												{apiKeysQuery.data?.keys.map((k: ApiKey) => (
													<div
														key={k.id}
														className="rounded-lg border border-neutral-100 p-4"
													>
														<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
															<div className="min-w-0">
																<div className="flex items-center gap-2">
																	<p className="truncate font-medium">{k.name}</p>
																	<Badge variant="outline">
																		{k.is_active ? "启用" : "已撤销"}
																	</Badge>
																</div>
																<p className="mt-1 text-xs text-neutral-500">
																	前缀：{k.key_prefix} · 限流：{k.rate_limit}
																</p>
																<p className="mt-1 text-xs text-neutral-500">
																	权限：
																	{k.permissions.length > 0
																		? k.permissions.join(", ")
																		: "（默认）"}
																</p>
															</div>

															<div className="flex gap-2">
																<Button
																	variant="outline"
																	disabled={
																		!k.is_active ||
																		revokeApiKeyMutation.isPending
																	}
																	onClick={() => {
																		if (
																			!window.confirm(
																				"确认撤销该 API 密钥？撤销后将立即失效。",
																			)
																		) {
																			return;
																		}
																		revokeApiKeyMutation.mutate(k.id);
																	}}
																>
																	撤销
																</Button>
																<Button
																	variant="outline"
																	disabled={deleteApiKeyMutation.isPending}
																	onClick={() => {
																		if (
																			!window.confirm(
																				"确认删除该 API 密钥？此操作不可恢复。",
																			)
																		) {
																			return;
																		}
																		deleteApiKeyMutation.mutate(k.id);
																	}}
																>
																	<Trash2 className="mr-2 h-4 w-4" />
																	删除
																</Button>
															</div>
														</div>
													</div>
												))}
											</div>
										</CardContent>
									</Card>
								)}

								{/* System Info */}
								{activeTab === "system" && (
									<Card>
										<CardHeader>
											<CardTitle>系统信息</CardTitle>
											<CardDescription>
												查看系统运行状态和版本信息
											</CardDescription>
										</CardHeader>
										<CardContent>
											<div className="space-y-3">
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">API 状态</span>
													<span className="text-sm font-medium">
														{healthQuery.isLoading
															? "检测中"
															: healthQuery.isError
																? "异常"
																: healthQuery.data?.status ?? "未知"}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">后端版本</span>
													<span className="text-sm font-medium">
														{healthQuery.data?.version ?? "-"}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">数据库</span>
													<span className="text-sm font-medium">
														{statsQuery.isLoading
															? "检测中"
															: statsQuery.isError
																? "异常"
																: "可用"}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">文章总数</span>
													<span className="text-sm font-medium">
														{statsQuery.data?.total_articles ?? "-"}
													</span>
												</div>
												<div className="flex items-center justify-between py-2">
													<span className="text-sm text-neutral-500">今日新增</span>
													<span className="text-sm font-medium">
														{statsQuery.data?.today_count ?? "-"}
													</span>
												</div>
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

function SettingsLoading() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
		</div>
	);
}

export default function SettingsPage() {
	return (
		<Suspense fallback={<SettingsLoading />}>
			<SettingsContent />
		</Suspense>
	);
}
