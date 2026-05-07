/**
 * Shared types + small validators for the reaction-insights admin dashboard.
 *
 * Mirrors the backend response shapes in
 * `crates/law-eye-api/src/routes/admin_insights_reactions.rs`.
 *
 * Each panel has its own useQuery (independent staleTime, parallel fetch).
 * Validators are conservative: we only fail the query when the JSON shape is
 * not an `{ items: [...] }` / `{ buckets: [...] }` object — the row fields
 * themselves are read defensively in the panel UI so that backend additions
 * never crash the frontend.
 */

export type ReactionInsightWindow = "7d" | "30d" | "all";
export type ReactionTrendGranularity = "hour" | "day";
export type ReactionTargetType = "article" | "source";

export interface TopReactionEntry {
	target_type: string;
	target_id: string;
	likes: number;
	dislikes: number;
	score: number;
	label?: string | null;
}

export interface TrendBucket {
	bucket: string;
	likes: number;
	dislikes: number;
}

export interface CategoryReactionEntry {
	category_id: string | null;
	category_slug: string | null;
	category_name: string | null;
	likes: number;
	dislikes: number;
	score: number;
}

export interface SourceHealthEntry {
	source_id: string;
	source_name: string;
	likes: number;
	dislikes: number;
	like_dislike_ratio: number;
	subscriber_count: number;
}

export interface TopReactionUserEntry {
	user_id: string;
	display_name?: string | null;
	likes_given: number;
	dislikes_given: number;
	total: number;
}

export interface ColdStartEntry {
	target_type: string;
	target_id: string;
	label?: string | null;
	created_at: string;
}

export interface NegativeSignalEntry {
	target_type: string;
	target_id: string;
	label?: string | null;
	likes: number;
	dislikes: number;
	dislike_ratio: number;
}

// ---- validators ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureItemsArray(value: unknown, label: string): unknown[] {
	if (!isRecord(value) || !Array.isArray(value.items)) {
		throw new Error(`Invalid ${label} response`);
	}
	return value.items;
}

export function assertTopScoreResponse(
	value: unknown,
): asserts value is { items: TopReactionEntry[] } {
	ensureItemsArray(value, "top-score");
}

export function assertControversyResponse(
	value: unknown,
): asserts value is { items: TopReactionEntry[] } {
	ensureItemsArray(value, "controversy");
}

export function assertTrendResponse(
	value: unknown,
): asserts value is { buckets: TrendBucket[] } {
	if (!isRecord(value) || !Array.isArray(value.buckets)) {
		throw new Error("Invalid trend response");
	}
}

export function assertCategoryResponse(
	value: unknown,
): asserts value is { items: CategoryReactionEntry[] } {
	ensureItemsArray(value, "by-category");
}

export function assertSourceHealthResponse(
	value: unknown,
): asserts value is { items: SourceHealthEntry[] } {
	ensureItemsArray(value, "source-health");
}

export function assertTopUsersResponse(
	value: unknown,
): asserts value is { items: TopReactionUserEntry[] } {
	ensureItemsArray(value, "top-users");
}

export function assertColdStartResponse(
	value: unknown,
): asserts value is { items: ColdStartEntry[] } {
	ensureItemsArray(value, "cold-start");
}

export function assertNegativeSignalResponse(
	value: unknown,
): asserts value is { items: NegativeSignalEntry[] } {
	ensureItemsArray(value, "negative-signal");
}

// ---- shared display helpers -----------------------------------------------

/** Default window selector value mirroring backend defaults. */
export const DEFAULT_WINDOW: ReactionInsightWindow = "30d";

/** Default per-query React Query stale time (60s). */
export const REACTION_INSIGHT_STALE_MS = 60_000;

/** Build the admin insights base path with a trailing slash trimmed. */
export const REACTION_INSIGHT_BASE = "/api/v1/admin/insights/reactions";

export function compactNumber(value: number): string {
	if (!Number.isFinite(value)) return "-";
	if (Math.abs(value) >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (Math.abs(value) >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}
	return value.toLocaleString();
}

export function formatPercent(value: number, fractionDigits = 1): string {
	if (!Number.isFinite(value)) return "-";
	return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function shortId(id: string): string {
	if (typeof id !== "string") return "";
	const trimmed = id.replace(/-/g, "");
	return trimmed.length <= 8 ? id : `${trimmed.slice(0, 8)}…`;
}
