"use client";

/**
 * Compose-and-generate hook for the admin report drawer.
 *
 * The backend exposes two distinct REST verbs:
 *   1) POST /api/v1/reports             — creates a draft report shell
 *   2) POST /api/v1/reports/{id}/generate — enqueues the AI generation task
 *
 * Admin UI flows ("立即生成" inside the report-template drawer) want a single
 * call site that boots the report from a template and immediately schedules
 * generation. We compose the two existing handlers here rather than introduce
 * a new server endpoint (which is owned by another agent in this milestone).
 */

import { apiClient } from "@/lib/api";
import {
	type Report,
	type ReportPeriodType,
	type ReportTaskEnqueuedResponse,
	assertReport,
	assertReportTaskEnqueuedResponse,
} from "@/lib/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ComposeAndGenerateInput {
	template_id: string;
	title: string;
	period_type: ReportPeriodType;
	period_start: string;
	period_end: string;
}

export interface ComposeAndGenerateResult {
	report: Report;
	task: ReportTaskEnqueuedResponse;
}

export function useComposeAndGenerateReport() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (
			input: ComposeAndGenerateInput,
		): Promise<ComposeAndGenerateResult> => {
			if (!input.template_id) {
				throw new Error("template_id is required");
			}
			if (!input.title.trim()) {
				throw new Error("title is required");
			}

			const report = await apiClient.post<Report>(
				"/api/v1/reports",
				{
					title: input.title,
					period_type: input.period_type,
					period_start: input.period_start,
					period_end: input.period_end,
					template_id: input.template_id,
				},
				assertReport,
			);

			const task = await apiClient.post<ReportTaskEnqueuedResponse>(
				`/api/v1/reports/${report.id}/generate`,
				undefined,
				assertReportTaskEnqueuedResponse,
			);

			return { report, task };
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["reports"] });
			queryClient.invalidateQueries({ queryKey: ["report", result.report.id] });
		},
	});
}
