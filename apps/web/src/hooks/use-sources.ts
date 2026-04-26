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

export function useSourceStats(options: { enabled?: boolean } = {}) {
	const { enabled = true } = options;
	return useQuery({
		queryKey: ["sourceStats"],
		queryFn: () =>
			apiClient.get("/api/v1/sources/stats", assertSourceStatsResponse),
		// In real-world runs, source state may be updated asynchronously by the worker
		// (e.g. last_fetch/last_error). Light polling keeps the UI closer to real-time.
		refetchInterval: 30_000,
		enabled,
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

/**
 * `DELETE /api/v1/sources/:id` — soft delete (sets `deleted_at`). Used as the
 * "pause" affordance on the admin sources page since the backend does not yet
 * expose a dedicated `is_active=false` PATCH route.
 */
export function useDeleteSource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiClient.delete(`/api/v1/sources/${id}`),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["sourceStats"] });
		},
	});
}

/**
 * `POST /api/v1/sources/:id/restore` — un-delete a soft-deleted source. Used
 * as the "resume" affordance on the admin sources page.
 */
export function useRestoreSource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiClient.post(`/api/v1/sources/${id}/restore`),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["sourceStats"] });
		},
	});
}

/**
 * Run-history endpoint — placeholder. Backend does not yet expose a
 * `/api/v1/sources/:id/runs` route, so the hook is wired with `enabled: false`
 * and the drawer renders a "not yet implemented" panel.
 */
export function useSourceRuns(_id: string | null) {
	return useQuery({
		queryKey: ["sourceRuns", _id],
		queryFn: async () => {
			throw new Error(
				"Per-source fetch run history is not implemented on the backend",
			);
		},
		enabled: false,
		retry: false,
	});
}

/**
 * Articles-by-source endpoint — placeholder. Backend `/api/v1/articles` list
 * params do not yet accept `source_id`, so the drawer's "Article preview" tab
 * surfaces a disabled card explaining the gap.
 */
export function useSourceArticles(_id: string | null) {
	return useQuery({
		queryKey: ["sourceArticles", _id],
		queryFn: async () => {
			throw new Error(
				"Per-source article filter is not implemented on the backend",
			);
		},
		enabled: false,
		retry: false,
	});
}
