"use client";

import { AnalyticsPagePrototype } from "@/components/analytics/prototype/analytics-page";
import { UserShell } from "@/components/layout/user-shell";

export default function AnalyticsPage() {
	return (
		<UserShell widthVariant="default">
			<AnalyticsPagePrototype />
		</UserShell>
	);
}
