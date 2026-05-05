import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Workspace = "user" | "admin";

interface WorkspaceState {
	panel: Workspace;
	lastAdminPath: string;
	lastUserPath: string;
	switcherSeen: boolean;
	setPanel: (panel: Workspace) => void;
	togglePanel: () => void;
	setLastPath: (workspace: Workspace, path: string) => void;
	markSwitcherSeen: () => void;
}

const DEFAULT_ADMIN_PATH = "/admin";
const DEFAULT_USER_PATH = "/me/feed";

export const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set) => ({
			panel: "user",
			lastAdminPath: DEFAULT_ADMIN_PATH,
			lastUserPath: DEFAULT_USER_PATH,
			switcherSeen: false,
			setPanel: (panel) =>
				set((state) => (state.panel === panel ? state : { ...state, panel })),
			togglePanel: () =>
				set((state) => ({
					...state,
					panel: state.panel === "admin" ? "user" : "admin",
				})),
			setLastPath: (workspace, path) =>
				set((state) =>
					workspace === "admin"
						? state.lastAdminPath === path
							? state
							: { ...state, lastAdminPath: path }
						: state.lastUserPath === path
							? state
							: { ...state, lastUserPath: path },
				),
			markSwitcherSeen: () => set({ switcherSeen: true }),
		}),
		{
			name: "lawsaw-workspace",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				panel: state.panel,
				lastAdminPath: state.lastAdminPath,
				lastUserPath: state.lastUserPath,
				switcherSeen: state.switcherSeen,
			}),
		},
	),
);

export function classifyWorkspace(pathname: string): Workspace | null {
	if (pathname.startsWith("/settings/admin") || pathname.startsWith("/admin")) {
		return "admin";
	}
	if (
		pathname === "/me" ||
		pathname.startsWith("/me/") ||
		pathname.startsWith("/articles") ||
		pathname.startsWith("/reports") ||
		pathname.startsWith("/analytics") ||
		pathname.startsWith("/knowledge") ||
		pathname.startsWith("/category/") ||
		pathname.startsWith("/feedback") ||
		pathname.startsWith("/search") ||
		pathname.startsWith("/dashboard")
	) {
		return "user";
	}
	return null;
}

export const WORKSPACE_DEFAULT_PATHS: Record<Workspace, string> = {
	admin: DEFAULT_ADMIN_PATH,
	user: DEFAULT_USER_PATH,
};
