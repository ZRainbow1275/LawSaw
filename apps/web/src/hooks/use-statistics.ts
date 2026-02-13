"use client";

import { apiClient } from "@/lib/api";
import {
	assertAuthorityDistribution,
	assertCrossDimensionalResult,
	assertImportanceDistribution,
	assertIndustryDistribution,
	assertIssuerDistribution,
	assertRegionalDistribution,
	assertStatisticsOverview,
	assertTimelineByDimension,
} from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";

// Re-export canonical types from types.ts for consumers that import from this file
export type {
	AuthorityDistribution,
	AuthorityLevelCount,
	CrossDimensionalCell,
	CrossDimensionalResult,
	DomainCount,
	ImportanceDistribution,
	IndustryDistribution,
	IssuerCount,
	IssuerDistribution,
	RegionalCount,
	RegionalDistribution,
	StatisticsOverview,
	SubDomainCount,
	TimelineByDimension,
	TimelinePoint,
	TimelineSeries,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

interface RegionalStatsParams {
	dateFrom?: string;
	dateTo?: string;
}

export function useRegionalStats(params?: RegionalStatsParams) {
	const searchParams = new URLSearchParams();
	if (params?.dateFrom) searchParams.set("date_from", params.dateFrom);
	if (params?.dateTo) searchParams.set("date_to", params.dateTo);
	const qs = searchParams.toString();

	return useQuery({
		queryKey: ["statistics", "regional", params],
		queryFn: () =>
			apiClient.get(
				`/api/v1/statistics/regional${qs ? `?${qs}` : ""}`,
				assertRegionalDistribution,
			),
		staleTime: 60_000,
	});
}

export function useIndustryStats(params?: { includeSub?: boolean }) {
	const qs = params?.includeSub ? "?include_sub=true" : "";

	return useQuery({
		queryKey: ["statistics", "industry", params],
		queryFn: () =>
			apiClient.get(
				`/api/v1/statistics/industry${qs}`,
				assertIndustryDistribution,
			),
		staleTime: 60_000,
	});
}

export function useImportanceStats() {
	return useQuery({
		queryKey: ["statistics", "importance"],
		queryFn: () =>
			apiClient.get(
				"/api/v1/statistics/importance",
				assertImportanceDistribution,
			),
		staleTime: 60_000,
	});
}

export function useAuthorityStats() {
	return useQuery({
		queryKey: ["statistics", "authority"],
		queryFn: () =>
			apiClient.get(
				"/api/v1/statistics/authority",
				assertAuthorityDistribution,
			),
		staleTime: 60_000,
	});
}

export function useIssuerStats(limit?: number) {
	const qs = limit ? `?limit=${limit}` : "";

	return useQuery({
		queryKey: ["statistics", "issuer", limit],
		queryFn: () =>
			apiClient.get(`/api/v1/statistics/issuer${qs}`, assertIssuerDistribution),
		staleTime: 60_000,
	});
}

export function useCrossDimensional(dimX: string, dimY: string) {
	return useQuery({
		queryKey: ["statistics", "cross", dimX, dimY],
		queryFn: () =>
			apiClient.get(
				`/api/v1/statistics/cross?dimension_x=${encodeURIComponent(dimX)}&dimension_y=${encodeURIComponent(dimY)}`,
				assertCrossDimensionalResult,
			),
		staleTime: 60_000,
		enabled: !!dimX && !!dimY,
	});
}

export function useTimelineByDimension(
	dimension: string,
	granularity = "daily",
	days = 30,
	topN = 5,
) {
	const params = new URLSearchParams({
		dimension,
		granularity,
		days: days.toString(),
		top_n: topN.toString(),
	});

	return useQuery({
		queryKey: ["statistics", "timeline", dimension, granularity, days, topN],
		queryFn: () =>
			apiClient.get(
				`/api/v1/statistics/timeline?${params.toString()}`,
				assertTimelineByDimension,
			),
		staleTime: 60_000,
		enabled: !!dimension,
	});
}

export function useStatisticsOverview() {
	return useQuery({
		queryKey: ["statistics", "overview"],
		queryFn: () =>
			apiClient.get("/api/v1/statistics/overview", assertStatisticsOverview),
		staleTime: 60_000,
	});
}
