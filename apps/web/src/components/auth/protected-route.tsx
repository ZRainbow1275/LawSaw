"use client";

import { useAuth } from "@/hooks/use-auth";
import { type RoleTier, isRoleTierAtLeast } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ProtectedRouteProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
	/**
	 * Minimum role tier required to render `children`. When set, users whose
	 * effective tier is below the requirement are redirected to `/admin`
	 * (which itself renders the standard "Access restricted" empty-state
	 * shell). Defaults to no minimum, matching legacy behavior.
	 */
	requiredRole?: RoleTier;
}

export function ProtectedRoute({
	children,
	fallback,
	requiredRole,
}: ProtectedRouteProps) {
	const router = useRouter();
	const locale = useLocale();
	const { refreshSession } = useAuth();
	const { isAuthenticated, isLoading, roleTier, roles } = useAuthStore();
	const requestedSessionCheckRef = useRef(false);
	const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);

	useEffect(() => {
		if (isAuthenticated || !isLoading) {
			setBootstrapTimedOut(false);
			return;
		}

		const timer = window.setTimeout(() => {
			setBootstrapTimedOut(true);
		}, 12_000);

		return () => {
			window.clearTimeout(timer);
		};
	}, [isAuthenticated, isLoading]);

	useEffect(() => {
		if (isAuthenticated) {
			requestedSessionCheckRef.current = false;
			return;
		}

		if (isLoading && !bootstrapTimedOut) return;

		// Step 1: for unauthenticated users, probe session once to recover from
		// in-memory auth resets on reload/navigation.
		if (!requestedSessionCheckRef.current) {
			requestedSessionCheckRef.current = true;
			void refreshSession();
			return;
		}

		// Step 2: probe completed (or bootstrap timed out) and still unauthenticated -> redirect.
		const pathname = window.location.pathname || "/";
		const search = window.location.search || "";
		const returnTo = `${pathname}${search}`;
		router.replace(
			withLocalePath(locale, `/login?returnTo=${encodeURIComponent(returnTo)}`),
		);
	}, [
		isLoading,
		isAuthenticated,
		bootstrapTimedOut,
		locale,
		router,
		refreshSession,
	]);

	const tierSatisfied =
		!requiredRole ||
		isRoleTierAtLeast(roleTier ?? null, requiredRole) ||
		(requiredRole === "super_admin" && roles.includes("super_admin"));

	useEffect(() => {
		if (!isAuthenticated) return;
		if (tierSatisfied) return;
		router.replace(withLocalePath(locale, "/admin"));
	}, [isAuthenticated, tierSatisfied, locale, router]);

	if (isLoading && !bootstrapTimedOut) {
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

	if (!tierSatisfied) {
		// Tier mismatch — `useEffect` above redirects to /admin; render the
		// spinner in the meantime to avoid flashing protected content.
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
