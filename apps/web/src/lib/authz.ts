export type RoleTier =
	| "basic_user"
	| "verified_user"
	| "premium_user"
	| "tenant_admin"
	| "super_admin";

const ROLE_TIER_ORDER: readonly RoleTier[] = [
	"basic_user",
	"verified_user",
	"premium_user",
	"tenant_admin",
	"super_admin",
];

/**
 * Tiers that map to the admin workspace (`/admin`).
 * Anyone outside this set is dispatched to the user workspace (`/me/feed`).
 */
export const ADMIN_TIERS: readonly RoleTier[] = ["tenant_admin", "super_admin"];

export function isAdminTier(roleTier: RoleTier): boolean {
	return ADMIN_TIERS.includes(roleTier);
}

const DISPLAY_NAME_ROLE_TIER_PATTERN =
	/^(?<name>.+?)\s+(?<roleTier>basic_user|verified_user|premium_user|tenant_admin|super_admin)$/u;

export function normalizeRoleTier(
	roleTier: string | null | undefined,
): RoleTier {
	if (roleTier && ROLE_TIER_ORDER.includes(roleTier as RoleTier)) {
		return roleTier as RoleTier;
	}

	return "basic_user";
}

export function roleTierLabelKey(roleTier: RoleTier): string {
	switch (roleTier) {
		case "super_admin":
			return "Super admin";
		case "tenant_admin":
			return "Tenant admin";
		case "premium_user":
			return "Premium user";
		case "verified_user":
			return "Verified user";
		case "basic_user":
			return "Basic user";
	}
}

export function splitDisplayNameRoleTier(
	displayName: string | null | undefined,
): {
	baseName: string;
	roleTier: RoleTier | null;
} {
	const trimmedDisplayName = displayName?.trim() ?? "";
	if (!trimmedDisplayName) {
		return { baseName: "", roleTier: null };
	}

	if (ROLE_TIER_ORDER.includes(trimmedDisplayName as RoleTier)) {
		return { baseName: "", roleTier: trimmedDisplayName as RoleTier };
	}

	const matchedSuffix = DISPLAY_NAME_ROLE_TIER_PATTERN.exec(trimmedDisplayName);
	if (!matchedSuffix?.groups?.roleTier) {
		return { baseName: trimmedDisplayName, roleTier: null };
	}

	return {
		baseName: matchedSuffix.groups.name?.trim() ?? "",
		roleTier: matchedSuffix.groups.roleTier as RoleTier,
	};
}

/**
 * Derives the highest effective role tier from backend role names.
 *
 * Backend user-detail responses return role names rather than a denormalized
 * `role_tier` field. Keeping this derivation in the shared authz module makes
 * SSR guards, client guards, and admin user tables agree on the same ladder.
 */
export function deriveRoleTierFromRoles(
	roleNames: readonly string[],
	displayName: string | null | undefined = null,
): RoleTier {
	if (roleNames.includes("super_admin")) return "super_admin";
	if (roleNames.some((role) => role === "tenant_admin" || role === "admin")) {
		return "tenant_admin";
	}
	if (roleNames.includes("premium_user")) return "premium_user";
	if (roleNames.some((role) => role === "verified_user" || role === "editor")) {
		return "verified_user";
	}

	const { roleTier } = splitDisplayNameRoleTier(displayName);
	return normalizeRoleTier(roleTier ?? "basic_user");
}

export function hasPermission(
	permissions: readonly string[] | null | undefined,
	permission: string,
): boolean {
	if (!permissions || permissions.length === 0) {
		return false;
	}

	return permissions.includes("*") || permissions.includes(permission);
}

export function isRoleTierAtLeast(
	roleTier: string | null | undefined,
	minimumTier: RoleTier,
): boolean {
	return (
		ROLE_TIER_ORDER.indexOf(normalizeRoleTier(roleTier)) >=
		ROLE_TIER_ORDER.indexOf(minimumTier)
	);
}
