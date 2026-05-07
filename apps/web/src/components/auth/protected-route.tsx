"use client";

import { useAuth } from "@/hooks/use-auth";
import {
	type RoleTier,
	isRoleTierAtLeast,
	roleTierLabelKey,
} from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "../ui/empty-state";

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

	// Bootstrap: only render the bootstrap spinner during the initial
	// unauthenticated load. Once `isAuthenticated` is true, subsequent
	// `isLoading` flips come from background `refreshSession()` calls (e.g.
	// AuthProvider's per-pathname session probe). Replacing `children` with the
	// spinner in that case would unmount the persistent shell (Sidebar/Header)
	// on every SPA navigation, which is exactly what we want to avoid.
	if (isLoading && !bootstrapTimedOut && !isAuthenticated) {
		return <>{fallback ?? <BootstrapSpinner />}</>;
	}

	if (!isAuthenticated) {
		// Redirect already scheduled by the effect above; render a labeled
		// "redirecting to login" placeholder until navigation lands.
		return <>{fallback ?? <RedirectingToLogin />}</>;
	}

	if (!tierSatisfied) {
		// Tier mismatch — `useEffect` above redirects to /admin; render a
		// semantic empty-state in the meantime instead of a faceless spinner.
		return (
			<>{fallback ?? <InsufficientTierEmpty tier={requiredRole ?? "basic_user"} />}</>
		);
	}

	return <>{children}</>;
}

// ============================================
// Internal fallback views (not exported)
// ============================================

function BootstrapSpinner() {
	const t = useT();
	const label = t("Loading session");
	return (
		<div
			role="status"
			aria-label={label}
			aria-live="polite"
			className="flex min-h-screen items-center justify-center"
		>
			<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
			<span className="sr-only">{label}</span>
		</div>
	);
}

function RedirectingToLogin() {
	const t = useT();
	const label = t("Redirecting to login");
	return (
		<div
			role="status"
			aria-label={label}
			aria-live="polite"
			className="flex min-h-screen flex-col items-center justify-center gap-4"
		>
			<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
			<p className="text-sm text-neutral-600">{t("Redirecting to login...")}</p>
			<span className="sr-only">{label}</span>
		</div>
	);
}

function InsufficientTierEmpty({ tier }: { tier: RoleTier }) {
	const t = useT();
	const tierLabel = t(roleTierLabelKey(tier));
	return (
		<div
			role="status"
			aria-live="polite"
			className="flex min-h-screen items-center justify-center"
		>
			<EmptyState
				icon={ShieldAlert}
				variant="error"
				title={t("Insufficient permissions")}
				description={t("This page requires {tier} access.", { tier: tierLabel })}
			/>
		</div>
	);
}
