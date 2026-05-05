import "server-only";

import type { AuthResponse, User, UserDetailResponse } from "@/lib/api/types";
import { assertAuthResponse, assertUserDetailResponse } from "@/lib/api/types";
import { type RoleTier, deriveRoleTierFromRoles } from "@/lib/authz";
import { cookies, headers } from "next/headers";

export interface ServerSession {
	user: User;
	roles: string[];
	permissions: string[];
	roleTier: RoleTier;
}

const SESSION_COOKIE_NAME = "id";
const DEFAULT_TIMEOUT_MS = 5_000;

function resolveInternalApiBaseUrl(): string {
	const proxyTarget =
		process.env.LAW_EYE_API_PROXY_TARGET ??
		process.env.NEXT_PUBLIC_API_URL ??
		"";
	const trimmed = proxyTarget.trim();
	if (!trimmed) return "http://127.0.0.1:3001";
	return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

async function buildForwardedCookieHeader(): Promise<string | null> {
	const cookieStore = await cookies();
	const session = cookieStore.get(SESSION_COOKIE_NAME);
	if (!session) return null;
	return `${session.name}=${session.value}`;
}

async function buildForwardHeaders(): Promise<HeadersInit | null> {
	const cookieHeader = await buildForwardedCookieHeader();
	if (!cookieHeader) return null;
	const headerStore = await headers();
	const forwarded: HeadersInit = {
		Accept: "application/json",
		Cookie: cookieHeader,
	};
	const requestId = headerStore.get("x-request-id");
	if (requestId) {
		(forwarded as Record<string, string>)["x-request-id"] = requestId;
	}
	return forwarded;
}

async function fetchJson<T>(
	endpoint: string,
	validate: (value: unknown, path?: string) => asserts value is T,
): Promise<T | null> {
	const headersInit = await buildForwardHeaders();
	if (!headersInit) return null;
	const url = `${resolveInternalApiBaseUrl()}${endpoint}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: headersInit,
			cache: "no-store",
			signal: controller.signal,
		});
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}

	if (response.status === 401 || response.status === 403) return null;
	if (!response.ok) return null;

	let parsed: unknown;
	try {
		parsed = await response.json();
	} catch {
		return null;
	}

	try {
		validate(parsed);
	} catch {
		return null;
	}
	return parsed;
}

export async function fetchSession(): Promise<ServerSession | null> {
	const auth = await fetchJson<AuthResponse>(
		"/api/v1/auth/me",
		assertAuthResponse,
	);
	if (!auth?.user) return null;

	const detail = await fetchJson<UserDetailResponse>(
		`/api/v1/users/${auth.user.id}`,
		assertUserDetailResponse,
	);

	const roles = detail?.roles ?? [];
	const permissions = detail?.permissions ?? [];
	return {
		user: auth.user,
		roles,
		permissions,
		roleTier: deriveRoleTierFromRoles(roles, auth.user.display_name ?? null),
	};
}

export function isAdminTier(roleTier: RoleTier): boolean {
	return roleTier === "tenant_admin" || roleTier === "super_admin";
}
