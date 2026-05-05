"use client";

/**
 * Super-admin tenant-management hooks.
 *
 * Backed by `/api/v1/super/tenants/*` (mounted in `routes::super_tenants`).
 *
 * Endpoint surface (after #37 + #40 landed):
 *   - GET    /super/tenants                      — list (q/status/include_deleted/limit/offset)
 *   - POST   /super/tenants                      — create + provision admin user + reset token
 *   - PATCH  /super/tenants/:id                  — update name / status / quotas / feature_flags
 *   - DELETE /super/tenants/:id                  — soft-delete (X-Confirm-Delete: yes header)
 *   - GET    /super/tenants/:id/usage            — live usage snapshot
 *   - GET    /super/tenants/:id/users            — paginated user roster (+ q/role_tier filters)
 *   - POST   /super/tenants/:id/suspend          — suspend tenant + revoke sessions
 *   - POST   /super/tenants/:id/admin/reset-password — issue reset token for first super_admin
 *   - POST   /super/tenants/:id/export           — enqueue tenant export job (returns 202)
 *   - GET    /super/tenants/:id/exports          — list export history
 *   - GET    /super/tenants/:id/exports/:export_id — single export entry
 *
 * Field shapes mirror the Rust handler structs in
 * `crates/law-eye-api/src/routes/super_tenants.rs` 1:1 (verified via Read).
 */

import { apiClient } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Tenant CRUD ──────────────────────────────────────────────────────────

export interface TenantRow {
	id: string;
	slug: string;
	name: string;
	status: string;
	quota_users: number;
	quota_storage_mb: number;
	quota_ai_tokens_monthly: number;
	feature_flags: Record<string, unknown>;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface TenantUsageRecord {
	tenant_id: string;
	current_users: number;
	current_articles: number;
	current_storage_mb: number;
	ai_tokens_this_month: number;
}

export interface CreateTenantResponse {
	tenant: TenantRow;
	admin_user_id: string;
	password_reset_token: string;
	password_reset_expires_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTenantRow(
	value: unknown,
	path = "tenant",
): asserts value is TenantRow {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.id !== "string" ||
		typeof value.slug !== "string" ||
		typeof value.name !== "string" ||
		typeof value.status !== "string"
	) {
		throw new Error(`${path}: missing id/slug/name/status`);
	}
}

function assertTenantList(
	value: unknown,
	path = "tenantList",
): asserts value is TenantRow[] {
	if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
	for (const [index, item] of value.entries())
		assertTenantRow(item, `${path}[${index}]`);
}

function assertTenantUsage(
	value: unknown,
	path = "tenantUsage",
): asserts value is TenantUsageRecord {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (typeof value.tenant_id !== "string") {
		throw new Error(`${path}: missing tenant_id`);
	}
}

function assertCreateResponse(
	value: unknown,
	path = "createTenantResponse",
): asserts value is CreateTenantResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (!isRecord(value.tenant)) {
		throw new Error(`${path}.tenant must be an object`);
	}
	assertTenantRow(value.tenant, `${path}.tenant`);
	if (
		typeof value.admin_user_id !== "string" ||
		typeof value.password_reset_token !== "string"
	) {
		throw new Error(`${path}: missing admin_user_id/password_reset_token`);
	}
}

export interface UseAdminTenantsOptions {
	enabled?: boolean;
	q?: string;
	status?: string;
	includeDeleted?: boolean;
	limit?: number;
	offset?: number;
}

export function useAdminTenants(options: UseAdminTenantsOptions = {}) {
	const { enabled = true, q, status, includeDeleted, limit, offset } = options;
	const queryString = new URLSearchParams();
	if (q && q.trim().length > 0) queryString.set("q", q.trim());
	if (status && status.trim().length > 0)
		queryString.set("status", status.trim());
	if (includeDeleted) queryString.set("include_deleted", "true");
	if (typeof limit === "number") queryString.set("limit", String(limit));
	if (typeof offset === "number") queryString.set("offset", String(offset));
	const search = queryString.toString();
	const url = search
		? `/api/v1/super/tenants?${search}`
		: "/api/v1/super/tenants";
	return useQuery({
		queryKey: [
			"adminTenants",
			q ?? "",
			status ?? "",
			includeDeleted ?? false,
			limit ?? null,
			offset ?? null,
		],
		queryFn: () => apiClient.get<TenantRow[]>(url, assertTenantList),
		enabled,
		staleTime: 30_000,
	});
}

export function useTenantUsage(tenantId: string | null) {
	return useQuery({
		queryKey: ["adminTenantUsage", tenantId],
		queryFn: async () => {
			if (!tenantId) throw new Error("tenantId required");
			return apiClient.get<TenantUsageRecord>(
				`/api/v1/super/tenants/${tenantId}/usage`,
				assertTenantUsage,
			);
		},
		enabled: Boolean(tenantId),
		staleTime: 15_000,
	});
}

export interface CreateTenantInput {
	slug: string;
	name: string;
	admin_email: string;
	admin_display_name?: string;
}

export function useCreateTenant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateTenantInput) =>
			apiClient.post<CreateTenantResponse>(
				"/api/v1/super/tenants",
				input,
				assertCreateResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
		},
	});
}

export interface UpdateTenantInput {
	id: string;
	name?: string;
	status?: string;
	quota_users?: number;
	quota_storage_mb?: number;
	quota_ai_tokens_monthly?: number;
	feature_flags?: Record<string, unknown>;
}

export function useUpdateTenant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateTenantInput) => {
			const { id, ...body } = input;
			return apiClient.patch<TenantRow>(
				`/api/v1/super/tenants/${id}`,
				body,
				assertTenantRow,
			);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
			queryClient.invalidateQueries({
				queryKey: ["adminTenantUsage", variables.id],
			});
		},
	});
}

export interface DeleteTenantResponse {
	success: boolean;
	id: string;
}

function assertDeleteResponse(
	value: unknown,
	path = "deleteResponse",
): asserts value is DeleteTenantResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (typeof value.success !== "boolean" || typeof value.id !== "string") {
		throw new Error(`${path}: missing success/id`);
	}
}

export function useDeleteTenant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (tenantId: string) => {
			const headers = new Headers();
			headers.set("X-Confirm-Delete", "yes");
			return apiClient.delete<DeleteTenantResponse>(
				`/api/v1/super/tenants/${tenantId}`,
				assertDeleteResponse,
				{ headers },
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
		},
	});
}

// ── Phase F.7: tenant subroutines ────────────────────────────────────────

export interface TenantUserRow {
	id: string;
	email: string;
	display_name: string | null;
	is_active: boolean;
	last_login: string | null;
	email_verified_at: string | null;
	role_tier: string;
	roles: string[];
	created_at: string;
}

export interface TenantUsersListResponse {
	data: TenantUserRow[];
	total: number;
	limit: number;
	offset: number;
}

function assertTenantUserRow(
	value: unknown,
	path = "tenantUser",
): asserts value is TenantUserRow {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.id !== "string" ||
		typeof value.email !== "string" ||
		typeof value.role_tier !== "string" ||
		typeof value.is_active !== "boolean" ||
		typeof value.created_at !== "string"
	) {
		throw new Error(`${path}: missing id/email/role_tier/is_active/created_at`);
	}
	if (!Array.isArray(value.roles)) {
		throw new Error(`${path}.roles must be an array`);
	}
}

function assertTenantUsersListResponse(
	value: unknown,
	path = "tenantUsersList",
): asserts value is TenantUsersListResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (!Array.isArray(value.data)) {
		throw new Error(`${path}.data must be an array`);
	}
	for (const [index, item] of (value.data as unknown[]).entries()) {
		assertTenantUserRow(item, `${path}.data[${index}]`);
	}
	if (
		typeof value.total !== "number" ||
		typeof value.limit !== "number" ||
		typeof value.offset !== "number"
	) {
		throw new Error(`${path}: missing total/limit/offset`);
	}
}

export interface UseTenantUsersOptions {
	tenantId: string | null;
	q?: string;
	roleTier?: string;
	limit?: number;
	offset?: number;
	enabled?: boolean;
}

/**
 * `GET /api/v1/super/tenants/:id/users` — paginated roster with optional
 * substring search (`q`) and minimum role-tier filter.
 */
export function useTenantUsers(options: UseTenantUsersOptions) {
	const {
		tenantId,
		q,
		roleTier,
		limit = 50,
		offset = 0,
		enabled = true,
	} = options;
	const qs = new URLSearchParams();
	if (q && q.trim().length > 0) qs.set("q", q.trim());
	if (roleTier && roleTier.trim().length > 0) qs.set("role_tier", roleTier);
	qs.set("limit", String(limit));
	qs.set("offset", String(offset));
	const search = qs.toString();
	return useQuery({
		queryKey: [
			"adminTenantUsers",
			tenantId,
			q ?? "",
			roleTier ?? "",
			limit,
			offset,
		],
		queryFn: async () => {
			if (!tenantId) throw new Error("tenantId required");
			return apiClient.get<TenantUsersListResponse>(
				`/api/v1/super/tenants/${tenantId}/users?${search}`,
				assertTenantUsersListResponse,
			);
		},
		enabled: enabled && Boolean(tenantId),
		staleTime: 15_000,
	});
}

export interface SuspendTenantInput {
	tenantId: string;
	reason?: string;
	until?: string | null;
}

export interface SuspendTenantResponse {
	tenant: TenantRow;
	sessions_revoked: number;
}

function assertSuspendTenantResponse(
	value: unknown,
	path = "suspendTenantResponse",
): asserts value is SuspendTenantResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (!isRecord(value.tenant)) {
		throw new Error(`${path}.tenant must be an object`);
	}
	assertTenantRow(value.tenant, `${path}.tenant`);
	if (typeof value.sessions_revoked !== "number") {
		throw new Error(`${path}.sessions_revoked must be a number`);
	}
}

/**
 * `POST /api/v1/super/tenants/:id/suspend` — flips status to 'suspended'
 * and revokes all active sessions for the tenant. Body carries optional
 * `reason` (free text for the audit log) and `until` (ISO timestamp for
 * auto-resume; null = indefinite).
 */
export function useSuspendTenant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SuspendTenantInput) => {
			const body: Record<string, unknown> = {};
			if (input.reason !== undefined) body.reason = input.reason;
			if (input.until !== undefined) body.until = input.until;
			return apiClient.post<SuspendTenantResponse>(
				`/api/v1/super/tenants/${input.tenantId}/suspend`,
				body,
				assertSuspendTenantResponse,
			);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["adminTenants"] });
			queryClient.invalidateQueries({
				queryKey: ["adminTenantUsage", variables.tenantId],
			});
		},
	});
}

export interface ResetAdminPasswordResponse {
	admin_user_id: string;
	admin_email: string;
	reset_token: string;
	expires_at: string;
}

function assertResetAdminPasswordResponse(
	value: unknown,
	path = "resetAdminPasswordResponse",
): asserts value is ResetAdminPasswordResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.admin_user_id !== "string" ||
		typeof value.admin_email !== "string" ||
		typeof value.reset_token !== "string" ||
		typeof value.expires_at !== "string"
	) {
		throw new Error(
			`${path}: missing admin_user_id/admin_email/reset_token/expires_at`,
		);
	}
}

/**
 * `POST /api/v1/super/tenants/:id/admin/reset-password` — issues a 24h
 * password-reset token for the first super_admin user inside the target
 * tenant. The raw token comes back in the response only this once — the
 * UI must let the operator copy it before the modal closes.
 */
export function useResetTenantAdminPassword() {
	return useMutation({
		mutationFn: (tenantId: string) =>
			apiClient.post<ResetAdminPasswordResponse>(
				`/api/v1/super/tenants/${tenantId}/admin/reset-password`,
				{},
				assertResetAdminPasswordResponse,
			),
	});
}

export interface ExportTenantResponse {
	export_id: string;
	job_id: string;
	queued_at: string;
	status: string;
}

function assertExportTenantResponse(
	value: unknown,
	path = "exportTenantResponse",
): asserts value is ExportTenantResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.export_id !== "string" ||
		typeof value.job_id !== "string" ||
		typeof value.queued_at !== "string" ||
		typeof value.status !== "string"
	) {
		throw new Error(`${path}: missing export_id/job_id/queued_at/status`);
	}
}

/**
 * `POST /api/v1/super/tenants/:id/export` — enqueues the export job and
 * persists a `tenant_exports` row with `status='queued'`. Worker advances
 * it through running → completed/failed; `useTenantExports` polls.
 */
export function useExportTenantData() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (tenantId: string) =>
			apiClient.post<ExportTenantResponse>(
				`/api/v1/super/tenants/${tenantId}/export`,
				{},
				assertExportTenantResponse,
			),
		onSuccess: (_data, tenantId) => {
			queryClient.invalidateQueries({
				queryKey: ["adminTenantExports", tenantId],
			});
		},
	});
}

// ── Phase F.8: export history ────────────────────────────────────────────

export interface TenantExportRow {
	id: string;
	tenant_id: string;
	status: string;
	requested_by: string | null;
	job_id: string | null;
	download_url: string | null;
	size_bytes: number | null;
	error_message: string | null;
	started_at: string | null;
	finished_at: string | null;
	created_at: string;
}

export interface TenantExportsListResponse {
	data: TenantExportRow[];
	total: number;
	limit: number;
	offset: number;
}

function assertTenantExportRow(
	value: unknown,
	path = "tenantExport",
): asserts value is TenantExportRow {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.id !== "string" ||
		typeof value.tenant_id !== "string" ||
		typeof value.status !== "string" ||
		typeof value.created_at !== "string"
	) {
		throw new Error(`${path}: missing id/tenant_id/status/created_at`);
	}
}

function assertTenantExportsListResponse(
	value: unknown,
	path = "tenantExportsList",
): asserts value is TenantExportsListResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (!Array.isArray(value.data)) {
		throw new Error(`${path}.data must be an array`);
	}
	for (const [index, item] of (value.data as unknown[]).entries()) {
		assertTenantExportRow(item, `${path}.data[${index}]`);
	}
	if (
		typeof value.total !== "number" ||
		typeof value.limit !== "number" ||
		typeof value.offset !== "number"
	) {
		throw new Error(`${path}: missing total/limit/offset`);
	}
}

export interface UseTenantExportsOptions {
	tenantId: string | null;
	limit?: number;
	offset?: number;
	enabled?: boolean;
}

/**
 * `GET /api/v1/super/tenants/:id/exports` — list export history.
 *
 * Polls every 30s when the cache contains a row whose status is `queued`
 * or `running`, so the UI can transition the badge live without manual
 * refresh. Polling stops automatically once all jobs settle.
 */
export function useTenantExports(options: UseTenantExportsOptions) {
	const { tenantId, limit = 20, offset = 0, enabled = true } = options;
	const qs = new URLSearchParams();
	qs.set("limit", String(limit));
	qs.set("offset", String(offset));
	return useQuery({
		queryKey: ["adminTenantExports", tenantId, limit, offset],
		queryFn: async () => {
			if (!tenantId) throw new Error("tenantId required");
			return apiClient.get<TenantExportsListResponse>(
				`/api/v1/super/tenants/${tenantId}/exports?${qs.toString()}`,
				assertTenantExportsListResponse,
			);
		},
		enabled: enabled && Boolean(tenantId),
		staleTime: 10_000,
		refetchInterval: (query) => {
			const data = query.state.data as TenantExportsListResponse | undefined;
			if (!data) return false;
			const hasActive = data.data.some(
				(row) => row.status === "queued" || row.status === "running",
			);
			return hasActive ? 30_000 : false;
		},
		refetchIntervalInBackground: false,
	});
}
