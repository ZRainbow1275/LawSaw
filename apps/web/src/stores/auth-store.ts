import type { User } from "@/lib/api/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	setUser: (user: User | null) => void;
	setLoading: (loading: boolean) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			isAuthenticated: false,
			isLoading: true,

			setUser: (user) =>
				set({
					user,
					isAuthenticated: !!user,
					isLoading: false,
				}),

			setLoading: (isLoading) => set({ isLoading }),

			logout: () =>
				set({
					user: null,
					isAuthenticated: false,
					isLoading: false,
				}),
		}),
		{
			name: "law-eye-auth",
			partialize: (state) => ({ user: state.user }),
		},
	),
);
