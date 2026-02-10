"use client";

import { withLocalePath } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
	const router = useRouter();
	const locale = useLocale();
	const { isAuthenticated, isLoading } = useAuthStore();

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			const pathname = window.location.pathname || "/";
			const search = window.location.search || "";
			const returnTo = `${pathname}${search}`;
			router.replace(
				withLocalePath(
					locale,
					`/login?returnTo=${encodeURIComponent(returnTo)}`,
				),
			);
		}
	}, [isLoading, isAuthenticated, locale, router]);

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
