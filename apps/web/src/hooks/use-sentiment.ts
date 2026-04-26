"use client";

/**
 * Selector wrapper around `useArticleAi` (#47 / G.5).
 *
 * Sentiment fields live on the same `MeArticleAiResponse` as the summary,
 * so this hook just slices them off the unified payload — no extra fetch.
 */

import { useArticleAi } from "@/hooks/use-article-ai";

export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";

export type SentimentAspect =
	| "compliance"
	| "penalty"
	| "litigation"
	| "policy_change"
	| "industry_trend"
	| "regulatory_impact"
	| "company_reputation"
	| "policy_direction"
	| "other";

export interface SentimentView {
	article_id: string;
	tier: string;
	label: SentimentLabel | null;
	score: number | null;
	rationale: string | null;
	aspect: SentimentAspect | null;
}

const SENTIMENT_LABELS: ReadonlyArray<SentimentLabel> = [
	"positive",
	"negative",
	"neutral",
	"mixed",
];

const SENTIMENT_ASPECTS: ReadonlyArray<SentimentAspect> = [
	"compliance",
	"penalty",
	"litigation",
	"policy_change",
	"industry_trend",
	"regulatory_impact",
	"company_reputation",
	"policy_direction",
	"other",
];

function coerceLabel(raw: string | null): SentimentLabel | null {
	if (raw === null) return null;
	return (SENTIMENT_LABELS as ReadonlyArray<string>).includes(raw)
		? (raw as SentimentLabel)
		: null;
}

function coerceAspect(raw: string | null): SentimentAspect | null {
	if (raw === null) return null;
	return (SENTIMENT_ASPECTS as ReadonlyArray<string>).includes(raw)
		? (raw as SentimentAspect)
		: null;
}

export function useSentiment(articleId: string | null | undefined) {
	const query = useArticleAi(articleId);
	const payload = query.data;
	const data: SentimentView | null = payload
		? {
				article_id: payload.article_id,
				tier: payload.tier,
				label: coerceLabel(payload.sentiment),
				score: payload.sentiment_score,
				rationale: payload.sentiment_rationale,
				aspect: coerceAspect(payload.sentiment_aspect),
			}
		: null;
	return { ...query, data };
}
