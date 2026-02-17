"use client";

import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	assertArticle,
	assertArticleAnalyticsSummary,
	assertArticleCategoryCounts,
	assertArticleListResponse,
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
			apiClient.get(
				"/api/v1/articles/category-counts",
				assertArticleCategoryCounts,
			),
		staleTime: 30000,
	});
}

export function useArticleAnalyticsSummary() {
	return useQuery({
		queryKey: ["articleAnalyticsSummary"],
		queryFn: () =>
			apiClient.get(
				"/api/v1/articles/analytics-summary",
				assertArticleAnalyticsSummary,
			),
		staleTime: 30000,
	});
}

export function usePublishArticle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { id: string; version: number }) =>
			apiClient.post(
				`/api/v1/articles/${input.id}/publish`,
				undefined,
				assertArticle,
				{
					headers: {
						"If-Match": ifMatchFromVersion(input.version),
					},
				},
			),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
	});
}

export function useArchiveArticle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { id: string; version: number }) =>
			apiClient.post(
				`/api/v1/articles/${input.id}/archive`,
				undefined,
				assertArticle,
				{
					headers: {
						"If-Match": ifMatchFromVersion(input.version),
					},
				},
			),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
	});
}

export function useDeleteArticle() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { id: string; version: number }) =>
			apiClient.delete(`/api/v1/articles/${input.id}`, assertDeleteResponse, {
				headers: {
					"If-Match": ifMatchFromVersion(input.version),
				},
			}),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["articles"] });
			queryClient.invalidateQueries({ queryKey: ["articleStats"] });
		},
	});
}
