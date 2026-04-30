"use client";

import { type RoleTier, isRoleTierAtLeast } from "@/lib/authz";
import { useAuthStore } from "@/stores/auth-store";
import type { ReactNode } from "react";

interface RoleTierGuardProps {
	minTier: RoleTier;
	fallback?: ReactNode;
	children: ReactNode;
}

/**
 * Pure decision helper exported for unit tests. Returns true when the supplied
 * auth snapshot satisfies `minTier`. Logged-out callers always fail.
 */
export function isRoleTierAuthorized(
	auth: {
		isAuthenticated: boolean;
		roleTier: string | null;
		roles: readonly string[];
	},
	minTier: RoleTier,
): boolean {
	if (!auth.isAuthenticated) return false;
	if (isRoleTierAtLeast(auth.roleTier, minTier)) return true;
	return minTier === "super_admin" && auth.roles.includes("super_admin");
}

export function RoleTierGuard({
	minTier,
	fallback = null,
	children,
}: RoleTierGuardProps) {
	const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
	const roleTier = useAuthStore((state) => state.roleTier);
	const roles = useAuthStore((state) => state.roles);

	const satisfied = isRoleTierAuthorized(
		{ isAuthenticated, roleTier, roles },
		minTier,
	);

	return <>{satisfied ? children : fallback}</>;
}
