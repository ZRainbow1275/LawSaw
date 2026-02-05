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
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
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
					title: t(
						localeFromPathname(window.location.pathname || "/"),
						"Copied",
					),
					description: t(
						localeFromPathname(window.location.pathname || "/"),
						"Conflict details copied to clipboard.",
					),
				});
			})
			.catch((err) => {
				reportClientError(err, { source: "conflictModal.copyToClipboard" });
				useToastStore.getState().addToast({
					type: "error",
					title: t(
						localeFromPathname(window.location.pathname || "/"),
						"Copy failed",
					),
					description: t(
						localeFromPathname(window.location.pathname || "/"),
						"Clipboard access is blocked by the browser. Please copy manually.",
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

				// 401 = session expired / unauthenticated: clear local state to avoid a stale UI.
				useAuthStore.getState().logout();

				// Avoid loops/toast noise for login/register routes (401 can be expected there).
				if (
					normalizedPathname === "/login" ||
					normalizedPathname === "/register"
				)
					return;

				useToastStore.getState().addToast({
					type: "warning",
					title: t(locale, "Session expired"),
					description: t(locale, "Please sign in again to continue."),
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
					title: t(locale, "Permission denied"),
					description:
						process.env.NODE_ENV === "production"
							? t(locale, "You don't have permission to access this resource.")
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
					title: t(locale, "Data updated"),
					description:
						process.env.NODE_ENV === "production"
							? t(
									locale,
									"This data was updated elsewhere. Please refresh and try again.",
								)
							: error.message,
					action: {
						label: t(locale, "Resolve"),
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
					title: t(locale, "Refresh required"),
					description:
						process.env.NODE_ENV === "production"
							? t(
									locale,
									"Please refresh and submit again to avoid overwriting other changes.",
								)
							: error.message,
					action: {
						label: t(locale, "Resolve"),
						onClick: () => setConflictInfo(info),
					},
				});
				return;
			}

			// status=0: network error/timeout/cancel. Avoid toast storms; keep it low-noise.
			if (error.status === 0) {
				if (now - lastNetworkErrorAt.current < COOLDOWN_MS) return;
				lastNetworkErrorAt.current = now;

				useToastStore.getState().addToast({
					type: "info",
					title: t(locale, "Network issue"),
					description: t(
						locale,
						"Request did not complete. Check your network and try again.",
					),
				});
			}
		});

		// Clean up legacy persisted user info (PII risk).
		try {
			localStorage.removeItem("law-eye-auth");
		} catch (err) {
			reportClientError(err, { source: "authProvider.localStorageCleanup" });
		}

		// PWA: register Service Worker (production-only to avoid dev cache interference).
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

	const pathname =
		typeof window !== "undefined" ? window.location.pathname : "/";
	const locale = localeFromPathname(pathname);

	return (
		<>
			{children}
			<Modal isOpen={!!conflictInfo} onClose={closeConflictModal} size="lg">
				<ModalHeader>
					<h2 className="text-lg font-semibold text-neutral-900">
						{t(locale, "Concurrency conflict detected")}
					</h2>
					<p className="mt-1 text-sm text-neutral-600">
						{t(
							locale,
							"This data was updated elsewhere. Refresh and submit again, or view details to choose how to proceed.",
						)}
					</p>
				</ModalHeader>
				<ModalBody>
					{conflictInfo ? (
						<div className="space-y-3">
							<div className="rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-neutral-800">
								<div className="font-medium">{t(locale, "Conflict info")}</div>
								<div className="mt-2 text-neutral-700 whitespace-pre-wrap break-words">
									{conflictInfo.message}
								</div>
								{conflictInfo.requestId && (
									<div className="mt-2 text-xs text-neutral-500">
										{t(locale, "Error ID")}:{" "}
										<span className="font-mono">{conflictInfo.requestId}</span>
									</div>
								)}
							</div>

							{process.env.NODE_ENV !== "production" && (
								<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
									<div className="text-xs font-medium text-neutral-500">
										{t(locale, "Debug details")}
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
							{t(locale, "Copy details")}
						</Button>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" onClick={hardRefreshForConflict}>
							{t(locale, "Hard refresh")}
						</Button>
						<Button onClick={softRefreshForConflict}>
							{t(locale, "Refresh data")}
						</Button>
					</div>
				</ModalFooter>
			</Modal>
		</>
	);
}
