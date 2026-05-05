"use client";

import { AdminStatsStrip } from "@/components/admin/admin-stats-strip";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ADMIN_WORKSPACE_TILES } from "@/lib/admin-nav";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import Link from "next/link";

function AdminWorkspaceContent() {
	const t = useT();
	const locale = useLocale();
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle
						className="text-3xl font-bold tracking-tight"
						style={headingStyle}
					>
						{t("Admin workspace")}
					</CardTitle>
					<CardDescription>
						{t(
							"Open dedicated governance consoles for tenant operations, content control, AI telemetry, and graph management.",
						)}
					</CardDescription>
				</CardHeader>
			</Card>
			<div className="space-y-6">
				<AdminStatsStrip />
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{ADMIN_WORKSPACE_TILES.map((item) => {
						const Icon = item.icon;
						const localizedHref = withLocalePath(locale, item.href);
						const tileBody = (
							<Card
								className={
									item.disabled
										? "h-full opacity-60"
										: "h-full transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_35%,var(--color-border)_65%)]"
								}
							>
								<CardContent className="flex h-full flex-col gap-3 p-5">
									<div
										className="flex h-11 w-11 items-center justify-center rounded-2xl"
										style={{
											backgroundColor: "var(--control-selected-bg)",
											color: "var(--color-primary-600)",
										}}
									>
										<Icon aria-hidden="true" className="h-5 w-5" />
									</div>
									<div>
										<p className="text-base font-semibold" style={headingStyle}>
											{t(item.labelKey)}
										</p>
										<p className="mt-2 text-sm" style={mutedTextStyle}>
											{t(item.descriptionKey)}
										</p>
										{item.disabled ? (
											<p
												className="mt-3 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
												style={{
													backgroundColor: "var(--surface-muted-bg)",
													borderColor: "var(--surface-muted-border)",
													color: "var(--surface-muted-text)",
												}}
											>
												{t("Coming soon")}
											</p>
										) : null}
									</div>
								</CardContent>
							</Card>
						);

						if (item.disabled) {
							return (
								<div key={item.href} aria-disabled="true" title={t("Coming soon")}>
									{tileBody}
								</div>
							);
						}

						return (
							<Link key={item.href} href={localizedHref}>
								{tileBody}
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
}

export default function AdminWorkspacePage() {
	return <AdminWorkspaceContent />;
}
