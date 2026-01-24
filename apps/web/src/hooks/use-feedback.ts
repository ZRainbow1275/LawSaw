"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Feedback, CreateFeedbackInput } from "@/lib/api/types";

export function useFeedbacks() {
  return useQuery({
    queryKey: ["feedbacks"],
    queryFn: () => apiClient.get<Feedback[]>("/api/v1/feedbacks"),
  });
}

export function useFeedback(id: string) {
  return useQuery({
    queryKey: ["feedback", id],
    queryFn: () => apiClient.get<Feedback>(`/api/v1/feedbacks/${id}`),
    enabled: !!id,
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeedbackInput) =>
      apiClient.post<Feedback>("/api/v1/feedbacks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedbacks"] });
    },
  });
}

export function useMyFeedbacks() {
  return useQuery({
    queryKey: ["my-feedbacks"],
    queryFn: () => apiClient.get<Feedback[]>("/api/v1/feedbacks/my"),
  });
}
