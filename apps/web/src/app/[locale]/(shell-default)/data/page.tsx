"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { ApiClientError, apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	assertBatchStatusResponse,
	assertDeleteResponse,
	getArticleRiskLevel,
} from "@/lib/api/types";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
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
		labelKey: string;
		variant: "default" | "outline" | "success" | "warning" | "destructive";
	}
> = {
	pending: { labelKey: "Pending", variant: "outline" },
	processing: { labelKey: "Processing", variant: "warning" },
	published: { labelKey: "Published", variant: "success" },
	archived: { labelKey: "Archived", variant: "outline" },
	rejected: { labelKey: "Rejected", variant: "destructive" },
};

const PAGE_SIZE = 20;

export default function DataPage() {
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
	const [page, setPage] = useState(0);
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<ArticleStatus | "all">(
		"all",
	);
	const [selectedArticles, setSelectedArticles] = useState<Map<string, number>>(
		new Map(),
	);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();
	const { permissions } = useAuthStore();
	const canWriteArticles =
		permissions.includes("*") || permissions.includes("articles:write");
	const canPublishArticles =
		permissions.includes("*") || permissions.includes("articles:publish");

	const { data: articlesData, isLoading } = useArticles({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
	});

	const { data: categories } = useCategories();

	const articles = articlesData?.data ?? [];
	const total = articlesData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);

	const selectedIdList = Array.from(selectedArticles.keys());
	const selectedEntries = Array.from(selectedArticles.entries()).map(
		([id, version]) => ({ id, version }),
	);

	const batchStatusMutation = useMutation({
		mutationFn: (input: { ids: string[]; status: ArticleStatus }) =>
			apiClient.post(
				"/api/v1/articles/batch-status",
				input,
				assertBatchStatusResponse,
			),
		onSuccess: (data, variables) => {
			const statusLabelKey =
				variables.status === "published" ? "Published" : "Archived";
			toastSuccess(
				t(statusLabelKey),
				t("Updated {count} articles", { count: data.updated }),
			);
			setSelectedArticles(new Map());
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
		onError: (cause) => {
			const message =
				cause instanceof Error ? cause.message : t("Operation failed");
			toastError(t("Batch update failed"), message);
		},
	});

	const batchDeleteMutation = useMutation({
		mutationFn: async (items: Array<{ id: string; version: number }>) => {
			const results = await Promise.allSettled(
				items.map(({ id, version }) =>
					apiClient.delete(`/api/v1/articles/${id}`, assertDeleteResponse, {
						headers: {
							"If-Match": ifMatchFromVersion(version),
						},
					}),
				),
			);

			const deleted = results.filter((r) => r.status === "fulfilled").length;
			const failed = results.length - deleted;
			const conflicts = results.filter(
				(r) =>
					r.status === "rejected" &&
					r.reason instanceof ApiClientError &&
					r.reason.status === 409,
			).length;

			return { deleted, failed, conflicts };
		},
		onSuccess: ({ deleted, failed, conflicts }) => {
			if (deleted > 0) {
				toastSuccess(
					t("Delete completed"),
					t("Deleted {count} articles", { count: deleted }),
				);
			}
			if (failed > 0) {
				toastError(
					t("Partial delete failed"),
					t("Failed {count} (maybe missing permissions or not found)", {
						count: failed,
					}),
				);
			}
			if (conflicts > 0) {
				toastError(
					t("Concurrency conflict detected"),
					t("{count} articles were updated. Please refresh and retry.", {
						count: conflicts,
					}),
				);
			}

			setSelectedArticles(new Map());
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
		onError: (cause) => {
			const message =
				cause instanceof Error ? cause.message : t("Operation failed");
			toastError(t("Batch delete failed"), message);
		},
	});

	// Filter articles
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
		if (!categoryId || !categories) return t("Uncategorized");
		const cat = categories.find((c) => c.id === categoryId);
		return cat ? `${cat.icon} ${cat.name}` : t("Uncategorized");
	};

	const toggleSelect = (id: string, version: number) => {
		setSelectedArticles((prev) => {
			const next = new Map(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.set(id, version);
			}
			return next;
		});
	};

	const selectAll = () => {
		if (selectedArticles.size === filteredArticles.length) {
			setSelectedArticles(new Map());
		} else {
			setSelectedArticles(
				new Map(filteredArticles.map((a) => [a.id, a.version])),
			);
		}
	};

	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return "-";
		return formatDateTime(locale, dateStr, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<>
			<div className="p-6">
				{/* Page Title */}
						<div className="mb-6">
							<h1 className="text-2xl font-bold text-neutral-900">
								{t("Data")}
							</h1>
							<p className="text-sm text-neutral-500">
								{t("Manage all ingested articles data")}
							</p>
						</div>

						{/* Filters */}
						<Card className="mb-6">
							<CardContent className="p-4">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex flex-1 gap-4">
										<div className="relative flex-1 max-w-md">
											<Search
												aria-hidden="true"
												className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
											/>
											<Input
												placeholder={t("Search title or summary...")}
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
											<option value="all">{t("All statuses")}</option>
											<option value="pending">{t("Pending")}</option>
											<option value="processing">{t("Processing")}</option>
											<option value="published">{t("Published")}</option>
											<option value="archived">{t("Archived")}</option>
											<option value="rejected">{t("Rejected")}</option>
										</select>
									</div>
									{selectedArticles.size > 0 && (
										<div className="flex items-center gap-2">
											<span className="text-sm text-neutral-500">
												{t("{count} selected", {
													count: selectedArticles.size,
												})}
											</span>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													if (!canPublishArticles) {
														toastError(
															t("Insufficient permissions"),
															t("Article publish permission required"),
														);
														return;
													}
													batchStatusMutation.mutate({
														ids: selectedIdList,
														status: "archived",
													});
												}}
												disabled={
													!canPublishArticles ||
													batchStatusMutation.isPending ||
													batchDeleteMutation.isPending
												}
												title={
													!canPublishArticles
														? t("Article publish permission required")
														: undefined
												}
											>
												<Archive aria-hidden="true" className="mr-1 h-3 w-3" />
												{t("Archive")}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													if (!canPublishArticles) {
														toastError(
															t("Insufficient permissions"),
															t("Article publish permission required"),
														);
														return;
													}
													batchStatusMutation.mutate({
														ids: selectedIdList,
														status: "published",
													});
												}}
												disabled={
													!canPublishArticles ||
													batchStatusMutation.isPending ||
													batchDeleteMutation.isPending
												}
												title={
													!canPublishArticles
														? t("Article publish permission required")
														: undefined
												}
											>
												<CheckCircle
													aria-hidden="true"
													className="mr-1 h-3 w-3"
												/>
												{t("Publish")}
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="text-destructive"
												onClick={() => {
													if (!canWriteArticles) {
														toastError(
															t("Insufficient permissions"),
															t("Article write permission required"),
														);
														return;
													}
													setDeleteConfirmOpen(true);
												}}
												disabled={
													!canWriteArticles ||
													batchStatusMutation.isPending ||
													batchDeleteMutation.isPending
												}
												title={
													!canWriteArticles
														? t("Article write permission required")
														: undefined
												}
											>
												<Trash2 aria-hidden="true" className="mr-1 h-3 w-3" />
												{t("Delete")}
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
									<Database
										aria-hidden="true"
										className="h-5 w-5 text-primary-500"
									/>
									{t("Articles data")}
									<Badge variant="outline">
										{t("{count} items", { count: total })}
									</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent>
								{isLoading ? (
									<div className="animate-pulse space-y-2">
										{Array.from(
											{ length: 10 },
											(_, idx) => `data-skel-${idx}`,
										).map((key) => (
											<div key={key} className="h-12 rounded bg-neutral-100" />
										))}
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
																selectedArticles.size ===
																	filteredArticles.length &&
																filteredArticles.length > 0
															}
															onChange={selectAll}
															className="rounded border-neutral-300"
														/>
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														{t("Title")}
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														{t("Category")}
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														{t("Status")}
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														{t("Risk")}
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														{t("Published at")}
													</th>
													<th className="px-3 py-3 text-left text-sm font-medium text-neutral-500">
														{t("Actions")}
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
															{t("No data")}
														</td>
													</tr>
												) : (
													filteredArticles.map((article) => {
														const status = statusConfig[article.status];
														const riskScore = article.risk_score;
														const riskLevel = getArticleRiskLevel(riskScore);
														const riskText =
															riskScore == null
																? t("Not assessed")
																: `${riskScore}%`;
														let riskVariant:
															| "outline"
															| "success"
															| "warning"
															| "destructive" = "outline";
														if (riskLevel === "low") riskVariant = "success";
														else if (riskLevel === "medium")
															riskVariant = "warning";
														else if (
															riskLevel === "high" ||
															riskLevel === "critical"
														)
															riskVariant = "destructive";

														return (
															<tr
																key={article.id}
																className="border-b border-neutral-50 hover:bg-neutral-50"
															>
																<td className="py-3">
																	<input
																		type="checkbox"
																		checked={selectedArticles.has(article.id)}
																		onChange={() =>
																			toggleSelect(article.id, article.version)
																		}
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
																		{t(status.labelKey)}
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
																		aria-label={t("View details")}
																		onClick={() =>
																			router.push(withLocalePath(locale, `/articles/${article.id}`))
																		}
																	>
																		<MoreHorizontal
																			aria-hidden="true"
																			className="h-4 w-4"
																		/>
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
											{t("Showing {from} - {to} of {total}", {
												from: page * PAGE_SIZE + 1,
												to: Math.min((page + 1) * PAGE_SIZE, total),
												total,
											})}
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPage((p) => Math.max(0, p - 1))}
												disabled={page === 0}
											>
												<ChevronLeft aria-hidden="true" className="h-4 w-4" />
												{t("Previous")}
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
												{t("Next")}
												<ChevronRight aria-hidden="true" className="h-4 w-4" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
				</div>

			{/* Batch delete confirmation */}
			<Modal
				isOpen={deleteConfirmOpen}
				onClose={() => setDeleteConfirmOpen(false)}
				size="sm"
			>
				<ModalHeader>
					<h2 className="text-lg font-semibold text-neutral-900">
						{t("Confirm delete")}
					</h2>
				</ModalHeader>
				<ModalBody>
					<p className="text-sm text-neutral-600">
						{t(
							"You are about to delete {count} articles. This action cannot be undone.",
							{ count: selectedArticles.size },
						)}
					</p>
				</ModalBody>
				<ModalFooter>
					<Button
						variant="outline"
						onClick={() => setDeleteConfirmOpen(false)}
						disabled={batchDeleteMutation.isPending}
					>
						{t("Cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={async () => {
							if (!canWriteArticles) {
								toastError(
									t("Insufficient permissions"),
									t("Article write permission required"),
								);
								return;
							}
							try {
								await batchDeleteMutation.mutateAsync(selectedEntries);
								setDeleteConfirmOpen(false);
							} catch {
								// Errors are already handled by mutations with toasts
							}
						}}
						disabled={
							batchDeleteMutation.isPending || selectedIdList.length === 0
						}
					>
						{t("Confirm delete")}
					</Button>
				</ModalFooter>
			</Modal>
		</>
	);
}
