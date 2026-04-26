"use client";

import { AdminStatsStrip } from "@/components/admin/admin-stats-strip";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import {
	BarChart3,
	Bell,
	BookOpen,
	BrainCircuit,
	Database,
	FileSearch,
	Globe,
	Key,
	type LucideIcon,
	MessageSquareText,
	Network,
	Pin,
	Settings as SettingsIcon,
	Shield,
	User,
} from "lucide-react";
import Link from "next/link";

interface WorkspaceTile {
	href: string;
	label: string;
	description: string;
	icon: LucideIcon;
	disabled?: boolean;
}

/**
 * Admin workspace tile grid.
 *
 * Order mirrors `SPEC-02-DUAL-PANEL.md` §2.1. Tiles flagged as `disabled`
 * are reserved slots for upcoming sub-workspaces; they render in a muted
 * "coming soon" state instead of linking out, so admins see the full
 * navigation surface even before backing pages exist.
 */
const WORKSPACES: readonly WorkspaceTile[] = [
	{
		href: "/admin/users",
		label: "User directory",
		description: "Browse tenant users and latest account activity.",
		icon: User,
	},
	{
		href: "/admin/relations",
		label: "Authorization relations",
		description: "Inspect and mutate ReBAC tuples.",
		icon: Shield,
	},
	{
		href: "/admin/channels",
		label: "Channel management",
		description: "Manage visibility channels mapped to content categories.",
		icon: Globe,
	},
	{
		href: "/admin/banners",
		label: "Banner management",
		description: "Operate banner lifecycle and targeting scope.",
		icon: Bell,
	},
	{
		href: "/admin/pins",
		label: "Pinned articles",
		description: "Control editorial pinning priority and placement.",
		icon: Pin,
	},
	{
		href: "/admin/feedbacks",
		label: "Feedback desk",
		description: "Review and resolve user feedback.",
		icon: MessageSquareText,
	},
	{
		href: "/admin/audit",
		label: "Audit trail",
		description: "Review state transitions and operator actions.",
		icon: FileSearch,
	},
	{
		href: "/admin/ai-usage",
		label: "AI usage",
		description: "Monitor model usage, rerank activity, and latency.",
		icon: BrainCircuit,
	},
	{
		href: "/admin/apikeys",
		label: "API keys",
		description: "Govern integration secrets and access scopes.",
		icon: Key,
	},
	{
		href: "/admin/reports",
		label: "Reports",
		description: "Operate report templates and delivery workflows.",
		icon: Database,
	},
	{
		href: "/admin/knowledge",
		label: "Knowledge graph",
		description:
			"Govern entity quality, duplicates, and retrieval analytics.",
		icon: Network,
	},
	{
		href: "/admin/permissions",
		label: "Permission matrix",
		description: "Visualize roles, permissions, and resource scopes.",
		icon: Shield,
		disabled: true,
	},
	{
		href: "/admin/sources",
		label: "Source registry",
		description: "Manage crawlers, ingestion sources, and health.",
		icon: BookOpen,
		disabled: true,
	},
	{
		href: "/admin/ai-governance",
		label: "AI governance",
		description: "Configure quotas, prompt versions, and model policy.",
		icon: BarChart3,
		disabled: true,
	},
	{
		href: "/admin/settings",
		label: "Tenant settings",
		description: "Tenant-level webhooks, notifications, and identity.",
		icon: SettingsIcon,
		disabled: true,
	},
] as const;

function AdminWorkspaceContent() {
	const t = useT();
	const locale = useLocale();
	const roles = useAuthStore((state) => state.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<div className="min-h-screen" style={pageStyle}>
			<Sidebar />
			<MainContent>
				<Header />
				<div className="space-y-6 p-4 md:p-6">
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
					{!isAdmin ? (
						<EmptyState
							title={t("Access restricted")}
							description={t(
								"You need an administrative role to access this workspace.",
							)}
						/>
					) : (
						<div className="space-y-6">
							<AdminStatsStrip />
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{WORKSPACES.map((item) => {
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
													<p
														className="text-base font-semibold"
														style={headingStyle}
													>
														{t(item.label)}
													</p>
													<p className="mt-2 text-sm" style={mutedTextStyle}>
														{t(item.description)}
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
											<div
												key={item.href}
												aria-disabled="true"
												title={t("Coming soon")}
											>
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
					)}
				</div>
			</MainContent>
		</div>
	);
}

export default function AdminWorkspacePage() {
	return (
		<ProtectedRoute>
			<AdminWorkspaceContent />
		</ProtectedRoute>
	);
}
