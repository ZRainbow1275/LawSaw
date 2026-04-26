"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import {
	Bell,
	BrainCircuit,
	Database,
	FileSearch,
	Globe,
	Key,
	MessageSquareText,
	Network,
	Pin,
	Shield,
	User,
} from "lucide-react";
import Link from "next/link";

const WORKSPACES = [
	{ href: "/settings/admin/users", label: "User directory", description: "Browse tenant users and latest account activity.", icon: User },
	{ href: "/settings/admin/relations", label: "Authorization relations", description: "Inspect and mutate ReBAC tuples.", icon: Shield },
	{ href: "/settings/admin/channels", label: "Channel management", description: "Manage visibility channels mapped to content categories.", icon: Globe },
	{ href: "/settings/admin/banners", label: "Banner management", description: "Operate banner lifecycle and targeting scope.", icon: Bell },
	{ href: "/settings/admin/pins", label: "Pinned articles", description: "Control editorial pinning priority and placement.", icon: Pin },
	{ href: "/settings/admin/feedbacks", label: "Feedback desk", description: "Review and resolve user feedback.", icon: MessageSquareText },
	{ href: "/settings/admin/audit", label: "Audit trail", description: "Review state transitions and operator actions.", icon: FileSearch },
	{ href: "/settings/admin/ai-usage", label: "AI usage", description: "Monitor model usage, rerank activity, and latency.", icon: BrainCircuit },
	{ href: "/settings/admin/apikeys", label: "API keys", description: "Govern integration secrets and access scopes.", icon: Key },
	{ href: "/settings/admin/reports", label: "Reports", description: "Operate report templates and delivery workflows.", icon: Database },
	{ href: "/settings/admin/knowledge", label: "Knowledge graph", description: "Govern entity quality, duplicates, and retrieval analytics.", icon: Network },
] as const;

function AdminWorkspaceContent() {
	const t = useT();
	const roles = useAuthStore((state) => state.roles);
	const isAdmin = roles.some((role) => ["super_admin", "tenant_admin", "admin"].includes(role));
	const pageStyle = {
		backgroundColor: "color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
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
							<CardTitle className="text-3xl font-bold tracking-tight" style={headingStyle}>
								{t("Admin workspace")}
							</CardTitle>
							<CardDescription>{t("Open dedicated governance consoles for tenant operations, content control, AI telemetry, and graph management.")}</CardDescription>
						</CardHeader>
					</Card>
					{!isAdmin ? (
						<EmptyState title={t("Access restricted")} description={t("You need an administrative role to access this workspace.")} />
					) : (
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{WORKSPACES.map((item) => {
								const Icon = item.icon;
								return (
									<Link key={item.href} href={item.href}>
										<Card className="h-full transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_35%,var(--color-border)_65%)]">
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
													<p className="text-base font-semibold" style={headingStyle}>{t(item.label)}</p>
													<p className="mt-2 text-sm" style={mutedTextStyle}>{t(item.description)}</p>
												</div>
											</CardContent>
										</Card>
									</Link>
								);
							})}
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
