"use client";

import { apiClient } from "@/lib/api";
import {
	assertAskResponse,
	assertSearchResponse,
	assertSemanticSearchResponse,
} from "@/lib/api/types";
import { useMutation, useQuery } from "@tanstack/react-query";

export function useSearch(query: string, limit = 10) {
	return useQuery({
		queryKey: ["search", query, limit],
		queryFn: () =>
			apiClient.get(
				`/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`,
				assertSearchResponse,
			),
		enabled: query.length > 2,
	});
}

export function useSemanticSearch() {
	return useMutation({
		mutationFn: (data: { query: string; limit?: number }) =>
			apiClient.post("/api/v1/search/semantic", data, assertSemanticSearchResponse),
	});
}

export function useAskQuestion() {
	return useMutation({
		mutationFn: (data: { question: string; top_k?: number }) =>
			apiClient.post("/api/v1/search/ask", data, assertAskResponse),
	});
}
