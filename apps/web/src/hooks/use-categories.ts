"use client";

import { apiClient } from "@/lib/api";
import { assertCategoryList } from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";

export function useCategories() {
	return useQuery({
		queryKey: ["categories"],
		queryFn: () => apiClient.get("/api/v1/categories", assertCategoryList),
		staleTime: 5 * 60 * 1000, // Categories rarely change
	});
}
