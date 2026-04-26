"use client";

import { UserShell } from "@/components/layout/user-shell";
import { UserReportList } from "@/components/reports/user-report-list";
import { useT } from "@/lib/i18n-client";
import { ClipboardList } from "lucide-react";

export default function ReportsPage() {
	const t = useT();

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const accentStyle = {
		backgroundColor: "var(--surface-accent-icon-bg)",
		color: "var(--surface-accent-strong)",
	} as const;

	return (
		<UserShell widthVariant="default">
			<div className="space-y-6">
				<header className="flex items-center gap-3">
					<span
						className="flex h-10 w-10 items-center justify-center rounded-2xl"
						style={accentStyle}
					>
						<ClipboardList aria-hidden="true" className="h-5 w-5" />
					</span>
					<div>
						<h1
							className="text-2xl font-bold tracking-tight"
							style={headingStyle}
						>
							{t("Reports")}
						</h1>
						<p className="text-sm" style={mutedStyle}>
							{t(
								"Subscribed, recommended, and historical legal analysis reports for your tier.",
							)}
						</p>
					</div>
				</header>

				<UserReportList />
			</div>
		</UserShell>
	);
}
