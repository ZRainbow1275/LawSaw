"use client";

import { apiClient } from "@/lib/api";
import { assertFeedback, assertFeedbackList } from "@/lib/api/types";
import type { CreateFeedbackInput } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useFeedbacks() {
	return useQuery({
		queryKey: ["feedbacks"],
		queryFn: () => apiClient.get("/api/v1/feedbacks", assertFeedbackList),
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["feedbacks"] });
			queryClient.invalidateQueries({ queryKey: ["my-feedbacks"] });
		},
	});
}

export function useMyFeedbacks() {
	return useQuery({
		queryKey: ["my-feedbacks"],
		queryFn: () => apiClient.get("/api/v1/feedbacks/my", assertFeedbackList),
	});
}
