import type { User } from "@/lib/api/types";
import { create } from "zustand";

interface AuthState {
	user: User | null;
	roles: string[];
	permissions: string[];
	isAuthenticated: boolean;
	isLoading: boolean;
	setUser: (user: User | null) => void;
	setAuthz: (authz: { roles: string[]; permissions: string[] } | null) => void;
	setLoading: (loading: boolean) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
	user: null,
	roles: [],
	permissions: [],
	isAuthenticated: false,
	isLoading: true,

	setUser: (user) =>
		set((state) => ({
			user,
			isAuthenticated: !!user,
			isLoading: false,
			roles: user ? state.roles : [],
			permissions: user ? state.permissions : [],
		})),

	setAuthz: (authz) =>
		set({
			roles: authz?.roles ?? [],
			permissions: authz?.permissions ?? [],
		}),

	setLoading: (isLoading) => set({ isLoading }),

	logout: () =>
		set({
			user: null,
			roles: [],
			permissions: [],
			isAuthenticated: false,
			isLoading: false,
		}),
}));
