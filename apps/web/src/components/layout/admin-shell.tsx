"use client";

import { RoleTierGuard } from "@/components/auth/role-tier-guard";
import { NotificationBell } from "@/components/layout/notification-bell";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-nav";
import {
	ADMIN_TIERS,
	type RoleTier,
	normalizeRoleTier,
	roleTierLabelKey,
} from "@/lib/authz";
import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
	ChevronRight,
	LogOut,
	Menu,
	Settings as SettingsIcon,
	Shield,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface AdminShellProps {
	children: ReactNode;
	className?: string;
}

function isAdminItemActive(activePath: string, href: string): boolean {
	if (href === "/admin") {
		return activePath === "/admin";
	}
	return activePath === href || activePath.startsWith(`${href}/`);
}

function roleTierBadgeStyle(tier: RoleTier): React.CSSProperties {
	switch (tier) {
		case "super_admin":
			return {
				backgroundColor: "var(--color-error-light)",
				borderColor: "var(--color-error)",
				color: "var(--color-error)",
			};
		case "tenant_admin":
			return {
				backgroundColor: "var(--color-info-light)",
				borderColor: "var(--color-info)",
				color: "var(--color-info)",
			};
		default:
			return {
				backgroundColor: "var(--surface-muted-bg)",
				borderColor: "var(--surface-muted-border)",
				color: "var(--surface-muted-text)",
			};
	}
}

interface AdminSidebarProps {
	collapsed: boolean;
	activePath: string;
	layoutIdPrefix: string;
	onNavigate?: () => void;
	showCollapseToggle?: boolean;
	onToggleCollapsed?: () => void;
	showCloseButton?: boolean;
	onRequestClose?: () => void;
}

function AdminSidebarPanel({
	collapsed,
	activePath,
	layoutIdPrefix: _layoutIdPrefix,
	onNavigate,
	showCollapseToggle,
	onToggleCollapsed,
	showCloseButton,
	onRequestClose,
}: AdminSidebarProps) {
	const locale = useLocale();
	const t = useT();
	const reducedMotion = useReducedMotion() ?? false;
	const user = useAuthStore((state) => state.user);
	const roleTier = normalizeRoleTier(useAuthStore((state) => state.roleTier));
	const navRef = useRef<HTMLElement | null>(null);

	// Reset internal nav scroll when the active path changes so deep links
	// always show the active group from the top instead of leaving the user
	// staring at residual scroll from the previous page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: activePath is intentional — it's the "reset trigger" signal, not a value read inside the effect.
	useEffect(() => {
		const node = navRef.current;
		if (!node) return;
		node.scrollTop = 0;
	}, [activePath]);
	const displayName =
		user?.display_name?.trim() || user?.email?.split("@")[0] || t("Admin");
	const avatarText = (displayName.charAt(0) || "A").toUpperCase();

	// Logo 圆角块 — 纯白主题下走 primary-500 单色 + 极轻 shadow，
	// 不再使用 bg-gradient-cta 厚 shadow（task #11）。
	const headerStyle = {
		backgroundColor: "var(--color-primary-500)",
		boxShadow:
			"0 1px 2px color-mix(in srgb, var(--color-primary-600) 18%, transparent)",
		color: "white",
	} as const;

	const mutedTextStyle = {
		color: "var(--surface-muted-text)",
	} as const;

	const headingStyle = {
		color: "var(--field-foreground)",
	} as const;

	return (
		<>
			<div
				className="flex h-16 items-center gap-3 border-b px-4"
				style={{ borderColor: "var(--surface-card-border)" }}
			>
				<div
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
					style={headerStyle}
				>
					<Shield aria-hidden="true" className="h-5 w-5" />
				</div>
				{!collapsed ? (
					<div className="min-w-0 flex-col overflow-hidden">
						<span
							className="block whitespace-nowrap text-base font-bold"
							style={headingStyle}
						>
							{t("Admin Console")}
						</span>
						<span
							className="block whitespace-nowrap text-xs"
							style={mutedTextStyle}
						>
							{t("Governance & telemetry")}
						</span>
					</div>
				) : null}
				{showCloseButton ? (
					<button
						type="button"
						onClick={() => onRequestClose?.()}
						className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--control-hover-bg)]"
						style={mutedTextStyle}
						aria-label={t("Close navigation")}
					>
						<X aria-hidden="true" className="h-5 w-5" />
					</button>
				) : null}
			</div>

			<RoleTierGuard
				minTier="tenant_admin"
				fallback={
					<nav
						aria-label={t("Admin navigation")}
						className="flex-1 overflow-y-auto p-4 text-sm"
						style={mutedTextStyle}
					>
						{collapsed
							? null
							: t(
									"Sign in with an administrative role to access governance navigation.",
								)}
					</nav>
				}
			>
				<nav
					ref={navRef}
					aria-label={t("Admin navigation")}
					className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3"
				>
					{ADMIN_NAV_GROUPS.map((group) => (
						<div key={group.titleKey}>
							{!collapsed ? (
								<p
									className="mb-2 px-3 text-xs font-medium uppercase tracking-wider"
									style={mutedTextStyle}
								>
									{t(group.titleKey)}
								</p>
							) : null}
							<div className="space-y-1">
								{group.items.map((item) => {
									const Icon = item.icon;
									const active = isAdminItemActive(activePath, item.href);
									const localizedHref = withLocalePath(locale, item.href);
									return (
										<Link
											key={item.href}
											href={localizedHref}
											onClick={onNavigate}
											className={cn(
												"group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
												"transition-colors duration-150",
												active
													? "text-[var(--nav-active-text)]"
													: "hover:bg-[var(--control-hover-bg)] hover:text-[var(--field-foreground)]",
												collapsed && "justify-center",
											)}
											style={
												active
													? { color: "var(--nav-active-text)" }
													: mutedTextStyle
											}
											aria-current={active ? "page" : undefined}
										>
											{active ? (
												<div
													className="absolute inset-0 rounded-xl shadow-sm"
													style={{
														backgroundColor: "var(--nav-active-surface)",
													}}
												/>
											) : null}
											<div className="relative z-10">
												<Icon
													className="h-5 w-5 shrink-0"
													aria-hidden="true"
													style={
														active
															? { color: "var(--nav-active-text)" }
															: mutedTextStyle
													}
												/>
											</div>
											{!collapsed ? (
												<span className="relative z-10 whitespace-nowrap">
													{t(item.labelKey)}
												</span>
											) : null}
										</Link>
									);
								})}
							</div>
						</div>
					))}
				</nav>
			</RoleTierGuard>

			<div
				className="relative border-t p-3"
				style={{ borderColor: "var(--surface-card-border)" }}
			>
				{showCollapseToggle && onToggleCollapsed ? (
					<motion.button
						type="button"
						onClick={onToggleCollapsed}
						className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm"
						style={{
							backgroundColor: "var(--surface-muted-bg)",
							color: "var(--surface-muted-text)",
							borderColor: "var(--surface-muted-border)",
						}}
						whileHover={reducedMotion ? undefined : { scale: 1.02 }}
						whileTap={reducedMotion ? undefined : { scale: 0.98 }}
						aria-label={t("Collapse menu")}
					>
						<motion.div
							animate={
								reducedMotion ? undefined : { rotate: collapsed ? 0 : 180 }
							}
							transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
						>
							<ChevronRight aria-hidden="true" className="h-4 w-4" />
						</motion.div>
						{!collapsed ? (
							<span className="whitespace-nowrap">{t("Collapse menu")}</span>
						) : null}
					</motion.button>
				) : null}

				<div
					className={cn(
						"flex items-center gap-3 rounded-2xl border px-3 py-3",
						showCollapseToggle && "mt-3",
						collapsed && "justify-center px-0",
					)}
					style={{
						backgroundColor: "var(--admin-card-bg)",
						borderColor: "var(--surface-card-border)",
					}}
				>
					<div
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
						style={headerStyle}
					>
						{avatarText}
					</div>
					{!collapsed ? (
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span
									className="truncate text-sm font-medium"
									style={headingStyle}
								>
									{displayName}
								</span>
							</div>
							<span
								className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold"
								style={roleTierBadgeStyle(roleTier)}
							>
								{t(roleTierLabelKey(roleTier))}
							</span>
						</div>
					) : null}
				</div>
			</div>
		</>
	);
}

function AdminTopBar() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const { logout } = useAuth();
	const { toggleMobile } = useSidebarStore();
	const [menuOpen, setMenuOpen] = useState(false);
	const menuButtonRef = useRef<HTMLButtonElement | null>(null);
	const menuPanelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!menuOpen) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setMenuOpen(false);
			menuButtonRef.current?.focus();
		};
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (menuPanelRef.current?.contains(target)) return;
			if (menuButtonRef.current?.contains(target)) return;
			setMenuOpen(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("pointerdown", handlePointerDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [menuOpen]);


	const handleLogout = async () => {
		await logout();
		router.push(withLocalePath(locale, "/login"));
	};

	// Topbar — minimalist hairline divider, no color blocking (task #11).
	const bannerStyle = {
		backgroundColor: "var(--admin-surface-bg)",
		color: "var(--color-foreground)",
		borderColor: "var(--surface-card-border)",
	} as const;

	return (
		<header
			className="sticky top-0 z-20 border-b"
			style={bannerStyle}
			aria-label="admin-topbar"
		>
			<div className="flex h-14 items-center gap-3 px-4 md:px-6">
				<button
					type="button"
					onClick={() => toggleMobile()}
					className="inline-flex h-9 w-9 items-center justify-center rounded-lg md:hidden"
					style={{
						color: "var(--surface-muted-text)",
					}}
					aria-label={t("Open navigation")}
				>
					<Menu aria-hidden="true" className="h-5 w-5" />
				</button>

				<div className="ml-auto flex items-center gap-2">
					<WorkspaceSwitcher className="hidden md:block" />

					<NotificationBell />

					<div className="relative">
						<button
							ref={menuButtonRef}
							type="button"
							onClick={() => setMenuOpen((prev) => !prev)}
							className="inline-flex h-9 w-9 items-center justify-center rounded-full"
							style={{
								backgroundColor: "var(--surface-muted-bg)",
								color: "var(--field-foreground)",
							}}
							aria-haspopup="menu"
							aria-expanded={menuOpen}
							aria-label={t("Admin menu")}
						>
							<SettingsIcon aria-hidden="true" className="h-4 w-4" />
						</button>
						{menuOpen ? (
							<div
								ref={menuPanelRef}
								role="menu"
								className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border shadow-xl"
								style={{
									backgroundColor: "var(--color-background)",
									borderColor: "var(--surface-muted-border)",
								}}
							>
								<button
									type="button"
									role="menuitem"
									className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-[var(--control-hover-bg)]"
									onClick={() => {
										setMenuOpen(false);
										router.push(withLocalePath(locale, "/settings"));
									}}
								>
									<SettingsIcon aria-hidden="true" className="h-4 w-4" />
									{t("Account settings")}
								</button>
								<button
									type="button"
									role="menuitem"
									className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-light)]"
									onClick={() => {
										setMenuOpen(false);
										void handleLogout();
									}}
								>
									<LogOut aria-hidden="true" className="h-4 w-4" />
									{t("Sign out")}
								</button>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</header>
	);
}

export function AdminShell({ children, className }: AdminShellProps) {
	const pathname = usePathname() ?? "";
	const activePath = stripLocalePrefix(pathname);
	const { refreshSession } = useAuth();
	const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
	const isAuthLoading = useAuthStore((state) => state.isLoading);
	const roleTier = normalizeRoleTier(useAuthStore((state) => state.roleTier));
	const collapsed = useSidebarStore((state) => state.collapsed);
	const toggle = useSidebarStore((state) => state.toggle);
	const mobileOpen = useSidebarStore((state) => state.mobileOpen);
	const closeMobile = useSidebarStore((state) => state.closeMobile);
	const reducedMotion = useReducedMotion() ?? false;
	const t = useT();
	const authBootstrapRequestedRef = useRef(false);
	const previousFocusedElementRef = useRef<HTMLElement | null>(null);
	const previousPathnameRef = useRef<string | null>(null);
	const mobileDrawerRef = useRef<HTMLDialogElement | null>(null);

	useEffect(() => {
		if (isAuthenticated) {
			authBootstrapRequestedRef.current = false;
			return;
		}
		if (authBootstrapRequestedRef.current) return;
		authBootstrapRequestedRef.current = true;
		void refreshSession();
	}, [isAuthenticated, refreshSession]);

	useEffect(() => {
		const previous = previousPathnameRef.current;
		previousPathnameRef.current = pathname;
		if (previous === null) return;
		if (previous === pathname) return;
		closeMobile();
	}, [pathname, closeMobile]);

	useEffect(() => {
		if (!mobileOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		previousFocusedElementRef.current =
			document.activeElement as HTMLElement | null;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeMobile();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = previousOverflow;
			const previousFocused = previousFocusedElementRef.current;
			if (previousFocused && document.contains(previousFocused)) {
				previousFocused.focus();
			}
			previousFocusedElementRef.current = null;
		};
	}, [mobileOpen, closeMobile]);

	const isAdmin = isAuthenticated && ADMIN_TIERS.includes(roleTier);

	if (!isAdmin && isAuthLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
			</div>
		);
	}

	if (!isAdmin) {
		return (
			<div className="flex min-h-screen items-center justify-center px-6 text-center">
				<div className="max-w-md space-y-3">
					<Shield
						aria-hidden="true"
						className="mx-auto h-10 w-10"
						style={{ color: "var(--color-error)" }}
					/>
					<h1
						className="text-xl font-semibold"
						style={{ color: "var(--color-foreground)" }}
					>
						{t("Access restricted")}
					</h1>
					<p className="text-sm" style={{ color: "var(--surface-muted-text)" }}>
						{t(
							"You need an administrative role tier to access the admin console.",
						)}
					</p>
				</div>
			</div>
		);
	}

	// Pure-white sidebar (task #11). The legacy build leaned on a dark
	// translucent surface + heavy black shadow which clashes with the
	// "background pure white, cards float" admin direction. We now use the
	// admin surface token + subtle 1px right-side hairline so the sidebar
	// reads as part of the same canvas as the main column.
	//
	// Layout note (sidebar sticky bug, 2026-05-07):
	// We deliberately use a flex-row + per-column `overflow-y-auto` shell
	// instead of `<aside position: fixed>`. An ancestor `<motion.div>` from
	// `RouteTransitionProvider` carries `filter: blur(0px)` during/after route
	// transitions, which (per CSS spec) becomes the containing block for any
	// descendant `position: fixed` element. With the legacy fixed layout the
	// sidebar would scroll away with the document instead of staying pinned.
	// A flex shell sidesteps the containing-block trap entirely — sidebar is
	// a flow-level flex item naturally locked to the viewport-height row.
	const desktopAsideClassName = cn(
		"hidden md:flex shrink-0 flex-col border-r",
		"transition-[width] duration-300",
		collapsed ? "w-16" : "w-[260px]",
	);
	const mobileAsideClassName = cn(
		"fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r",
		"m-0 w-[280px] max-w-none p-0 md:hidden",
	);
	const baseAsideStyle = {
		backgroundColor: "var(--admin-surface-bg)",
		borderColor: "var(--surface-card-border)",
	} as const;

	return (
		<div
			className="relative flex h-screen w-full overflow-hidden"
			style={{ backgroundColor: "var(--admin-surface-bg)" }}
		>

			<aside
				className={desktopAsideClassName}
				style={baseAsideStyle}
				aria-label={t("Admin navigation")}
			>
				<AdminSidebarPanel
					collapsed={collapsed}
					activePath={activePath}
					layoutIdPrefix="admin-desktop"
					showCollapseToggle
					onToggleCollapsed={toggle}
				/>
			</aside>

			<AnimatePresence initial={!reducedMotion}>
				{mobileOpen ? (
					<>
						<motion.div
							initial={reducedMotion ? false : { opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={reducedMotion ? undefined : { opacity: 0 }}
							className="fixed inset-0 z-40 md:hidden"
							style={{
								backgroundColor: "color-mix(in srgb, black 40%, transparent)",
							}}
							onClick={closeMobile}
							aria-hidden="true"
						/>
						<motion.dialog
							ref={mobileDrawerRef}
							open
							initial={reducedMotion ? false : { x: -320 }}
							animate={{ x: 0 }}
							exit={reducedMotion ? undefined : { x: -320 }}
							transition={
								reducedMotion
									? { duration: 0 }
									: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
							}
							className={mobileAsideClassName}
							style={baseAsideStyle}
							aria-modal="true"
							aria-label={t("Admin navigation")}
							tabIndex={-1}
						>
							<AdminSidebarPanel
								collapsed={false}
								activePath={activePath}
								layoutIdPrefix="admin-mobile"
								onNavigate={closeMobile}
								showCloseButton
								onRequestClose={closeMobile}
							/>
						</motion.dialog>
					</>
				) : null}
			</AnimatePresence>

			<div className="flex min-w-0 flex-1 flex-col">
				<AdminTopBar />

				<main className="flex-1 overflow-y-auto">
					<div
						className={cn(
							"mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6 md:py-8",
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
