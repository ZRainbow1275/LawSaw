"use client";

import { apiClient } from "@/lib/api";
import { type FeedResponse, assertFeedResponse } from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";

type FeedParams = {
	limit?: number;
	offset?: number;
	bannerLimit?: number;
	enabled?: boolean;
};

export function useFeed(params: FeedParams = {}) {
	const { limit = 20, offset = 0, bannerLimit = 6, enabled = true } = params;
	const searchParams = new URLSearchParams();
	searchParams.set("limit", String(limit));
	searchParams.set("offset", String(offset));
	searchParams.set("banner_limit", String(bannerLimit));

	return useQuery({
		queryKey: ["me-feed", { limit, offset, bannerLimit }],
		queryFn: () =>
			apiClient.get<FeedResponse>(
				`/api/v1/me/feed?${searchParams.toString()}`,
				assertFeedResponse,
			),
		enabled,
		staleTime: 15_000,
	});
}
