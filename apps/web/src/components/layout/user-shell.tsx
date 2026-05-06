"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar-store";
import type { ReactNode } from "react";

interface UserShellProps {
	children: ReactNode;
	/** When true the layout uses a wider container (e.g. for reader pages). */
	widthVariant?: "default" | "wide" | "full";
	/** Hide the workspace switcher strip (e.g. immersive reader). */
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
	hideWorkspaceStrip = false,
	hideHeader = false,
	className,
}: UserShellProps) {
	return (
		<ProtectedRoute>
			<UserShellContent
				widthVariant={widthVariant}
				hideWorkspaceStrip={hideWorkspaceStrip}
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
	hideWorkspaceStrip: boolean;
	hideHeader: boolean;
	className?: string;
}

function UserShellContent({
	children,
	widthVariant,
	hideWorkspaceStrip,
	hideHeader,
	className,
}: UserShellContentProps) {
	const collapsed = useSidebarStore((state) => state.collapsed);

	return (
		<div className="relative min-h-screen">
			<div
				aria-hidden="true"
				className="pointer-events-none fixed inset-0 -z-10"
				style={{
					background:
						"radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--color-primary-100) 38%, transparent) 0%, transparent 60%), radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--color-info-light) 30%, transparent) 0%, transparent 55%), var(--surface-muted-bg)",
				}}
			/>

			<aside
				aria-hidden="true"
				className={cn(
					"fixed left-0 top-0 z-30 hidden h-screen md:block",
					"glass-sidebar",
					collapsed ? "w-16" : "w-[280px]",
				)}
			/>

			<Sidebar />

			<div
				className={cn(
					"flex min-h-screen flex-col transition-[margin] duration-300",
					"md:ml-[280px]",
					collapsed && "md:ml-16",
				)}
			>
				{!hideHeader ? (
					<div className="glass-topbar sticky top-0 z-20">
						{!hideWorkspaceStrip ? (
							<div
								className="flex h-12 items-center gap-3 border-b px-4 md:px-6"
								style={{
									borderColor: "var(--surface-muted-border)",
								}}
							>
								<WorkspaceSwitcher />
							</div>
						) : null}
						<Header />
					</div>
				) : null}

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
