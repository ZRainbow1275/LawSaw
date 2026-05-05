"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
	type Command,
	type CommandContext,
	appendRecentCommandId,
	builtinCommands,
	filterAndRankCommands,
	readRecentCommandIds,
	writeRecentCommandIds,
} from "@/lib/commands";
import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants, scaleVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/appearance-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
	ArrowRight,
	CornerDownLeft,
	Search as SearchIcon,
	X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
	onOpenShortcutsHelp: () => void;
}

const backdropStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-neutral-950) 40%, transparent)",
} as const;

const surfaceStyle = {
	backgroundColor: "var(--surface-muted-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const nestedSurfaceStyle = {
	backgroundColor: "var(--control-hover-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const headingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const mutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

const selectedStyle = {
	backgroundColor: "var(--control-selected-bg)",
	borderColor: "var(--control-selected-border)",
	color: "var(--control-selected-text)",
} as const;

const accentIconStyle = {
	color: "var(--surface-accent-strong)",
} as const;

export function CommandPalette({
	isOpen,
	onClose,
	onOpenShortcutsHelp,
}: CommandPaletteProps) {
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
	const pathname = usePathname() ?? "/";
	const searchParams = useSearchParams();
	const reducedMotion = useReducedMotion() ?? false;
	const appearance = useAppearanceStore((state) => state.appearance);
	const setAppearance = useAppearanceStore((state) => state.setAppearance);
	const toggleSidebar = useSidebarStore((state) => state.toggle);
	const { logout } = useAuth();

	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [recentIds, setRecentIds] = useState<string[]>([]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		setRecentIds(readRecentCommandIds(window.localStorage));
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		setQuery("");
		setSelectedIndex(0);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const raf = window.requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
		return () => {
			window.cancelAnimationFrame(raf);
			document.body.style.overflow = previousOverflow;
		};
	}, [isOpen]);

	const switchLocale = useCallback(() => {
		const nextLocale = locale === "zh" ? "en" : "zh";
		const qs = searchParams?.toString() ?? "";
		const bare = stripLocalePrefix(pathname || "/");
		router.push(withLocalePath(nextLocale, qs ? `${bare}?${qs}` : bare));
	}, [locale, pathname, router, searchParams]);

	const paletteRouter = useMemo(
		() => ({
			push: (href: string) => router.push(href),
			replace: (href: string) => router.replace(href),
		}),
		[router],
	);

	const commandCtx = useMemo<CommandContext>(
		() => ({
			locale,
			pathname,
			router: paletteRouter,
			appearance,
			setAppearance,
			toggleSidebar,
			switchLocale,
			logout: async () => {
				await logout();
			},
			openShortcutsHelp: onOpenShortcutsHelp,
			closePalette: onClose,
		}),
		[
			locale,
			pathname,
			paletteRouter,
			appearance,
			setAppearance,
			toggleSidebar,
			switchLocale,
			logout,
			onOpenShortcutsHelp,
			onClose,
		],
	);

	const allCommands = useMemo(() => builtinCommands(), []);

	const visibleCommands = useMemo<Command[]>(() => {
		const matched = filterAndRankCommands(allCommands, query);
		if (query.trim()) return matched;

		if (recentIds.length === 0) return matched;
		const idToCommand = new Map(allCommands.map((cmd) => [cmd.id, cmd]));
		const recent: Command[] = [];
		const seen = new Set<string>();
		for (const id of recentIds) {
			const cmd = idToCommand.get(id);
			if (cmd && !seen.has(cmd.id)) {
				recent.push(cmd);
				seen.add(cmd.id);
			}
		}
		const remaining = matched.filter((cmd) => !seen.has(cmd.id));
		return [...recent, ...remaining];
	}, [allCommands, query, recentIds]);

	const handleQueryChange = useCallback((nextQuery: string) => {
		setQuery(nextQuery);
		setSelectedIndex(0);
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		if (visibleCommands.length === 0) {
			setSelectedIndex(0);
			return;
		}
		setSelectedIndex((current) =>
			Math.min(Math.max(0, current), visibleCommands.length - 1),
		);
	}, [isOpen, visibleCommands.length]);

	const runCommand = useCallback(
		async (command: Command) => {
			try {
				await command.run(commandCtx);
			} catch (error) {
				console.error("command palette execute failed", command.id, error);
			}
			if (typeof window !== "undefined") {
				const next = appendRecentCommandId(recentIds, command.id);
				setRecentIds(next);
				writeRecentCommandIds(window.localStorage, next);
			}
		},
		[commandCtx, recentIds],
	);

	const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key === "ArrowDown") {
			if (visibleCommands.length === 0) return;
			event.preventDefault();
			setSelectedIndex((current) =>
				current >= visibleCommands.length - 1 ? 0 : current + 1,
			);
			return;
		}
		if (event.key === "ArrowUp") {
			if (visibleCommands.length === 0) return;
			event.preventDefault();
			setSelectedIndex((current) =>
				current <= 0 ? visibleCommands.length - 1 : current - 1,
			);
			return;
		}
		if (event.key === "Home") {
			event.preventDefault();
			setSelectedIndex(0);
			return;
		}
		if (event.key === "End") {
			event.preventDefault();
			setSelectedIndex(Math.max(0, visibleCommands.length - 1));
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			const target = visibleCommands[selectedIndex];
			if (target) void runCommand(target);
		}
	};

	const categoryLabelKey = (cat: Command["category"]): string => {
		switch (cat) {
			case "navigate":
				return "Navigate";
			case "action":
				return "Action";
			case "settings":
				return "Settings";
			case "help":
				return "Help";
		}
	};

	useEffect(() => {
		if (!isOpen || !listRef.current) return;
		const selected = listRef.current.querySelector<HTMLElement>(
			`[data-command-index="${selectedIndex}"]`,
		);
		selected?.scrollIntoView({ block: "nearest" });
	}, [isOpen, selectedIndex]);

	return (
		<AnimatePresence initial={!reducedMotion}>
			{isOpen ? (
				<motion.div
					className="fixed inset-0 z-[60] flex items-start justify-center px-4 py-20 backdrop-blur-sm md:py-28"
					style={backdropStyle}
					initial="hidden"
					animate="visible"
					exit="hidden"
					variants={overlayVariants}
					onClick={onClose}
					role="presentation"
				>
					<motion.dialog
						open
						className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
						style={surfaceStyle}
						variants={scaleVariants}
						initial="hidden"
						animate="visible"
						exit="hidden"
						onClick={(event) => event.stopPropagation()}
						aria-modal="true"
						aria-labelledby="command-palette-label"
					>
						<div
							className="border-b p-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div
								className="flex items-center gap-3 rounded-xl border px-3 py-2 shadow-sm"
								style={nestedSurfaceStyle}
							>
								<SearchIcon
									aria-hidden="true"
									className="h-4 w-4 shrink-0"
									style={accentIconStyle}
								/>
								<input
									ref={inputRef}
									type="search"
									aria-label={t("Command palette")}
									placeholder={t("Type a command or navigation, Enter to run")}
									className="h-8 w-full border-0 bg-transparent text-sm focus:outline-none"
									style={headingTextStyle}
									value={query}
									onChange={(event) => handleQueryChange(event.target.value)}
									onKeyDown={handleInputKeyDown}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8 shrink-0"
									aria-label={t("Close")}
									onClick={onClose}
								>
									<X aria-hidden="true" className="h-4 w-4" />
								</Button>
							</div>
							<p
								id="command-palette-label"
								className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]"
								style={mutedTextStyle}
							>
								<span>
									{t("Use arrow keys to navigate, Enter to open, Esc to close")}
								</span>
								<span className="flex items-center gap-1">
									<kbd
										className="rounded border px-1.5 py-0.5 font-sans text-[10px]"
										style={nestedSurfaceStyle}
									>
										Ctrl
									</kbd>
									<kbd
										className="rounded border px-1.5 py-0.5 font-sans text-[10px]"
										style={nestedSurfaceStyle}
									>
										Shift
									</kbd>
									<kbd
										className="rounded border px-1.5 py-0.5 font-sans text-[10px]"
										style={nestedSurfaceStyle}
									>
										P
									</kbd>
								</span>
							</p>
						</div>

						<div className="max-h-[60vh] overflow-y-auto p-2">
							{visibleCommands.length === 0 ? (
								<div
									className="flex flex-col items-center gap-2 py-12 text-sm"
									style={mutedTextStyle}
								>
									<p>{t("No matching commands")}</p>
									<p className="text-xs">
										{t(
											"Try keywords like settings, theme, search or 设置、主题、搜索",
										)}
									</p>
								</div>
							) : (
								<div
									ref={listRef}
									aria-label={t("Command palette results")}
									className="flex flex-col gap-1"
								>
									{visibleCommands.map((command, index) => {
										const Icon = command.icon;
										const isSelected = index === selectedIndex;
										return (
											<button
												key={command.id}
												data-command-index={index}
												type="button"
												aria-pressed={isSelected}
												className={cn(
													"flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
												)}
												style={isSelected ? selectedStyle : nestedSurfaceStyle}
												onMouseEnter={() => setSelectedIndex(index)}
												onClick={() => void runCommand(command)}
											>
												{Icon ? (
													<Icon
														aria-hidden="true"
														className="h-4 w-4 shrink-0"
														style={isSelected ? undefined : accentIconStyle}
													/>
												) : (
													<ArrowRight
														aria-hidden="true"
														className="h-4 w-4 shrink-0"
														style={isSelected ? undefined : accentIconStyle}
													/>
												)}
												<div className="min-w-0 flex-1">
													<p
														className="truncate text-sm font-medium"
														style={isSelected ? undefined : headingTextStyle}
													>
														{locale === "en" && command.titleEn
															? command.titleEn
															: command.title}
													</p>
													<p
														className="truncate text-[11px]"
														style={isSelected ? undefined : mutedTextStyle}
													>
														{t(categoryLabelKey(command.category))}
														{command.shortcut ? ` · ${command.shortcut}` : ""}
													</p>
												</div>
												{isSelected ? (
													<CornerDownLeft
														aria-hidden="true"
														className="h-4 w-4 shrink-0 opacity-80"
													/>
												) : null}
											</button>
										);
									})}
								</div>
							)}
						</div>

						<div
							className="flex items-center justify-between border-t px-4 py-3 text-[11px]"
							style={{
								borderColor: "var(--surface-muted-border)",
								...mutedTextStyle,
							}}
						>
							<span>
								{query.trim()
									? t("{count} results", {
											count: visibleCommands.length,
										})
									: t("Recent and all commands")}
							</span>
							<span>{t("Press Ctrl+/ to view all shortcuts")}</span>
						</div>
					</motion.dialog>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
