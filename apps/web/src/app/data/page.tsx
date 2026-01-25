"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { apiClient } from "@/lib/api";
import {
	assertBatchStatusResponse,
	assertDeleteResponse,
	getArticleRiskLevel,
} from "@/lib/api/types";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Archive,
	CheckCircle,
	ChevronLeft,
	ChevronRight,
	Clock,
	Database,
	Filter,
	MoreHorizontal,
	Search,
	Trash2,
	XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ArticleStatus =
	| "pending"
	| "processing"
	| "published"
	| "archived"
	| "rejected";

const statusConfig: Record<
	ArticleStatus,
	{
		label: string;
		variant: "default" | "outline" | "success" | "warning" | "destructive";
	}
> = {
	pending: { label: "待处理", variant: "outline" },
	processing: { label: "处理中", variant: "warning" },
	published: { label: "已发布", variant: "success" },
	archived: { label: "已归档", variant: "outline" },
	rejected: { label: "已拒绝", variant: "destructive" },
};

const PAGE_SIZE = 20;

export default function DataPage() {
	const router = useRouter();
	const [page, setPage] = useState(0);
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<ArticleStatus | "all">(
		"all",
	);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();

	const { data: articlesData, isLoading } = useArticles({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
	});

	const { data: categories } = useCategories();

	const articles = articlesData?.data ?? [];
	const total = articlesData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);

	const selectedIdList = Array.from(selectedIds);

	const batchStatusMutation = useMutation({
		mutationFn: (input: { ids: string[]; status: ArticleStatus }) =>
			apiClient.post(
				"/api/v1/articles/batch-status",
				input,
				assertBatchStatusResponse,
			),
		onSuccess: (data, variables) => {
			const actionLabel = variables.status === "published" ? "发布" : "归档";
			toastSuccess(`已${actionLabel}`, `已更新 ${data.updated} 条资讯`);
			setSelectedIds(new Set());
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
		onError: (cause) => {
			const message = cause instanceof Error ? cause.message : "操作失败";
			toastError("批量更新失败", message);
		},
	});

	const batchDeleteMutation = useMutation({
		mutationFn: async (ids: string[]) => {
			const results = await Promise.allSettled(
				ids.map((id) => apiClient.delete(`/api/v1/articles/${id}`, assertDeleteResponse)),
			);

			const deleted = results.filter((r) => r.status === "fulfilled").length;
			const failed = results.length - deleted;

			return { deleted, failed };
		},
		onSuccess: ({ deleted, failed }) => {
			if (deleted > 0) {
				toastSuccess("删除完成", `已删除 ${deleted} 条资讯`);
			}
			if (failed > 0) {
				toastError("部分删除失败", `失败 ${failed} 条（可能是权限不足或不存在）`);
			}

			setSelectedIds(new Set());
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
		onError: (cause) => {
			const message = cause instanceof Error ? cause.message : "操作失败";
			toastError("批量删除失败", message);
		},
	});

	// 过滤文章
	const filteredArticles = articles.filter((article) => {
		const matchesSearch =
			!searchTerm ||
			article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
			article.summary?.toLowerCase().includes(searchTerm.toLowerCase());
		const matchesStatus =
			statusFilter === "all" || article.status === statusFilter;
		return matchesSearch && matchesStatus;
	});

	const getCategoryName = (categoryId: string | null) => {
		if (!categoryId || !categories) return "未分类";
		const cat = categories.find((c) => c.id === categoryId);
		return cat ? `${cat.icon} ${cat.name}` : "未分类";
	};

	const toggleSelect = (id: string) => {
		const newSelected = new Set(selectedIds);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		setSelectedIds(newSelected);
	};

	const selectAll = () => {
		if (selectedIds.size === filteredArticles.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(filteredArticles.map((a) => a.id)));
		}
	};

	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return "-";
		return new Date(dateStr).toLocaleDateString("zh-CN");
	};

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6">
							<h1 className="text-2xl font-bold text-neutral-900">数据管理</h1>
							<p className="text-sm text-neutral-500">管理所有采集的资讯数据</p>
						</div>

						{/* Filters */}
						<Card className="mb-6">
							<CardContent className="p-4">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex flex-1 gap-4">
										<div className="relative flex-1 max-w-md">
											<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
											<Input
												placeholder="搜索标题或摘要..."
												className="pl-10"
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
											/>
										</div>
										<select
											className="h-10 rounded-md border border-neutral-200 px-3 text-sm"
											value={statusFilter}
											onChange={(e) =>
												setStatusFilter(e.target.value as ArticleStatus | "all")
											}
										>
											<option value="all">全部状态</option>
											<option value="pending">待处理</option>
											<option value="processing">处理中</option>
											<option value="published">已发布</option>
											<option value="archived">已归档</option>
											<option value="rejected">已拒绝</option>
										</select>
									</div>
									{selectedIds.size > 0 && (
										<div className="flex items-center gap-2">
											<span className="text-sm text-neutral-500">
												已选 {selectedIds.size} 项
											</span>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													batchStatusMutation.mutate({
														ids: selectedIdList,
														status: "archived",
													})
												}
												disabled={
													batchStatusMutation.isPending ||
													batchDeleteMutation.isPending
												}
											>
												<Archive className="mr-1 h-3 w-3" />
												归档
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													batchStatusMutation.mutate({
														ids: selectedIdList,
														status: "published",
													})
												}
												disabled={
													batchStatusMutation.isPending ||
													batchDeleteMutation.isPending
												}
											>
												<CheckCircle className="mr-1 h-3 w-3" />
												发布
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="text-destructive"
												onClick={() => setDeleteConfirmOpen(true)}
												disabled={
													batchStatusMutation.isPending ||
													batchDeleteMutation.isPending
												}
											>
												<Trash2 className="mr-1 h-3 w-3" />
												删除
											</Button>
										</div>
									)}
								</div>
							</CardContent>
						</Card>

						{/* Data Table */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Database className="h-5 w-5 text-primary-500" />
									资讯数据
									<Badge variant="outline">{total} 条</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent>
								{isLoading ? (
									<div className="animate-pulse space-y-2">
										{Array.from({ length: 10 }, (_, idx) => `data-skel-${idx}`).map(
											(key) => (
												<div key={key} className="h-12 rounded bg-neutral-100" />
											),
										)}
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full">
											<thead>
												<tr className="border-b border-neutral-100">
													<th className="py-3 text-left">
														<input
															type="checkbox"
															checked={
																selectedIds.size === filteredArticles.length &&
																filteredArticles.length > 0
															}
															onChange={selectAll}
															className="rounded border-neutral-300"
														/>
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														标题
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														分类
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														状态
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														风险
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														发布时间
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														操作
													</th>
												</tr>
											</thead>
											<tbody>
												{filteredArticles.length === 0 ? (
													<tr>
														<td
															colSpan={7}
															className="py-12 text-center text-neutral-500"
														>
															暂无数据
														</td>
													</tr>
												) : (
													filteredArticles.map((article) => {
														const status = statusConfig[article.status];
														const riskScore = article.risk_score;
														const riskLevel = getArticleRiskLevel(riskScore);
														const riskText =
															riskScore == null ? "未评估" : `${riskScore}%`;
														let riskVariant:
															| "outline"
															| "success"
															| "warning"
															| "destructive" = "outline";
														if (riskLevel === "low") riskVariant = "success";
														else if (riskLevel === "medium") riskVariant = "warning";
														else if (riskLevel === "high" || riskLevel === "critical")
															riskVariant = "destructive";

														return (
															<tr
																key={article.id}
																className="border-b border-neutral-50 hover:bg-neutral-50"
															>
																<td className="py-3">
																	<input
																		type="checkbox"
																		checked={selectedIds.has(article.id)}
																		onChange={() => toggleSelect(article.id)}
																		className="rounded border-neutral-300"
																	/>
																</td>
																<td className="max-w-xs truncate px-3 py-3 text-sm font-medium">
																	{article.title}
																</td>
																<td className="px-3 py-3 text-sm text-neutral-500">
																	{getCategoryName(article.category_id)}
																</td>
																<td className="px-3 py-3">
																	<Badge variant={status.variant}>
																		{status.label}
																	</Badge>
																</td>
																<td className="px-3 py-3">
																	<Badge variant={riskVariant}>
																		{riskText}
																	</Badge>
																</td>
																<td className="px-3 py-3 text-sm text-neutral-500">
																	{formatDate(article.published_at)}
																</td>
																<td className="px-3 py-3">
																	<Button
																		variant="ghost"
																		size="icon"
																		aria-label="查看详情"
																		onClick={() => router.push(`/articles/${article.id}`)}
																	>
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</td>
															</tr>
														);
													})
												)}
											</tbody>
										</table>
									</div>
								)}

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
										<p className="text-sm text-neutral-500">
											显示 {page * PAGE_SIZE + 1} -{" "}
											{Math.min((page + 1) * PAGE_SIZE, total)} / {total} 条
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPage((p) => Math.max(0, p - 1))}
												disabled={page === 0}
											>
												<ChevronLeft className="h-4 w-4" />
												上一页
											</Button>
											<span className="text-sm text-neutral-500">
												{page + 1} / {totalPages}
											</span>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setPage((p) => Math.min(totalPages - 1, p + 1))
												}
												disabled={page >= totalPages - 1}
											>
												下一页
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</MainContent>
			</div>

			{/* 批量删除确认 */}
			<Modal
				isOpen={deleteConfirmOpen}
				onClose={() => setDeleteConfirmOpen(false)}
				size="sm"
			>
				<ModalHeader>
					<h2 className="text-lg font-semibold text-neutral-900">确认删除</h2>
				</ModalHeader>
				<ModalBody>
					<p className="text-sm text-neutral-600">
						将删除已选择的 <span className="font-semibold">{selectedIds.size}</span>{" "}
						条资讯。该操作不可撤销。
					</p>
				</ModalBody>
				<ModalFooter>
					<Button
						variant="outline"
						onClick={() => setDeleteConfirmOpen(false)}
						disabled={batchDeleteMutation.isPending}
					>
						取消
					</Button>
					<Button
						variant="destructive"
						onClick={async () => {
							try {
								await batchDeleteMutation.mutateAsync(selectedIdList);
								setDeleteConfirmOpen(false);
							} catch {
								// 错误已由 mutation 统一 toast
							}
						}}
						disabled={batchDeleteMutation.isPending || selectedIdList.length === 0}
					>
						确认删除
					</Button>
				</ModalFooter>
			</Modal>
		</ProtectedRoute>
	);
}
