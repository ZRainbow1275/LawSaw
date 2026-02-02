import { ApiClientError } from "@/lib/api";
import { QueryClient } from "@tanstack/react-query";

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
	// TanStack Query 默认会对任意错误重试；这里按“商业可控”口径收敛：
	// - 401/403/绝大多数 4xx 不重试（避免放大无效流量/造成 toast 风暴）
	// - 429/5xx/网络错误允许少量重试（指数退避 + 抖动）
	if (error instanceof ApiClientError) {
		if (error.status === 401 || error.status === 403) return false;
		if (error.status >= 400 && error.status < 500 && error.status !== 429) {
			return false;
		}
	}

	return failureCount < 2;
}

function retryDelayMs(attemptIndex: number): number {
	const base = 500 * 2 ** attemptIndex;
	const capped = Math.min(base, 8000);
	const jitter = Math.floor(Math.random() * 200);
	return capped + jitter;
}

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000, // 1 minute
				gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
				retry: shouldRetryQuery,
				retryDelay: retryDelayMs,
				refetchOnWindowFocus: false,
			},
			mutations: {
				// 写操作默认不自动重试，避免重复提交；需要幂等时由业务显式实现。
				retry: false,
			},
		},
	});
}
