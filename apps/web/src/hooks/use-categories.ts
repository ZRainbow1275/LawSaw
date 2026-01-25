"use client";

import { apiClient } from "@/lib/api";
import type { Category } from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";

export function useCategories() {
	return useQuery({
		queryKey: ["categories"],
		queryFn: () => apiClient.get<Category[]>("/api/v1/categories"),
		staleTime: 5 * 60 * 1000, // Categories rarely change
	});
}
