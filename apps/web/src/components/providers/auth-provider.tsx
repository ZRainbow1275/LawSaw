"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api";
import type { AuthResponse } from "@/lib/api/types";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const checkSession = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<AuthResponse>("/api/v1/auth/me");
        setUser(response.user);
      } catch {
        setUser(null);
      }
    };

    checkSession();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
