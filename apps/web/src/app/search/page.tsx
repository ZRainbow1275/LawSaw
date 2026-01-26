"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAiAvailability, useAskQuestion, useSearch } from "@/hooks/use-search";
import { useToast } from "@/stores/toast-store";
import {
	ArrowUpRight,
	MessageCircle,
	Search,
	Send,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const PAGE_SIZE = 10;

function normalizeExcerpt(excerpt: string): string {
	const trimmed = excerpt.trim();
	if (!trimmed) return "";
	if (!trimmed.includes("<")) return trimmed;

	try {
		const doc = new DOMParser().parseFromString(trimmed, "text/html");
		const text = doc.body.textContent ?? "";
		return text.replace(/\s+/g, " ").trim();
	} catch {
		return trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	}
}

function SearchContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const initialQuery = searchParams.get("q") || "";
	const initialPageParam = searchParams.get("page");
	const initialPageParsed = initialPageParam
		? Number.parseInt(initialPageParam, 10)
		: 1;
	const initialPage =
		Number.isFinite(initialPageParsed) && initialPageParsed > 0
			? initialPageParsed
			: 1;

	const [query, setQuery] = useState(initialQuery);
	const [searchTerm, setSearchTerm] = useState(initialQuery);
	const [page, setPage] = useState(initialPage);
	const [question, setQuestion] = useState("");
	const [showAI, setShowAI] = useState(false);

	const { error: toastError } = useToast();
	const aiAvailabilityQuery = useAiAvailability();
	const aiAvailable = aiAvailabilityQuery.data?.available ?? false;
	const aiDisabled =
		aiAvailabilityQuery.isLoading || aiAvailabilityQuery.isError || !aiAvailable;
	const aiAvailabilityError =
		aiAvailabilityQuery.error instanceof Error
			? aiAvailabilityQuery.error.message
			: null;

	const trimmedSearchTerm = searchTerm.trim();
	const searchEnabled = trimmedSearchTerm.length > 2;
	const offset = (page - 1) * PAGE_SIZE;

	const {
		data: searchData,
		isLoading: searchLoading,
		isFetching: searchFetching,
		isError: searchIsError,
		error: searchError,
		refetch: refetchSearch,
	} = useSearch(searchTerm, PAGE_SIZE, offset);
	const searching = searchLoading || searchFetching;
	const askMutation = useAskQuestion();

	useEffect(() => {
		const q = searchParams.get("q") || "";
		const pageParam = searchParams.get("page");
		const parsed = pageParam ? Number.parseInt(pageParam, 10) : 1;
		const nextPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

		setQuery(q);
		setSearchTerm(q);
		setPage(nextPage);
	}, [searchParams]);

	useEffect(() => {
		if (!aiAvailabilityQuery.isLoading && !aiAvailable && showAI) {
			setShowAI(false);
		}
	}, [aiAvailabilityQuery.isLoading, aiAvailable, showAI]);

	useEffect(() => {
		if (!searchEnabled || !searchData) return;

		const totalPages = Math.max(1, Math.ceil(searchData.total / PAGE_SIZE));
		if (page <= totalPages) return;

		const correctedPage = totalPages;
		setPage(correctedPage);

		const params = new URLSearchParams();
		if (trimmedSearchTerm) params.set("q", trimmedSearchTerm);
		params.set("page", correctedPage.toString());
		router.replace(`/search?${params.toString()}`);
	}, [page, router, searchData, searchEnabled, trimmedSearchTerm]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		const next = query.trim();
		setSearchTerm(next);
		setPage(1);

		if (!next) {
			router.push("/search");
			return;
		}

		const params = new URLSearchParams();
		params.set("q", next);
		params.set("page", "1");
		router.push(`/search?${params.toString()}`);
	};

	const handleAsk = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!question.trim()) return;
		askMutation.mutate(
			{ question, top_k: 5 },
			{
				onError: (err) => {
					const message = err instanceof Error ? err.message : "未知错误";
					toastError("AI 问答失败", message);
				},
			},
		);
	};

	const goToPage = (nextPage: number) => {
		if (!searchEnabled) return;

		const safePage = Math.max(1, nextPage);
		setPage(safePage);

		const params = new URLSearchParams();
		if (trimmedSearchTerm) params.set("q", trimmedSearchTerm);
		params.set("page", safePage.toString());
		router.push(`/search?${params.toString()}`);
	};

	const totalResults = searchData?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
	const hasPrevPage = page > 1;
	const hasNextPage = page < totalPages;
	const resultFrom = totalResults === 0 ? 0 : offset + 1;
	const resultTo = offset + (searchData?.results.length ?? 0);

	return (
		<div className="p-6">
			{/* Page Title */}
			<div className="mb-6">
				<h1 className="text-2xl font-bold text-neutral-900">搜索</h1>
				<p className="text-sm text-neutral-500">搜索法律资讯或向 AI 提问</p>
			</div>

			{/* Search Form */}
			<form onSubmit={handleSearch} className="mb-6">
				<div className="relative">
					<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
					<Input
						type="search"
						placeholder="输入关键词搜索..."
						className="h-12 pl-12 pr-24 text-lg"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<Button
						type="submit"
						className="absolute right-2 top-1/2 -translate-y-1/2"
						disabled={searching}
					>
						搜索
					</Button>
				</div>
			</form>

			{/* Toggle AI Mode */}
			<div className="mb-6 flex items-center gap-4">
				<Button
					variant={showAI ? "outline" : "default"}
					size="sm"
					onClick={() => setShowAI(false)}
				>
					<Search className="mr-2 h-4 w-4" />
					关键词搜索
				</Button>
				<Button
					variant={showAI ? "default" : "outline"}
					size="sm"
					disabled={aiDisabled}
					onClick={() => setShowAI(true)}
				>
					<Sparkles className="mr-2 h-4 w-4" />
					AI 问答
				</Button>
			</div>

			{aiAvailabilityQuery.isLoading ? (
				<p className="mb-6 text-xs text-neutral-500">AI 服务检测中...</p>
			) : aiAvailabilityQuery.isError ? (
				<p className="mb-6 text-xs text-neutral-500">
					AI 服务检测失败：{aiAvailabilityError ?? "未知错误"}。请稍后重试或联系管理员。
				</p>
			) : !aiAvailable ? (
				<p className="mb-6 text-xs text-neutral-500">
					AI 服务未启用：当前环境未配置 AI 服务，AI 问答已禁用。如需启用，请联系管理员配置后端 AI API Key。
				</p>
			) : null}

			{showAI ? (
				/* AI Q&A Section */
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageCircle className="h-5 w-5 text-primary-500" />
							AI 智能问答
						</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleAsk} className="mb-6">
							<div className="flex gap-2">
								<Input
									placeholder="输入您的法律问题..."
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									className="flex-1"
								/>
								<Button type="submit" disabled={askMutation.isPending}>
									<Send className="h-4 w-4" />
								</Button>
							</div>
						</form>

						{askMutation.isPending && (
							<div className="flex items-center justify-center py-8">
								<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
							</div>
						)}

						{askMutation.data && (
							<div className="space-y-4">
								<div className="rounded-lg bg-primary-50 p-4">
									<p className="font-medium text-neutral-900">
										{askMutation.data.answer}
									</p>
									<p className="mt-2 text-xs text-neutral-500">
										置信度: {(askMutation.data.confidence * 100).toFixed(0)}%
									</p>
								</div>

								{askMutation.data.sources.length > 0 && (
									<div>
										<h4 className="mb-2 text-sm font-medium text-neutral-700">
											参考来源:
										</h4>
										<div className="space-y-2">
											{askMutation.data.sources.map((source) => (
												<div
													key={source.article_id}
													className="rounded border border-neutral-100 p-3"
												>
													<p className="text-sm font-medium">{source.title}</p>
													<p className="mt-1 text-xs text-neutral-500">
														{normalizeExcerpt(source.excerpt)}
													</p>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			) : (
				/* Search Results */
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Search className="h-5 w-5 text-primary-500" />
							搜索结果
							{searchEnabled && searchData && !searchIsError && (
								<Badge variant="outline">{searchData.total} 条结果</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{!trimmedSearchTerm ? (
							<p className="py-12 text-center text-neutral-500">
								输入关键词开始搜索
							</p>
						) : trimmedSearchTerm.length < 3 ? (
							<p className="py-12 text-center text-neutral-500">
								请输入至少 3 个字符后再搜索
							</p>
						) : searching ? (
							<div className="animate-pulse space-y-4">
								{Array.from({ length: 5 }, (_, idx) => `search-skel-${idx}`).map(
									(key) => (
										<div key={key} className="h-20 rounded-lg bg-neutral-100" />
									),
								)}
							</div>
						) : searchIsError ? (
							<div className="py-12 text-center text-neutral-500">
								<p>
									搜索失败：
									{searchError instanceof Error ? searchError.message : "未知错误"}
								</p>
								<Button
									variant="outline"
									size="sm"
									className="mt-4"
									onClick={() => refetchSearch()}
								>
									重试
								</Button>
							</div>
						) : !searchData || searchData.results.length === 0 ? (
							<p className="py-12 text-center text-neutral-500">未找到相关结果</p>
						) : (
							<div className="space-y-4">
								{searchData.results.map((result) => (
									<div
										key={result.article_id}
										className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
									>
										<div className="flex-1">
											<Link
												href={`/articles/${result.article_id}`}
												className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600 hover:underline"
											>
												{result.title}
											</Link>
											<p className="mt-1 line-clamp-2 text-xs text-neutral-500">
												{normalizeExcerpt(result.excerpt)}
											</p>
											<p className="mt-2 text-xs text-neutral-400">
												相关度: {(result.score * 100).toFixed(0)}%
											</p>
										</div>
										<Link
											href={`/articles/${result.article_id}`}
											aria-label="查看详情"
											className={buttonVariants({
												variant: "ghost",
												size: "icon",
												className:
													"opacity-0 transition-opacity group-hover:opacity-100",
											})}
										>
											<ArrowUpRight className="h-4 w-4" />
										</Link>
									</div>
								))}
								<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-xs text-neutral-500">
										显示 {resultFrom}-{resultTo} / {totalResults}（第 {page}/
										{totalPages} 页）
									</p>
									{totalPages > 1 ? (
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												disabled={!hasPrevPage || searching}
												onClick={() => goToPage(page - 1)}
											>
												上一页
											</Button>
											<Button
												variant="outline"
												size="sm"
												disabled={!hasNextPage || searching}
												onClick={() => goToPage(page + 1)}
											>
												下一页
											</Button>
										</div>
									) : null}
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function SearchLoading() {
	return (
		<div className="p-6">
			<div className="mb-6">
				<div className="h-8 w-24 animate-pulse rounded bg-neutral-200" />
				<div className="mt-2 h-4 w-48 animate-pulse rounded bg-neutral-100" />
			</div>
			<div className="h-12 animate-pulse rounded-lg bg-neutral-100" />
		</div>
	);
}

export default function SearchPage() {
	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<Suspense fallback={<SearchLoading />}>
						<SearchContent />
					</Suspense>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
