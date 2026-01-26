"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAskQuestion, useSearch } from "@/hooks/use-search";
import {
	ArrowUpRight,
	MessageCircle,
	Search,
	Send,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SearchContent() {
	const searchParams = useSearchParams();
	const initialQuery = searchParams.get("q") || "";

	const [query, setQuery] = useState(initialQuery);
	const [searchTerm, setSearchTerm] = useState(initialQuery);
	const [question, setQuestion] = useState("");
	const [showAI, setShowAI] = useState(false);

	const { data: searchData, isLoading: searching } = useSearch(searchTerm);
	const askMutation = useAskQuestion();

	useEffect(() => {
		const q = searchParams.get("q");
		if (q) {
			setQuery(q);
			setSearchTerm(q);
		}
	}, [searchParams]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		setSearchTerm(query);
	};

	const handleAsk = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!question.trim()) return;
		askMutation.mutate({ question, top_k: 5 });
	};

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
					onClick={() => setShowAI(true)}
				>
					<Sparkles className="mr-2 h-4 w-4" />
					AI 问答
				</Button>
			</div>

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
														{source.excerpt}
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
							{searchData && (
								<Badge variant="outline">{searchData.total} 条结果</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{searching ? (
							<div className="animate-pulse space-y-4">
								{Array.from({ length: 5 }, (_, idx) => `search-skel-${idx}`).map(
									(key) => (
										<div key={key} className="h-20 rounded-lg bg-neutral-100" />
									),
								)}
							</div>
						) : !searchData || searchData.results.length === 0 ? (
							<p className="py-12 text-center text-neutral-500">
								{searchTerm ? "未找到相关结果" : "输入关键词开始搜索"}
							</p>
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
												{result.excerpt}
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
