"use client";

import { useAuth } from "@/hooks/use-auth";
import { type ReactNode, useEffect } from "react";

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	const { refreshSession } = useAuth();

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

		refreshSession();
	}, [refreshSession]);

	return <>{children}</>;
}
