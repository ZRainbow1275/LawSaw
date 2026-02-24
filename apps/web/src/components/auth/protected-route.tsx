"use client";

import { useAuth } from "@/hooks/use-auth";
import { withLocalePath } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface ProtectedRouteProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
	const router = useRouter();
	const locale = useLocale();
	const { refreshSession } = useAuth();
	const { isAuthenticated, isLoading } = useAuthStore();
	const requestedSessionCheckRef = useRef(false);

	useEffect(() => {
		if (isAuthenticated) {
			requestedSessionCheckRef.current = false;
			return;
		}

		if (isLoading) return;

		// Step 1: for unauthenticated users, probe session once to recover from
		// in-memory auth resets on reload/navigation.
		if (!requestedSessionCheckRef.current) {
			requestedSessionCheckRef.current = true;
			void refreshSession();
			return;
		}

		// Step 2: probe completed and still unauthenticated -> redirect.
		const pathname = window.location.pathname || "/";
		const search = window.location.search || "";
		const returnTo = `${pathname}${search}`;
		router.replace(
			withLocalePath(locale, `/login?returnTo=${encodeURIComponent(returnTo)}`),
		);
	}, [isLoading, isAuthenticated, locale, router, refreshSession]);

	if (isLoading) {
		return (
			fallback ?? (
				<div className="flex min-h-screen items-center justify-center">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
				</div>
			)
		);
	}

	if (!isAuthenticated) {
		// 正在跳转到登录页，保持 spinner 避免白屏闪烁
		return (
			fallback ?? (
				<div className="flex min-h-screen items-center justify-center">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
				</div>
			)
		);
	}

	return <>{children}</>;
}
