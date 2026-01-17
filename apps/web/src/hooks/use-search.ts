"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { SearchResponse, AskResponse } from "@/lib/api/types";

export function useSearch(query: string, limit = 10) {
  return useQuery({
    queryKey: ["search", query, limit],
    queryFn: () =>
      apiClient.get<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`
      ),
    enabled: query.length > 2,
  });
}

export function useSemanticSearch() {
  return useMutation({
    mutationFn: (data: { query: string; limit?: number }) =>
      apiClient.post<SearchResponse>("/api/v1/search/semantic", data),
  });
}

export function useAskQuestion() {
  return useMutation({
    mutationFn: (data: { question: string; top_k?: number }) =>
      apiClient.post<AskResponse>("/api/v1/search/ask", data),
  });
}
