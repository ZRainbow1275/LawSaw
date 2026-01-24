"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Article, ArticleListResponse, ArticleStats } from "@/lib/api/types";

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
      apiClient.get<ArticleListResponse>(
        "/api/v1/articles?" + queryParams.toString()
      ),
  });
}

export function useArticle(id: string) {
  return useQuery({
    queryKey: ["article", id],
    queryFn: () => apiClient.get<Article>("/api/v1/articles/" + id),
    enabled: !!id,
  });
}

export function useArticleStats() {
  return useQuery({
    queryKey: ["articleStats"],
    queryFn: () => apiClient.get<ArticleStats>("/api/v1/articles/stats"),
    staleTime: 30000,
  });
}

export function usePublishArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Article>("/api/v1/articles/" + id + "/publish"),
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
      apiClient.post<Article>("/api/v1/articles/" + id + "/archive"),
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
      apiClient.delete<void>("/api/v1/articles/" + id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      queryClient.invalidateQueries({ queryKey: ["articleStats"] });
    },
  });
}
