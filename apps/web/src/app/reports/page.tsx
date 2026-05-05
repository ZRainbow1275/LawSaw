"use client";

import { UserShell } from "@/components/layout/user-shell";
import { ReportsPageContent } from "@/components/reports/prototype/reports-page-content";

export default function ReportsPage() {
	return (
		<UserShell widthVariant="default">
			<ReportsPageContent />
		</UserShell>
	);
}
