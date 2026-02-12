"use client";

import { apiClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Type definitions — Regional
// ---------------------------------------------------------------------------

export interface RegionalCount {
	region_code: string;
	region_name: string;
	count: number;
	percentage: number;
}

export interface RegionalDistribution {
	items: RegionalCount[];
	total: number;
	coverage_rate: number;
}

// ---------------------------------------------------------------------------
// Type definitions — Industry
// ---------------------------------------------------------------------------

export interface SubDomainCount {
	domain_sub: string;
	label: string;
	count: number;
}

export interface DomainCount {
	domain_root: string;
	domain_sub: string | null;
	label: string;
	count: number;
	percentage: number;
	sub_domains: SubDomainCount[] | null;
}

export interface IndustryDistribution {
	items: DomainCount[];
	total: number;
	coverage_rate: number;
}

// ---------------------------------------------------------------------------
// Type definitions — Importance
// ---------------------------------------------------------------------------

export interface ImportanceDistribution {
	levels: [number, number, number, number, number];
	total: number;
	average: number;
	coverage_rate: number;
}

// ---------------------------------------------------------------------------
// Type definitions — Authority
// ---------------------------------------------------------------------------

export interface AuthorityLevelCount {
	level: number;
	label: string;
	count: number;
	percentage: number;
}

export interface AuthorityDistribution {
	levels: AuthorityLevelCount[];
	total: number;
	coverage_rate: number;
}

// ---------------------------------------------------------------------------
// Type definitions — Issuer
// ---------------------------------------------------------------------------

export interface IssuerCount {
	issuer: string;
	count: number;
	percentage: number;
}

export interface IssuerDistribution {
	items: IssuerCount[];
	total: number;
	unique_issuers: number;
}

// ---------------------------------------------------------------------------
// Type definitions — Cross-dimensional
// ---------------------------------------------------------------------------

export interface CrossDimensionalCell {
	x_value: string;
	y_value: string;
	count: number;
}

export interface CrossDimensionalResult {
	dimension_x: string;
	dimension_y: string;
	cells: CrossDimensionalCell[];
}

// ---------------------------------------------------------------------------
// Type definitions — Timeline
// ---------------------------------------------------------------------------

export interface TimelinePoint {
	date: string;
	count: number;
}

export interface TimelineSeries {
	dimension_value: string;
	label: string;
	points: TimelinePoint[];
}

export interface TimelineByDimension {
	dimension: string;
	granularity: string;
	series: TimelineSeries[];
}

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
			apiClient.get<RegionalDistribution>(
				`/api/v1/statistics/regional${qs ? `?${qs}` : ""}`,
			),
		staleTime: 60_000,
	});
}

export function useIndustryStats(params?: { includeSub?: boolean }) {
	const qs = params?.includeSub ? "?include_sub=true" : "";

	return useQuery({
		queryKey: ["statistics", "industry", params],
		queryFn: () =>
			apiClient.get<IndustryDistribution>(
				`/api/v1/statistics/industry${qs}`,
			),
		staleTime: 60_000,
	});
}

export function useImportanceStats() {
	return useQuery({
		queryKey: ["statistics", "importance"],
		queryFn: () =>
			apiClient.get<ImportanceDistribution>(
				"/api/v1/statistics/importance",
			),
		staleTime: 60_000,
	});
}

export function useAuthorityStats() {
	return useQuery({
		queryKey: ["statistics", "authority"],
		queryFn: () =>
			apiClient.get<AuthorityDistribution>(
				"/api/v1/statistics/authority",
			),
		staleTime: 60_000,
	});
}

export function useIssuerStats(limit?: number) {
	const qs = limit ? `?limit=${limit}` : "";

	return useQuery({
		queryKey: ["statistics", "issuer", limit],
		queryFn: () =>
			apiClient.get<IssuerDistribution>(
				`/api/v1/statistics/issuer${qs}`,
			),
		staleTime: 60_000,
	});
}

export function useCrossDimensional(dimX: string, dimY: string) {
	return useQuery({
		queryKey: ["statistics", "cross", dimX, dimY],
		queryFn: () =>
			apiClient.get<CrossDimensionalResult>(
				`/api/v1/statistics/cross?dim_x=${encodeURIComponent(dimX)}&dim_y=${encodeURIComponent(dimY)}`,
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
			apiClient.get<TimelineByDimension>(
				`/api/v1/statistics/timeline?${params.toString()}`,
			),
		staleTime: 60_000,
		enabled: !!dimension,
	});
}
