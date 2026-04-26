"use client";

import { apiClient } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface BannerTargetRecord {
	id: string;
	target_type: "global" | "channel";
	target_channel_id: string | null;
	sort_order: number;
}

export interface BannerRecord {
	id: string;
	title: string;
	body: string | null;
	image_url: string | null;
	cta_label: string | null;
	cta_url: string | null;
	status: "draft" | "scheduled" | "active" | "expired" | "archived";
	priority: number;
	starts_at: string | null;
	ends_at: string | null;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
	metadata?: Record<string, unknown>;
	targets: BannerTargetRecord[];
}

export interface BannerTargetInput {
	target_type: BannerTargetRecord["target_type"];
	target_channel_id?: string | null;
	sort_order?: number;
}

export interface CreateBannerInput {
	title: string;
	body?: string;
	image_url?: string;
	cta_label?: string;
	cta_url?: string;
	status?: BannerRecord["status"];
	priority?: number;
	starts_at?: string | null;
	ends_at?: string | null;
	metadata?: Record<string, unknown>;
	targets: BannerTargetInput[];
}

export interface UpdateBannerInput {
	id: string;
	title?: string;
	body?: string;
	image_url?: string;
	cta_label?: string;
	cta_url?: string;
	status?: BannerRecord["status"];
	priority?: number;
	starts_at?: string | null;
	ends_at?: string | null;
	metadata?: Record<string, unknown>;
	archived_at?: string | null;
	targets?: BannerTargetInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertBannerRecord(value: unknown, path = "banner"): asserts value is BannerRecord {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.targets)) {
		throw new Error(`${path} is invalid`);
	}
}

function assertBannerList(value: unknown, path = "banners"): asserts value is BannerRecord[] {
	if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
	for (const [index, item] of value.entries()) assertBannerRecord(item, `${path}[${index}]`);
}

export function useActiveBanners(channelIds: string[]) {
	const query = channelIds.length > 0 ? `?channel_ids=${encodeURIComponent(channelIds.join(","))}` : "";
	return useQuery({
		queryKey: ["activeBanners", channelIds],
		queryFn: () => apiClient.get<BannerRecord[]>(`/api/v1/banners/active${query}`, assertBannerList),
		staleTime: 15_000,
	});
}

export function useAdminBanners(includeArchived = false) {
	return useQuery({
		queryKey: ["adminBanners", includeArchived],
		queryFn: () => apiClient.get<BannerRecord[]>(`/api/v1/admin/banners?include_archived=${includeArchived}`, assertBannerList),
		staleTime: 10_000,
	});
}

export function useCreateBanner() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateBannerInput) => apiClient.post<BannerRecord>("/api/v1/admin/banners", input, assertBannerRecord),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["adminBanners"] });
			queryClient.invalidateQueries({ queryKey: ["activeBanners"] });
		},
	});
}

export function useUpdateBanner() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...input }: UpdateBannerInput) => apiClient.patch<BannerRecord>(`/api/v1/admin/banners/${id}`, input, assertBannerRecord),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["adminBanners"] });
			queryClient.invalidateQueries({ queryKey: ["activeBanners"] });
		},
	});
}
