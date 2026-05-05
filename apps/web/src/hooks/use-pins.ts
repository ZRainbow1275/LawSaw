"use client";

import { apiClient } from "@/lib/api";
import type { Article } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ArticlePinRecord {
	id: string;
	article_id: string;
	priority: number;
	starts_at: string | null;
	ends_at: string | null;
	created_at: string;
	article: Article;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertArticlePin(
	value: unknown,
	path = "articlePin",
): asserts value is ArticlePinRecord {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.article_id !== "string" ||
		!isRecord(value.article)
	) {
		throw new Error(`${path} is invalid`);
	}
}

function assertArticlePinList(
	value: unknown,
	path = "articlePins",
): asserts value is ArticlePinRecord[] {
	if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
	for (const [index, item] of value.entries())
		assertArticlePin(item, `${path}[${index}]`);
}

export function usePinnedArticles(limit = 6) {
	return useQuery({
		queryKey: ["articlePins", "public", limit],
		queryFn: () =>
			apiClient.get<ArticlePinRecord[]>(
				`/api/v1/article-pins?limit=${limit}`,
				assertArticlePinList,
			),
		staleTime: 15_000,
	});
}

export function useAdminArticlePins(enabled = true) {
	return useQuery({
		queryKey: ["articlePins", "admin"],
		queryFn: () =>
			apiClient.get<ArticlePinRecord[]>(
				"/api/v1/admin/article-pins",
				assertArticlePinList,
			),
		enabled,
		staleTime: 5_000,
	});
}

export function useCreateArticlePin() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			article_id: string;
			priority?: number;
			starts_at?: string | null;
			ends_at?: string | null;
			metadata?: Record<string, unknown>;
		}) =>
			apiClient.post<ArticlePinRecord>(
				"/api/v1/admin/article-pins",
				input,
				assertArticlePin,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["articlePins"] });
		},
	});
}

export function useUpdateArticlePin() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			...input
		}: {
			id: string;
			priority?: number;
			starts_at?: string | null;
			ends_at?: string | null;
			metadata?: Record<string, unknown>;
		}) =>
			apiClient.patch<ArticlePinRecord>(
				`/api/v1/admin/article-pins/${id}`,
				input,
				assertArticlePin,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["articlePins"] });
		},
	});
}

export function useDeleteArticlePin() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(
				`/api/v1/admin/article-pins/${id}`,
				(value): asserts value is { success: boolean; id: string } => {
					if (
						!isRecord(value) ||
						typeof value.success !== "boolean" ||
						typeof value.id !== "string"
					) {
						throw new Error("articlePinDeleteResponse is invalid");
					}
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["articlePins"] });
		},
	});
}
