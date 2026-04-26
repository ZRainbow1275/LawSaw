"use client";

import { UserShell } from "@/components/layout/user-shell";
import { UserReportReader } from "@/components/reports/user-report-reader";
import { useParams } from "next/navigation";

export default function ReportReaderPage() {
	const params = useParams<{ id: string }>();
	const id = typeof params?.id === "string" ? params.id : "";
	if (!id) return null;

	return (
		<UserShell widthVariant="wide">
			<UserReportReader reportId={id} />
		</UserShell>
	);
}
