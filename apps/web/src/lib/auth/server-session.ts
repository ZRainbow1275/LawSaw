import "server-only";

import { cache } from "react";
import { type RoleTier } from "@/lib/authz";
import { fetchSession, type ServerSession } from "@/lib/auth/server";

/**
 * SSR session DTO consumed by Server Components for routing decisions.
 *
 * Mirrors the canonical fields exposed by `/api/v1/auth/me` + `/api/v1/users/{id}`.
 * Returned values are normalized: `role_tier` is always a valid `RoleTier`,
 * never an unrecognized backend string.
 */
export interface SessionDto {
	id: string;
	email: string;
	tenant_id: string;
	role_names: readonly string[];
	role_tier: RoleTier;
	locale: string | null;
}

function toSessionDto(session: ServerSession): SessionDto {
	return {
		id: session.user.id,
		email: session.user.email,
		tenant_id: session.user.tenant_id,
		role_names: session.roles,
		role_tier: session.roleTier,
		locale: null,
	};
}

/**
 * Fetches the current user's session for SSR.
 *
 * - Reads the auth cookie via `cookies()` and forwards it to the internal API.
 * - Returns `null` for unauthenticated, expired, or failed lookups (never throws).
 * - Wrapped in React `cache()` so that multiple Server Components in the same
 *   request share a single API call (deduplicated within one render).
 */
export const getServerSession = cache(
	async (): Promise<SessionDto | null> => {
		const session = await fetchSession();
		if (!session) return null;
		return toSessionDto(session);
	},
);
