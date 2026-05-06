"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar-store";
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

function UserShellContent({
	children,
	widthVariant,
	hideHeader,
	className,
}: UserShellContentProps) {
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
				{!hideHeader ? <Header /> : null}

				<main
					className={cn(
						"flex-1 px-4 py-6 md:px-6 md:py-8",
						containerByVariant[widthVariant],
						className,
					)}
				>
					{children}
				</main>
			</div>
		</div>
	);
}
