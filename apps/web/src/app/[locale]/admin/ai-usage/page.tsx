"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { apiClient } from "@/lib/api";
import { formatDateTime, formatTimeAgo } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	BrainCircuit,
	CheckCircle2,
	Cpu,
	Layers,
} from "lucide-react";
import { useMemo } from "react";

interface AiUsageEventRecord {
	id: string;
	request_scope: string;
	operation: string;
	provider: string;
	model: string | null;
	success: boolean;
	error_category: string | null;
	error_message: string | null;
	latency_ms: number;
	created_at: string;
}

interface AiUsageListResponse {
	data: AiUsageEventRecord[];
	total: number;
	limit: number;
	offset: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAiUsageList(
	value: unknown,
): asserts value is AiUsageListResponse {
	if (
		!isRecord(value) ||
		!Array.isArray(value.data) ||
		typeof value.total !== "number"
	) {
		throw new Error("Invalid AI usage list response");
	}
}

function formatAiUsageTimestamp(
	locale: ReturnType<typeof useLocale>,
	value: string,
): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return formatDateTime(locale, parsed, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatAiUsageErrorCategory(
	t: ReturnType<typeof useT>,
	value: string | null,
): string {
	switch (value) {
		case "upstream":
			return t("Upstream service");
		default:
			return value ?? "-";
	}
}

function formatAiUsageErrorMessage(
	t: ReturnType<typeof useT>,
	value: string | null,
): { summary: string; raw: string | null } {
	if (!value) return { summary: "-", raw: null };

	const retryAfterMatch = value.match(/retry_after_seconds=(\d+)/);
	if (value.includes("AI_CIRCUIT_OPEN")) {
		return {
			summary: retryAfterMatch
				? t(
						"The upstream AI service circuit is open. Retry after about {seconds} seconds.",
						{
							seconds: retryAfterMatch[1],
						},
					)
				: t("The upstream AI service circuit is open. Please try again later."),
			raw: value,
		};
	}

	if (value.toLowerCase().includes("timeout")) {
		return {
			summary: t("The upstream AI request timed out. Please retry later."),
			raw: value,
		};
	}

	return { summary: value, raw: null };
}

function formatAiUsageOperation(
	t: ReturnType<typeof useT>,
	value: string,
): string {
	switch (value) {
		case "chat":
			return t("Chat");
		case "embedding":
			return t("Embedding");
		case "rerank":
			return t("Rerank");
		default:
			return value;
	}
}

function formatAiUsageScope(t: ReturnType<typeof useT>, value: string): string {
	switch (value) {
		case "worker.process_ai_task":
			return t("AI task processing");
		case "api.knowledge.hybrid_search":
			return t("Knowledge graph hybrid search");
		case "api.knowledge.semantic_search":
			return t("Knowledge graph semantic search");
		default:
			return value;
	}
}

function AdminAiUsageContent() {
	const locale = useLocale();
	const t = useT();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	const query = useQuery({
		queryKey: ["admin-ai-usage", 50],
		enabled: isAdmin,
		queryFn: () =>
			apiClient.get<AiUsageListResponse>(
				"/api/v1/admin/ai-usage?limit=50",
				assertAiUsageList,
			),
	});

	const rows = query.data?.data ?? [];
	const usageStats = useMemo(() => {
		let success = 0;
		let errors = 0;
		const models = new Set<string>();
		for (const row of rows) {
			if (row.success) success += 1;
			else errors += 1;
			if (row.model) models.add(row.model);
		}
		return { success, errors, models: models.size };
	}, [rows]);

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle
						className="flex items-center gap-2 text-3xl font-bold tracking-tight"
						style={headingStyle}
					>
						<BrainCircuit
							aria-hidden="true"
							className="h-7 w-7"
							style={{ color: "var(--color-primary-500)" }}
						/>
						{t("AI usage")}
					</CardTitle>
					<p className="text-sm" style={mutedTextStyle}>
						{t(
							"Inspect model usage, rerank activity, latency, and failure categories from real tenant traffic.",
						)}
					</p>
				</CardHeader>
			</Card>

			<KpiCardGrid columns={4}>
				<KpiCard
					tone="info"
					label={t("Total events")}
					value={query.data?.total ?? 0}
					icon={Layers}
				/>
				<KpiCard
					tone="success"
					label={t("Successful")}
					value={usageStats.success}
					icon={CheckCircle2}
				/>
				<KpiCard
					tone="error"
					label={t("Errors")}
					value={usageStats.errors}
					icon={AlertTriangle}
				/>
				<KpiCard
					tone="warning"
					label={t("Unique models")}
					value={usageStats.models}
					icon={Cpu}
				/>
			</KpiCardGrid>

			{!isAdmin ? (
				<EmptyState
					title={t("Access restricted")}
					description={t(
						"You need an administrative role to access this workspace.",
					)}
				/>
			) : query.isLoading ? (
				<Card>
					<CardContent className="py-10 text-sm" style={mutedTextStyle}>
						{t("Loading AI usage")}
					</CardContent>
				</Card>
			) : query.isError ? (
				<EmptyState
					variant="error"
					title={t("Failed to load AI usage")}
					description={
						query.error instanceof Error
							? query.error.message
							: t("Unknown error")
					}
					action={{ label: t("Retry"), onClick: () => query.refetch() }}
				/>
			) : rows.length === 0 ? (
				<EmptyState
					title={t("No AI usage yet")}
					description={t(
						"AI telemetry will appear after real model calls are recorded for this tenant.",
					)}
				/>
			) : (
				<div className="grid gap-4">
					{rows.map((row) => {
						const formattedError = formatAiUsageErrorMessage(
							t,
							row.error_message,
						);
						const formattedCreatedAt = formatAiUsageTimestamp(
							locale,
							row.created_at,
						);
						const formattedCreatedAtRelative = formatTimeAgo(
							locale,
							row.created_at,
						);
						const formattedOperation = formatAiUsageOperation(t, row.operation);
						const formattedScope = formatAiUsageScope(t, row.request_scope);

						return (
							<Card key={row.id}>
								<CardContent className="space-y-3 p-5">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={row.success ? "success" : "destructive"}>
											{row.success ? t("Success") : t("Failure")}
										</Badge>
										<Badge variant="outline">{formattedOperation}</Badge>
										<Badge variant="secondary">{formattedScope}</Badge>
									</div>
									<div
										className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4"
										style={mutedTextStyle}
									>
										<div>
											<span className="font-medium" style={headingStyle}>
												{t("Provider")}:{" "}
											</span>
											{row.provider}
										</div>
										<div>
											<span className="font-medium" style={headingStyle}>
												{t("Model")}:{" "}
											</span>
											{row.model ?? "-"}
										</div>
										<div>
											<span className="font-medium" style={headingStyle}>
												{t("Latency")}:{" "}
											</span>
											{row.latency_ms} ms
										</div>
										<div>
											<span className="font-medium" style={headingStyle}>
												{t("Created at")}:{" "}
											</span>
											<span title={row.created_at}>{formattedCreatedAt}</span>
											{formattedCreatedAtRelative ? (
												<div className="mt-1 text-xs" style={mutedTextStyle}>
													{formattedCreatedAtRelative}
												</div>
											) : null}
										</div>
									</div>
									{row.error_category || row.error_message ? (
										<div
											className="rounded-xl p-3 text-sm"
											style={{
												backgroundColor:
													"color-mix(in srgb, var(--surface-muted-bg) 70%, transparent)",
												color: "var(--surface-muted-text)",
											}}
										>
											<div>
												<span className="font-medium" style={headingStyle}>
													{t("Error category")}:{" "}
												</span>
												{formatAiUsageErrorCategory(t, row.error_category)}
											</div>
											<div className="mt-1">
												<span className="font-medium" style={headingStyle}>
													{t("Error summary")}:{" "}
												</span>
												{formattedError.summary}
											</div>
											{formattedError.raw ? (
												<div className="mt-1 break-all text-xs">
													<span className="font-medium" style={headingStyle}>
														{t("Raw backend message")}:{" "}
													</span>
													{formattedError.raw}
												</div>
											) : null}
										</div>
									) : null}
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default function AdminAiUsagePage() {
	return <AdminAiUsageContent />;
}
