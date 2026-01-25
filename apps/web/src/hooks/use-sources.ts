"use client";

import { apiClient } from "@/lib/api";
import { assertSource, assertSourceList } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
		queryFn: () => apiClient.get("/api/v1/sources", assertSourceList),
	});
}

export function useSource(id: string) {
	return useQuery({
		queryKey: ["source", id],
		queryFn: () => apiClient.get(`/api/v1/sources/${id}`, assertSource),
		enabled: !!id,
	});
}

export function useCreateSource() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateSourceInput) =>
			apiClient.post("/api/v1/sources", data, assertSource),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
		},
	});
}

export function useTriggerFetch() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => apiClient.post(`/api/v1/sources/${id}/fetch`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
		},
	});
}
