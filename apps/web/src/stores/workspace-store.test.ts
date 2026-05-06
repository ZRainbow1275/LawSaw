import { beforeEach, describe, expect, it } from "vitest";
import {
	WORKSPACE_DEFAULT_PATHS,
	classifyWorkspace,
	useWorkspaceStore,
} from "./workspace-store";

function resetStore() {
	useWorkspaceStore.setState({
		panel: "user",
		lastAdminPath: WORKSPACE_DEFAULT_PATHS.admin,
		lastUserPath: WORKSPACE_DEFAULT_PATHS.user,
		switcherSeen: false,
	});
	if (typeof window !== "undefined") {
		try {
			window.localStorage.removeItem("lawsaw-workspace");
		} catch {
			/* ignore */
		}
	}
}

describe("workspace store", () => {
	beforeEach(() => {
		resetStore();
	});

	it("starts with panel=user", () => {
		expect(useWorkspaceStore.getState().panel).toBe("user");
	});

	it("setPanel switches the panel", () => {
		useWorkspaceStore.getState().setPanel("admin");
		expect(useWorkspaceStore.getState().panel).toBe("admin");
		useWorkspaceStore.getState().setPanel("user");
		expect(useWorkspaceStore.getState().panel).toBe("user");
	});

	it("setPanel is idempotent (no-op when same value)", () => {
		const before = useWorkspaceStore.getState();
		useWorkspaceStore.getState().setPanel("user");
		const after = useWorkspaceStore.getState();
		expect(after).toBe(before);
	});

	it("togglePanel flips between user and admin", () => {
		expect(useWorkspaceStore.getState().panel).toBe("user");
		useWorkspaceStore.getState().togglePanel();
		expect(useWorkspaceStore.getState().panel).toBe("admin");
		useWorkspaceStore.getState().togglePanel();
		expect(useWorkspaceStore.getState().panel).toBe("user");
	});

	it("setLastPath updates only the matching workspace", () => {
		useWorkspaceStore.getState().setLastPath("admin", "/admin/governance");
		useWorkspaceStore.getState().setLastPath("user", "/me/feed?tab=today");

		const state = useWorkspaceStore.getState();
		expect(state.lastAdminPath).toBe("/admin/governance");
		expect(state.lastUserPath).toBe("/me/feed?tab=today");
	});

	it("markSwitcherSeen flips switcherSeen to true", () => {
		expect(useWorkspaceStore.getState().switcherSeen).toBe(false);
		useWorkspaceStore.getState().markSwitcherSeen();
		expect(useWorkspaceStore.getState().switcherSeen).toBe(true);
	});

	it("classifyWorkspace returns admin for admin paths", () => {
		expect(classifyWorkspace("/admin")).toBe("admin");
		expect(classifyWorkspace("/settings/admin/users")).toBe("admin");
	});

	it("classifyWorkspace returns user for user paths", () => {
		expect(classifyWorkspace("/me/feed")).toBe("user");
		expect(classifyWorkspace("/articles/1")).toBe("user");
		expect(classifyWorkspace("/dashboard")).toBe("user");
	});

	it("classifyWorkspace returns null for unknown paths", () => {
		expect(classifyWorkspace("/login")).toBe(null);
	});
});
