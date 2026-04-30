"use client";

import { hasPermission } from "@/lib/authz";
import { useAuthStore } from "@/stores/auth-store";
import type { ReactNode } from "react";

type PermissionInput = string | readonly string[];

interface PermissionGuardProps {
	permission: PermissionInput;
	/**
	 * When `permission` is an array, default behavior requires ANY one to match.
	 * Set `mode="all"` to require every listed permission.
	 */
	mode?: "any" | "all";
	fallback?: ReactNode;
	children: ReactNode;
}

/**
 * Pure decision helper exported for unit tests. Returns true when the supplied
 * auth snapshot is allowed to view the gated slot.
 */
export function isPermissionAuthorized(
	auth: { isAuthenticated: boolean; permissions: readonly string[] },
	permission: PermissionInput,
	mode: "any" | "all" = "any",
): boolean {
	if (!auth.isAuthenticated) return false;
	const required = Array.isArray(permission) ? permission : [permission];
	if (required.length === 0) return false;
	return mode === "all"
		? required.every((p) => hasPermission(auth.permissions, p))
		: required.some((p) => hasPermission(auth.permissions, p));
}

export function PermissionGuard({
	permission,
	mode = "any",
	fallback = null,
	children,
}: PermissionGuardProps) {
	const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
	const permissions = useAuthStore((state) => state.permissions);

	const allowed = isPermissionAuthorized(
		{ isAuthenticated, permissions },
		permission,
		mode,
	);

	return <>{allowed ? children : fallback}</>;
}
