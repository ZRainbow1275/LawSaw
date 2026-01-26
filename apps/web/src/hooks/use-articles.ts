"use client";

import { apiClient } from "@/lib/api";
import {
	assertArticle,
	assertArticleListResponse,
	assertArticleCategoryCounts,
	assertArticleStats,
	assertArticleTrends,
	assertDeleteResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface ArticleFilters {
	limit?: number;
	offset?: number;
	category_id?: string;
	status?: string;
}

export function useArticles(filters: ArticleFilters = {}) {
	const { limit = 20, offset = 0, category_id, status } = filters;

	const queryParams = new URLSearchParams();
	queryParams.set("limit", limit.toString());
	queryParams.set("offset", offset.toString());
	if (category_id) queryParams.set("category_id", category_id);
	if (status) queryParams.set("status", status);

	return useQuery({
		queryKey: ["articles", filters],
		queryFn: () =>
			apiClient.get(
				`/api/v1/articles?${queryParams.toString()}`,
				assertArticleListResponse,
			),
	});
}

export function useArticle(id: string) {
	return useQuery({
		queryKey: ["article", id],
		queryFn: () => apiClient.get(`/api/v1/articles/${id}`, assertArticle),
		enabled: !!id,
	});
}

export function useArticleStats() {
	return useQuery({
		queryKey: ["articleStats"],
		queryFn: () => apiClient.get("/api/v1/articles/stats", assertArticleStats),
		staleTime: 30000,
	});
}

export function useArticleTrends(days = 7) {
	const queryParams = new URLSearchParams();
	queryParams.set("days", days.toString());

	return useQuery({
		queryKey: ["articleTrends", days],
		queryFn: () =>
			apiClient.get(
				`/api/v1/articles/trends?${queryParams.toString()}`,
				assertArticleTrends,
			),
		staleTime: 30000,
	});
}

export function useArticleCategoryCounts() {
	return useQuery({
		queryKey: ["articleCategoryCounts"],
		queryFn: () =>
			apiClient.get("/api/v1/articles/category-counts", assertArticleCategoryCounts),
		staleTime: 30000,
	});
}

export function usePublishArticle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.post(`/api/v1/articles/${id}/publish`, undefined, assertArticle),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
	});
}

export function useArchiveArticle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.post(`/api/v1/articles/${id}/archive`, undefined, assertArticle),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
	});
}

export function useDeleteArticle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(`/api/v1/articles/${id}`, assertDeleteResponse),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
	});
}
