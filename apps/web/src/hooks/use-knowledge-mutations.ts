"use client";

/**
 * Admin-side knowledge graph mutations.
 *
 * Two operations are exposed:
 *   - `useKnowledgeMergeInto`     — merge a source entity into a target.
 *   - `useKnowledgeRetriggerExtract` — re-enqueue LLM entity extraction.
 *
 * Re-extract is wired against the existing `/api/v1/knowledge/backfill-llm`
 * endpoint, which only re-processes articles that are missing entity links or
 * embeddings. The handler is a tenant-scoped batch — we limit it to a small
 * window per click so admin actions stay snappy.
 */

import { apiClient } from "@/lib/api";
import {
	assertKnowledgeLlmBackfillResponse,
	assertKnowledgeMergeEntitiesResponse,
} from "@/lib/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface MergeEntitiesInput {
	target_id: string;
	source_id: string;
}

export function useKnowledgeMergeInto() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: MergeEntitiesInput) => {
			if (!input.target_id || !input.source_id) {
				throw new Error("target_id and source_id are required");
			}
			if (input.target_id === input.source_id) {
				throw new Error("target_id must differ from source_id");
			}
			return apiClient.post(
				"/api/v1/knowledge/entities/merge",
				input,
				assertKnowledgeMergeEntitiesResponse,
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
		},
	});
}

export interface RetriggerExtractInput {
	limit?: number;
}

export function useKnowledgeRetriggerExtract() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: RetriggerExtractInput = {}) => {
			const limit = Math.min(50, Math.max(1, input.limit ?? 5));
			return apiClient.post(
				"/api/v1/knowledge/backfill-llm",
				{ limit },
				assertKnowledgeLlmBackfillResponse,
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
		},
	});
}
