"use client";

import { apiClient } from "@/lib/api";
import type { AuthResponse } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";
import { type ReactNode, useEffect } from "react";

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	const { setUser, setLoading } = useAuthStore();

	useEffect(() => {
		// 清理历史版本遗留的本地持久化用户信息（PII 风险）。
		try {
			localStorage.removeItem("law-eye-auth");
		} catch {
			// ignore
		}

		const checkSession = async () => {
			setLoading(true);
			try {
				const response = await apiClient.get<AuthResponse>("/api/v1/auth/me");
				setUser(response.user);
			} catch {
				setUser(null);
			}
		};

		checkSession();
	}, [setUser, setLoading]);

	return <>{children}</>;
}
