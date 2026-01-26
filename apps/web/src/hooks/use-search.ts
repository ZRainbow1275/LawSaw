"use client";

import { apiClient } from "@/lib/api";
import {
	assertAiAvailabilityResponse,
	assertAskResponse,
	assertSearchResponse,
	assertSemanticSearchResponse,
} from "@/lib/api/types";
import { useMutation, useQuery } from "@tanstack/react-query";

export function useAiAvailability() {
	return useQuery({
		queryKey: ["ai", "available"],
		queryFn: () => apiClient.get("/api/v1/ai/available", assertAiAvailabilityResponse),
		staleTime: 30_000,
	});
}

export function useSearch(query: string, limit = 10, offset = 0) {
	const trimmed = query.trim();

	return useQuery({
		queryKey: ["search", trimmed, limit, offset],
		queryFn: () =>
			apiClient.get(
				`/api/v1/search?q=${encodeURIComponent(trimmed)}&limit=${limit}&offset=${offset}`,
				assertSearchResponse,
			),
		enabled: trimmed.length > 2,
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
