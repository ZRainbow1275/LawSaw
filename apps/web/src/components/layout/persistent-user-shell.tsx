"use client";

/**
 * PersistentUserShell — locale-level shell that renders Sidebar + Header +
 * ProtectedRoute exactly once and stays mounted across navigations between
 * sibling user-facing pages.
 *
 * Why this exists:
 *   `UserShell` is mounted by every page that wraps its children with it, so
 *   navigating between e.g. `/me/feed` and `/me/notifications` re-mounts the
 *   sidebar, the header and the auth gate, which re-runs `useCategories`,
 *   `useAuth`, and onboarding hydration on every transition.
 *
 *   By hoisting that chrome into `[locale]/layout.tsx`, the shell stays mounted
 *   while only the inner `<main>` swaps — which is what eliminates the
 *   "rendering" stall reported in `prompts/0505/`.
 *
 * Width handling:
 *   The two route groups `(shell-default)` and `(shell-wide)` own their own
 *   `<main>` container width. PersistentUserShell intentionally does *not*
 *   apply `containerByVariant` — pages opt into a width by living inside the
 *   matching route group.
 *
 * Exemptions:
 *   Pathname-based exemption keeps the legacy/admin/auth/article-reader pages
 *   in charge of their own chrome until those flows are migrated:
 *     - `/admin/**`            uses `AdminShell`
 *     - `/login` / `/register` / `/verify-email` / `/reset-password`
 *                              are unauthenticated full-bleed pages
 *     - `/articles/{id}/...`   uses the immersive `<ReaderLayout>`
 *
 *   Routes still wrapping themselves in `<UserShell>` (settings, search, data,
 *   sources, dashboard, articles list, category, etc.) keep working because the
 *   shell wrapper short-circuits to children when those prefixes match — the
 *   inner `UserShell` continues to render the chrome as before. Each such
 *   prefix carries a `TODO(shell-lift):` note for the eventual migration into
 *   the `(shell-default)` / `(shell-wide)` route groups.
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar-store";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo } from "react";

const SHELL_EXEMPT_PREFIXES = [
	"/admin",
	"/login",
	"/register",
	"/verify-email",
	"/reset-password",
	// Pages that still own their own Sidebar/Header (legacy chrome, not yet
	// migrated to the persistent shell). Routing them through this list keeps
	// their existing layout intact and avoids the doubled-chrome regression.
	// TODO(shell-lift): /articles index renders own UserShell (wide); /articles/[id]
	// is the immersive ReaderLayout that MUST stay exempt — split this prefix when
	// migrating the index into (shell-wide) in a follow-up.
	"/articles",
];

const SHELL_EXEMPT_PATTERNS: RegExp[] = [
	// (intentionally empty — `/me/articles/[id]` was relocated into
	// `(shell-wide)/me/articles/[id]` so PersistentUserShell now owns its chrome.)
];

function stripLocale(pathname: string): string {
	return pathname.replace(/^\/(zh|en)(?=\/|$)/, "") || "/";
}

function shouldRenderShell(pathname: string): boolean {
	const stripped = stripLocale(pathname);

	for (const prefix of SHELL_EXEMPT_PREFIXES) {
		if (stripped === prefix || stripped.startsWith(`${prefix}/`)) {
			return false;
		}
	}

	for (const pattern of SHELL_EXEMPT_PATTERNS) {
		if (pattern.test(stripped)) return false;
	}

	return true;
}

interface PersistentUserShellProps {
	children: ReactNode;
}

export function PersistentUserShell({ children }: PersistentUserShellProps) {
	const pathname = usePathname() ?? "/";
	const renderShell = useMemo(() => shouldRenderShell(pathname), [pathname]);

	if (!renderShell) {
		return <>{children}</>;
	}

	return (
		<ProtectedRoute>
			<PersistentUserShellChrome>{children}</PersistentUserShellChrome>
		</ProtectedRoute>
	);
}

function PersistentUserShellChrome({ children }: { children: ReactNode }) {
	const collapsed = useSidebarStore((state) => state.collapsed);

	return (
		<div
			className="relative min-h-screen"
			style={{ backgroundColor: "var(--color-card)" }}
		>
			<Sidebar />

			<div
				className={cn(
					"flex min-h-screen flex-col transition-[margin] duration-300",
					"md:ml-[280px]",
					collapsed && "md:ml-16",
				)}
			>
				<Header />
				<div className="flex flex-1 flex-col">{children}</div>
			</div>
		</div>
	);
}
