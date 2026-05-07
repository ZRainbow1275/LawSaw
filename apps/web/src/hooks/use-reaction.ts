"use client";

/**
 * Reactions React Query hook (Wave 8 Stream C-2).
 *
 * - `useReaction(targetType, targetId, initialSummary?)` — single-entity hook
 *   used by reader / source detail / inline pills. Performs optimistic update
 *   with rollback on failure and invalidates the article/source detail query
 *   after the mutation settles so any embedded `reaction_summary` stays fresh.
 *
 * - `useReactionSummariesBatch(targetType, targetIds)` — list scenario hook
 *   that fans 1..N target ids out across batches of 100 in a single query.
 */

import {
	REACTION_BATCH_LIMIT,
	type ReactionKind,
	type ReactionSummary,
	type ReactionTargetType,
	getReactionSummariesBatch,
	setReaction,
} from "@/lib/api/reactions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

// ----------------------------------------------------------------------------
// Query keys
// ----------------------------------------------------------------------------

export const REACTION_QUERY_KEY_PREFIX = "reaction" as const;

export function reactionDetailQueryKey(
	targetType: ReactionTargetType,
	targetId: string,
): readonly unknown[] {
	return [REACTION_QUERY_KEY_PREFIX, targetType, targetId] as const;
}

export function reactionBatchQueryKey(
	targetType: ReactionTargetType,
	targetIds: string[],
): readonly unknown[] {
	// Sort to keep cache hits stable across re-orderings of the same id set.
	return [
		REACTION_QUERY_KEY_PREFIX,
		"batch",
		targetType,
		[...targetIds].sort(),
	] as const;
}

// ----------------------------------------------------------------------------
// Optimistic update helper
// ----------------------------------------------------------------------------

/**
 * Compute what the next summary should look like immediately after a user
 * intent, without waiting for the server. This must mirror the canonical
 * server-side bookkeeping in `law-eye-core::reaction::service`.
 */
export function applyOptimisticReaction(
	prev: ReactionSummary | undefined,
	nextKind: ReactionKind | null,
): ReactionSummary {
	const base: ReactionSummary = prev ?? {
		likes: 0,
		dislikes: 0,
		score: 0,
		my_kind: undefined,
	};

	const previousKind = base.my_kind ?? null;
	if (previousKind === nextKind) {
		return base;
	}

	let likes = base.likes;
	let dislikes = base.dislikes;

	if (previousKind === "like") likes = Math.max(0, likes - 1);
	if (previousKind === "dislike") dislikes = Math.max(0, dislikes - 1);
	if (nextKind === "like") likes += 1;
	if (nextKind === "dislike") dislikes += 1;

	return {
		likes,
		dislikes,
		score: likes - dislikes,
		my_kind: nextKind ?? undefined,
	};
}

// ----------------------------------------------------------------------------
// useReaction (single entity)
// ----------------------------------------------------------------------------

interface UseReactionOptions {
	/**
	 * If the caller already has a summary in hand (e.g. from
	 * `article.reaction_summary`), pass it here to seed the cache and avoid an
	 * extra round trip.
	 */
	initialSummary?: ReactionSummary | null;
	/**
	 * When true, the hook will not auto-fetch on mount and will rely on the
	 * cache being hydrated externally — typically by `useReactionSummariesBatch`
	 * higher up in the tree. Use this for list scenarios where N cards would
	 * otherwise fan out into N detail requests.
	 */
	lazy?: boolean;
	/**
	 * Optional invalidation callback fired after a successful mutation. Use
	 * this to refresh related queries — for example, the article detail query
	 * which embeds `reaction_summary`.
	 */
	onSuccessInvalidate?: () => void;
}

export interface UseReactionResult {
	summary: ReactionSummary | undefined;
	myKind: ReactionKind | null;
	isPending: boolean;
	isError: boolean;
	error: unknown;
	mutate: (kind: ReactionKind | null) => void;
	mutateAsync: (kind: ReactionKind | null) => Promise<ReactionSummary>;
	/** Convenience: if user already reacted with `kind`, clear it; otherwise set it. */
	toggle: (kind: ReactionKind) => void;
}

export function useReaction(
	targetType: ReactionTargetType,
	targetId: string | null | undefined,
	options: UseReactionOptions = {},
): UseReactionResult {
	const queryClient = useQueryClient();
	const enabled = Boolean(targetId);
	const detailKey = targetId
		? reactionDetailQueryKey(targetType, targetId)
		: ([REACTION_QUERY_KEY_PREFIX, "noop"] as const);

	const query = useQuery({
		queryKey: detailKey,
		queryFn: async (): Promise<ReactionSummary> => {
			if (!targetId) {
				return { likes: 0, dislikes: 0, score: 0 };
			}
			const response = await getReactionSummariesBatch({
				targetType,
				targetIds: [targetId],
			});
			return (
				response.summaries[targetId] ?? {
					likes: 0,
					dislikes: 0,
					score: 0,
				}
			);
		},
		// In lazy mode the hook reads from cache only — list scenarios are
		// expected to hydrate the cache via `useReactionSummariesBatch`.
		// When the caller supplies an `initialSummary` we also skip the auto
		// fetch since the embedded `reaction_summary` is already authoritative
		// for the lifetime of that mount.
		enabled: enabled && !options.lazy && !options.initialSummary,
		// Seed cache from caller-supplied summary if available.
		initialData: options.initialSummary ?? undefined,
		// Reaction counts shift slowly; aggressive refetch is unnecessary.
		staleTime: 30_000,
	});

	const mutation = useMutation({
		mutationFn: async (kind: ReactionKind | null): Promise<ReactionSummary> => {
			if (!targetId) {
				throw new Error("useReaction.mutate: targetId is missing");
			}
			const response = await setReaction({ targetType, targetId, kind });
			return response.summary;
		},
		onMutate: async (kind) => {
			if (!targetId) return { previous: undefined };
			await queryClient.cancelQueries({ queryKey: detailKey });
			const previous = queryClient.getQueryData<ReactionSummary>(detailKey);
			const optimistic = applyOptimisticReaction(previous, kind);
			queryClient.setQueryData<ReactionSummary>(detailKey, optimistic);
			return { previous };
		},
		onError: (_error, _kind, context) => {
			// Roll back to the snapshot we captured in onMutate.
			if (context && "previous" in context) {
				queryClient.setQueryData<ReactionSummary | undefined>(
					detailKey,
					context.previous,
				);
			}
		},
		onSuccess: (next) => {
			queryClient.setQueryData<ReactionSummary>(detailKey, next);
		},
		onSettled: () => {
			if (!targetId) return;
			// Refresh embedded reaction_summary on article/source detail responses.
			if (targetType === "article") {
				void queryClient.invalidateQueries({ queryKey: ["article", targetId] });
			} else {
				void queryClient.invalidateQueries({ queryKey: ["source", targetId] });
			}
			options.onSuccessInvalidate?.();
		},
	});

	const summary = query.data;
	const myKind = (summary?.my_kind ?? null) as ReactionKind | null;

	const mutate = useCallback(
		(kind: ReactionKind | null): void => {
			mutation.mutate(kind);
		},
		[mutation],
	);

	const mutateAsync = useCallback(
		(kind: ReactionKind | null): Promise<ReactionSummary> => {
			return mutation.mutateAsync(kind);
		},
		[mutation],
	);

	const toggle = useCallback(
		(kind: ReactionKind): void => {
			const next = myKind === kind ? null : kind;
			mutation.mutate(next);
		},
		[mutation, myKind],
	);

	return {
		summary,
		myKind,
		isPending: mutation.isPending,
		isError: mutation.isError,
		error: mutation.error,
		mutate,
		mutateAsync,
		toggle,
	};
}

// ----------------------------------------------------------------------------
// useReactionSummariesBatch (list scenario)
// ----------------------------------------------------------------------------

export interface UseReactionSummariesBatchResult {
	summaries: Record<string, ReactionSummary>;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
}

/**
 * Fetch reaction summaries for up to N target ids. Splits the call into chunks
 * of 100 to honour the backend's `MAX_BATCH_TARGET_IDS` cap.
 */
export function useReactionSummariesBatch(
	targetType: ReactionTargetType,
	targetIds: string[],
	options: { enabled?: boolean; staleTime?: number } = {},
): UseReactionSummariesBatchResult {
	const queryClient = useQueryClient();
	const stableIds = useMemo(() => [...targetIds].sort(), [targetIds]);
	const enabled = (options.enabled ?? true) && stableIds.length > 0;

	const query = useQuery({
		queryKey: reactionBatchQueryKey(targetType, stableIds),
		queryFn: async (): Promise<Record<string, ReactionSummary>> => {
			const merged: Record<string, ReactionSummary> = {};
			for (let i = 0; i < stableIds.length; i += REACTION_BATCH_LIMIT) {
				const chunk = stableIds.slice(i, i + REACTION_BATCH_LIMIT);
				const response = await getReactionSummariesBatch({
					targetType,
					targetIds: chunk,
				});
				for (const id of chunk) {
					merged[id] = response.summaries[id] ?? {
						likes: 0,
						dislikes: 0,
						score: 0,
					};
				}
			}
			// Hydrate the per-target cache so detail hooks reuse the data.
			for (const [id, summary] of Object.entries(merged)) {
				queryClient.setQueryData<ReactionSummary>(
					reactionDetailQueryKey(targetType, id),
					summary,
				);
			}
			return merged;
		},
		enabled,
		staleTime: options.staleTime ?? 30_000,
	});

	return {
		summaries: query.data ?? {},
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		refetch: () => {
			void query.refetch();
		},
	};
}
