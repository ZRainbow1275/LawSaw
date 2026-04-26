"use client";

/**
 * Selector wrapper around `useArticleAi` (#47 / G.5).
 *
 * Backwards-compatible shim — exposes the same hook names callers used to
 * call against the now-removed `/api/v1/articles/{id}/summary` phantom path.
 * All summary fields are derived from a single `/me/articles/{id}/ai`
 * request, no extra network traffic.
 */

import {
	readHeadlineKeywords,
	readKeyPoints,
	useArticleAi,
} from "@/hooks/use-article-ai";
import { apiClient } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ArticleSummaryView {
	article_id: string;
	tier: string;
	one_sentence: string | null;
	three_sentences: string | null;
	key_points: string[];
	headline_keywords: string[];
}

/**
 * Returns the summary slice of `MeArticleAiResponse` plus the original
 * react-query metadata (loading / error / refetch). The `data` field is
 * pre-coerced into a flat shape so callers don't have to JSON-parse
 * `summary_key_points` themselves.
 */
export function useArticleSummary(articleId: string | null | undefined) {
	const query = useArticleAi(articleId);
	const payload = query.data;
	const data: ArticleSummaryView | null = payload
		? {
				article_id: payload.article_id,
				tier: payload.tier,
				one_sentence: payload.summary_one_sentence,
				three_sentences: payload.summary_three_sentences,
				key_points: readKeyPoints(payload),
				headline_keywords: readHeadlineKeywords(payload),
			}
		: null;
	return { ...query, data };
}

export interface RefreshArticleSummaryResponse {
	message: string;
	article_id: string;
	task_type: string;
	degraded?: boolean;
	degraded_reason?: string | null;
}

/**
 * Admin-only refresh trigger. Invalidates the unified `articleAi` cache so
 * the next render re-fetches the freshly enqueued payload.
 */
export function useRefreshArticleSummary() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (articleId: string) =>
			apiClient.post<RefreshArticleSummaryResponse>(
				`/api/v1/ai/summarize/${articleId}`,
			),
		onSuccess: (_data, articleId) => {
			queryClient.invalidateQueries({ queryKey: ["articleAi", articleId] });
		},
	});
}
