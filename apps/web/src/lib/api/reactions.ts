/**
 * Reactions API client (Wave 8 Stream C-2).
 *
 * Wraps `POST /api/v1/reactions` and `GET /api/v1/reactions/summary`.
 * The wire shape is kept aligned with the OpenAPI-generated
 * `ReactionSummaryResponse` / `SetReactionResponse` / `SummaryBatchResponse`
 * components. Article and source detail responses already embed the same
 * `reaction_summary` field, so consumers can read it directly off the entity.
 */

import { apiClient } from "@/lib/api/client";

// ----------------------------------------------------------------------------
// Wire types
// ----------------------------------------------------------------------------

export type ReactionTargetType = "article" | "source";
export type ReactionKind = "like" | "dislike";

export interface ReactionSummary {
	likes: number;
	dislikes: number;
	score: number;
	/**
	 * `"like"` / `"dislike"` / undefined. The backend omits this field for
	 * anonymous callers. Treat undefined as "no reaction yet".
	 */
	my_kind?: ReactionKind | null;
}

export interface SetReactionInput {
	targetType: ReactionTargetType;
	targetId: string;
	/** `null` clears any existing reaction. */
	kind: ReactionKind | null;
}

export interface SetReactionResponse {
	summary: ReactionSummary;
}

export interface SummaryBatchInput {
	targetType: ReactionTargetType;
	/** Up to 100 target ids per call. The caller is responsible for chunking. */
	targetIds: string[];
}

export interface SummaryBatchResponse {
	summaries: Record<string, ReactionSummary>;
}

export const REACTION_BATCH_LIMIT = 100;

// ----------------------------------------------------------------------------
// Runtime validators
// ----------------------------------------------------------------------------

const TARGET_TYPES: readonly ReactionTargetType[] = ["article", "source"];
const KINDS: readonly ReactionKind[] = ["like", "dislike"];

function isReactionKind(value: unknown): value is ReactionKind {
	return (
		typeof value === "string" && (KINDS as readonly string[]).includes(value)
	);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${path}: expected object, got ${typeof value}`);
	}
	return value as Record<string, unknown>;
}

function asNumber(value: unknown, path: string): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(`${path}: expected number, got ${typeof value}`);
	}
	return value;
}

export function assertReactionSummary(
	value: unknown,
	path = "reactionSummary",
): asserts value is ReactionSummary {
	const record = asRecord(value, path);
	asNumber(record.likes, `${path}.likes`);
	asNumber(record.dislikes, `${path}.dislikes`);
	asNumber(record.score, `${path}.score`);

	if (record.my_kind !== undefined && record.my_kind !== null) {
		if (!isReactionKind(record.my_kind)) {
			throw new Error(
				`${path}.my_kind: expected "like" | "dislike" | null | undefined, got ${String(record.my_kind)}`,
			);
		}
	}
}

export function assertSetReactionResponse(
	value: unknown,
): asserts value is SetReactionResponse {
	const record = asRecord(value, "setReactionResponse");
	assertReactionSummary(record.summary, "setReactionResponse.summary");
}

export function assertSummaryBatchResponse(
	value: unknown,
): asserts value is SummaryBatchResponse {
	const record = asRecord(value, "summaryBatchResponse");
	const summaries = asRecord(
		record.summaries,
		"summaryBatchResponse.summaries",
	);
	for (const [id, summary] of Object.entries(summaries)) {
		assertReactionSummary(summary, `summaryBatchResponse.summaries["${id}"]`);
	}
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * The empty/zero summary. Use this when the backend has no record for a target
 * yet (e.g. a freshly created article that no one has reacted to).
 */
export const EMPTY_REACTION_SUMMARY: ReactionSummary = {
	likes: 0,
	dislikes: 0,
	score: 0,
};

export function isReactionTargetType(
	value: unknown,
): value is ReactionTargetType {
	return (
		typeof value === "string" &&
		(TARGET_TYPES as readonly string[]).includes(value)
	);
}

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

export async function setReaction(
	input: SetReactionInput,
): Promise<SetReactionResponse> {
	const body = {
		target_type: input.targetType,
		target_id: input.targetId,
		kind: input.kind,
	};
	return apiClient.post<SetReactionResponse>(
		"/api/v1/reactions",
		body,
		assertSetReactionResponse,
	);
}

export async function getReactionSummariesBatch(
	input: SummaryBatchInput,
): Promise<SummaryBatchResponse> {
	if (input.targetIds.length === 0) {
		return { summaries: {} };
	}
	if (input.targetIds.length > REACTION_BATCH_LIMIT) {
		throw new Error(
			`getReactionSummariesBatch: targetIds capped at ${REACTION_BATCH_LIMIT}, got ${input.targetIds.length}`,
		);
	}

	const params = new URLSearchParams();
	params.set("target_type", input.targetType);
	for (const id of input.targetIds) {
		params.append("target_ids[]", id);
	}

	return apiClient.get<SummaryBatchResponse>(
		`/api/v1/reactions/summary?${params.toString()}`,
		assertSummaryBatchResponse,
	);
}
