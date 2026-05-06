"use client";

import { DashboardPageContent } from "@/components/dashboard/dashboard-page-content";
import { UserShell } from "@/components/layout/user-shell";

export default function DashboardPage() {
	return (
		<UserShell widthVariant="default">
			<DashboardPageContent />
		</UserShell>
	);
}
