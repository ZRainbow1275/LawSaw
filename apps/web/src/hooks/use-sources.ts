"use client";

import { apiClient } from "@/lib/api";
import {
	assertSource,
	assertSourceListResponse,
	assertSourceStatsResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface CreateSourceInput {
	name: string;
	url: string;
	source_type: "rss" | "spider";
	config?: Record<string, unknown>;
	schedule?: string;
	priority?: number;
}

interface ListSourcesParams {
	limit?: number;
	offset?: number;
}

export function useSourceStats() {
	return useQuery({
		queryKey: ["sourceStats"],
		queryFn: () =>
			apiClient.get("/api/v1/sources/stats", assertSourceStatsResponse),
		// In real-world runs, source state may be updated asynchronously by the worker
		// (e.g. last_fetch/last_error). Light polling keeps the UI closer to real-time.
		refetchInterval: 30_000,
	});
}

export function useSources(params?: ListSourcesParams) {
	const limit = params?.limit ?? 50;
	const offset = params?.offset ?? 0;

	return useQuery({
		queryKey: ["sources", limit, offset],
		queryFn: () =>
			apiClient.get(
				`/api/v1/sources?limit=${limit}&offset=${offset}`,
				assertSourceListResponse,
			),
		// In real-world runs, source state may be updated asynchronously by the worker
		// (e.g. last_fetch/last_error). Light polling keeps the UI closer to real-time.
		refetchInterval: 30_000,
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
			apiClient.post(
				"/api/v1/sources",
				{ ...data, config: data.config ?? {} },
				assertSource,
			),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["sourceStats"] });
		},
	});
}

export function useTriggerFetch() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => apiClient.post(`/api/v1/sources/${id}/fetch`),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["sourceStats"] });
		},
	});
}
