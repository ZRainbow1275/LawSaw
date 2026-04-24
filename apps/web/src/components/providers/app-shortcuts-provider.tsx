"use client";

import { CommandPalette } from "@/components/ui/command-palette";
import { ShortcutsHelp } from "@/components/ui/shortcuts-help";
import {
	GLOBAL_SAVE_SHORTCUT_EVENT,
	type GlobalSaveShortcutDetail,
} from "@/lib/shortcuts";
import { useSidebarStore } from "@/stores/sidebar-store";
import { usePathname } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
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

export function AppShortcutsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname() ?? "/";
	const toggleSidebar = useSidebarStore((state) => state.toggle);
	const [isPaletteOpen, setIsPaletteOpen] = useState(false);
	const [isHelpOpen, setIsHelpOpen] = useState(false);

	const setPaletteOpen = useCallback((next: boolean) => {
		setIsPaletteOpen(next);
	}, []);

	const setHelpOpen = useCallback((next: boolean) => {
		setIsHelpOpen(next);
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

			const key = event.key.toLowerCase();
			const editableTarget = isEditableTarget(event.target);

			if (key === "b" && !editableTarget) {
				event.preventDefault();
				toggleSidebar();
				return;
			}

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
	}, [pathname, toggleSidebar]);

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
			<CommandPalette
				isOpen={isPaletteOpen}
				onClose={() => setIsPaletteOpen(false)}
				onOpenShortcutsHelp={() => {
					setIsPaletteOpen(false);
					setIsHelpOpen(true);
				}}
			/>
			<ShortcutsHelp
				isOpen={isHelpOpen}
				onClose={() => setIsHelpOpen(false)}
			/>
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
