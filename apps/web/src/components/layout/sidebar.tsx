"use client";

import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/use-categories";
import { useSidebarStore } from "@/stores/sidebar-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	ChevronRight,
	Database,
	Eye,
	FileText,
	Share2,
	LayoutDashboard,
	MessageSquarePlus,
	Rss,
	Settings,
	Sparkles,
	TrendingUp,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
	const hex = input.trim();
	if (!hex.startsWith("#")) return null;
	const value = hex.slice(1);
	if (!/^[0-9a-fA-F]{3}$/.test(value) && !/^[0-9a-fA-F]{6}$/.test(value)) return null;

	const expanded =
		value.length === 3
			? value
					.split("")
					.map((c) => `${c}${c}`)
					.join("")
			: value;

	const r = Number.parseInt(expanded.slice(0, 2), 16);
	const g = Number.parseInt(expanded.slice(2, 4), 16);
	const b = Number.parseInt(expanded.slice(4, 6), 16);
	if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;

	return { r, g, b };
}

function getCategoryBadgeStyle(color: string | null): React.CSSProperties | undefined {
	if (!color) return undefined;
	const parsed = parseHexColor(color);
	if (!parsed) return undefined;

	return {
		color: `rgb(${parsed.r} ${parsed.g} ${parsed.b})`,
		backgroundColor: `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.12)`,
	};
}

const navigation = [
	{ name: "数据看板", href: "/", icon: LayoutDashboard },
	{ name: "全部资讯", href: "/articles", icon: FileText },
	{ name: "信息源", href: "/sources", icon: Rss },
	{ name: "统计分析", href: "/analytics", icon: TrendingUp },
	{ name: "知识图谱", href: "/knowledge", icon: Share2 },
	{ name: "数据管理", href: "/data", icon: Database },
	{ name: "留言反馈", href: "/feedback", icon: MessageSquarePlus },
	{ name: "系统设置", href: "/settings", icon: Settings },
];

type CategoriesQuery = ReturnType<typeof useCategories>;
type CategoryList = NonNullable<CategoriesQuery["data"]>;

interface SidebarPanelProps {
	collapsed: boolean;
	pathname: string;
	categoriesQuery: CategoriesQuery;
	categories: CategoryList;
	categoryCount: number;
	layoutIdPrefix: string;
	onNavigate?: () => void;
	showCollapseToggle?: boolean;
	onToggleCollapsed?: () => void;
	showCloseButton?: boolean;
	onRequestClose?: () => void;
}

function SidebarPanel({
	collapsed,
	pathname,
	categoriesQuery,
	categories,
	categoryCount,
	layoutIdPrefix,
	onNavigate,
	showCollapseToggle,
	onToggleCollapsed,
	showCloseButton,
	onRequestClose,
}: SidebarPanelProps) {
	return (
		<>
			{/* Logo - 带呼吸动画 */}
			<div className="flex h-16 items-center gap-3 border-b border-neutral-100 px-4">
				<motion.div
					className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-brand"
					whileHover={{ scale: 1.08, rotate: 5 }}
					whileTap={{ scale: 0.95 }}
				>
					<Eye className="h-5 w-5" />
					<motion.div
						className="absolute -right-0.5 -top-0.5"
						animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
						transition={{
							duration: 2,
							repeat: Number.POSITIVE_INFINITY,
							ease: "easeInOut",
						}}
					>
						<Sparkles className="h-3 w-3 text-yellow-300" />
					</motion.div>
				</motion.div>
				<AnimatePresence>
					{!collapsed && (
						<motion.div
							className="flex flex-col overflow-hidden"
							initial={{ opacity: 0, width: 0 }}
							animate={{ opacity: 1, width: "auto" }}
							exit={{ opacity: 0, width: 0 }}
							transition={{ duration: 0.2 }}
						>
							<span className="text-lg font-bold text-neutral-900">法眼</span>
							<span className="text-xs text-neutral-500">Law Eye</span>
						</motion.div>
					)}
				</AnimatePresence>
				{showCloseButton && (
					<button
						type="button"
						className={cn(
							"ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl",
							"text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
						)}
						aria-label="关闭导航菜单"
						onClick={() => onRequestClose?.()}
					>
						<X className="h-5 w-5" aria-hidden="true" />
					</button>
				)}
			</div>

			{/* Navigation */}
			<nav className="flex-1 space-y-1 overflow-y-auto p-3">
				<div className="mb-4">
					<AnimatePresence>
						{!collapsed && (
							<motion.p
								className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-neutral-400"
								initial={{ opacity: 0, x: -10 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -10 }}
							>
								导航
							</motion.p>
						)}
					</AnimatePresence>
					{navigation.map((item, index) => {
						const isActive = pathname === item.href;
						return (
							<motion.div
								key={item.name}
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: index * 0.05 }}
							>
								<Link
									href={item.href}
									onClick={onNavigate}
									className={cn(
										"group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
										"transition-all duration-200",
										isActive
											? "text-primary-700"
											: "text-neutral-600 hover:text-neutral-900",
										collapsed && "justify-center",
									)}
								>
									{/* 活跃状态背景 */}
									{isActive && (
										<motion.div
											layoutId={`${layoutIdPrefix}-activeNav`}
											className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary-50 to-primary-100 shadow-sm"
											transition={{
												type: "spring",
												stiffness: 300,
												damping: 30,
											}}
										/>
									)}

									<motion.div
										className="relative z-10"
										whileHover={{ scale: 1.1, rotate: isActive ? 0 : 5 }}
										transition={{ type: "spring", stiffness: 400 }}
									>
										<item.icon
											className={cn(
												"h-5 w-5 shrink-0",
												isActive
													? "text-primary-500"
													: "text-neutral-400 group-hover:text-primary-400",
											)}
										/>
									</motion.div>

									<AnimatePresence>
										{!collapsed && (
											<motion.span
												className="relative z-10"
												initial={{ opacity: 0, x: -10 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: -10 }}
											>
												{item.name}
											</motion.span>
										)}
									</AnimatePresence>
								</Link>
							</motion.div>
						);
					})}
				</div>

				{/* Categories */}
				<AnimatePresence>
					{!collapsed && (
						<motion.div
							className="pt-4 border-t border-neutral-100"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
						>
							<motion.p
								className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-neutral-400"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.1 }}
							>
								{categoriesQuery.isLoading
									? "板块加载中"
									: categoriesQuery.isError
										? "板块加载失败"
										: `${categoryCount} 板块`}
							</motion.p>
							{categoriesQuery.isLoading ? (
								<div className="space-y-1 px-3">
									{Array.from({ length: 8 }, (_, idx) => `cat-skel-${idx}`).map(
										(key) => (
											<div
												key={key}
												className="h-9 rounded-xl bg-neutral-100 animate-pulse"
											/>
										),
									)}
								</div>
							) : categoriesQuery.isError ? (
								<div className="px-3 py-2 text-xs text-neutral-500">
									<p>无法加载板块数据（请检查 API / 登录状态）。</p>
									<button
										type="button"
										onClick={() => categoriesQuery.refetch()}
										className="mt-2 inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
									>
										重试
									</button>
								</div>
							) : (
								<div className="space-y-0.5">
									{categories.map((category, index) => {
										const isActive = pathname === `/category/${category.slug}`;
										const iconText =
											category.icon?.trim() ||
											category.name.trim().slice(0, 1) ||
											"#";
										const badgeStyle = getCategoryBadgeStyle(category.color);

										return (
											<motion.div
												key={category.id}
												initial={{ opacity: 0, x: -20 }}
												animate={{ opacity: 1, x: 0 }}
												transition={{ delay: 0.15 + index * 0.03 }}
											>
												<Link
													href={`/category/${category.slug}`}
													onClick={onNavigate}
													className={cn(
														"group flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
														"transition-all duration-200",
														isActive
															? "bg-neutral-100 text-neutral-900 font-medium"
															: "text-neutral-600 hover:bg-neutral-50/80 hover:text-neutral-900",
													)}
												>
													<motion.div
														className={cn(
															"flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold",
															badgeStyle ? "" : "bg-neutral-100 text-neutral-600",
														)}
														style={badgeStyle}
														whileHover={{ scale: 1.15, rotate: 10 }}
														transition={{ type: "spring", stiffness: 400 }}
														aria-hidden="true"
													>
														{iconText}
													</motion.div>
													<span>{category.name}</span>
												</Link>
											</motion.div>
										);
									})}
								</div>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</nav>

			{/* Collapse Button */}
			{showCollapseToggle && onToggleCollapsed && (
				<div className="border-t border-neutral-100 p-3">
					<motion.button
						onClick={onToggleCollapsed}
						className={cn(
							"flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm",
							"bg-gradient-to-r from-neutral-50 to-neutral-100/80 text-neutral-600",
							"border border-neutral-200/50",
							"hover:from-primary-50 hover:to-primary-100/50 hover:text-primary-600 hover:border-primary-200/50",
						)}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						<motion.div
							animate={{ rotate: collapsed ? 0 : 180 }}
							transition={{ duration: 0.3 }}
						>
							<ChevronRight className="h-4 w-4" />
						</motion.div>
						<AnimatePresence>
							{!collapsed && (
								<motion.span
									initial={{ opacity: 0, width: 0 }}
									animate={{ opacity: 1, width: "auto" }}
									exit={{ opacity: 0, width: 0 }}
								>
									收起菜单
								</motion.span>
							)}
						</AnimatePresence>
					</motion.button>
				</div>
			)}
		</>
	);
}

export function Sidebar() {
	const pathname = usePathname();
	const { collapsed, toggle, mobileOpen, closeMobile } = useSidebarStore();
	const categoriesQuery = useCategories();
	const categories = categoriesQuery.data ?? [];
	const categoryCount = categories.length;

	const previousPathnameRef = useRef<string | null>(null);

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

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeMobile();
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = previousOverflow;
		};
	}, [mobileOpen, closeMobile]);

	const baseAsideClassName = cn(
		"fixed left-0 top-0 flex h-screen flex-col",
		"bg-white/90 backdrop-blur-xl",
		"border-r border-neutral-200/60",
		"shadow-lg shadow-neutral-200/20",
	);

	return (
		<>
			{/* Desktop */}
			<motion.aside
				initial={false}
				animate={{ width: collapsed ? 64 : 280 }}
				transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
				className={cn(baseAsideClassName, "z-30 hidden md:flex")}
				aria-label="主导航"
			>
				<SidebarPanel
					collapsed={collapsed}
					pathname={pathname}
					categoriesQuery={categoriesQuery}
					categories={categories}
					categoryCount={categoryCount}
					layoutIdPrefix="desktop"
					showCollapseToggle
					onToggleCollapsed={toggle}
				/>
			</motion.aside>

			{/* Mobile Drawer */}
			<AnimatePresence>
				{mobileOpen && (
					<>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="fixed inset-0 z-40 bg-black/40 md:hidden"
							onClick={closeMobile}
							aria-hidden="true"
						/>
						<motion.aside
							initial={{ x: -320 }}
							animate={{ x: 0 }}
							exit={{ x: -320 }}
							transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
							className={cn(baseAsideClassName, "z-50 w-[280px] md:hidden")}
							aria-label="主导航"
						>
							<SidebarPanel
								collapsed={false}
								pathname={pathname}
								categoriesQuery={categoriesQuery}
								categories={categories}
								categoryCount={categoryCount}
								layoutIdPrefix="mobile"
								onNavigate={closeMobile}
								showCloseButton
								onRequestClose={closeMobile}
							/>
						</motion.aside>
					</>
				)}
			</AnimatePresence>
		</>
	);
}
