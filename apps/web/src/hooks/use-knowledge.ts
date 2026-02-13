"use client";

import { apiClient } from "@/lib/api";
import {
	assertKnowledgeBackfillResponse,
	assertKnowledgeCooccurrenceEdgeList,
	assertKnowledgeDegreeCentralityList,
	assertKnowledgeDuplicateCandidateList,
	assertKnowledgeEntity,
	assertKnowledgeEntityArticleList,
	assertKnowledgeEntityList,
	assertKnowledgeGraphStats,
	assertKnowledgeLlmBackfillResponse,
	assertKnowledgeMergeEntitiesResponse,
	assertKnowledgeRelatedEntityList,
	assertKnowledgeSemanticSearchResultList,
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
		queryFn: () =>
			apiClient.get(`/api/v1/knowledge/entities/${id}`, assertKnowledgeEntity),
		enabled: !!id,
	});
}

export function useKnowledgeRelatedEntities(
	id: string | null | undefined,
	limit = 20,
) {
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

export function useKnowledgeEntityArticles(
	id: string | null | undefined,
	limit = 10,
) {
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
			apiClient.post(
				"/api/v1/knowledge/backfill",
				input,
				assertKnowledgeBackfillResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
		},
	});
}

export function useKnowledgeLlmBackfill() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { limit: number }) =>
			apiClient.post(
				"/api/v1/knowledge/backfill-llm",
				input,
				assertKnowledgeLlmBackfillResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
		},
	});
}

export function useKnowledgeSemanticSearch(query: string, limit = 20) {
	const term = query.trim();
	return useQuery({
		queryKey: ["knowledge", "entities", "semantic-search", term, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/semantic-search?q=${encodeURIComponent(term)}&limit=${limit}`,
				assertKnowledgeSemanticSearchResultList,
			),
		enabled: term.length > 0,
	});
}

export function useKnowledgeHybridSearch(query: string, limit = 20) {
	const term = query.trim();
	return useQuery({
		queryKey: ["knowledge", "entities", "hybrid-search", term, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/hybrid-search?q=${encodeURIComponent(term)}&limit=${limit}`,
				assertKnowledgeEntityList,
			),
		enabled: term.length > 0,
	});
}

export function useKnowledgeEntitiesByType(
	entityType: string | null | undefined,
	limit = 50,
) {
	return useQuery({
		queryKey: ["knowledge", "entities", "by-type", entityType, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/by-type?entity_type=${encodeURIComponent(entityType ?? "")}&limit=${limit}`,
				assertKnowledgeEntityList,
			),
		enabled: !!entityType,
	});
}

export function useKnowledgeDuplicateCandidates(threshold = 0.85, limit = 20) {
	return useQuery({
		queryKey: ["knowledge", "entities", "duplicates", threshold, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/entities/duplicates?similarity_threshold=${threshold}&limit=${limit}`,
				assertKnowledgeDuplicateCandidateList,
			),
	});
}

export function useKnowledgeMergeEntities() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { target_id: string; source_id: string }) =>
			apiClient.post(
				"/api/v1/knowledge/entities/merge",
				input,
				assertKnowledgeMergeEntitiesResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
		},
	});
}

export function useKnowledgeDegreeCentrality(limit = 50) {
	return useQuery({
		queryKey: ["knowledge", "analytics", "centrality", limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/analytics/centrality?limit=${limit}`,
				assertKnowledgeDegreeCentralityList,
			),
	});
}

export function useKnowledgeCooccurrenceNetwork(
	minCooccurrence = 2,
	limit = 50,
) {
	return useQuery({
		queryKey: [
			"knowledge",
			"analytics",
			"cooccurrence",
			minCooccurrence,
			limit,
		],
		queryFn: () =>
			apiClient.get(
				`/api/v1/knowledge/analytics/cooccurrence?min_cooccurrence=${minCooccurrence}&limit=${limit}`,
				assertKnowledgeCooccurrenceEdgeList,
			),
	});
}

export function useKnowledgeGraphStats() {
	return useQuery({
		queryKey: ["knowledge", "stats"],
		queryFn: () =>
			apiClient.get("/api/v1/knowledge/stats", assertKnowledgeGraphStats),
	});
}
