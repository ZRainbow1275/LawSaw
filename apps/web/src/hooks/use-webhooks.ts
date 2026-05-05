"use client";

import { apiClient } from "@/lib/api";
import {
	type WebhookEndpoint,
	type WebhookListResponse,
	type WebhookTestResponse,
	assertDeleteResponse,
	assertWebhookEndpoint,
	assertWebhookListResponse,
	assertWebhookTestResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

export interface ListWebhookParams {
	limit?: number;
	offset?: number;
	search?: string;
	enabled?: WebhookEnabledFilter;
	delivery?: WebhookDeliveryFilter;
}

export type WebhookEnabledFilter = "all" | "enabled" | "disabled";
export type WebhookDeliveryFilter = "all" | "healthy" | "failing" | "never";

export interface WebhookDeliveryStats {
	total: number;
	enabled: number;
	disabled: number;
	healthy: number;
	failing: number;
	never: number;
}

export interface WebhookListView extends WebhookListResponse {
	raw_total: number;
	filtered_total: number;
	stats: WebhookDeliveryStats;
}

export interface CreateWebhookInput {
	name: string;
	url: string;
	signing_secret: string;
	enabled?: boolean;
	events: string[];
	timeout_ms?: number;
	max_retries?: number;
}

export interface UpdateWebhookInput {
	id: string;
	name?: string;
	url?: string;
	signing_secret?: string;
	enabled?: boolean;
	events?: string[];
	timeout_ms?: number;
	max_retries?: number;
}

export interface TestWebhookInput {
	id: string;
	event_type?: string;
	payload?: Record<string, unknown>;
}

function deliveryState(
	item: WebhookEndpoint,
): Exclude<WebhookDeliveryFilter, "all"> {
	const successTs = item.last_success_at
		? Date.parse(item.last_success_at)
		: Number.NaN;
	const failureTs = item.last_failure_at
		? Date.parse(item.last_failure_at)
		: Number.NaN;
	const hasSuccess = Number.isFinite(successTs);
	const hasFailure = Number.isFinite(failureTs);

	if (!hasSuccess && !hasFailure) return "never";
	if (hasFailure && (!hasSuccess || failureTs > successTs)) return "failing";
	return "healthy";
}

export function useWebhooks(params: ListWebhookParams = {}) {
	const {
		limit = 50,
		offset = 0,
		search = "",
		enabled = "all",
		delivery = "all",
	} = params;
	const normalizedSearch = search.trim().toLowerCase();

	const query = useQuery({
		queryKey: ["webhooks", { limit, offset }],
		queryFn: () =>
			apiClient.get<WebhookListResponse>(
				`/api/v1/webhooks?limit=${limit}&offset=${offset}`,
				assertWebhookListResponse,
			),
		refetchInterval: 30_000,
		staleTime: 15_000,
	});

	const data = useMemo(() => {
		if (!query.data) return undefined;

		const stats = query.data.items.reduce<WebhookDeliveryStats>(
			(acc, item) => {
				acc.total += 1;
				if (item.enabled) acc.enabled += 1;
				else acc.disabled += 1;

				const state = deliveryState(item);
				acc[state] += 1;
				return acc;
			},
			{
				total: 0,
				enabled: 0,
				disabled: 0,
				healthy: 0,
				failing: 0,
				never: 0,
			},
		);

		const filteredItems = query.data.items.filter((item) => {
			if (enabled === "enabled" && !item.enabled) return false;
			if (enabled === "disabled" && item.enabled) return false;
			if (delivery !== "all" && deliveryState(item) !== delivery) return false;
			if (!normalizedSearch) return true;

			const haystack =
				`${item.name} ${item.url} ${item.events.join(" ")}`.toLowerCase();
			return haystack.includes(normalizedSearch);
		});

		return {
			...query.data,
			items: filteredItems,
			total: filteredItems.length,
			raw_total: query.data.total,
			filtered_total: filteredItems.length,
			stats,
		} satisfies WebhookListView;
	}, [query.data, normalizedSearch, enabled, delivery]);

	return {
		...query,
		data,
	};
}

export function useCreateWebhook() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateWebhookInput) =>
			apiClient.post<WebhookEndpoint>(
				"/api/v1/webhooks",
				input,
				assertWebhookEndpoint,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["webhooks"] });
		},
	});
}

export function useUpdateWebhook() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, ...input }: UpdateWebhookInput) =>
			apiClient.patch<WebhookEndpoint>(
				`/api/v1/webhooks/${id}`,
				input,
				assertWebhookEndpoint,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["webhooks"] });
		},
	});
}

export function useDeleteWebhook() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(`/api/v1/webhooks/${id}`, assertDeleteResponse),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["webhooks"] });
		},
	});
}

export function useTestWebhook() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, event_type, payload }: TestWebhookInput) =>
			apiClient.post<WebhookTestResponse>(
				`/api/v1/webhooks/${id}/test`,
				{ event_type, payload },
				assertWebhookTestResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["webhooks"] });
		},
	});
}
