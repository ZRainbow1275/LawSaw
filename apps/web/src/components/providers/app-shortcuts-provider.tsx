"use client";

import { CommandPalette } from "@/components/ui/command-palette";
import { ShortcutsHelp } from "@/components/ui/shortcuts-help";
import { withLocalePath } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import {
	GLOBAL_SAVE_SHORTCUT_EVENT,
	type GlobalSaveShortcutDetail,
} from "@/lib/shortcuts";
import { useSidebarStore } from "@/stores/sidebar-store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tagName = target.tagName.toLowerCase();
	return (
		tagName === "input" ||
		tagName === "textarea" ||
		tagName === "select" ||
		target.closest("[contenteditable='true']") !== null
	);
}

interface OverlayController {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

interface OverlayContextValue {
	commandPalette: OverlayController;
	shortcutsHelp: OverlayController;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

function createController(
	isOpen: boolean,
	setOpen: (next: boolean) => void,
): OverlayController {
	return {
		isOpen,
		open: () => setOpen(true),
		close: () => setOpen(false),
		toggle: () => setOpen(!isOpen),
	};
}

/**
 * Linear/GitHub-style two-key navigation prefix table. After pressing `g`
 * (and within 1.2s) any of these letters teleports the user to the route.
 * Sidebar nav items render the matching chip via `g.<key>`.
 */
const NAVIGATION_PREFIX_TABLE: Record<string, { href: string; label: string }> =
	{
		d: { href: "/dashboard", label: "Dashboard" },
		f: { href: "/me/feed", label: "My feed" },
		s: { href: "/search", label: "Search" },
		a: { href: "/articles", label: "Articles" },
		r: { href: "/reports", label: "Reports" },
		n: { href: "/me/notifications", label: "Notifications" },
		t: { href: "/settings", label: "Settings" },
	};

const PREFIX_TIMEOUT_MS = 1_200;

interface PrefixIndicatorProps {
	visible: boolean;
}

function PrefixIndicator({ visible }: PrefixIndicatorProps) {
	const reducedMotion = useReducedMotion() ?? false;
	return (
		<AnimatePresence initial={!reducedMotion}>
			{visible ? (
				<motion.div
					// biome-ignore lint/a11y/useSemanticElements: status role is appropriate here for transient navigation prefix announcements; output element does not nest motion.div as cleanly.
					role="status"
					aria-live="polite"
					initial={reducedMotion ? false : { opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={reducedMotion ? undefined : { opacity: 0, y: 12 }}
					transition={{ duration: reducedMotion ? 0.12 : 0.18 }}
					className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-md"
					style={{
						backgroundColor:
							"color-mix(in srgb, var(--surface-card-foreground) 78%, transparent)",
						borderColor:
							"color-mix(in srgb, var(--surface-card-faint-fg) 24%, transparent)",
						color: "color-mix(in srgb, white 96%, transparent)",
					}}
				>
					<div className="flex items-center gap-3 text-xs font-medium">
						<span className="flex items-center gap-1.5">
							<kbd className="rounded border border-white/30 bg-white/10 px-2 py-0.5 font-mono text-[11px]">
								g
							</kbd>
							<span aria-hidden="true">+</span>
							<kbd className="rounded border border-white/30 bg-white/10 px-2 py-0.5 font-mono text-[11px]">
								?
							</kbd>
						</span>
						<span className="text-white/80">
							d · f · s · a · r · n · t
						</span>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

export function AppShortcutsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const locale = useLocale();
	const pathname = usePathname() ?? "/";
	const toggleSidebar = useSidebarStore((state) => state.toggle);
	const [isPaletteOpen, setIsPaletteOpen] = useState(false);
	const [isHelpOpen, setIsHelpOpen] = useState(false);
	const [prefixActive, setPrefixActive] = useState(false);
	const prefixTimerRef = useRef<number | null>(null);

	const setPaletteOpen = useCallback((next: boolean) => {
		setIsPaletteOpen(next);
	}, []);

	const setHelpOpen = useCallback((next: boolean) => {
		setIsHelpOpen(next);
	}, []);

	const clearPrefix = useCallback(() => {
		if (prefixTimerRef.current !== null) {
			window.clearTimeout(prefixTimerRef.current);
			prefixTimerRef.current = null;
		}
		setPrefixActive(false);
	}, []);

	useEffect(() => {
		return () => {
			if (prefixTimerRef.current !== null) {
				window.clearTimeout(prefixTimerRef.current);
				prefixTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();
			const editableTarget = isEditableTarget(event.target);

			// Two-step navigation prefix (g + letter). Linear / GitHub style.
			if (prefixActive && !editableTarget) {
				const target = NAVIGATION_PREFIX_TABLE[key];
				if (target) {
					event.preventDefault();
					router.push(withLocalePath(locale, target.href));
					clearPrefix();
					return;
				}
				if (event.key !== "Shift" && event.key !== "Meta") {
					clearPrefix();
				}
			}

			if (
				!prefixActive &&
				key === "g" &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				!editableTarget
			) {
				event.preventDefault();
				setPrefixActive(true);
				if (prefixTimerRef.current !== null) {
					window.clearTimeout(prefixTimerRef.current);
				}
				prefixTimerRef.current = window.setTimeout(() => {
					setPrefixActive(false);
					prefixTimerRef.current = null;
				}, PREFIX_TIMEOUT_MS);
				return;
			}

			if (event.key === "Escape" && prefixActive) {
				event.preventDefault();
				clearPrefix();
				return;
			}

			if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

			if (key === "b" && !editableTarget) {
				event.preventDefault();
				toggleSidebar();
				return;
			}

			// Cmd/Ctrl+K — universal command palette trigger (Linear / Vercel style).
			if (key === "k" && !event.shiftKey) {
				event.preventDefault();
				setIsHelpOpen(false);
				setIsPaletteOpen((current) => !current);
				return;
			}

			// Legacy / power-user fallback.
			if (event.shiftKey && key === "p") {
				event.preventDefault();
				setIsHelpOpen(false);
				setIsPaletteOpen((current) => !current);
				return;
			}

			if (!event.shiftKey && (key === "/" || event.code === "Slash")) {
				event.preventDefault();
				setIsPaletteOpen(false);
				setIsHelpOpen((current) => !current);
				return;
			}

			if (key === "s" && !event.shiftKey) {
				event.preventDefault();
				window.dispatchEvent(
					new CustomEvent<GlobalSaveShortcutDetail>(
						GLOBAL_SAVE_SHORTCUT_EVENT,
						{
							detail: {
								pathname,
								trigger: "keyboard",
								timestamp: Date.now(),
							},
						},
					),
				);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		clearPrefix,
		locale,
		pathname,
		prefixActive,
		router,
		toggleSidebar,
	]);

	const value = useMemo<OverlayContextValue>(
		() => ({
			commandPalette: createController(isPaletteOpen, setPaletteOpen),
			shortcutsHelp: createController(isHelpOpen, setHelpOpen),
		}),
		[isPaletteOpen, isHelpOpen, setPaletteOpen, setHelpOpen],
	);

	return (
		<OverlayContext.Provider value={value}>
			{children}
			<PrefixIndicator visible={prefixActive} />
			<CommandPalette
				isOpen={isPaletteOpen}
				onClose={() => setIsPaletteOpen(false)}
				onOpenShortcutsHelp={() => {
					setIsPaletteOpen(false);
					setIsHelpOpen(true);
				}}
			/>
			<ShortcutsHelp isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
		</OverlayContext.Provider>
	);
}

function useOverlayContext(): OverlayContextValue {
	const ctx = useContext(OverlayContext);
	if (!ctx) {
		throw new Error(
			"AppShortcutsProvider context unavailable; ensure <AppShortcutsProvider /> wraps the tree.",
		);
	}
	return ctx;
}

export function useCommandPaletteController(): OverlayController {
	return useOverlayContext().commandPalette;
}

export function useShortcutsHelpController(): OverlayController {
	return useOverlayContext().shortcutsHelp;
}

export const NAVIGATION_PREFIX_KEYS: Record<string, string> = Object.fromEntries(
	Object.entries(NAVIGATION_PREFIX_TABLE).map(([key, value]) => [
		value.href,
		key,
	]),
);
