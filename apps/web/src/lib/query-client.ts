import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000, // 1 minute
				gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
				// Network retries are handled by ApiClient to avoid compounded retries.
				retry: false,
				refetchOnWindowFocus: false,
			},
			mutations: {
				// Mutations do not retry by default to avoid duplicate submissions.
				retry: false,
			},
		},
	});
}
