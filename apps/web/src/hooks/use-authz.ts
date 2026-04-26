"use client";

import { apiClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface AuthzDecisionRecord {
	allow: boolean;
	decision_path?: string[];
	role_tier?: string | null;
	matched_relation?: string | null;
	matched_subject?: string | null;
	roles?: string[];
	permissions?: string[];
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function assertAuthzDecisionRecord(value: unknown): asserts value is AuthzDecisionRecord {
	if (typeof value !== "object" || value === null || typeof (value as { allow?: unknown }).allow !== "boolean") {
		throw new Error("Invalid authz decision response");
	}

	const candidate = value as Record<string, unknown>;
	if (candidate.decision_path != null && !isStringArray(candidate.decision_path)) {
		throw new Error("Invalid authz decision path");
	}
	if (candidate.roles != null && !isStringArray(candidate.roles)) {
		throw new Error("Invalid authz decision roles");
	}
	if (candidate.permissions != null && !isStringArray(candidate.permissions)) {
		throw new Error("Invalid authz decision permissions");
	}
}

export function useAuthzDecision(resourceType: string, resourceId: string | null, permission: string) {
	return useQuery({
		queryKey: ["authzDecision", resourceType, resourceId, permission],
		queryFn: () =>
			apiClient.get<AuthzDecisionRecord>(
				`/api/v1/authz/check?resource_type=${encodeURIComponent(resourceType)}&resource_id=${encodeURIComponent(resourceId ?? "")}&permission=${encodeURIComponent(permission)}`,
				assertAuthzDecisionRecord,
			),
		enabled: Boolean(resourceId),
		staleTime: 15_000,
	});
}
