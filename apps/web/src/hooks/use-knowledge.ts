"use client";

import { apiClient } from "@/lib/api";
import {
	assertKnowledgeBackfillResponse,
	assertKnowledgeEntity,
	assertKnowledgeEntityArticleList,
	assertKnowledgeEntityList,
	assertKnowledgeRelatedEntityList,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useKnowledgeTopEntities(limit = 50) {
	return useQuery({
		queryKey: ["knowledge", "entities", "top", limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/top?limit=${limit}`,
				assertKnowledgeEntityList,
			),
	});
}

export function useKnowledgeSearchEntities(query: string, limit = 20) {
	const term = query.trim();
	return useQuery({
		queryKey: ["knowledge", "entities", "search", term, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/search?q=${encodeURIComponent(term)}&limit=${limit}`,
				assertKnowledgeEntityList,
			),
		enabled: term.length > 0,
	});
}

export function useKnowledgeEntity(id: string | null | undefined) {
	return useQuery({
		queryKey: ["knowledge", "entities", "detail", id],
		queryFn: () => apiClient.get(`/api/v1/knowledge/entities/${id}`, assertKnowledgeEntity),
		enabled: !!id,
	});
}

export function useKnowledgeRelatedEntities(id: string | null | undefined, limit = 20) {
	return useQuery({
		queryKey: ["knowledge", "entities", "related", id, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/${id}/related?limit=${limit}`,
				assertKnowledgeRelatedEntityList,
			),
		enabled: !!id,
	});
}

export function useKnowledgeEntityArticles(id: string | null | undefined, limit = 10) {
	return useQuery({
		queryKey: ["knowledge", "entities", "articles", id, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/${id}/articles?limit=${limit}`,
				assertKnowledgeEntityArticleList,
			),
		enabled: !!id,
	});
}

export function useKnowledgeBackfill() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { limit: number }) =>
			apiClient.post("/api/v1/knowledge/backfill", input, assertKnowledgeBackfillResponse),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
		},
	});
}
