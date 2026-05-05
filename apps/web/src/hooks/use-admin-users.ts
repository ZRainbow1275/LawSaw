"use client";

/**
 * Admin user-management hooks.
 *
 * Backed by `/api/v1/users` (the same router used by the user-self profile
 * endpoints). The list/detail/permission-audit endpoints are real; the
 * "invite user" and "session list" capabilities are not yet exposed by the
 * backend, so the corresponding hooks are stubbed with `enabled: false` and
 * documented in-line so the UI can render disabled affordances without
 * fabricating data.
 */

import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type UserDetailResponse,
	assertUserDetailResponse,
} from "@/lib/api/types";
import { normalizeRoleTier, type RoleTier } from "@/lib/authz";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export { deriveRoleTierFromRoles } from "@/lib/authz";

export interface AdminUserRow {
	id: string;
	tenant_id: string;
	email: string;
	display_name: string | null;
	avatar_url: string | null;
	is_active: boolean;
	email_verified_at: string | null;
	last_login: string | null;
	version: number;
	created_at: string;
	roles: string[];
	role_tier: RoleTier;
}

export interface AdminUserListResponse {
	data: AdminUserRow[];
	total: number;
	limit: number;
	offset: number;
	next_cursor?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAdminUserRow(
	value: unknown,
	path = "adminUserRow",
): asserts value is AdminUserRow {
	if (!isRecord(value)) {
		throw new Error(`${path} must be an object`);
	}
	if (typeof value.id !== "string" || typeof value.email !== "string") {
		throw new Error(`${path}: missing id/email`);
	}
	const roles = Array.isArray(value.roles) ? value.roles : [];
	for (const [index, role] of roles.entries()) {
		if (typeof role !== "string") {
			throw new Error(`${path}.roles[${index}] must be string`);
		}
	}
	value.roles = roles;
	value.role_tier = normalizeRoleTier(
		typeof value.role_tier === "string" ? value.role_tier : null,
	);
}

function assertAdminUserList(
	value: unknown,
	path = "adminUserList",
): asserts value is AdminUserListResponse {
	if (!isRecord(value)) {
		throw new Error(`${path} must be an object`);
	}
	if (!Array.isArray(value.data)) {
		throw new Error(`${path}.data must be an array`);
	}
	for (const [index, item] of value.data.entries()) {
		assertAdminUserRow(item, `${path}.data[${index}]`);
	}
	if (typeof value.total !== "number") {
		throw new Error(`${path}.total must be number`);
	}
}

export interface UseAdminUsersOptions {
	limit?: number;
	offset?: number;
	enabled?: boolean;
}

/**
 * `GET /api/v1/users` — paginated tenant user roster. Search/role-tier filters
 * are applied client-side because the backend does not expose those query
 * params yet.
 */
export function useAdminUsers(options: UseAdminUsersOptions = {}) {
	const { limit = 50, offset = 0, enabled = true } = options;
	return useQuery({
		queryKey: ["adminUsers", limit, offset],
		queryFn: async () => {
			const search = new URLSearchParams();
			search.set("limit", String(limit));
			if (offset > 0) search.set("offset", String(offset));
			return apiClient.get<AdminUserListResponse>(
				`/api/v1/users?${search.toString()}`,
				assertAdminUserList,
			);
		},
		enabled,
		staleTime: 30_000,
	});
}

/**
 * `GET /api/v1/users/:id` — full user detail with role list and effective
 * permissions.
 */
export function useAdminUserDetail(userId: string | null) {
	return useQuery({
		queryKey: ["adminUserDetail", userId],
		queryFn: async () => {
			if (!userId) throw new Error("userId required");
			return apiClient.get<UserDetailResponse>(
				`/api/v1/users/${userId}`,
				assertUserDetailResponse,
			);
		},
		enabled: Boolean(userId),
		staleTime: 15_000,
	});
}

export interface PermissionAuditEntry {
	id: string;
	user_id: string;
	actor_id: string | null;
	action: string;
	resource: string;
	resource_id: string | null;
	occurred_at: string;
	metadata: Record<string, unknown> | null;
}

function assertPermissionAuditList(
	value: unknown,
	path = "permissionAuditList",
): asserts value is PermissionAuditEntry[] {
	if (!Array.isArray(value)) {
		throw new Error(`${path} must be an array`);
	}
	for (const [index, item] of value.entries()) {
		if (!isRecord(item)) {
			throw new Error(`${path}[${index}] must be an object`);
		}
		if (typeof item.id !== "string") {
			throw new Error(`${path}[${index}].id must be string`);
		}
	}
}

export function useUserPermissionAudits(userId: string | null) {
	return useQuery({
		queryKey: ["adminUserPermissionAudits", userId],
		queryFn: async () => {
			if (!userId) throw new Error("userId required");
			const raw = await apiClient.get<unknown>(
				`/api/v1/users/${userId}/permissions/audit?limit=50`,
			);
			const entries = Array.isArray(raw)
				? raw
				: isRecord(raw) && Array.isArray(raw.data)
					? raw.data
					: isRecord(raw) && Array.isArray(raw.entries)
						? raw.entries
						: [];
			assertPermissionAuditList(entries);
			return entries;
		},
		enabled: Boolean(userId),
		staleTime: 30_000,
	});
}

/**
 * `PATCH /api/v1/users/:id/roles` — adds/removes role memberships in a single
 * versioned write. Sends `If-Match` so concurrent admin edits raise 412 instead
 * of silently clobbering each other.
 */
export interface UpdateRolesInput {
	userId: string;
	version: number;
	addRoles?: string[];
	removeRoles?: string[];
}

export function useUpdateUserRoles() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: UpdateRolesInput) => {
			const headers = new Headers();
			headers.set("If-Match", ifMatchFromVersion(input.version));
			headers.set("Content-Type", "application/json");
			return apiClient.patch<{ success: boolean }>(
				`/api/v1/users/${input.userId}/roles`,
				{
					add_roles: input.addRoles ?? [],
					remove_roles: input.removeRoles ?? [],
				},
				undefined,
				{ headers },
			);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
			queryClient.invalidateQueries({
				queryKey: ["adminUserDetail", variables.userId],
			});
			queryClient.invalidateQueries({
				queryKey: ["adminUserPermissionAudits", variables.userId],
			});
		},
	});
}

/**
 * Sessions endpoint — placeholder. Backend does not yet expose a per-user
 * session listing; the hook is wired so the UI can render a disabled tab
 * without fabricating data.
 */
export function useAdminUserSessions(_userId: string | null) {
	return useQuery({
		queryKey: ["adminUserSessions", _userId],
		queryFn: async () => {
			throw new Error(
				"Per-user session listing is not implemented on the backend",
			);
		},
		enabled: false,
		retry: false,
	});
}

/**
 * Invite endpoint — placeholder. Backend does not yet expose an invite-user
 * route; the mutation is wired so the modal can render a disabled CTA without
 * fabricating data.
 */
export interface InviteUserInput {
	email: string;
	display_name?: string;
	role_tier?: RoleTier;
}

export function useInviteUser() {
	return useMutation({
		mutationFn: async (_input: InviteUserInput) => {
			throw new Error(
				"User-invite endpoint is not implemented on the backend yet",
			);
		},
	});
}
