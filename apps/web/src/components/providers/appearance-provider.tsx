"use client";

import { apiClient } from "@/lib/api";
import { assertUserDetailResponse } from "@/lib/api/types";
import {
	readAppearancePreferences,
	resolveAppearanceTheme,
	useAppearanceStore,
} from "@/stores/appearance-store";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

interface AppearanceProviderProps {
	children: ReactNode;
}

export function AppearanceProvider({ children }: AppearanceProviderProps) {
	const userId = useAuthStore((state) => state.user?.id ?? null);
	const appearance = useAppearanceStore((state) => state.appearance);
	const setAppearance = useAppearanceStore((state) => state.setAppearance);
	const resetAppearance = useAppearanceStore((state) => state.resetAppearance);
	const userDetailQueryKey = ["users", "me", "detail", userId] as const;

	const userDetailQuery = useQuery({
		queryKey: userDetailQueryKey,
		enabled: Boolean(userId),
		queryFn: async () => {
			if (!userId) {
				throw new Error("Missing user info");
			}

			return apiClient.get(`/api/v1/users/${userId}`, assertUserDetailResponse);
		},
		staleTime: 30_000,
	});

	useEffect(() => {
		if (!userId) {
			resetAppearance();
		}
	}, [resetAppearance, userId]);

	useEffect(() => {
		const preferences = userDetailQuery.data?.user.preferences;
		setAppearance(readAppearancePreferences(preferences?.appearance));
	}, [setAppearance, userDetailQuery.data]);

	useEffect(() => {
		const root = document.documentElement;
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const applyAppearance = () => {
			const nextTheme = resolveAppearanceTheme(
				appearance.theme,
				mediaQuery.matches,
			);
			root.classList.toggle("dark", nextTheme === "dark");
			root.dataset.theme = nextTheme;
			root.dataset.themeMode = appearance.theme;
			root.dataset.density = appearance.compactMode ? "compact" : "comfortable";
			root.style.colorScheme = nextTheme;
		};

		const handleMediaChange = () => {
			if (appearance.theme === "system") {
				applyAppearance();
			}
		};

		applyAppearance();
		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", handleMediaChange);
			return () => mediaQuery.removeEventListener("change", handleMediaChange);
		}

		mediaQuery.addListener(handleMediaChange);
		return () => mediaQuery.removeListener(handleMediaChange);
	}, [appearance]);

	return children;
}
