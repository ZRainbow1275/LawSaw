"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	useAiAvailability,
	useAskQuestion,
	useSearch,
} from "@/hooks/use-search";
import { formatNumber, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
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
	if (!trimmed.includes("<") && !trimmed.includes("&")) {
		return trimmed.replace(/\s+/g, " ").trim();
	}

	const withoutScriptOrStyle = trimmed
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");

	const strippedTags = withoutScriptOrStyle.replace(/<[^>]+>/g, " ");

	try {
		const doc = new DOMParser().parseFromString(strippedTags, "text/html");
		const text = doc.body.textContent ?? strippedTags;
		return text.replace(/\s+/g, " ").trim();
	} catch {
		return strippedTags.replace(/\s+/g, " ").trim();
	}
}

function SearchContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const t = useT();
	const locale = useLocale();
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
		aiAvailabilityQuery.isLoading ||
		aiAvailabilityQuery.isError ||
		!aiAvailable;
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
		const trimmed = query.trim();
		const current = searchTerm.trim();
		if (trimmed === current) return;

		const id = window.setTimeout(() => {
			setSearchTerm(trimmed);
			setPage(1);

			if (!trimmed) {
				router.replace(withLocalePath(locale, "/search"));
				return;
			}

			const params = new URLSearchParams();
			params.set("q", trimmed);
			params.set("page", "1");
			router.replace(`${withLocalePath(locale, "/search")}?${params.toString()}`);
		}, 400);

		return () => window.clearTimeout(id);
	}, [query, router, searchTerm, locale]);

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
		router.replace(`${withLocalePath(locale, "/search")}?${params.toString()}`);
	}, [page, router, searchData, searchEnabled, trimmedSearchTerm, locale]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		const next = query.trim();
		setSearchTerm(next);
		setPage(1);

		if (!next) {
			router.push(withLocalePath(locale, "/search"));
			return;
		}

		const params = new URLSearchParams();
		params.set("q", next);
		params.set("page", "1");
		router.push(`${withLocalePath(locale, "/search")}?${params.toString()}`);
	};

	const handleAsk = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!question.trim()) return;
		askMutation.mutate(
			{ question, top_k: 5 },
			{
				onError: (err) => {
					const message =
						err instanceof Error ? err.message : t("Unknown error");
					toastError(t("AI Q&A failed"), message);
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
		router.push(`${withLocalePath(locale, "/search")}?${params.toString()}`);
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
				<h1 className="text-2xl font-bold text-neutral-900">{t("Search")}</h1>
				<p className="text-sm text-neutral-500">
					{t("Search legal updates or ask AI")}
				</p>
			</div>

			{/* Search Form */}
			<form onSubmit={handleSearch} className="mb-6">
				<div className="relative">
					<Search
						aria-hidden="true"
						className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
					/>
					<Input
						type="search"
						placeholder={t("Type keywords to search...")}
						className="h-12 pl-12 pr-24 text-lg"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<Button
						type="submit"
						className="absolute right-2 top-1/2 -translate-y-1/2"
						disabled={searching}
					>
						{t("Search")}
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
					<Search aria-hidden="true" className="mr-2 h-4 w-4" />
					{t("Keyword search")}
				</Button>
				<Button
					variant={showAI ? "default" : "outline"}
					size="sm"
					disabled={aiDisabled}
					onClick={() => setShowAI(true)}
				>
					<Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
					{t("AI Q&A")}
				</Button>
			</div>

			{aiAvailabilityQuery.isLoading ? (
				<p className="mb-6 text-xs text-neutral-500">
					{t("Checking AI service...")}
				</p>
			) : aiAvailabilityQuery.isError ? (
				<p className="mb-6 text-xs text-neutral-500">
					{t("AI service check failed: {message}.", {
						message: aiAvailabilityError ?? t("Unknown error"),
					})}{" "}
					{t("Please try again later or contact an administrator.")}
				</p>
			) : !aiAvailable ? (
				<p className="mb-6 text-xs text-neutral-500">
					{t(
						"AI service is disabled: configure the backend AI API key to enable Q&A.",
					)}
				</p>
			) : null}

			{showAI ? (
				/* AI Q&A Section */
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageCircle
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("AI Q&A")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleAsk} className="mb-6">
							<div className="flex gap-2">
								<Input
									placeholder={t("Type your legal question...")}
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									className="flex-1"
								/>
								<Button type="submit" disabled={askMutation.isPending}>
									<Send aria-hidden="true" className="h-4 w-4" />
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
										{t("Confidence: {value}%", {
											value: formatNumber(
												locale,
												askMutation.data.confidence * 100,
												{
													maximumFractionDigits: 0,
												},
											),
										})}
									</p>
								</div>

								{askMutation.data.sources.length > 0 && (
									<div>
										<h4 className="mb-2 text-sm font-medium text-neutral-700">
											{t("Sources:")}
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
							<Search aria-hidden="true" className="h-5 w-5 text-primary-500" />
							{t("Search results")}
							{searchEnabled && searchData && !searchIsError && (
								<Badge variant="outline">
									{t("{count} results", { count: searchData.total })}
								</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{!trimmedSearchTerm ? (
							<p className="py-12 text-center text-neutral-500">
								{t("Type keywords to start searching")}
							</p>
						) : trimmedSearchTerm.length < 3 ? (
							<p className="py-12 text-center text-neutral-500">
								{t("Please enter at least {count} characters", { count: 3 })}
							</p>
						) : searching ? (
							<div className="animate-pulse space-y-4">
								{Array.from(
									{ length: 5 },
									(_, idx) => `search-skel-${idx}`,
								).map((key) => (
									<div key={key} className="h-20 rounded-lg bg-neutral-100" />
								))}
							</div>
						) : searchIsError ? (
							<div className="py-12 text-center text-neutral-500">
								<p>
									{t("Search failed")}:{" "}
									{searchError instanceof Error
										? searchError.message
										: t("Unknown error")}
								</p>
								<Button
									variant="outline"
									size="sm"
									className="mt-4"
									onClick={() => refetchSearch()}
								>
									{t("Retry")}
								</Button>
							</div>
						) : !searchData || searchData.results.length === 0 ? (
							<p className="py-12 text-center text-neutral-500">
								{t("No results found")}
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
												href={withLocalePath(locale, `/articles/${result.article_id}`)}
												className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600 hover:underline"
											>
												{result.title}
											</Link>
											<p className="mt-1 line-clamp-2 text-xs text-neutral-500">
												{normalizeExcerpt(result.excerpt)}
											</p>
											<p className="mt-2 text-xs text-neutral-400">
												{t("Relevance: {value}%", {
													value: formatNumber(locale, result.score * 100, {
														maximumFractionDigits: 0,
													}),
												})}
											</p>
										</div>
										<Link
											href={`/articles/${result.article_id}`}
											aria-label={t("View details")}
											className={buttonVariants({
												variant: "ghost",
												size: "icon",
												className:
													"opacity-0 transition-opacity group-hover:opacity-100",
											})}
										>
											<ArrowUpRight aria-hidden="true" className="h-4 w-4" />
										</Link>
									</div>
								))}
								<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<p className="text-xs text-neutral-500">
										{t("Showing {from}-{to} / {total} (page {page}/{pages})", {
											from: resultFrom,
											to: resultTo,
											total: totalResults,
											page,
											pages: totalPages,
										})}
									</p>
									{totalPages > 1 ? (
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												disabled={!hasPrevPage || searching}
												onClick={() => goToPage(page - 1)}
											>
												{t("Previous")}
											</Button>
											<Button
												variant="outline"
												size="sm"
												disabled={!hasNextPage || searching}
												onClick={() => goToPage(page + 1)}
											>
												{t("Next")}
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
		<Suspense fallback={<SearchLoading />}>
			<SearchContent />
		</Suspense>
	);
}
