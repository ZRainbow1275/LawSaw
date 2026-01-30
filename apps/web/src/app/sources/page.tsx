"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	useCreateSource,
	useSources,
	useTriggerFetch,
} from "@/hooks/use-sources";
import type { Source } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Database,
	Globe,
	Plus,
	RefreshCw,
	Rss,
	X,
} from "lucide-react";
import { useState } from "react";

const sourceTypeIcons: Record<Source["source_type"], React.ReactNode> = {
	rss: <Rss className="h-4 w-4" />,
	spider: <Globe className="h-4 w-4" />,
	api: <Database className="h-4 w-4" />,
};

const sourceTypeLabels: Record<Source["source_type"], string> = {
	rss: "RSS 订阅",
	spider: "网页爬虫",
	api: "API 接口",
};

function formatTime(dateStr: string | null): string {
	if (!dateStr) return "从未";
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "刚刚";
	if (diffMins < 60) return `${diffMins} 分钟前`;
	if (diffHours < 24) return `${diffHours} 小时前`;
	return `${diffDays} 天前`;
}

export default function SourcesPage() {
	const { data: sources, isLoading } = useSources();
	const triggerFetch = useTriggerFetch();
	const createSource = useCreateSource();
	const { permissions } = useAuthStore();
	const isAdmin = permissions.includes("*");
	const { success: toastSuccess, error: toastError } = useToast();
	const [showAddForm, setShowAddForm] = useState(false);
	const [newSource, setNewSource] = useState({
		name: "",
		url: "",
		source_type: "rss" as "rss" | "spider",
	});
	const [spiderConfig, setSpiderConfig] = useState({
		list_selector: "",
		title_selector: "",
		link_selector: "",
		content_selector: "",
		date_selector: "",
		delay_ms: "",
	});

	const handleTriggerFetch = (id: string) => {
		if (!isAdmin) return;
		triggerFetch.mutate(id, {
			onSuccess: () => {
				toastSuccess("已触发抓取", "采集任务已加入队列");
			},
			onError: (cause) => {
				const message = cause instanceof Error ? cause.message : "触发抓取失败";
				toastError("触发抓取失败", message);
			},
		});
	};

	const handleAddSource = (e: React.FormEvent) => {
		e.preventDefault();
		if (!isAdmin) {
			toastError("权限不足", "仅管理员可添加信息源");
			return;
		}
		if (!newSource.name || !newSource.url) return;

		const name = newSource.name.trim();
		const url = newSource.url.trim();
		if (!name || !url) return;

		let config: Record<string, unknown> = {};
		if (newSource.source_type === "spider") {
			const list_selector = spiderConfig.list_selector.trim();
			const title_selector = spiderConfig.title_selector.trim();
			const link_selector = spiderConfig.link_selector.trim();

			if (!list_selector || !title_selector || !link_selector) {
				toastError(
					"爬虫配置不完整",
					"请填写 list_selector、title_selector、link_selector",
				);
				return;
			}

			let delay_ms: number | undefined;
			if (spiderConfig.delay_ms.trim()) {
				const parsed = Number(spiderConfig.delay_ms);
				if (!Number.isFinite(parsed) || parsed < 0) {
					toastError("爬虫配置无效", "delay_ms 必须是非负数字");
					return;
				}
				delay_ms = parsed;
			}

			config = {
				list_selector,
				title_selector,
				link_selector,
				content_selector: spiderConfig.content_selector.trim() || undefined,
				date_selector: spiderConfig.date_selector.trim() || undefined,
				delay_ms,
			};
		}

		createSource.mutate(
			{ name, url, source_type: newSource.source_type, config },
			{
				onSuccess: () => {
					setShowAddForm(false);
					setNewSource({ name: "", url: "", source_type: "rss" });
					setSpiderConfig({
						list_selector: "",
						title_selector: "",
						link_selector: "",
						content_selector: "",
						date_selector: "",
						delay_ms: "",
					});
					toastSuccess("添加成功", "信息源已创建");
				},
				onError: (cause) => {
					const message =
						cause instanceof Error ? cause.message : "添加信息源失败";
					toastError("添加信息源失败", message);
				},
			},
		);
	};

	const activeCount = sources?.filter((s) => s.is_active).length ?? 0;
	const errorCount = sources?.filter((s) => s.last_error).length ?? 0;

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6 flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-neutral-900">
									信息源管理
								</h1>
								<p className="text-sm text-neutral-500">
									管理和监控所有数据采集源
								</p>
							</div>
							<Button
								onClick={() => setShowAddForm(true)}
								disabled={!isAdmin}
								title={!isAdmin ? "需要管理员权限" : undefined}
							>
								<Plus className="mr-2 h-4 w-4" />
								添加信息源
							</Button>
						</div>

						{/* Stats */}
						<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
											<Rss className="h-5 w-5 text-primary-600" />
										</div>
										<div>
											<p className="text-2xl font-bold">
												{sources?.length ?? 0}
											</p>
											<p className="text-sm text-neutral-500">总信息源</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
											<CheckCircle2 className="h-5 w-5 text-success" />
										</div>
										<div>
											<p className="text-2xl font-bold">{activeCount}</p>
											<p className="text-sm text-neutral-500">活跃源</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
											<AlertCircle className="h-5 w-5 text-destructive" />
										</div>
										<div>
											<p className="text-2xl font-bold">{errorCount}</p>
											<p className="text-sm text-neutral-500">异常源</p>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Add Source Form */}
						{showAddForm && (
							<Card className="mb-6">
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										<span>添加新信息源</span>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setShowAddForm(false)}
										>
											<X className="h-4 w-4" />
										</Button>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<form onSubmit={handleAddSource} className="space-y-4">
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
											<div>
												<label
													htmlFor="new-source-name"
													className="mb-1 block text-sm font-medium"
												>
													名称
												</label>
												<Input
													id="new-source-name"
													placeholder="例如：财新网"
													value={newSource.name}
													onChange={(e) =>
														setNewSource({ ...newSource, name: e.target.value })
													}
												/>
											</div>
											<div>
												<label
													htmlFor="new-source-type"
													className="mb-1 block text-sm font-medium"
												>
													类型
												</label>
												<select
													id="new-source-type"
													className="h-10 w-full rounded-md border border-neutral-200 px-3"
													value={newSource.source_type}
													onChange={(e) =>
														setNewSource({
															...newSource,
															source_type: e.target.value as "rss" | "spider",
														})
													}
												>
													<option value="rss">RSS 订阅</option>
													<option value="spider">网页爬虫</option>
												</select>
											</div>
										</div>
										<div>
											<label
												htmlFor="new-source-url"
												className="mb-1 block text-sm font-medium"
											>
												URL
											</label>
											<Input
												id="new-source-url"
												placeholder="https://www.theguardian.com/law/rss"
												value={newSource.url}
												onChange={(e) =>
													setNewSource({ ...newSource, url: e.target.value })
												}
											/>
										</div>

										{newSource.source_type === "spider" && (
											<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-4">
												<div>
													<p className="text-sm font-medium text-neutral-700">
														爬虫配置
													</p>
													<p className="mt-1 text-xs text-neutral-500">
														必填：list/title/link selector。可选：content/date
														selector 与延迟（ms）。
													</p>
												</div>
												<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
													<div>
														<label
															htmlFor="spider-list-selector"
															className="mb-1 block text-sm font-medium"
														>
															list_selector{" "}
															<span className="text-red-500">*</span>
														</label>
														<Input
															id="spider-list-selector"
															placeholder="例如：.article-list a"
															value={spiderConfig.list_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	list_selector: e.target.value,
																})
															}
															required
														/>
													</div>
													<div>
														<label
															htmlFor="spider-title-selector"
															className="mb-1 block text-sm font-medium"
														>
															title_selector{" "}
															<span className="text-red-500">*</span>
														</label>
														<Input
															id="spider-title-selector"
															placeholder="例如：.title"
															value={spiderConfig.title_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	title_selector: e.target.value,
																})
															}
															required
														/>
													</div>
													<div>
														<label
															htmlFor="spider-link-selector"
															className="mb-1 block text-sm font-medium"
														>
															link_selector{" "}
															<span className="text-red-500">*</span>
														</label>
														<Input
															id="spider-link-selector"
															placeholder="例如：a"
															value={spiderConfig.link_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	link_selector: e.target.value,
																})
															}
															required
														/>
													</div>
												</div>
												<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
													<div>
														<label
															htmlFor="spider-content-selector"
															className="mb-1 block text-sm font-medium"
														>
															content_selector（选填）
														</label>
														<Input
															id="spider-content-selector"
															placeholder="例如：article"
															value={spiderConfig.content_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	content_selector: e.target.value,
																})
															}
														/>
													</div>
													<div>
														<label
															htmlFor="spider-date-selector"
															className="mb-1 block text-sm font-medium"
														>
															date_selector（选填）
														</label>
														<Input
															id="spider-date-selector"
															placeholder="例如：time"
															value={spiderConfig.date_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	date_selector: e.target.value,
																})
															}
														/>
													</div>
													<div>
														<label
															htmlFor="spider-delay-ms"
															className="mb-1 block text-sm font-medium"
														>
															delay_ms（选填）
														</label>
														<Input
															id="spider-delay-ms"
															type="number"
															min={0}
															placeholder="例如：500"
															value={spiderConfig.delay_ms}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	delay_ms: e.target.value,
																})
															}
														/>
													</div>
												</div>
											</div>
										)}

										<div className="flex justify-end gap-2">
											<Button
												type="button"
												variant="outline"
												onClick={() => setShowAddForm(false)}
											>
												取消
											</Button>
											<Button type="submit" disabled={createSource.isPending}>
												{createSource.isPending ? "添加中..." : "添加"}
											</Button>
										</div>
									</form>
								</CardContent>
							</Card>
						)}

						{/* Sources List */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Rss className="h-5 w-5 text-primary-500" />
									信息源列表
								</CardTitle>
							</CardHeader>
							<CardContent>
								{isLoading ? (
									<div className="animate-pulse space-y-4">
										{Array.from(
											{ length: 5 },
											(_, idx) => `source-skel-${idx}`,
										).map((key) => (
											<div
												key={key}
												className="h-20 rounded-lg bg-neutral-100"
											/>
										))}
									</div>
								) : !sources || sources.length === 0 ? (
									<p className="py-12 text-center text-neutral-500">
										暂无信息源，点击上方按钮添加
									</p>
								) : (
									<div className="space-y-4">
										{sources.map((source) => (
											<div
												key={source.id}
												className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
											>
												<div className="flex-1">
													<div className="mb-2 flex items-center gap-2">
														<Badge variant="outline" className="gap-1">
															{sourceTypeIcons[source.source_type]}
															{sourceTypeLabels[source.source_type]}
														</Badge>
														{source.is_active ? (
															<Badge variant="success">活跃</Badge>
														) : (
															<Badge variant="outline">已停用</Badge>
														)}
														{source.last_error && (
															<Badge variant="destructive">异常</Badge>
														)}
													</div>
													<h4 className="text-sm font-semibold text-neutral-900">
														{source.name}
													</h4>
													<p className="mt-1 text-xs text-neutral-500 truncate max-w-md">
														{source.url}
													</p>
													<div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
														<span className="flex items-center gap-1">
															<Clock className="h-3 w-3" />
															最后抓取: {formatTime(source.last_fetch)}
														</span>
														{source.schedule && (
															<span>调度: {source.schedule}</span>
														)}
													</div>
													{source.last_error && (
														<p className="mt-2 text-xs text-destructive">
															错误: {source.last_error}
														</p>
													)}
												</div>
												<div className="flex items-center gap-2">
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleTriggerFetch(source.id)}
														disabled={!isAdmin || triggerFetch.isPending}
														title={!isAdmin ? "需要管理员权限" : undefined}
													>
														<RefreshCw
															className={`mr-1 h-3 w-3 ${
																triggerFetch.isPending ? "animate-spin" : ""
															}`}
														/>
														抓取
													</Button>
												</div>
											</div>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
