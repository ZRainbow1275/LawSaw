"use client";

import { apiClient } from "@/lib/api";
import { assertAuthResponse, assertUserDetailResponse } from "@/lib/api/types";
import { useAuthStore } from "@/stores/auth-store";
import { type ReactNode, useEffect } from "react";

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	const { setUser, setAuthz, setLoading } = useAuthStore();

	useEffect(() => {
		// 清理历史版本遗留的本地持久化用户信息（PII 风险）。
		try {
			localStorage.removeItem("law-eye-auth");
		} catch {
			// ignore
		}

		// PWA：注册 Service Worker（仅生产环境，避免 dev 下缓存干扰）。
		if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
			navigator.serviceWorker.register("/sw", { scope: "/" }).catch(() => {
				// ignore
			});
		}

		const checkSession = async () => {
			setLoading(true);
			try {
				const response = await apiClient.get("/api/v1/auth/me", assertAuthResponse);
				setUser(response.user);

				if (response.user) {
					try {
						const detail = await apiClient.get(
							`/api/v1/users/${response.user.id}`,
							assertUserDetailResponse,
						);
						setAuthz({ roles: detail.roles, permissions: detail.permissions });
					} catch {
						setAuthz(null);
					}
				} else {
					setAuthz(null);
				}
			} catch {
				setUser(null);
				setAuthz(null);
			}
		};

		checkSession();
	}, [setUser, setAuthz, setLoading]);

	return <>{children}</>;
}
