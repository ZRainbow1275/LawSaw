"use client";

import { NAVIGATION_PREFIX_KEYS } from "@/components/providers/app-shortcuts-provider";
import { useCategories } from "@/hooks/use-categories";
import {
	type RoleTier,
	normalizeRoleTier,
	roleTierLabelKey,
	splitDisplayNameRoleTier,
} from "@/lib/authz";
import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
	BarChart3,
	Briefcase,
	Building2,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Database,
	Eye,
	FileText,
	Flame,
	Globe2,
	GraduationCap,
	LayoutDashboard,
	type LucideIcon,
	MessageSquarePlus,
	Newspaper,
	Rss,
	Scale,
	ScrollText,
	Settings,
	Share2,
	Shield,
	ShieldCheck,
	TrendingUp,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function normalizeHexColor(input: string): string | null {
	const hex = input.trim();
	if (!hex.startsWith("#")) return null;
	const value = hex.slice(1);
	if (!/^[0-9a-fA-F]{3}$/.test(value) && !/^[0-9a-fA-F]{6}$/.test(value))
		return null;

	const normalized =
		value.length === 3
			? value
					.split("")
					.map((c) => `${c}${c}`)
					.join("")
			: value;
	return `#${normalized}`;
}

function getCategoryBadgeStyle(
	color: string | null,
): React.CSSProperties | undefined {
	if (!color) return undefined;
	const normalizedColor = normalizeHexColor(color);
	if (!normalizedColor) return undefined;

	return {
		color: normalizedColor,
		backgroundColor: `color-mix(in srgb, ${normalizedColor} 12%, transparent)`,
	};
}

const navigation: Array<{
	name: string;
	href: string;
	icon: LucideIcon;
	tourId?: string;
}> = [
	{
		name: "Dashboard",
		href: "/dashboard",
		icon: LayoutDashboard,
		tourId: "dashboard",
	},
	{ name: "My feed", href: "/me/feed", icon: Newspaper },
	{
		name: "All articles",
		href: "/articles",
		icon: FileText,
		tourId: "articles",
	},
	{ name: "Sources", href: "/sources", icon: Rss },
	{ name: "Reports", href: "/reports", icon: ClipboardList, tourId: "reports" },
	{ name: "Analytics", href: "/analytics", icon: TrendingUp },
	{ name: "Knowledge Graph", href: "/knowledge", icon: Share2 },
	{ name: "Data", href: "/data", icon: Database },
	{
		name: "Feedback",
		href: "/feedback",
		icon: MessageSquarePlus,
		tourId: "feedback",
	},
	{ name: "Settings", href: "/settings", icon: Settings, tourId: "settings" },
];

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
		case "premium_user":
			return {
				backgroundColor: "var(--color-warning-light)",
				borderColor: "var(--color-warning)",
				color: "var(--color-warning)",
			};
		case "verified_user":
			return {
				backgroundColor:
					"color-mix(in srgb, var(--color-regulation) 12%, transparent)",
				borderColor:
					"color-mix(in srgb, var(--color-regulation) 24%, transparent)",
				color: "var(--color-regulation)",
			};
		case "basic_user":
			return {
				backgroundColor: "var(--control-hover-bg)",
				borderColor: "var(--surface-muted-border)",
				color: "var(--surface-muted-text)",
			};
	}
}

function roleTierDotStyle(tier: RoleTier): React.CSSProperties {
	switch (tier) {
		case "super_admin":
			return { backgroundColor: "var(--color-error)" };
		case "tenant_admin":
			return { backgroundColor: "var(--color-info)" };
		case "premium_user":
			return { backgroundColor: "var(--color-warning)" };
		case "verified_user":
			return { backgroundColor: "var(--color-regulation)" };
		case "basic_user":
			return { backgroundColor: "var(--surface-muted-text)" };
	}
}

function isNavigationItemActive(pathname: string, href: string): boolean {
	if (href === "/dashboard") {
		return pathname === "/" || pathname === "/dashboard";
	}

	return pathname === href || pathname.startsWith(`${href}/`);
}

const categoryIconMap: Record<string, LucideIcon> = {
	legislation: ScrollText,
	regulation: Building2,
	enforcement: Scale,
	industry: Briefcase,
	compliance: ShieldCheck,
	data: BarChart3,
	security: Shield,
	academic: GraduationCap,
	events: Flame,
	international: Globe2,
};

const sidebarNestedSurfaceStyle = {
	backgroundColor: "var(--control-hover-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const sidebarHeadingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const sidebarMutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

const sidebarSelectedControlStyle = {
	backgroundColor: "var(--control-selected-bg)",
	borderColor: "var(--control-selected-border)",
	color: "var(--control-selected-text)",
} as const;

const sidebarSurfaceHoverClassName =
	"hover:bg-[var(--control-hover-bg)] hover:text-[var(--field-foreground)]";

const sidebarAccentHoverClassName =
	"hover:border-[var(--surface-accent-border)] hover:bg-[var(--surface-accent-bg)] hover:text-[var(--field-foreground)]";

const sidebarFocusRingClassName =
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent-border)]";

const sidebarBrandMarkStyle = {
	boxShadow:
		"0 4px 12px color-mix(in srgb, var(--color-primary-500) 15%, transparent)",
	color: "color-mix(in srgb, white 96%, transparent)",
} as const;

const sidebarBrandAvatarStyle = {
	color: "color-mix(in srgb, white 96%, transparent)",
} as const;

const sidebarMobileBackdropStyle = {
	backgroundColor: "color-mix(in srgb, black 40%, transparent)",
} as const;

type CategoriesQuery = ReturnType<typeof useCategories>;
type CategoryList = NonNullable<CategoriesQuery["data"]>;

interface SidebarPanelProps {
	collapsed: boolean;
	pathname: string;
	canReadCategories: boolean;
	categoriesQuery: CategoriesQuery;
	categories: CategoryList;
	categoryCount: number;
	layoutIdPrefix: string;
	reducedMotion: boolean;
	onNavigate?: () => void;
	showCollapseToggle?: boolean;
	onToggleCollapsed?: () => void;
	showCloseButton?: boolean;
	onRequestClose?: () => void;
}

function SidebarPanel({
	collapsed,
	pathname,
	canReadCategories,
	categoriesQuery,
	categories,
	categoryCount,
	layoutIdPrefix,
	reducedMotion,
	onNavigate,
	showCollapseToggle,
	onToggleCollapsed,
	showCloseButton,
	onRequestClose,
}: SidebarPanelProps) {
	const locale = useLocale();
	const t = useT();
	const user = useAuthStore((state) => state.user);
	const roleTier = useAuthStore((state) => state.roleTier);
	const [showRolePopup, setShowRolePopup] = useState(false);
	const [previewRoleTier, setPreviewRoleTier] = useState<RoleTier | null>(null);
	const roleSelectorRef = useRef<HTMLButtonElement | null>(null);
	const rolePopupRef = useRef<HTMLDivElement | null>(null);
	const actualRoleTier = normalizeRoleTier(roleTier);
	const effectiveRoleTier = previewRoleTier ?? actualRoleTier;
	const fallbackDisplayName = user?.email?.split("@")[0] || t("User");
	const { baseName: parsedDisplayName } = splitDisplayNameRoleTier(
		user?.display_name,
	);
	const displayName = parsedDisplayName || fallbackDisplayName;
	const avatarText = (
		displayName.charAt(0) ||
		fallbackDisplayName.charAt(0) ||
		"U"
	).toUpperCase();
	const roleOptions = useMemo(() => {
		const base: RoleTier[] = ["basic_user", "verified_user", "premium_user"];
		if (actualRoleTier === "tenant_admin" || actualRoleTier === "super_admin") {
			return [actualRoleTier, ...base];
		}
		return base;
	}, [actualRoleTier]);
	const isPreviewing =
		previewRoleTier !== null && previewRoleTier !== actualRoleTier;

	useEffect(() => {
		if (!showRolePopup) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setShowRolePopup(false);
			roleSelectorRef.current?.focus();
		};

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (rolePopupRef.current?.contains(target)) return;
			if (roleSelectorRef.current?.contains(target)) return;
			setShowRolePopup(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("pointerdown", handlePointerDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [showRolePopup]);

	return (
		<>
			{/* Brand */}
			<div
				className="flex h-16 items-center gap-3 border-b px-4"
				style={{ borderColor: "var(--surface-muted-border)" }}
			>
				<div
					className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-cta"
					style={sidebarBrandMarkStyle}
				>
					<Eye aria-hidden="true" className="h-5 w-5" />
				</div>
				{!collapsed && (
					<div className="min-w-0 flex-col overflow-hidden">
						<span
							className="block whitespace-nowrap text-lg font-bold"
							style={sidebarHeadingTextStyle}
						>
							{locale === "zh" ? t("Law Eye (short)") : t("Law Eye")}
						</span>
						<span
							className="block whitespace-nowrap text-xs"
							style={sidebarMutedTextStyle}
						>
							LawSaw
						</span>
					</div>
				)}
				{showCloseButton && (
					<button
						type="button"
						className={cn(
							"ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl",
							sidebarSurfaceHoverClassName,
							sidebarFocusRingClassName,
						)}
						style={sidebarMutedTextStyle}
						aria-label={t("Close navigation")}
						onClick={() => onRequestClose?.()}
					>
						<X aria-hidden="true" className="h-5 w-5" />
					</button>
				)}
			</div>

			{/* Navigation */}
			<nav className="flex-1 space-y-1 overflow-y-auto p-3">
				<div className="mb-4">
					{!collapsed ? (
						<p
							className="mb-2 px-3 text-xs font-medium uppercase tracking-wider"
							style={sidebarMutedTextStyle}
						>
							{t("Navigation")}
						</p>
					) : null}
					{navigation.map((item) => {
						const isActive = isNavigationItemActive(pathname, item.href);
						return (
							<div key={item.name}>
								<Link
									href={withLocalePath(locale, item.href)}
									onClick={onNavigate}
									data-tour={item.tourId ? `sidebar-${item.tourId}` : undefined}
									className={cn(
										"group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
										"transition-colors duration-150",
										isActive
											? "text-[var(--color-primary-700)]"
											: sidebarSurfaceHoverClassName,
										collapsed && "justify-center",
									)}
									style={
										isActive
											? { color: "var(--color-primary-700)" }
											: sidebarMutedTextStyle
									}
								>
									{/* Active state — 4px left bar (mp4 truth) */}
									{isActive && !collapsed && (
										<span
											aria-hidden
											className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r"
											style={{
												background:
													"linear-gradient(180deg, var(--color-primary-500), var(--color-primary-600))",
											}}
										/>
									)}

									<div className="relative z-10">
										<item.icon
											className={cn("h-5 w-5 shrink-0")}
											style={
												isActive
													? { color: "var(--color-primary-700)" }
													: sidebarMutedTextStyle
											}
										/>
									</div>

									{!collapsed ? (
										<span className="relative z-10 flex flex-1 items-center gap-2 whitespace-nowrap">
											<span className="flex-1">{t(item.name)}</span>
											{NAVIGATION_PREFIX_KEYS[item.href] ? (
												<span
													aria-hidden="true"
													className="hidden items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100 md:inline-flex"
													style={{
														borderColor: "var(--surface-muted-border)",
														backgroundColor: "var(--control-hover-bg)",
														color: "var(--surface-muted-text)",
													}}
												>
													g
													<span className="opacity-50">·</span>
													{NAVIGATION_PREFIX_KEYS[item.href]}
												</span>
											) : null}
										</span>
									) : null}
								</Link>
							</div>
						);
					})}
				</div>

				{/* Categories */}
				{!collapsed && canReadCategories && (
					<div
						className="border-t pt-4"
						style={{ borderColor: "var(--surface-muted-border)" }}
					>
						<p
							className="mb-2 px-3 text-xs font-medium uppercase tracking-wider"
							style={sidebarMutedTextStyle}
						>
							{categoriesQuery.isLoading
								? t("Loading categories")
								: categoriesQuery.isError
									? t("Failed to load categories")
									: t("{count} categories", { count: categoryCount })}
						</p>
						{categoriesQuery.isLoading ? (
							<div className="space-y-1 px-3">
								{Array.from({ length: 8 }, (_, idx) => `cat-skel-${idx}`).map(
									(key) => (
										<div
											key={key}
											className="h-9 animate-pulse rounded-xl"
											style={{ backgroundColor: "var(--control-hover-bg)" }}
										/>
									),
								)}
							</div>
						) : categoriesQuery.isError ? (
							<div className="px-3 py-2 text-xs" style={sidebarMutedTextStyle}>
								<p>
									{t("Unable to load categories (check API / login status).")}
								</p>
								<button
									type="button"
									onClick={() => categoriesQuery.refetch()}
									className={cn(
										"mt-2 inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-xs font-medium",
										sidebarAccentHoverClassName,
									)}
									style={{
										...sidebarNestedSurfaceStyle,
										...sidebarHeadingTextStyle,
									}}
								>
									{t("Retry")}
								</button>
							</div>
						) : (
							<div className="space-y-0.5">
								{categories.map((category) => {
									const isActive = pathname === `/category/${category.slug}`;
									const CategoryIcon = categoryIconMap[category.slug];
									const badgeStyle = getCategoryBadgeStyle(category.color);

									return (
										<div key={category.id}>
											<Link
												href={withLocalePath(
													locale,
													`/category/${category.slug}`,
												)}
												onClick={onNavigate}
												className={cn(
													"group flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
													"transition-colors duration-150",
													isActive
														? "font-medium"
														: sidebarSurfaceHoverClassName,
												)}
												style={
													isActive
														? {
																backgroundColor: "var(--nav-active-surface)",
																color: "var(--nav-active-text)",
															}
														: sidebarMutedTextStyle
												}
											>
												<div
													className={cn(
														"flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold",
													)}
													style={
														badgeStyle ?? {
															backgroundColor: "var(--control-hover-bg)",
															color: "var(--surface-muted-text)",
														}
													}
													aria-hidden="true"
												>
													{CategoryIcon ? (
														<CategoryIcon className="h-3.5 w-3.5" />
													) : (
														<FileText className="h-3.5 w-3.5" />
													)}
												</div>
												<span>{category.name}</span>
											</Link>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}
			</nav>

			{/* Footer */}
			<div
				className="relative border-t p-3"
				style={{ borderColor: "var(--surface-muted-border)" }}
			>
				{showCollapseToggle && onToggleCollapsed ? (
					<motion.button
						onClick={onToggleCollapsed}
						className={cn(
							"flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm",
							"border",
						)}
						style={{
							backgroundColor: "var(--surface-muted-bg)",
							color: "var(--surface-muted-text)",
							borderColor: "var(--surface-muted-border)",
						}}
						whileHover={reducedMotion ? undefined : { scale: 1.02 }}
						whileTap={reducedMotion ? undefined : { scale: 0.98 }}
					>
						<motion.div
							animate={
								reducedMotion ? undefined : { rotate: collapsed ? 0 : 180 }
							}
							transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
						>
							<ChevronRight aria-hidden="true" className="h-4 w-4" />
						</motion.div>
						<AnimatePresence initial={!reducedMotion}>
							{!collapsed && (
								<motion.span
									initial={reducedMotion ? false : { opacity: 0, width: 0 }}
									animate={{ opacity: 1, width: "auto" }}
									exit={reducedMotion ? undefined : { opacity: 0, width: 0 }}
									transition={reducedMotion ? { duration: 0 } : undefined}
								>
									{t("Collapse menu")}
								</motion.span>
							)}
						</AnimatePresence>
					</motion.button>
				) : null}

				<AnimatePresence initial={!reducedMotion}>
					{showRolePopup ? (
						<motion.div
							ref={rolePopupRef}
							id={`${layoutIdPrefix}-role-popup`}
							initial={reducedMotion ? false : { opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
							transition={reducedMotion ? { duration: 0 } : undefined}
							className="absolute bottom-[calc(100%+0.75rem)] left-3 right-3 z-20 rounded-2xl border p-2 shadow-xl"
							style={{
								backgroundColor: "var(--surface-muted-bg)",
								borderColor: "var(--surface-muted-border)",
							}}
						>
							<p
								className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.12em]"
								style={sidebarMutedTextStyle}
							>
								{t("Preview role")}
							</p>
							<div className="space-y-1">
								{roleOptions.map((option) => {
									const selected = option === effectiveRoleTier;
									return (
										<button
											key={option}
											type="button"
											className={cn(
												"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
												selected ? "" : sidebarSurfaceHoverClassName,
											)}
											style={
												selected
													? sidebarSelectedControlStyle
													: sidebarHeadingTextStyle
											}
											onClick={() => {
												setPreviewRoleTier(
													option === actualRoleTier ? null : option,
												);
												setShowRolePopup(false);
											}}
										>
											<span
												className="h-2.5 w-2.5 shrink-0 rounded-full"
												style={roleTierDotStyle(option)}
												aria-hidden="true"
											/>
											<span className="flex-1">
												{t(roleTierLabelKey(option))}
											</span>
										</button>
									);
								})}
							</div>
							<p
								className="mt-2 px-2 pb-1 text-xs leading-5"
								style={sidebarMutedTextStyle}
							>
								{t(
									"This only changes the prototype preview and does not modify backend permissions.",
								)}
							</p>
						</motion.div>
					) : null}
				</AnimatePresence>

				<motion.button
					ref={roleSelectorRef}
					type="button"
					className={cn(
						"flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm",
						"transition-colors",
						sidebarAccentHoverClassName,
						showCollapseToggle && onToggleCollapsed && "mt-3",
						collapsed && "justify-center px-0",
					)}
					style={{
						backgroundColor: "var(--surface-muted-bg)",
						borderColor: "var(--surface-muted-border)",
					}}
					onClick={() => setShowRolePopup((current) => !current)}
					whileHover={reducedMotion ? undefined : { scale: 1.02 }}
					whileTap={reducedMotion ? undefined : { scale: 0.98 }}
					aria-haspopup="dialog"
					aria-expanded={showRolePopup}
					aria-controls={`${layoutIdPrefix}-role-popup`}
					aria-label={t("Switch preview role")}
				>
					<div
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-cta text-sm font-semibold"
						style={sidebarBrandAvatarStyle}
					>
						{avatarText}
					</div>
					{!collapsed ? (
						<>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span
										className="truncate text-sm font-medium"
										style={sidebarHeadingTextStyle}
									>
										{displayName}
									</span>
									<span
										className="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold"
										style={roleTierBadgeStyle(effectiveRoleTier)}
									>
										{t(roleTierLabelKey(effectiveRoleTier))}
									</span>
								</div>
								<p
									className="mt-1 truncate text-xs"
									style={sidebarMutedTextStyle}
								>
									{isPreviewing
										? t("Prototype preview only")
										: t("Current role")}
								</p>
							</div>
							<ChevronDown
								aria-hidden="true"
								className={cn(
									"h-4 w-4 shrink-0 transition-transform",
									showRolePopup && "rotate-180",
								)}
								style={sidebarMutedTextStyle}
							/>
						</>
					) : null}
				</motion.button>
			</div>
		</>
	);
}

export function Sidebar() {
	const pathname = usePathname();
	const activePathname = stripLocalePrefix(pathname);
	const t = useT();
	const reducedMotion = useReducedMotion() ?? false;
	const permissions = useAuthStore((state) => state.permissions);
	const canReadCategories =
		permissions.includes("categories:read") || permissions.includes("*");
	const { collapsed, toggle, mobileOpen, closeMobile } = useSidebarStore();
	const categoriesQuery = useCategories({ enabled: canReadCategories });
	const categories = categoriesQuery.data ?? [];
	const categoryCount = categories.length;

	const previousPathnameRef = useRef<string | null>(null);
	const mobileDrawerRef = useRef<HTMLDialogElement | null>(null);
	const previousFocusedElementRef = useRef<HTMLElement | null>(null);

	const handleFocusTrap = useCallback((event: KeyboardEvent) => {
		if (event.key !== "Tab") return;
		const container = mobileDrawerRef.current;
		if (!container) return;

		const focusable = container.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
		);
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (event.shiftKey) {
			if (document.activeElement === first) {
				event.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}, []);

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
			handleFocusTrap(event);
		};

		window.addEventListener("keydown", handleKeyDown);

		// Focus the drawer container when opened
		const drawer = mobileDrawerRef.current;
		if (drawer) {
			const firstFocusable = drawer.querySelector<HTMLElement>(
				'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
			);
			if (firstFocusable) {
				firstFocusable.focus();
			} else {
				drawer.focus();
			}
		}

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = previousOverflow;
			const previousFocused = previousFocusedElementRef.current;
			if (previousFocused && document.contains(previousFocused)) {
				previousFocused.focus();
			}
			previousFocusedElementRef.current = null;
		};
	}, [mobileOpen, closeMobile, handleFocusTrap]);

	const baseAsideClassName = cn(
		"fixed left-0 top-0 flex h-screen flex-col",
		"border-r",
	);
	const baseAsideStyle = {
		backgroundColor: "var(--color-card)",
		borderColor: "var(--surface-muted-border)",
	} as const;

	return (
		<>
			{/* Desktop */}
			<aside
				className={cn(
					baseAsideClassName,
					"z-30 hidden md:flex",
					collapsed ? "w-16" : "w-[280px]",
				)}
				style={baseAsideStyle}
				aria-label={t("Primary navigation")}
			>
				<SidebarPanel
					collapsed={collapsed}
					pathname={activePathname}
					canReadCategories={canReadCategories}
					categoriesQuery={categoriesQuery}
					categories={categories}
					categoryCount={categoryCount}
					layoutIdPrefix="desktop"
					reducedMotion={reducedMotion}
					showCollapseToggle
					onToggleCollapsed={toggle}
				/>
			</aside>

			{/* Mobile Drawer */}
			<AnimatePresence initial={!reducedMotion}>
				{mobileOpen && (
					<>
						<motion.div
							initial={reducedMotion ? false : { opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={reducedMotion ? undefined : { opacity: 0 }}
							transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
							className="fixed inset-0 z-40 md:hidden"
							style={sidebarMobileBackdropStyle}
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
							className={cn(
								baseAsideClassName,
								"z-50 m-0 w-[280px] max-w-none p-0 md:hidden",
							)}
							style={baseAsideStyle}
							aria-modal="true"
							aria-label={t("Primary navigation")}
							tabIndex={-1}
						>
							<SidebarPanel
								collapsed={false}
								pathname={activePathname}
								canReadCategories={canReadCategories}
								categoriesQuery={categoriesQuery}
								categories={categories}
								categoryCount={categoryCount}
								layoutIdPrefix="mobile"
								reducedMotion={reducedMotion}
								onNavigate={closeMobile}
								showCloseButton
								onRequestClose={closeMobile}
							/>
						</motion.dialog>
					</>
				)}
			</AnimatePresence>
		</>
	);
}
