"use client";

import { useAuth } from "@/hooks/use-auth";
import { ApiClientError, apiClient } from "@/lib/api";
import { reportClientError } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	const { refreshSession } = useAuth();
	const router = useRouter();
	const lastUnauthorizedAt = useRef(0);
	const lastForbiddenAt = useRef(0);
	const lastNetworkErrorAt = useRef(0);

	useEffect(() => {
		const COOLDOWN_MS = 3000;

		const onError = (event: ErrorEvent) => {
			reportClientError(event.error ?? event.message, {
				source: "window.error",
				extra: {
					filename: event.filename,
					lineno: event.lineno,
					colno: event.colno,
				},
			});
		};

		const onUnhandledRejection = (event: PromiseRejectionEvent) => {
			reportClientError(event.reason, { source: "window.unhandledrejection" });
		};

		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onUnhandledRejection);

		apiClient.setErrorHandler((error) => {
			if (!(error instanceof ApiClientError)) return;

			const now = Date.now();
			const pathname = window.location.pathname || "/";
			const search = window.location.search || "";
			const returnTo = `${pathname}${search}`;

			if (error.status === 0 || error.status >= 500) {
				reportClientError(error, {
					source: "apiClient",
					extra: {
						endpoint: error.endpoint,
						status: error.status,
						requestId: error.requestId,
					},
				});
			}

			if (error.status === 401) {
				if (now - lastUnauthorizedAt.current < COOLDOWN_MS) return;
				lastUnauthorizedAt.current = now;

				// 401 = 会话失效/未登录：统一清理本地状态，避免 UI “假登录”。
				useAuthStore.getState().logout();

				// 登录/注册页的 401 可能来自“密码错误/未登录”等正常场景，避免循环跳转与 toast 干扰。
				if (pathname === "/login" || pathname === "/register") return;

				useToastStore.getState().addToast({
					type: "warning",
					title: "登录已过期",
					description: "请重新登录后继续操作",
				});

				router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
				return;
			}

			if (error.status === 403) {
				if (now - lastForbiddenAt.current < COOLDOWN_MS) return;
				lastForbiddenAt.current = now;

				useToastStore.getState().addToast({
					type: "warning",
					title: "权限不足",
					description:
						process.env.NODE_ENV === "production"
							? "您没有访问该资源的权限"
							: error.message,
				});
				return;
			}

			// status=0: 网络错误/超时/取消。避免 toast 风暴：仅作为轻提示。
			if (error.status === 0) {
				if (now - lastNetworkErrorAt.current < COOLDOWN_MS) return;
				lastNetworkErrorAt.current = now;

				useToastStore.getState().addToast({
					type: "info",
					title: "网络异常",
					description: "请求未完成，请检查网络或稍后重试",
				});
			}
		});

		// 清理历史版本遗留的本地持久化用户信息（PII 风险）。
		try {
			localStorage.removeItem("law-eye-auth");
		} catch (err) {
			reportClientError(err, { source: "authProvider.localStorageCleanup" });
		}

		// PWA：注册 Service Worker（仅生产环境，避免 dev 下缓存干扰）。
		if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
			navigator.serviceWorker.register("/sw", { scope: "/" }).catch((err) => {
				reportClientError(err, { source: "pwa.serviceWorkerRegister" });
			});
		}

		refreshSession();
		return () => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onUnhandledRejection);
			apiClient.setErrorHandler(null);
		};
	}, [refreshSession, router]);

	return <>{children}</>;
}
