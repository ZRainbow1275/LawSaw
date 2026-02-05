"use client";

import { useAuth } from "@/hooks/use-auth";
import { ApiClientError, apiClient } from "@/lib/api";
import {
	localeFromPathname,
	stripLocalePrefix,
	t,
	withLocalePath,
} from "@/lib/i18n";
import { reportClientError } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "../ui/modal";

interface AuthProviderProps {
	children: ReactNode;
}

type ConflictInfo = {
	status: number;
	message: string;
	endpoint: string;
	requestId: string | null;
	code: string | null;
	details: unknown | null;
	occurredAt: number;
};

export function AuthProvider({ children }: AuthProviderProps) {
	const { refreshSession } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
	const lastUnauthorizedAt = useRef(0);
	const lastForbiddenAt = useRef(0);
	const lastConflictAt = useRef(0);
	const lastNetworkErrorAt = useRef(0);

	const closeConflictModal = useCallback(() => {
		setConflictInfo(null);
	}, []);

	const softRefreshForConflict = useCallback(() => {
		queryClient.invalidateQueries();
		router.refresh();
		setConflictInfo(null);
	}, [queryClient, router]);

	const hardRefreshForConflict = useCallback(() => {
		setConflictInfo(null);
		window.location.reload();
	}, []);

	const copyConflictDetails = useCallback(() => {
		if (!conflictInfo) return;
		const payload = JSON.stringify(conflictInfo, null, 2);
		navigator.clipboard
			.writeText(payload)
			.then(() => {
				useToastStore.getState().addToast({
					type: "success",
					title: t(localeFromPathname(window.location.pathname || "/"), "已复制"),
					description: t(
						localeFromPathname(window.location.pathname || "/"),
						"冲突详情已复制到剪贴板",
					),
				});
			})
			.catch((err) => {
				reportClientError(err, { source: "conflictModal.copyToClipboard" });
				useToastStore.getState().addToast({
					type: "error",
					title: t(localeFromPathname(window.location.pathname || "/"), "复制失败"),
					description: t(
						localeFromPathname(window.location.pathname || "/"),
						"浏览器禁止访问剪贴板，请手动复制",
					),
				});
			});
	}, [conflictInfo]);

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
			const locale = localeFromPathname(pathname);
			const normalizedPathname = stripLocalePrefix(pathname);
			const search = window.location.search || "";
			const returnTo = `${pathname}${search}`;

			if (error.status === 0 || error.status >= 500) {
				reportClientError(error, {
					source: "apiClient",
					extra: {
						endpoint: error.endpoint,
						status: error.status,
						requestId: error.requestId,
						cause: (error as { cause?: unknown }).cause,
					},
				});
			}

			if (error.status === 401) {
				if (now - lastUnauthorizedAt.current < COOLDOWN_MS) return;
				lastUnauthorizedAt.current = now;

				// 401 = 会话失效/未登录：统一清理本地状态，避免 UI “假登录”。
				useAuthStore.getState().logout();

				// 登录/注册页的 401 可能来自“密码错误/未登录”等正常场景，避免循环跳转与 toast 干扰。
				if (
					normalizedPathname === "/login" ||
					normalizedPathname === "/register"
				)
					return;

				useToastStore.getState().addToast({
					type: "warning",
					title: t(locale, "登录已过期"),
					description: t(locale, "请重新登录后继续操作"),
				});

				router.replace(
					withLocalePath(
						locale,
						`/login?returnTo=${encodeURIComponent(returnTo)}`,
					),
				);
				return;
			}

			if (error.status === 403) {
				if (now - lastForbiddenAt.current < COOLDOWN_MS) return;
				lastForbiddenAt.current = now;

				useToastStore.getState().addToast({
					type: "warning",
					title: t(locale, "权限不足"),
					description:
						process.env.NODE_ENV === "production"
							? t(locale, "您没有访问该资源的权限")
							: error.message,
				});
				return;
			}

			if (error.status === 409) {
				if (now - lastConflictAt.current < COOLDOWN_MS) return;
				lastConflictAt.current = now;

				const info: ConflictInfo = {
					status: error.status,
					message: error.message,
					endpoint: error.endpoint,
					requestId: error.requestId,
					code: error.code,
					details: error.details,
					occurredAt: now,
				};
				setConflictInfo(info);

				useToastStore.getState().addToast({
					type: "warning",
					title: t(locale, "数据已更新"),
					description:
						process.env.NODE_ENV === "production"
							? t(locale, "该数据已被其他操作更新，请刷新后重试")
							: error.message,
					action: {
						label: t(locale, "处理冲突"),
						onClick: () => setConflictInfo(info),
					},
				});
				return;
			}

			if (error.status === 428 || error.status === 412) {
				if (now - lastConflictAt.current < COOLDOWN_MS) return;
				lastConflictAt.current = now;

				const info: ConflictInfo = {
					status: error.status,
					message: error.message,
					endpoint: error.endpoint,
					requestId: error.requestId,
					code: error.code,
					details: error.details,
					occurredAt: now,
				};
				setConflictInfo(info);
				useToastStore.getState().addToast({
					type: "warning",
					title: t(locale, "需要刷新数据"),
					description:
						process.env.NODE_ENV === "production"
							? t(locale, "请刷新后重新提交，以避免覆盖其他更改")
							: error.message,
					action: {
						label: t(locale, "处理冲突"),
						onClick: () => setConflictInfo(info),
					},
				});
				return;
			}

			// status=0: 网络错误/超时/取消。避免 toast 风暴：仅作为轻提示。
			if (error.status === 0) {
				if (now - lastNetworkErrorAt.current < COOLDOWN_MS) return;
				lastNetworkErrorAt.current = now;

				useToastStore.getState().addToast({
					type: "info",
					title: t(locale, "网络异常"),
					description: t(locale, "请求未完成，请检查网络或稍后重试"),
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

	const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
	const locale = localeFromPathname(pathname);

	return (
		<>
			{children}
			<Modal isOpen={!!conflictInfo} onClose={closeConflictModal} size="lg">
				<ModalHeader>
					<h2 className="text-lg font-semibold text-neutral-900">
						{t(locale, "检测到并发冲突")}
					</h2>
					<p className="mt-1 text-sm text-neutral-600">
						{t(locale, "该数据已被其他操作更新。请刷新后重新提交，或查看详情后选择处理方式。")}
					</p>
				</ModalHeader>
				<ModalBody>
					{conflictInfo ? (
						<div className="space-y-3">
							<div className="rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-neutral-800">
								<div className="font-medium">{t(locale, "冲突信息")}</div>
								<div className="mt-2 text-neutral-700 whitespace-pre-wrap break-words">
									{conflictInfo.message}
								</div>
								{conflictInfo.requestId && (
									<div className="mt-2 text-xs text-neutral-500">
										{t(locale, "错误标识")}:{" "}
										<span className="font-mono">{conflictInfo.requestId}</span>
									</div>
								)}
							</div>

							{process.env.NODE_ENV !== "production" && (
								<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
									<div className="text-xs font-medium text-neutral-500">
										{t(locale, "调试详情")}
									</div>
									<pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs text-neutral-700">
										{JSON.stringify(conflictInfo, null, 2)}
									</pre>
								</div>
							)}
						</div>
					) : null}
				</ModalBody>
				<ModalFooter className="justify-between">
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={copyConflictDetails}>
							{t(locale, "复制详情")}
						</Button>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={hardRefreshForConflict}>
							{t(locale, "强制刷新页面")}
						</Button>
						<Button onClick={softRefreshForConflict}>
							{t(locale, "刷新数据")}
						</Button>
					</div>
				</ModalFooter>
			</Modal>
		</>
	);
}
