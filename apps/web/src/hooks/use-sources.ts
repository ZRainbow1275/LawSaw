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
		// 真实运行场景下，信息源状态可能被 worker 异步更新（last_fetch/last_error）。
		// 轻量轮询可让 UI 更接近实时状态，而不依赖手动刷新。
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
		// 真实运行场景下，信息源状态可能被 worker 异步更新（last_fetch/last_error）。
		// 轻量轮询可让 UI 更接近实时状态，而不依赖手动刷新。
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["sourceStats"] });
		},
	});
}

export function useTriggerFetch() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => apiClient.post(`/api/v1/sources/${id}/fetch`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["sourceStats"] });
		},
	});
}
