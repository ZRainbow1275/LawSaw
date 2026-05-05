"use client";

/**
 * User reading-history hooks (Phase D.11 + E.7).
 *
 * Backend: `GET /api/v1/me/reading-history?limit=&offset=&finished_only=`
 * (handler `list_reading_history` in `crates/law-eye-api/src/routes/me.rs`).
 * Returns same-day-aggregated rows (max dwell + peak scroll) joined with
 * article title and category slug.
 */

import { apiClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface ReadingHistoryItem {
	article_id: string;
	title: string;
	category_slug: string | null;
	dwell_ms_total: number;
	scroll_pct_peak: number;
	finished: boolean;
	last_read_at: string;
}

export interface ReadingHistoryResponse {
	items: ReadingHistoryItem[];
	total: number;
	limit: number;
	offset: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertReadingHistoryItem(
	value: unknown,
	path = "readingHistoryItem",
): asserts value is ReadingHistoryItem {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (
		typeof value.article_id !== "string" ||
		typeof value.title !== "string" ||
		typeof value.last_read_at !== "string" ||
		typeof value.finished !== "boolean" ||
		typeof value.dwell_ms_total !== "number" ||
		typeof value.scroll_pct_peak !== "number"
	) {
		throw new Error(
			`${path}: missing article_id/title/last_read_at/finished/dwell_ms_total/scroll_pct_peak`,
		);
	}
}

export function assertReadingHistoryResponse(
	value: unknown,
	path = "readingHistory",
): asserts value is ReadingHistoryResponse {
	if (!isRecord(value)) throw new Error(`${path} must be an object`);
	if (!Array.isArray(value.items))
		throw new Error(`${path}.items must be an array`);
	for (const [index, item] of (value.items as unknown[]).entries()) {
		assertReadingHistoryItem(item, `${path}.items[${index}]`);
	}
	if (
		typeof value.total !== "number" ||
		typeof value.limit !== "number" ||
		typeof value.offset !== "number"
	) {
		throw new Error(`${path}: missing total/limit/offset`);
	}
}

export interface UseReadingHistoryOptions {
	limit?: number;
	offset?: number;
	finishedOnly?: boolean;
	enabled?: boolean;
}

export function useReadingHistory(options: UseReadingHistoryOptions = {}) {
	const {
		limit = 30,
		offset = 0,
		finishedOnly = false,
		enabled = true,
	} = options;
	const qs = new URLSearchParams();
	qs.set("limit", String(limit));
	qs.set("offset", String(offset));
	if (finishedOnly) qs.set("finished_only", "true");
	const url = `/api/v1/me/reading-history?${qs.toString()}`;

	return useQuery({
		queryKey: ["reading-history", { limit, offset, finishedOnly }],
		queryFn: () =>
			apiClient.get<ReadingHistoryResponse>(url, assertReadingHistoryResponse),
		enabled,
		staleTime: 60_000,
	});
}

/**
 * Convenience wrapper for the dashboard "Continue reading" card —
 * only the most recent un-finished items.
 */
export function useContinueReading(limit = 3) {
	return useReadingHistory({ limit, offset: 0, finishedOnly: false });
}
