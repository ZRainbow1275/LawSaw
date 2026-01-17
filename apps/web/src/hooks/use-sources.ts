"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Source } from "@/lib/api/types";

interface CreateSourceInput {
  name: string;
  url: string;
  source_type: "rss" | "spider" | "api";
  config?: Record<string, unknown>;
  schedule?: string;
  priority?: number;
}

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => apiClient.get<Source[]>("/api/v1/sources"),
  });
}

export function useSource(id: string) {
  return useQuery({
    queryKey: ["source", id],
    queryFn: () => apiClient.get<Source>(`/api/v1/sources/${id}`),
    enabled: !!id,
  });
}

export function useCreateSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSourceInput) =>
      apiClient.post<Source>("/api/v1/sources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useTriggerFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/v1/sources/${id}/fetch`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}
