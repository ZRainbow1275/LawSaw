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
