"use client";

import { apiClient } from "@/lib/api";
import {
	type AiBudgetAlertListResponse,
	type AiContentFlagListResponse,
	type AiMetricsResponse,
	type AiPolicySnapshotResponse,
	type AiPromptVersionListResponse,
	type AiTokenUsageListResponse,
	type FeedExperimentConfigListResponse,
	type RecomputeAiBudgetAlertsResponse,
	assertAiBudgetAlertListResponse,
	assertAiContentFlagListResponse,
	assertAiMetricsResponse,
	assertAiPolicySnapshotResponse,
	assertAiPromptVersionListResponse,
	assertAiTokenUsageListResponse,
	assertFeedExperimentConfigListResponse,
	assertFeedExperimentConfigResponse,
	assertRecomputeAiBudgetAlertsResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type UpsertAiPolicyInput = {
	policyKind: string;
	display_name?: string;
	model?: string;
	embedding_model?: string | null;
	reranker_model?: string | null;
	config?: Record<string, unknown>;
	budget_daily_tokens?: number;
	budget_monthly_tokens?: number;
	is_enabled?: boolean;
	active_prompt_version?: number | null;
};

export type PublishPromptVersionInput = {
	policyKind: string;
	prompt_template: string;
	variables?: Record<string, unknown>;
	change_note?: string | null;
};

export type PromptVersionFilter = {
	limit?: number;
	offset?: number;
};

export type ContentFlagsFilter = {
	article_id?: string;
	risk_level?: "unknown" | "low" | "medium" | "high" | "critical";
	sentiment?: "positive" | "negative" | "neutral" | "mixed";
	policy_kind?: string;
	model_version?: string;
	limit?: number;
	offset?: number;
};

export type TokenUsageFilter = {
	policy_kind?: string;
	model_version?: string;
	status?: "success" | "failed" | "degraded";
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
};

export type BudgetAlertsFilter = {
	policy_kind?: string;
	status?: "triggered" | "resolved" | "suppressed";
	limit?: number;
	offset?: number;
};

export type UpsertFeedExperimentInput = {
	experiment_key: "feed_ranking" | "banner_delivery";
	is_enabled?: boolean;
	rollout_percent?: number;
	variants?: Record<string, unknown>;
	rollback_variant?: string;
	config?: Record<string, unknown>;
};

function policyKey(policyKind: string) {
	return ["admin-ai-policy", policyKind];
}

function promptVersionsKey(policyKind: string, queryString: string) {
	return ["admin-ai-prompt-versions", policyKind, queryString];
}

function contentFlagsKey(queryString: string) {
	return ["admin-ai-content-flags", queryString];
}

function tokenUsageKey(queryString: string) {
	return ["admin-ai-token-usage", queryString];
}

function budgetAlertsKey(queryString: string) {
	return ["admin-ai-budget-alerts", queryString];
}

function buildPromptVersionQueryString(filter: PromptVersionFilter): string {
	const params = new URLSearchParams();
	params.set("limit", String(filter.limit ?? 20));
	params.set("offset", String(filter.offset ?? 0));
	return params.toString();
}

function buildContentFlagsQueryString(filter: ContentFlagsFilter): string {
	const params = new URLSearchParams();
	params.set("limit", String(filter.limit ?? 50));
	params.set("offset", String(filter.offset ?? 0));
	if (filter.article_id) params.set("article_id", filter.article_id);
	if (filter.risk_level) params.set("risk_level", filter.risk_level);
	if (filter.sentiment) params.set("sentiment", filter.sentiment);
	if (filter.policy_kind) params.set("policy_kind", filter.policy_kind);
	if (filter.model_version) params.set("model_version", filter.model_version);
	return params.toString();
}

function buildTokenUsageQueryString(filter: TokenUsageFilter): string {
	const params = new URLSearchParams();
	params.set("limit", String(filter.limit ?? 100));
	params.set("offset", String(filter.offset ?? 0));
	if (filter.policy_kind) params.set("policy_kind", filter.policy_kind);
	if (filter.model_version) params.set("model_version", filter.model_version);
	if (filter.status) params.set("status", filter.status);
	if (filter.from) params.set("from", filter.from);
	if (filter.to) params.set("to", filter.to);
	return params.toString();
}

function buildBudgetAlertsQueryString(filter: BudgetAlertsFilter): string {
	const params = new URLSearchParams();
	params.set("limit", String(filter.limit ?? 100));
	params.set("offset", String(filter.offset ?? 0));
	if (filter.policy_kind) params.set("policy_kind", filter.policy_kind);
	if (filter.status) params.set("status", filter.status);
	return params.toString();
}

export function useAiPolicy(policyKind: string | null) {
	return useQuery({
		queryKey: policyKind ? policyKey(policyKind) : ["admin-ai-policy-empty"],
		queryFn: () =>
			apiClient.get<AiPolicySnapshotResponse>(
				`/api/v1/admin/ai/policies/${policyKind}`,
				assertAiPolicySnapshotResponse,
			),
		enabled: Boolean(policyKind),
		staleTime: 10_000,
	});
}

export function useUpsertAiPolicy() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ policyKind, ...payload }: UpsertAiPolicyInput) =>
			apiClient.put<AiPolicySnapshotResponse>(
				`/api/v1/admin/ai/policies/${policyKind}`,
				payload,
				assertAiPolicySnapshotResponse,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: policyKey(variables.policyKind),
			});
			queryClient.invalidateQueries({ queryKey: ["admin-ai-metrics"] });
			queryClient.invalidateQueries({ queryKey: ["admin-ai-content-flags"] });
		},
	});
}

export function useAiPromptVersions(
	policyKind: string | null,
	filter: PromptVersionFilter = {},
) {
	const queryString = buildPromptVersionQueryString(filter);
	return useQuery({
		queryKey: policyKind
			? promptVersionsKey(policyKind, queryString)
			: ["admin-ai-prompt-versions-empty"],
		queryFn: () =>
			apiClient.get<AiPromptVersionListResponse>(
				`/api/v1/admin/ai/policies/${policyKind}/prompts?${queryString}`,
				assertAiPromptVersionListResponse,
			),
		enabled: Boolean(policyKind),
		staleTime: 10_000,
	});
}

export function usePublishAiPromptVersion() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ policyKind, ...payload }: PublishPromptVersionInput) =>
			apiClient.post<AiPolicySnapshotResponse>(
				`/api/v1/admin/ai/policies/${policyKind}/publish`,
				payload,
				assertAiPolicySnapshotResponse,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: policyKey(variables.policyKind),
			});
			queryClient.invalidateQueries({
				queryKey: ["admin-ai-prompt-versions", variables.policyKind],
			});
			queryClient.invalidateQueries({ queryKey: ["admin-ai-content-flags"] });
			queryClient.invalidateQueries({ queryKey: ["admin-ai-metrics"] });
		},
	});
}

export function useAiContentFlags(filter: ContentFlagsFilter = {}) {
	const queryString = buildContentFlagsQueryString(filter);
	return useQuery({
		queryKey: contentFlagsKey(queryString),
		queryFn: () =>
			apiClient.get<AiContentFlagListResponse>(
				`/api/v1/admin/ai/content-flags?${queryString}`,
				assertAiContentFlagListResponse,
			),
		staleTime: 10_000,
	});
}

export function useAiMetrics() {
	return useQuery({
		queryKey: ["admin-ai-metrics"],
		queryFn: () =>
			apiClient.get<AiMetricsResponse>(
				"/api/v1/admin/ai/metrics",
				assertAiMetricsResponse,
			),
		staleTime: 10_000,
	});
}

export function useAiTokenUsage(filter: TokenUsageFilter = {}) {
	const queryString = buildTokenUsageQueryString(filter);
	return useQuery({
		queryKey: tokenUsageKey(queryString),
		queryFn: () =>
			apiClient.get<AiTokenUsageListResponse>(
				`/api/v1/admin/ai/token-usage?${queryString}`,
				assertAiTokenUsageListResponse,
			),
		staleTime: 10_000,
	});
}

export function useAiBudgetAlerts(filter: BudgetAlertsFilter = {}) {
	const queryString = buildBudgetAlertsQueryString(filter);
	return useQuery({
		queryKey: budgetAlertsKey(queryString),
		queryFn: () =>
			apiClient.get<AiBudgetAlertListResponse>(
				`/api/v1/admin/ai/budget-alerts?${queryString}`,
				assertAiBudgetAlertListResponse,
			),
		staleTime: 10_000,
	});
}

export function useRecomputeAiBudgetAlerts() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			apiClient.post<RecomputeAiBudgetAlertsResponse>(
				"/api/v1/admin/ai/budget-alerts/recompute",
				{},
				assertRecomputeAiBudgetAlertsResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-ai-budget-alerts"] });
			queryClient.invalidateQueries({ queryKey: ["admin-ai-token-usage"] });
			queryClient.invalidateQueries({ queryKey: ["admin-ai-metrics"] });
		},
	});
}

export function useFeedExperiments() {
	return useQuery({
		queryKey: ["admin-ai-feed-experiments"],
		queryFn: () =>
			apiClient.get<FeedExperimentConfigListResponse>(
				"/api/v1/admin/ai/experiments",
				assertFeedExperimentConfigListResponse,
			),
		staleTime: 10_000,
	});
}

export function useUpsertFeedExperiment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ experiment_key, ...payload }: UpsertFeedExperimentInput) =>
			apiClient.put(
				`/api/v1/admin/ai/experiments/${experiment_key}`,
				payload,
				assertFeedExperimentConfigResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["admin-ai-feed-experiments"],
			});
			queryClient.invalidateQueries({ queryKey: ["admin-ai-content-flags"] });
			queryClient.invalidateQueries({ queryKey: ["me-feed"] });
		},
	});
}
