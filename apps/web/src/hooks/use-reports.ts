"use client";

import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type Report,
	type ReportExportFormat,
	type ReportListResponse,
	type ReportPeriodType,
	type ReportStatus,
	type ReportSubscription,
	type ReportSubscriptionListResponse,
	type ReportSubscriptionTriggerResponse,
	type ReportTaskEnqueuedResponse,
	type ReportTemplate,
	assertDeleteResponse,
	assertReport,
	assertReportListResponse,
	assertReportSubscription,
	assertReportSubscriptionListResponse,
	assertReportSubscriptionTriggerResponse,
	assertReportTaskEnqueuedResponse,
	assertReportTemplate,
	assertReportTemplateList,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Reports — Query hooks
// ---------------------------------------------------------------------------

interface ReportFilters {
	limit?: number;
	offset?: number;
	status?: ReportStatus;
	period_type?: ReportPeriodType;
	author_id?: string;
	date_from?: string;
	date_to?: string;
	enabled?: boolean;
}

export function useReports(filters: ReportFilters = {}) {
	const {
		limit = 20,
		offset = 0,
		status,
		period_type,
		author_id,
		date_from,
		date_to,
		enabled = true,
	} = filters;

	const queryParams = new URLSearchParams();
	queryParams.set("limit", limit.toString());
	queryParams.set("offset", offset.toString());
	if (status) queryParams.set("status", status);
	if (period_type) queryParams.set("period_type", period_type);
	if (author_id) queryParams.set("author_id", author_id);
	if (date_from) queryParams.set("date_from", date_from);
	if (date_to) queryParams.set("date_to", date_to);

	return useQuery({
		queryKey: ["reports", queryParams.toString()],
		queryFn: () =>
			apiClient.get<ReportListResponse>(
				`/api/v1/reports?${queryParams.toString()}`,
				assertReportListResponse,
			),
		enabled,
	});
}

interface UseReportOptions {
	enabled?: boolean;
	refetchInterval?: number | false;
}

export function useReport(id: string, options: UseReportOptions = {}) {
	const { enabled = true, refetchInterval = false } = options;

	return useQuery({
		queryKey: ["report", id],
		queryFn: () => apiClient.get<Report>(`/api/v1/reports/${id}`, assertReport),
		enabled: !!id && enabled,
		refetchInterval,
	});
}

// ---------------------------------------------------------------------------
// Reports — Mutation hooks
// ---------------------------------------------------------------------------

interface CreateReportInput {
	title: string;
	period_type: ReportPeriodType;
	period_start: string; // YYYY-MM-DD
	period_end: string; // YYYY-MM-DD
	template_id?: string;
}

export function useCreateReport() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateReportInput) =>
			apiClient.post<Report>("/api/v1/reports", input, assertReport),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
	});
}

interface UpdateReportInput {
	id: string;
	version: number;
	title?: string;
	content?: Record<string, unknown>;
}

export function useUpdateReport() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, version, ...data }: UpdateReportInput) =>
			apiClient.put<Report>(`/api/v1/reports/${id}`, data, assertReport, {
				headers: {
					"If-Match": ifMatchFromVersion(version),
				},
			}),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
			queryClient.invalidateQueries({ queryKey: ["report", variables.id] });
		},
	});
}

export function useDeleteReport() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { id: string }) =>
			apiClient.delete(`/api/v1/reports/${input.id}`, assertDeleteResponse),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
	});
}

interface TransitionStatusInput {
	id: string;
	target_status: ReportStatus;
}

export function useTransitionReportStatus() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, target_status }: TransitionStatusInput) =>
			apiClient.post<Report>(
				`/api/v1/reports/${id}/transition`,
				{ target_status },
				assertReport,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
			queryClient.invalidateQueries({ queryKey: ["report", variables.id] });
		},
	});
}

export function useGenerateReport() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.post<ReportTaskEnqueuedResponse>(
				`/api/v1/reports/${id}/generate`,
				undefined,
				assertReportTaskEnqueuedResponse,
			),
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
			queryClient.invalidateQueries({ queryKey: ["report", id] });
		},
	});
}

interface ExportReportInput {
	id: string;
	format: ReportExportFormat;
}

export function useExportReport() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, format }: ExportReportInput) =>
			apiClient.post<ReportTaskEnqueuedResponse>(
				`/api/v1/reports/${id}/export`,
				{ format },
				assertReportTaskEnqueuedResponse,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
			queryClient.invalidateQueries({ queryKey: ["report", variables.id] });
		},
	});
}

// ---------------------------------------------------------------------------
// Templates — Query hooks
// ---------------------------------------------------------------------------

interface UseReportTemplatesOptions {
	enabled?: boolean;
}

export function useReportTemplates(
	periodType?: string,
	options: UseReportTemplatesOptions = {},
) {
	const { enabled = true } = options;
	const qs = periodType ? `?period_type=${encodeURIComponent(periodType)}` : "";

	return useQuery({
		queryKey: ["reportTemplates", periodType],
		queryFn: () =>
			apiClient.get<ReportTemplate[]>(
				`/api/v1/report-templates${qs}`,
				assertReportTemplateList,
			),
		staleTime: 60_000,
		enabled,
	});
}

export function useReportTemplate(id: string) {
	return useQuery({
		queryKey: ["reportTemplate", id],
		queryFn: () =>
			apiClient.get<ReportTemplate>(
				`/api/v1/report-templates/${id}`,
				assertReportTemplate,
			),
		enabled: !!id,
	});
}

// ---------------------------------------------------------------------------
// Templates — Mutation hooks
// ---------------------------------------------------------------------------

interface CreateTemplateInput {
	name: string;
	description?: string;
	period_type: ReportPeriodType;
	template_body: string;
	css_styles?: string;
	page_config?: Record<string, unknown>;
	sections_config?: unknown;
}

export function useCreateReportTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateTemplateInput) =>
			apiClient.post<ReportTemplate>(
				"/api/v1/report-templates",
				input,
				assertReportTemplate,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
		},
	});
}

interface UpdateTemplateInput {
	id: string;
	name?: string;
	description?: string;
	period_type?: string;
	template_body?: string;
	css_styles?: string;
	page_config?: Record<string, unknown>;
	sections_config?: unknown;
}

export function useUpdateReportTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, ...data }: UpdateTemplateInput) =>
			apiClient.put<ReportTemplate>(
				`/api/v1/report-templates/${id}`,
				data,
				assertReportTemplate,
			),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
			queryClient.invalidateQueries({
				queryKey: ["reportTemplate", variables.id],
			});
		},
	});
}

export function useDeleteReportTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(`/api/v1/report-templates/${id}`, assertDeleteResponse),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
		},
	});
}

// ---------------------------------------------------------------------------
// Subscriptions — Query hook
// ---------------------------------------------------------------------------

interface UseReportSubscriptionsOptions {
	enabled?: boolean;
}

export function useReportSubscriptions(
	options: UseReportSubscriptionsOptions = {},
) {
	const { enabled = true } = options;

	return useQuery({
		queryKey: ["reportSubscriptions"],
		queryFn: () =>
			apiClient.get<ReportSubscriptionListResponse>(
				"/api/v1/report-subscriptions",
				assertReportSubscriptionListResponse,
			),
		enabled,
	});
}

// ---------------------------------------------------------------------------
// Subscriptions — Mutation hooks
// ---------------------------------------------------------------------------

interface CreateReportSubscriptionInput {
	name: string;
	template_id: string;
	period_type: string;
	delivery_channel: string;
	export_format: string;
	filters?: Record<string, unknown>;
	is_active?: boolean;
}

export function useCreateReportSubscription() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateReportSubscriptionInput) =>
			apiClient.post<ReportSubscription>(
				"/api/v1/report-subscriptions",
				input,
				assertReportSubscription,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reportSubscriptions"] });
		},
	});
}

interface UpdateReportSubscriptionInput {
	id: string;
	name?: string;
	template_id?: string;
	period_type?: string;
	delivery_channel?: string;
	export_format?: string;
	filters?: Record<string, unknown>;
	is_active?: boolean;
}

export function useUpdateReportSubscription() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, ...data }: UpdateReportSubscriptionInput) =>
			apiClient.put<ReportSubscription>(
				`/api/v1/report-subscriptions/${id}`,
				data,
				assertReportSubscription,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reportSubscriptions"] });
		},
	});
}

export function useDeleteReportSubscription() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(
				`/api/v1/report-subscriptions/${id}`,
				assertDeleteResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reportSubscriptions"] });
		},
	});
}

export function useTriggerReportSubscription() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) =>
			apiClient.post<ReportSubscriptionTriggerResponse>(
				`/api/v1/report-subscriptions/${id}/trigger`,
				undefined,
				assertReportSubscriptionTriggerResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["reportSubscriptions"] });
			queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
	});
}
