"use client";

import { apiClient } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ChannelRecord {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	linked_category_id: string | null;
	visibility: "public" | "restricted" | "verified" | "premium";
	is_active: boolean;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface ChannelPolicyRecord {
	id: string;
	subject_type: string;
	subject_key: string;
	can_read: boolean;
	can_read_source_meta: boolean;
	can_access_reports: boolean;
	priority: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertChannelRecord(
	value: unknown,
	path = "channel",
): asserts value is ChannelRecord {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.id !== "string" ||
		typeof value.slug !== "string" ||
		typeof value.name !== "string"
	) {
		throw new Error(`${path} is invalid`);
	}
}

function assertChannelList(
	value: unknown,
	path = "channels",
): asserts value is ChannelRecord[] {
	if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
	for (const [index, item] of value.entries())
		assertChannelRecord(item, `${path}[${index}]`);
}

function assertChannelPolicyList(
	value: unknown,
	path = "channelPolicies",
): asserts value is ChannelPolicyRecord[] {
	if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
	for (const [index, item] of value.entries()) {
		if (
			!isRecord(item) ||
			typeof item.id !== "string" ||
			typeof item.subject_key !== "string"
		) {
			throw new Error(`${path}[${index}] is invalid`);
		}
	}
}

export interface CreateChannelInput {
	slug: string;
	name: string;
	description?: string;
	linked_category_id?: string | null;
	visibility?: ChannelRecord["visibility"];
	is_active?: boolean;
	metadata?: Record<string, unknown>;
}

export interface UpdateChannelInput {
	id: string;
	slug?: string;
	name?: string;
	description?: string;
	linked_category_id?: string | null;
	clear_linked_category?: boolean;
	visibility?: ChannelRecord["visibility"];
	is_active?: boolean;
	metadata?: Record<string, unknown>;
}

export function useChannels() {
	return useQuery({
		queryKey: ["channels"],
		queryFn: () =>
			apiClient.get<ChannelRecord[]>("/api/v1/channels", assertChannelList),
		staleTime: 30_000,
	});
}

export function useAdminChannels(includeInactive = true) {
	return useQuery({
		queryKey: ["adminChannels", includeInactive],
		queryFn: () =>
			apiClient.get<ChannelRecord[]>(
				`/api/v1/admin/channels?include_inactive=${includeInactive}`,
				assertChannelList,
			),
		staleTime: 10_000,
	});
}

export function useChannelPolicies(channelId: string | null) {
	return useQuery({
		queryKey: ["channelPolicies", channelId],
		queryFn: () =>
			apiClient.get<ChannelPolicyRecord[]>(
				`/api/v1/admin/channels/${channelId}/policies`,
				assertChannelPolicyList,
			),
		enabled: Boolean(channelId),
		staleTime: 10_000,
	});
}

export function useCreateChannel() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateChannelInput) =>
			apiClient.post<ChannelRecord>(
				"/api/v1/admin/channels",
				input,
				assertChannelRecord,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["channels"] });
			queryClient.invalidateQueries({ queryKey: ["adminChannels"] });
		},
	});
}

export function useUpdateChannel() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...input }: UpdateChannelInput) =>
			apiClient.patch<ChannelRecord>(
				`/api/v1/admin/channels/${id}`,
				input,
				assertChannelRecord,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["channels"] });
			queryClient.invalidateQueries({ queryKey: ["adminChannels"] });
			queryClient.invalidateQueries({
				queryKey: ["channelPolicies", variables.id],
			});
		},
	});
}
