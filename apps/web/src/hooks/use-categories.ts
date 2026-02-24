"use client";

import { apiClient } from "@/lib/api";
import { assertCategoryList } from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";

interface UseCategoriesOptions {
	enabled?: boolean;
}

export function useCategories(options: UseCategoriesOptions = {}) {
	const { enabled = true } = options;

	return useQuery({
		queryKey: ["categories"],
		queryFn: () => apiClient.get("/api/v1/categories", assertCategoryList),
		enabled,
		staleTime: 5 * 60 * 1000, // Categories rarely change
	});
}
