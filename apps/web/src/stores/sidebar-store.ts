import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
	collapsed: boolean;
	readerMode: boolean;
	hovered: boolean;
	mobileOpen: boolean;
	setCollapsed: (collapsed: boolean) => void;
	toggle: () => void;
	setReaderMode: (readerMode: boolean) => void;
	setHovered: (hovered: boolean) => void;
	setMobileOpen: (mobileOpen: boolean) => void;
	openMobile: () => void;
	closeMobile: () => void;
	toggleMobile: () => void;
}

export const useSidebarStore = create<SidebarState>()(
	persist(
		(set) => ({
			collapsed: false,
			readerMode: false,
			hovered: false,
			mobileOpen: false,
			setCollapsed: (collapsed) => set({ collapsed }),
			toggle: () => set((state) => ({ collapsed: !state.collapsed })),
			setReaderMode: (readerMode) => set({ readerMode }),
			setHovered: (hovered) => set({ hovered }),
			setMobileOpen: (mobileOpen) => set({ mobileOpen }),
			openMobile: () => set({ mobileOpen: true }),
			closeMobile: () => set({ mobileOpen: false }),
			toggleMobile: () => set((state) => ({ mobileOpen: !state.mobileOpen })),
		}),
		{
			name: "law-eye-sidebar",
			partialize: (state) => ({ collapsed: state.collapsed }),
		},
	),
);
