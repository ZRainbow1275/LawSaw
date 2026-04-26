"use client";

import { apiClient } from "@/lib/api";
import { assertFeedback, assertFeedbackListResponse } from "@/lib/api/types";
import type {
	CreateFeedbackInput,
	Feedback,
	FeedbackListResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface UpdateFeedbackInput {
	id: string;
	version: number;
	status?: Feedback["status"];
	admin_response?: string | null;
}

export interface FeedbackListParams {
	limit?: number;
	offset?: number;
}

export function useFeedbacks(params: FeedbackListParams = {}) {
	const { limit = 50, offset = 0 } = params;
	return useQuery({
		queryKey: ["feedbacks", { limit, offset }],
		queryFn: () =>
			apiClient.get<FeedbackListResponse>(
				`/api/v1/feedbacks?limit=${limit}&offset=${offset}`,
				assertFeedbackListResponse,
			),
	});
}

export function useFeedback(id: string) {
	return useQuery({
		queryKey: ["feedback", id],
		queryFn: () => apiClient.get(`/api/v1/feedbacks/${id}`, assertFeedback),
		enabled: !!id,
	});
}

export function useCreateFeedback() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateFeedbackInput) =>
			apiClient.post("/api/v1/feedbacks", data, assertFeedback),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["feedbacks"] });
			queryClient.invalidateQueries({ queryKey: ["my-feedbacks"] });
		},
	});
}

export function useUpdateFeedback() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, ...data }: UpdateFeedbackInput) =>
			apiClient.patch(`/api/v1/feedbacks/${id}`, data, assertFeedback),
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["feedbacks"] });
			queryClient.invalidateQueries({ queryKey: ["my-feedbacks"] });
		},
	});
}

export function useMyFeedbacks(params: FeedbackListParams = {}) {
	const { limit = 50, offset = 0 } = params;
	return useQuery({
		queryKey: ["my-feedbacks", { limit, offset }],
		queryFn: () =>
			apiClient.get<FeedbackListResponse>(
				`/api/v1/feedbacks/my?limit=${limit}&offset=${offset}`,
				assertFeedbackListResponse,
			),
	});
}
