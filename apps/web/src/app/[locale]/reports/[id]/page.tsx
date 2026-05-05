"use client";

/**
 * /[locale]/reports/[id] — user-facing report reader (P0 D4 fix).
 *
 * Accepts both UUID and `RPT-yyyymmdd-NNNN` style report IDs. The backend
 * `GET /api/v1/reports/:id` only takes a UUID, so when the URL segment is a
 * report number we resolve it client-side via `useReports` and forward the
 * matching UUID to `<UserReportReader>`.
 */

import { UserShell } from "@/components/layout/user-shell";
import { UserReportReader } from "@/components/reports/user-report-reader";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useReports } from "@/hooks/use-reports";
import { useT } from "@/lib/i18n-client";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const UUID_PATTERN =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const REPORT_NUMBER_PATTERN = /^RPT-\d{8}-\d{4}$/i;

export default function ReportReaderPage() {
	const t = useT();
	const params = useParams<{ id: string }>();
	const rawId = typeof params?.id === "string" ? params.id : "";

	const isUuid = UUID_PATTERN.test(rawId);
	const isReportNumber = !isUuid && REPORT_NUMBER_PATTERN.test(rawId);

	// Backend `GET /api/v1/reports/:id` only takes a UUID. To resolve
	// `RPT-yyyymmdd-NNNN`, we scan the list endpoint with the maximum supported
	// page size (100). Reports are returned ORDER BY created_at DESC so newer
	// numbers resolve first. For tenants exceeding 100 active reports the user
	// hits an explicit "not found" empty-state instead of an infinite spinner.
	const reportsQuery = useReports({
		limit: 100,
		offset: 0,
		enabled: !isUuid && isReportNumber,
	});

	const resolvedUuid = useMemo(() => {
		if (isUuid) return rawId;
		if (!isReportNumber) return null;
		const match = reportsQuery.data?.data.find(
			(item) => item.report_number.toUpperCase() === rawId.toUpperCase(),
		);
		return match?.id ?? null;
	}, [isUuid, isReportNumber, rawId, reportsQuery.data]);

	if (!rawId) return null;

	if (!isUuid && !isReportNumber) {
		return (
			<UserShell widthVariant="wide">
				<Card>
					<CardContent className="py-12">
						<EmptyState
							variant="error"
							title={t("Invalid report identifier")}
							description={t(
								"The report identifier in the URL does not match a known UUID or report number format.",
							)}
						/>
					</CardContent>
				</Card>
			</UserShell>
		);
	}

	if (!isUuid) {
		if (reportsQuery.isLoading) {
			return (
				<UserShell widthVariant="wide">
					<Card>
						<CardContent className="flex items-center gap-2 py-12 text-sm">
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading report")}
						</CardContent>
					</Card>
				</UserShell>
			);
		}
		if (reportsQuery.isError) {
			return (
				<UserShell widthVariant="wide">
					<Card>
						<CardContent className="py-12">
							<EmptyState
								variant="error"
								title={t("Failed to load report")}
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
						</CardContent>
					</Card>
				</UserShell>
			);
		}
		if (!resolvedUuid) {
			return (
				<UserShell widthVariant="wide">
					<Card>
						<CardContent className="py-12">
							<EmptyState
								title={t("Report not found")}
								description={t(
									"No report with this report number is available in the current scope.",
								)}
							/>
						</CardContent>
					</Card>
				</UserShell>
			);
		}
	}

	return (
		<UserShell widthVariant="wide">
			<UserReportReader reportId={resolvedUuid ?? rawId} />
		</UserShell>
	);
}
