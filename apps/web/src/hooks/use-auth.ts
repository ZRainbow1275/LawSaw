"use client";

import { ApiClientError, apiClient } from "@/lib/api";
import type { User } from "@/lib/api/types";
import { assertAuthResponse, assertUserDetailResponse } from "@/lib/api/types";
import { type Locale, t } from "@/lib/i18n";
import { reportClientError } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useCallback } from "react";

interface LoginCredentials {
	email: string;
	password: string;
}

interface RegisterData {
	email: string;
	password: string;
	display_name?: string;
	tenant_slug?: string;
	tenant_name?: string;
}

function localeFromDocument(): Locale {
	const lang =
		typeof document !== "undefined" ? document.documentElement.lang : "";
	return lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

function authErrorMessage(kind: "login" | "register", error: unknown): string {
	const locale = localeFromDocument();
	const base =
		kind === "login"
			? t(locale, "Sign in failed. Please try again.")
			: t(locale, "Sign up failed. Please try again.");

	if (!(error instanceof ApiClientError)) {
		return error instanceof Error ? error.message : base;
	}

	if (error.status === 0) {
		return t(locale, "Network issue. Please try again later.");
	}

	if (error.status === 429) {
		return t(locale, "Too many requests. Please try again later.");
	}

	if (kind === "login" && error.status === 401) {
		return t(locale, "Incorrect email or password.");
	}

	if (kind === "register" && error.status === 409) {
		return t(locale, "Email is already registered.");
	}

	if (process.env.NODE_ENV !== "production") {
		return error.message || base;
	}

	return base;
}

export function useAuth() {
	const {
		user,
		isAuthenticated,
		isLoading,
		setUser,
		setAuthz,
		setLoading,
		logout: storeLogout,
	} = useAuthStore();

	const shouldReportError = useCallback((error: unknown): boolean => {
		if (!(error instanceof ApiClientError)) return true;
		return error.status === 0 || error.status >= 500;
	}, []);

	const refreshAuthz = useCallback(
		async (nextUser: User | null) => {
			if (!nextUser) {
				setAuthz(null);
				return;
			}

			try {
				const detail = await apiClient.get(
					`/api/v1/users/${nextUser.id}`,
					assertUserDetailResponse,
				);
				setAuthz({ roles: detail.roles, permissions: detail.permissions });
			} catch (err) {
				if (shouldReportError(err)) {
					reportClientError(err, {
						source: "auth.refreshAuthz",
						extra: { userId: nextUser.id },
					});
				}
				setAuthz(null);
			}
		},
		[setAuthz, shouldReportError],
	);

	const refreshSession = useCallback(async () => {
		setLoading(true);
		try {
			const response = await apiClient.get(
				"/api/v1/auth/me",
				assertAuthResponse,
			);
			setUser(response.user);
			await refreshAuthz(response.user);
		} catch (err) {
			if (shouldReportError(err)) {
				reportClientError(err, { source: "auth.refreshSession" });
			}
			setUser(null);
			setAuthz(null);
		}
	}, [setUser, setAuthz, setLoading, refreshAuthz, shouldReportError]);

	const login = useCallback(
		async (credentials: LoginCredentials) => {
			setLoading(true);
			try {
				const response = await apiClient.post(
					"/api/v1/auth/login",
					credentials,
					assertAuthResponse,
				);
				if (
					response.success &&
					response.mfa_required &&
					response.mfa_challenge
				) {
					setLoading(false);
					return {
						success: false as const,
						mfaRequired: true as const,
						mfaChallenge: response.mfa_challenge,
						email: credentials.email,
					};
				}
				if (response.success && response.user) {
					setUser(response.user);
					await refreshAuthz(response.user);
					return { success: true as const };
				}
				return {
					success: false as const,
					error: t(localeFromDocument(), "Sign in failed. Please try again."),
				};
			} catch (error) {
				return {
					success: false as const,
					error: authErrorMessage("login", error),
				};
			} finally {
				setLoading(false);
			}
		},
		[setUser, setLoading, refreshAuthz],
	);

	const verifyMfa = useCallback(
		async (params: { email: string; challenge: string; code: string }) => {
			setLoading(true);
			try {
				const response = await apiClient.post(
					"/api/v1/auth/mfa/verify",
					params,
					assertAuthResponse,
				);
				if (response.success && response.user) {
					setUser(response.user);
					await refreshAuthz(response.user);
					return { success: true as const };
				}
				return {
					success: false as const,
					error: t(localeFromDocument(), "MFA verification failed."),
				};
			} catch (error) {
				return {
					success: false as const,
					error: authErrorMessage("login", error),
				};
			} finally {
				setLoading(false);
			}
		},
		[setUser, setLoading, refreshAuthz],
	);

	const register = useCallback(
		async (data: RegisterData) => {
			setLoading(true);
			try {
				const response = await apiClient.post(
					"/api/v1/auth/register",
					data,
					assertAuthResponse,
				);
				if (response.success && response.user) {
					setUser(response.user);
					await refreshAuthz(response.user);
					return { success: true };
				}
				return {
					success: false,
					error: t(localeFromDocument(), "Sign up failed. Please try again."),
				};
			} catch (error) {
				return { success: false, error: authErrorMessage("register", error) };
			} finally {
				setLoading(false);
			}
		},
		[setUser, setLoading, refreshAuthz],
	);

	const logout = useCallback(async () => {
		try {
			await apiClient.post("/api/v1/auth/logout");
		} catch (err) {
			if (shouldReportError(err)) {
				reportClientError(err, { source: "auth.logout" });
			}
		} finally {
			storeLogout();
		}
	}, [storeLogout, shouldReportError]);

	return {
		user,
		isAuthenticated,
		isLoading,
		refreshSession,
		login,
		verifyMfa,
		register,
		logout,
	};
}
