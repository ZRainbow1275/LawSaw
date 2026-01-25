"use client";

import { apiClient } from "@/lib/api";
import { assertAuthResponse } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";
import { useCallback, useEffect } from "react";

interface LoginCredentials {
	email: string;
	password: string;
}

interface RegisterData {
	email: string;
	password: string;
	display_name?: string;
}

export function useAuth() {
	const {
		user,
		isAuthenticated,
		isLoading,
		setUser,
		setLoading,
		logout: storeLogout,
	} = useAuthStore();

	useEffect(() => {
		const checkSession = async () => {
			try {
				const response = await apiClient.get("/api/v1/auth/me", assertAuthResponse);
				setUser(response.user);
			} catch {
				setUser(null);
			}
		};

		checkSession();
	}, [setUser]);

	const login = useCallback(
		async (credentials: LoginCredentials) => {
			setLoading(true);
			try {
				const response = await apiClient.post(
					"/api/v1/auth/login",
					credentials,
					assertAuthResponse,
				);
				if (response.success && response.user) {
					setUser(response.user);
					return { success: true };
				}
				return { success: false, error: response.message };
			} catch (error) {
				const message = error instanceof Error ? error.message : "登录失败";
				return { success: false, error: message };
			} finally {
				setLoading(false);
			}
		},
		[setUser, setLoading],
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
					return { success: true };
				}
				return { success: false, error: response.message };
			} catch (error) {
				const message = error instanceof Error ? error.message : "注册失败";
				return { success: false, error: message };
			} finally {
				setLoading(false);
			}
		},
		[setUser, setLoading],
	);

	const logout = useCallback(async () => {
		try {
			await apiClient.post("/api/v1/auth/logout");
		} catch {
			// Ignore logout errors
		} finally {
			storeLogout();
		}
	}, [storeLogout]);

	return {
		user,
		isAuthenticated,
		isLoading,
		login,
		register,
		logout,
	};
}
