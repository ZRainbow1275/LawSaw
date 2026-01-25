import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
	collapsed: boolean;
	readerMode: boolean;
	hovered: boolean;
	setCollapsed: (collapsed: boolean) => void;
	toggle: () => void;
	setReaderMode: (readerMode: boolean) => void;
	setHovered: (hovered: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
	persist(
		(set) => ({
			collapsed: false,
			readerMode: false,
			hovered: false,
			setCollapsed: (collapsed) => set({ collapsed }),
			toggle: () => set((state) => ({ collapsed: !state.collapsed })),
			setReaderMode: (readerMode) => set({ readerMode }),
			setHovered: (hovered) => set({ hovered }),
		}),
		{
			name: "law-eye-sidebar",
			partialize: (state) => ({ collapsed: state.collapsed }),
		},
	),
);
