"use client";

/**
 * ReportsPageContent — `prototype/app.html:1036-1239` 1:1 reproduction.
 *
 * Composes the prototype layout: page-header → toolbar → subscription panel
 * → list of report cards. State (status / period filters) is synced to the
 * URL via `useSearchParams` so links remain shareable.
 */

import { CreateReportDialog } from "@/components/reports/create-report-dialog";
import { ReportCard } from "@/components/reports/prototype/report-card";
import { ReportsToolbar } from "@/components/reports/prototype/reports-toolbar";
import { SubscriptionPanel } from "@/components/reports/prototype/subscription-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useReports } from "@/hooks/use-reports";
import type { Report, ReportPeriodType, ReportStatus } from "@/lib/api/types";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { ClipboardList } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

const REPORTS_LIMIT = 20;

function isStatus(value: string): value is ReportStatus {
	return [
		"draft",
		"generating",
		"generated",
		"review",
		"approved",
		"published",
		"archived",
		"error",
	].includes(value);
}

function isPeriod(value: string): value is ReportPeriodType {
	return ["weekly", "monthly", "quarterly", "custom"].includes(value);
}

export function ReportsPageContent() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();

	const status = searchParams.get("status") ?? "";
	const period = searchParams.get("period") ?? "";
	const page = Math.max(0, Number(searchParams.get("page") ?? 0));
	const [showCreate, setShowCreate] = useState(false);

	const reportsQuery = useReports({
		limit: REPORTS_LIMIT,
		offset: page * REPORTS_LIMIT,
		status: isStatus(status) ? status : undefined,
		period_type: isPeriod(period) ? period : undefined,
	});

	const updateParam = useCallback(
		(key: string, value: string) => {
			const params = new URLSearchParams(searchParams.toString());
			if (value) {
				params.set(key, value);
			} else {
				params.delete(key);
			}
			params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : "?", { scroll: false });
		},
		[router, searchParams],
	);

	const handlePreview = useCallback(
		(report: Report) => {
			router.push(withLocalePath(locale, `/reports/${report.id}`));
		},
		[router, locale],
	);

	const reports = useMemo(
		() => reportsQuery.data?.data ?? [],
		[reportsQuery.data],
	);
	const total = reportsQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / REPORTS_LIMIT));

	return (
		<>
			<header className="mb-6 flex items-center gap-3">
				<span
					className="flex h-10 w-10 items-center justify-center rounded-2xl"
					style={{
						backgroundColor: "var(--surface-accent-icon-bg)",
						color: "var(--surface-accent-strong)",
					}}
				>
					<ClipboardList aria-hidden="true" className="h-5 w-5" />
				</span>
				<div>
					<h1
						className="text-2xl font-bold tracking-tight"
						style={{ color: "var(--color-foreground)" }}
					>
						{t("Reports center")}
					</h1>
					<p className="text-sm" style={{ color: "var(--surface-muted-text)" }}>
						{t(
							"Browse, generate and export periodic legal reports — schedule subscriptions or kick off ad-hoc runs.",
						)}
					</p>
				</div>
			</header>

			<ReportsToolbar
				status={status}
				period={period}
				onStatusChange={(v) => updateParam("status", v)}
				onPeriodChange={(v) => updateParam("period", v)}
				onCreate={() => setShowCreate(true)}
			/>

			<SubscriptionPanel onCreate={() => setShowCreate(true)} />

			{reportsQuery.isLoading ? (
				<div className="space-y-3" aria-busy="true">
					{[0, 1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-44 animate-pulse rounded-2xl"
							style={{ backgroundColor: "var(--color-neutral-100)" }}
						/>
					))}
				</div>
			) : reportsQuery.isError ? (
				<EmptyState
					variant="error"
					title={t("Failed to load reports")}
					description={
						reportsQuery.error instanceof Error
							? reportsQuery.error.message
							: t("Unknown error")
					}
					action={{
						label: t("Retry"),
						onClick: () => reportsQuery.refetch(),
					}}
				/>
			) : reports.length === 0 ? (
				<EmptyState
					title={t("No reports match these filters")}
					description={t(
						"Try clearing filters, or generate a new report to populate this view.",
					)}
				/>
			) : (
				<div data-testid="report-cards">
					{reports.map((report) => (
						<ReportCard
							key={report.id}
							report={report}
							onPreview={handlePreview}
						/>
					))}
				</div>
			)}

			{totalPages > 1 ? (
				<div className="mt-6 flex items-center justify-center gap-3">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 0}
						onClick={() => {
							const params = new URLSearchParams(searchParams.toString());
							const next = Math.max(0, page - 1);
							if (next > 0) params.set("page", String(next));
							else params.delete("page");
							router.replace(`?${params.toString()}`, { scroll: false });
						}}
					>
						{t("Previous")}
					</Button>
					<span
						className="text-xs"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{t("Page {current} / {total}", {
							current: page + 1,
							total: totalPages,
						})}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page + 1 >= totalPages}
						onClick={() => {
							const params = new URLSearchParams(searchParams.toString());
							params.set("page", String(page + 1));
							router.replace(`?${params.toString()}`, { scroll: false });
						}}
					>
						{t("Next")}
					</Button>
				</div>
			) : null}

			<CreateReportDialog
				isOpen={showCreate}
				onClose={() => setShowCreate(false)}
				onSuccess={() => {
					setShowCreate(false);
					reportsQuery.refetch();
				}}
			/>
		</>
	);
}
