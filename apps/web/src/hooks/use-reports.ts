"use client";

import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type Report,
	type ReportExportFormat,
	type ReportListResponse,
	type ReportPeriodType,
	type ReportStatus,
	type ReportTaskEnqueuedResponse,
	type ReportTemplate,
	assertDeleteResponse,
	assertReport,
	assertReportListResponse,
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
		queryKey: ["reports", filters],
		queryFn: () =>
			apiClient.get<ReportListResponse>(
				`/api/v1/reports?${queryParams.toString()}`,
				assertReportListResponse,
			),
	});
}

export function useReport(id: string) {
	return useQuery({
		queryKey: ["report", id],
		queryFn: () => apiClient.get<Report>(`/api/v1/reports/${id}`, assertReport),
		enabled: !!id,
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
		mutationFn: (input: { id: string; version: number }) =>
			apiClient.delete(`/api/v1/reports/${input.id}`, assertDeleteResponse, {
				headers: {
					"If-Match": ifMatchFromVersion(input.version),
				},
			}),
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
			queryClient.invalidateQueries({ queryKey: ["report", variables.id] });
		},
	});
}

// ---------------------------------------------------------------------------
// Templates — Query hooks
// ---------------------------------------------------------------------------

export function useReportTemplates(periodType?: string) {
	const qs = periodType ? `?period_type=${encodeURIComponent(periodType)}` : "";

	return useQuery({
		queryKey: ["reportTemplates", periodType],
		queryFn: () =>
			apiClient.get<ReportTemplate[]>(
				`/api/v1/report-templates${qs}`,
				assertReportTemplateList,
			),
		staleTime: 60_000,
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
