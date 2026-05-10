"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface UserShellProps {
	children: ReactNode;
	/** When true the layout uses a wider container (e.g. for reader pages). */
	widthVariant?: "default" | "wide" | "full";
	/** Reserved for future overrides — currently a no-op. */
	hideWorkspaceStrip?: boolean;
	/** Hide the inner page header bar (search/notifications); useful for full-bleed pages. */
	hideHeader?: boolean;
	className?: string;
}

const containerByVariant = {
	default: "mx-auto w-full max-w-7xl",
	wide: "mx-auto w-full max-w-screen-2xl",
	full: "w-full",
} as const;

export function UserShell({
	children,
	widthVariant = "default",
	hideHeader = false,
	className,
}: UserShellProps) {
	return (
		<ProtectedRoute>
			<UserShellContent
				widthVariant={widthVariant}
				hideHeader={hideHeader}
				className={className}
			>
				{children}
			</UserShellContent>
		</ProtectedRoute>
	);
}

interface UserShellContentProps {
	children: ReactNode;
	widthVariant: NonNullable<UserShellProps["widthVariant"]>;
	hideHeader: boolean;
	className?: string;
}

// Wave 9 hot-fix #2 (regression follow-up): mirror `PersistentUserShellChrome`
// layout exactly. The `<Sidebar>` is now a flex-row child (no longer fixed),
// so the legacy `relative min-h-screen` + `md:ml-[280px]` push pattern leaves
// a 280px empty band when sidebar takes natural block flow. Switch to the
// flex `h-screen overflow-hidden` shell so sidebar + content sit side-by-side
// and only `<main>` owns the page scroll.
function UserShellContent({
	children,
	widthVariant,
	hideHeader,
	className,
}: UserShellContentProps) {
	return (
		<div
			className="relative flex h-screen w-full overflow-hidden"
			style={{ backgroundColor: "var(--color-card)" }}
		>
			<Sidebar />

			<div className="flex min-w-0 flex-1 flex-col">
				{!hideHeader ? <Header /> : null}

				<main className="flex-1 overflow-y-auto scrollbar-subtle">
					<div
						className={cn(
							"px-4 py-6 md:px-6 md:py-8",
							containerByVariant[widthVariant],
							className,
						)}
					>
						{children}
					</div>
				</main>
			</div>
		</div>
	);
}
