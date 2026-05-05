"use client";

import { type RoleTier, normalizeRoleTier } from "@/lib/authz";
import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import {
	WORKSPACE_DEFAULT_PATHS,
	type Workspace,
	classifyWorkspace,
	useWorkspaceStore,
} from "@/stores/workspace-store";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Newspaper, Shield } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isAdminTier(tier: RoleTier): boolean {
	return tier === "tenant_admin" || tier === "super_admin";
}

interface OptionConfig {
	id: Workspace;
	labelKey: string;
	descriptionKey: string;
	icon: typeof Shield;
}

const OPTIONS: OptionConfig[] = [
	{
		id: "user",
		labelKey: "User workspace",
		descriptionKey: "Today's insights and personal reading",
		icon: Newspaper,
	},
	{
		id: "admin",
		labelKey: "Admin console",
		descriptionKey: "Operations hub and tenant governance",
		icon: Shield,
	},
];

export function WorkspaceSwitcher({ className }: { className?: string }) {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const roleTier = useAuthStore((state) => state.roleTier);
	const tier = normalizeRoleTier(roleTier);
	const isAdmin = isAdminTier(tier);

	const lastAdminPath = useWorkspaceStore((state) => state.lastAdminPath);
	const lastUserPath = useWorkspaceStore((state) => state.lastUserPath);
	const setLastPath = useWorkspaceStore((state) => state.setLastPath);
	const switcherSeen = useWorkspaceStore((state) => state.switcherSeen);
	const markSwitcherSeen = useWorkspaceStore((state) => state.markSwitcherSeen);

	const [open, setOpen] = useState(false);
	const [showHint, setShowHint] = useState(false);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);

	const stripped = stripLocalePrefix(pathname || "/");
	const currentWorkspace = classifyWorkspace(stripped) ?? "user";
	const activeOption =
		OPTIONS.find((option) => option.id === currentWorkspace) ?? OPTIONS[0];
	const ActiveIcon = activeOption.icon;

	useEffect(() => {
		if (!stripped) return;
		const ws = classifyWorkspace(stripped);
		if (ws) setLastPath(ws, stripped);
	}, [stripped, setLastPath]);

	useEffect(() => {
		if (!open) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setOpen(false);
			triggerRef.current?.focus();
		};

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (popoverRef.current?.contains(target)) return;
			if (triggerRef.current?.contains(target)) return;
			setOpen(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("pointerdown", handlePointerDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [open]);

	const handleSelect = (target: Workspace) => {
		setOpen(false);
		if (target === currentWorkspace) return;

		if (!switcherSeen) {
			setShowHint(true);
			markSwitcherSeen();
		}

		const candidate =
			target === "admin"
				? lastAdminPath || WORKSPACE_DEFAULT_PATHS.admin
				: lastUserPath || WORKSPACE_DEFAULT_PATHS.user;
		const safePath =
			classifyWorkspace(candidate) === target
				? candidate
				: WORKSPACE_DEFAULT_PATHS[target];
		router.push(withLocalePath(locale, safePath));
	};

	const visibleOptions = isAdmin ? OPTIONS : [OPTIONS[0]];

	const triggerStyle = {
		backgroundColor: "var(--surface-popover-bg)",
		borderColor: "var(--surface-muted-border)",
		color: "var(--field-foreground)",
	} as const;

	return (
		<div className={cn("relative", className)}>
			<motion.button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					"inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
					"shadow-sm transition-colors",
					"hover:border-[var(--surface-accent-border)]",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent-border)]",
					!isAdmin && "cursor-default opacity-90",
				)}
				style={triggerStyle}
				whileTap={isAdmin ? { scale: 0.97 } : undefined}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={t("Switch workspace")}
				disabled={!isAdmin}
				title={
					isAdmin
						? t("Switch workspace")
						: t("Admin workspace requires elevated role")
				}
			>
				<ActiveIcon
					aria-hidden="true"
					className="h-4 w-4"
					style={{
						color:
							currentWorkspace === "admin"
								? "var(--color-info)"
								: "var(--color-primary-500)",
					}}
				/>
				<span>{t(activeOption.labelKey)}</span>
				{isAdmin ? (
					<ChevronDown
						aria-hidden="true"
						className={cn(
							"h-3.5 w-3.5 transition-transform",
							open && "rotate-180",
						)}
						style={{ color: "var(--surface-muted-text)" }}
					/>
				) : null}
			</motion.button>

			<AnimatePresence>
				{open && isAdmin ? (
					<motion.div
						ref={popoverRef}
						role="menu"
						aria-label={t("Switch workspace")}
						initial={{ opacity: 0, scale: 0.96, y: 6 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.96, y: 4 }}
						transition={{ duration: 0.16, ease: [0.25, 0.8, 0.25, 1] }}
						className={cn(
							"absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-2xl border p-2",
							"shadow-popup-card popup-in",
						)}
						style={{
							backgroundColor: "var(--surface-popover-bg)",
							borderColor: "var(--surface-muted-border)",
						}}
					>
						<p
							className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{t("Switch workspace")}
						</p>
						<div className="space-y-1">
							{visibleOptions.map((option) => {
								const Icon = option.icon;
								const selected = option.id === currentWorkspace;
								const accent =
									option.id === "admin"
										? "var(--color-info)"
										: "var(--color-primary-500)";
								return (
									<button
										key={option.id}
										type="button"
										role="menuitemradio"
										aria-checked={selected}
										onClick={() => handleSelect(option.id)}
										className={cn(
											"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
											"hover:bg-[var(--control-hover-bg)]",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent-border)]",
										)}
										style={{ color: "var(--field-foreground)" }}
									>
										<span
											className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
											style={{
												backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
												color: accent,
											}}
										>
											<Icon aria-hidden="true" className="h-4 w-4" />
										</span>
										<span className="flex-1 min-w-0">
											<span
												className="block text-sm font-semibold"
												style={{ color: "var(--auth-copy-primary)" }}
											>
												{t(option.labelKey)}
											</span>
											<span
												className="mt-0.5 block truncate text-xs"
												style={{ color: "var(--surface-muted-text)" }}
											>
												{t(option.descriptionKey)}
											</span>
										</span>
										{selected ? (
											<Check
												aria-hidden="true"
												className="h-4 w-4"
												style={{ color: accent }}
											/>
										) : null}
									</button>
								);
							})}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>

			<AnimatePresence>
				{showHint ? (
					<motion.output
						aria-live="polite"
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.2 }}
						className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-72 rounded-xl border p-3 text-xs leading-relaxed shadow-popup-card"
						style={{
							backgroundColor: "var(--surface-muted-bg)",
							borderColor: "var(--surface-muted-border)",
							color: "var(--surface-muted-text)",
						}}
					>
						<p>
							{t(
								"Switching workspace changes the view only. Your role and permissions remain the same.",
							)}
						</p>
						<button
							type="button"
							onClick={() => setShowHint(false)}
							className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em]"
							style={{ color: "var(--color-primary-600)" }}
						>
							{t("Got it")}
						</button>
					</motion.output>
				) : null}
			</AnimatePresence>
		</div>
	);
}
