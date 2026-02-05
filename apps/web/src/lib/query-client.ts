import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000, // 1 minute
				gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
				// 统一由 ApiClient 做网络层重试，避免“双重重试”放大流量与延迟。
				retry: false,
				refetchOnWindowFocus: false,
			},
			mutations: {
				// 写操作默认不自动重试，避免重复提交；需要幂等时由业务显式实现。
				retry: false,
			},
		},
	});
}
