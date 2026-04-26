"use client";

import { apiClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/** AI gateway health buckets returned by the backend. */
export type AiGatewayStatus = "healthy" | "degraded" | "down";

/**
 * Aggregated KPI payload from `/api/v1/admin/dashboard/summary`.
 *
 * Mirrors `crates/law-eye-api/src/routes/admin_dashboard.rs::AdminDashboardSummary`.
 */
export interface AdminDashboardSummary {
	active_users_24h: number;
	articles_ingested_24h: number;
	articles_total: number;
	ai_tokens_24h: number;
	ai_calls_24h: number;
	feedbacks_pending: number;
	feedbacks_total: number;
	ai_gateway_status: AiGatewayStatus;
	last_updated_at: string;
}

const AI_GATEWAY_STATUSES = new Set<AiGatewayStatus>([
	"healthy",
	"degraded",
	"down",
]);

function assertAdminDashboardSummary(
	value: unknown,
	path = "adminDashboardSummary",
): asserts value is AdminDashboardSummary {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${path}: expected object`);
	}
	const obj = value as Record<string, unknown>;

	const numericFields: ReadonlyArray<keyof AdminDashboardSummary> = [
		"active_users_24h",
		"articles_ingested_24h",
		"articles_total",
		"ai_tokens_24h",
		"ai_calls_24h",
		"feedbacks_pending",
		"feedbacks_total",
	];
	for (const field of numericFields) {
		const candidate = obj[field];
		if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
			throw new Error(`${path}.${String(field)}: expected finite number`);
		}
	}

	const status = obj.ai_gateway_status;
	if (
		typeof status !== "string" ||
		!AI_GATEWAY_STATUSES.has(status as AiGatewayStatus)
	) {
		throw new Error(`${path}.ai_gateway_status: expected healthy|degraded|down`);
	}

	const lastUpdated = obj.last_updated_at;
	if (typeof lastUpdated !== "string") {
		throw new Error(`${path}.last_updated_at: expected ISO timestamp string`);
	}
}

/**
 * React Query wrapper around `/api/v1/admin/dashboard/summary`.
 *
 * The dashboard strip is admin-only and refreshes every 60s so KPIs do not
 * become stale. We deliberately avoid a longer cache: 5-minute staleness
 * would visibly desync the "active users 24h" counter from reality during
 * incident response.
 */
export function useAdminDashboardSummary(options: { enabled?: boolean } = {}) {
	const { enabled = true } = options;
	return useQuery({
		queryKey: ["admin-dashboard", "summary"],
		queryFn: () =>
			apiClient.get<AdminDashboardSummary>(
				"/api/v1/admin/dashboard/summary",
				assertAdminDashboardSummary,
			),
		enabled,
		staleTime: 60_000,
		refetchInterval: 60_000,
		refetchOnWindowFocus: true,
	});
}
