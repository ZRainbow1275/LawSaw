"use client";

/**
 * Single source of truth for the per-article AI payload.
 *
 * Backend: `GET /api/v1/me/articles/{id}/ai` (handler `get_my_article_ai` in
 * `crates/law-eye-api/src/routes/me.rs`). Premium-tier-gated — basic /
 * verified users get 403 with an upgrade hint.
 *
 * Field names mirror the Rust struct `MeArticleAiResponse` 1:1 to avoid the
 * shape drift caught by the #43 audit. The selector hooks
 * (`useArticleSummary` / `useSentiment` / `useKgExtract`) re-export
 * derivations of this payload so callers don't fan out 3 network requests.
 */

import { ApiClientError, apiClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const AI_STALE_MS = 5 * 60 * 1000;
const AI_GC_MS = 30 * 60 * 1000;

export interface MeArticleAiResponse {
	article_id: string;
	tier: string;
	sentiment: string | null;
	sentiment_score: number | null;
	sentiment_rationale: string | null;
	sentiment_aspect: string | null;
	summary_one_sentence: string | null;
	summary_three_sentences: string | null;
	/** JSON array of strings (3-5 key points). Backend defaults to `[]`. */
	summary_key_points: unknown;
	/** JSON array (2-5 items). Backend defaults to `[]`. */
	headline_keywords: unknown;
	tags: string[];
	keywords: string[];
	ai_metadata: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isOptionalString(value: unknown): value is string | null | undefined {
	return value === null || value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | null | undefined {
	return value === null || value === undefined || typeof value === "number";
}

export function assertMeArticleAiResponse(
	value: unknown,
): asserts value is MeArticleAiResponse {
	if (!isRecord(value)) {
		throw new Error("MeArticleAiResponse: expected object");
	}
	if (typeof value.article_id !== "string") {
		throw new Error("MeArticleAiResponse: article_id must be string");
	}
	if (typeof value.tier !== "string") {
		throw new Error("MeArticleAiResponse: tier must be string");
	}
	if (
		!isOptionalString(value.sentiment) ||
		!isOptionalNumber(value.sentiment_score) ||
		!isOptionalString(value.sentiment_rationale) ||
		!isOptionalString(value.sentiment_aspect) ||
		!isOptionalString(value.summary_one_sentence) ||
		!isOptionalString(value.summary_three_sentences)
	) {
		throw new Error(
			"MeArticleAiResponse: invalid optional sentiment/summary fields",
		);
	}
	if (!isStringArray(value.tags) || !isStringArray(value.keywords)) {
		throw new Error("MeArticleAiResponse: tags/keywords must be string[]");
	}
}

/**
 * `staleTime: 5min` mirrors the legacy per-shard hooks. We don't retry on
 * 401/403 — the tier gate is part of normal flow, not a transient error,
 * and surfacing the `ApiClientError` to the caller lets the reader page
 * render the "Upgrade to Premium" CTA.
 */
export function useArticleAi(articleId: string | null | undefined) {
	return useQuery({
		queryKey: ["articleAi", articleId],
		queryFn: () =>
			apiClient.get<MeArticleAiResponse>(
				`/api/v1/me/articles/${articleId}/ai`,
				assertMeArticleAiResponse,
				{ skipGlobalErrorHandler: true },
			),
		enabled: !!articleId,
		staleTime: AI_STALE_MS,
		gcTime: AI_GC_MS,
		refetchOnWindowFocus: false,
		retry: (failureCount, error) => {
			if (error instanceof ApiClientError) {
				if (error.status === 401 || error.status === 403) return false;
				if (error.status === 404) return false;
			}
			return failureCount < 2;
		},
	});
}

/**
 * Coerce `summary_key_points` (Value/JSON) into a clean `string[]` for UI.
 * Backend stores `[]` by default; tolerate both legacy `null` and bad shape.
 */
export function readKeyPoints(
	payload: MeArticleAiResponse | undefined,
): string[] {
	if (!payload) return [];
	const raw = payload.summary_key_points;
	return isStringArray(raw) ? raw : [];
}

/**
 * Same coercion for `headline_keywords`.
 */
export function readHeadlineKeywords(
	payload: MeArticleAiResponse | undefined,
): string[] {
	if (!payload) return [];
	const raw = payload.headline_keywords;
	return isStringArray(raw) ? raw : [];
}
