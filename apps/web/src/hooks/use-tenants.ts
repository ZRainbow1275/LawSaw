"use client";

import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type Tenant,
	type TenantConfig,
	type TenantDetail,
	type TenantUsage,
	assertDeleteResponse,
	assertTenant,
	assertTenantConfig,
	assertTenantDetail,
	assertTenantUsage,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function assertTenantList(
	value: unknown,
	path = "tenantList",
): asserts value is Tenant[] {
	if (!Array.isArray(value)) {
		throw new Error(`${path} must be an array`);
	}

	for (const [index, item] of value.entries()) {
		assertTenant(item, `${path}[${index}]`);
	}
}

export interface CreateTenantInput {
	slug: string;
	name: string;
}

export interface UpdateTenantInput {
	id: string;
	name: string;
}

export interface UpdateTenantConfigInput {
	id: string;
	version: number;
	max_users?: number;
	max_articles?: number;
	max_sources?: number;
	max_storage_mb?: number;
	max_reports_per_month?: number;
	feature_ai_enabled?: boolean;
	feature_knowledge_graph?: boolean;
	feature_report_generation?: boolean;
	feature_webhook?: boolean;
	logo_url?: string | null;
	primary_color?: string | null;
}

export function useTenants() {
	return useQuery({
		queryKey: ["tenants"],
		queryFn: () =>
			apiClient.get<Tenant[]>("/api/v1/tenants", assertTenantList, {
				retry: { retries: 1 },
			}),
		staleTime: 30_000,
	});
}

export function useTenantDetail(id: string | null) {
	return useQuery({
		queryKey: ["tenant", id],
		queryFn: () =>
			apiClient.get<TenantDetail>(`/api/v1/tenants/${id}`, assertTenantDetail),
		enabled: Boolean(id),
		staleTime: 15_000,
	});
}

export function useTenantConfig(id: string | null) {
	return useQuery({
		queryKey: ["tenantConfig", id],
		queryFn: () =>
			apiClient.get<TenantConfig>(
				`/api/v1/tenants/${id}/config`,
				assertTenantConfig,
			),
		enabled: Boolean(id),
		staleTime: 15_000,
	});
}

export function useTenantUsage(id: string | null) {
	return useQuery({
		queryKey: ["tenantUsage", id],
		queryFn: () =>
			apiClient.get<TenantUsage>(`/api/v1/tenants/${id}/usage`, assertTenantUsage),
		enabled: Boolean(id),
		staleTime: 30_000,
	});
}

export function useCreateTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateTenantInput) =>
			apiClient.post<Tenant>("/api/v1/tenants", input, assertTenant),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
		},
	});
}

export function useUpdateTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, name }: UpdateTenantInput) =>
			apiClient.put<Tenant>(`/api/v1/tenants/${id}`, { name }, assertTenant),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			queryClient.invalidateQueries({ queryKey: ["tenant", variables.id] });
		},
	});
}

export function useDeleteTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(`/api/v1/tenants/${id}`, assertDeleteResponse),
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			queryClient.removeQueries({ queryKey: ["tenant", id] });
			queryClient.removeQueries({ queryKey: ["tenantConfig", id] });
			queryClient.removeQueries({ queryKey: ["tenantUsage", id] });
		},
	});
}

export function useUpdateTenantConfig() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, version, ...input }: UpdateTenantConfigInput) =>
			apiClient.put<TenantConfig>(
				`/api/v1/tenants/${id}/config`,
				input,
				assertTenantConfig,
				{
					headers: {
						"If-Match": ifMatchFromVersion(version),
					},
				},
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["tenant", variables.id] });
			queryClient.invalidateQueries({ queryKey: ["tenantConfig", variables.id] });
		},
	});
}

export function useRefreshTenantUsage() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.post<TenantUsage>(
				`/api/v1/tenants/${id}/usage/refresh`,
				undefined,
				assertTenantUsage,
			),
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["tenant", id] });
			queryClient.invalidateQueries({ queryKey: ["tenantUsage", id] });
		},
	});
}
