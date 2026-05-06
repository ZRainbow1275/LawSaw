"use client";

/**
 * Tenant-level settings — `/[locale]/admin/settings`.
 *
 * Three panels grouped by concern:
 *   - Webhooks: outbound HTTP delivery for tenant-scoped events
 *   - Notification preferences: per-channel default toggles for the tenant
 *   - Identity providers: SSO/OIDC/SAML configuration
 *
 * The supporting backend endpoints (tenant webhooks CRUD, tenant
 * notification preferences, identity provider registration) have not yet
 * shipped, so each panel renders as a structured placeholder that explains
 * the missing endpoint and surfaces the call-to-action as disabled. No mock
 * data — the placeholder is the only honest rendering until the API exists.
 *
 * Once any of the underlying endpoints lands, the matching panel can be
 * swapped to a real `useQuery`/`useMutation` flow without touching the
 * surrounding shell or the navigation entry.
 */

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useT } from "@/lib/i18n-client";
import {
	Bell,
	Info,
	KeyRound,
	Mail,
	MessageSquare,
	Plug,
	Plus,
	Settings as SettingsIcon,
	Shield,
	Slack,
	Webhook,
} from "lucide-react";

interface PlaceholderRowProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	endpoint: string;
}

function PlaceholderRow({
	icon,
	title,
	description,
	endpoint,
}: PlaceholderRowProps) {
	const t = useT();
	return (
		<div
			className="flex items-start gap-3 rounded-2xl border px-4 py-3"
			style={{
				borderColor: "var(--surface-muted-border)",
				backgroundColor: "var(--surface-muted-bg)",
			}}
		>
			<div
				className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
				style={{
					backgroundColor: "var(--surface-accent-icon-bg)",
					color: "var(--surface-accent-strong)",
				}}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p
					className="text-sm font-semibold"
					style={{ color: "var(--color-foreground)" }}
				>
					{title}
				</p>
				<p
					className="mt-0.5 text-xs leading-relaxed"
					style={{ color: "var(--surface-muted-text)" }}
				>
					{description}
				</p>
				<p
					className="mt-1 font-mono text-[11px]"
					style={{
						color:
							"color-mix(in srgb, var(--surface-muted-text) 80%, transparent)",
					}}
				>
					{t("Awaiting backend endpoint")}: <span>{endpoint}</span>
				</p>
			</div>
		</div>
	);
}

function PanelEmptyHint({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-xs"
			style={{
				borderColor: "var(--surface-muted-border)",
				color: "var(--surface-muted-text)",
				backgroundColor:
					"color-mix(in srgb, var(--surface-muted-bg) 60%, transparent)",
			}}
		>
			<Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<span className="leading-relaxed">{children}</span>
		</div>
	);
}

function TenantSettingsContent() {
	const t = useT();
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle
								className="flex items-center gap-2 text-3xl font-bold tracking-tight"
								style={headingStyle}
							>
								<SettingsIcon
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Tenant settings")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t(
									"Tenant-level webhooks, notifications, and identity providers.",
								)}
							</p>
						</div>
					</div>
				</CardHeader>
			</Card>

			<div className="grid gap-4 xl:grid-cols-2">
				{/* Webhook 配置 */}
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle className="flex items-center gap-2">
								<Webhook
									aria-hidden="true"
									className="h-5 w-5"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Webhook configuration")}
							</CardTitle>
							<Button type="button" size="sm" variant="outline" disabled>
								<Plus aria-hidden="true" className="h-4 w-4" />
								{t("Add webhook")}
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-xs" style={mutedTextStyle}>
							{t(
								"Deliver tenant-scoped events to external services with HMAC signatures and retry semantics.",
							)}
						</p>
						<PanelEmptyHint>
							{t(
								"The tenant webhook endpoints have not yet shipped. Configuration will become available once the backend exposes the CRUD routes.",
							)}
						</PanelEmptyHint>
						<PlaceholderRow
							icon={<Webhook aria-hidden="true" className="h-4 w-4" />}
							title={t("Outbound webhooks")}
							description={t(
								"Subscribe external systems to article, audit, and ingestion events scoped to this tenant.",
							)}
							endpoint="GET /api/v1/tenants/{tenant_id}/webhooks"
						/>
					</CardContent>
				</Card>

				{/* 通知偏好 */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Bell
								aria-hidden="true"
								className="h-5 w-5"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Notification preferences")}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-xs" style={mutedTextStyle}>
							{t(
								"Set the tenant-level defaults that apply to every member unless overridden in their personal preferences.",
							)}
						</p>
						<PanelEmptyHint>
							{t(
								"Per-tenant default channels are not yet exposed by the backend. Personal preferences continue to work via /me/notifications.",
							)}
						</PanelEmptyHint>
						<PlaceholderRow
							icon={<Mail aria-hidden="true" className="h-4 w-4" />}
							title={t("Email digests")}
							description={t(
								"Tenant-wide opt-in for daily and weekly digest emails. Members can override their own preference.",
							)}
							endpoint="PATCH /api/v1/tenants/{tenant_id}/notification-preferences"
						/>
						<PlaceholderRow
							icon={<Slack aria-hidden="true" className="h-4 w-4" />}
							title={t("Slack delivery")}
							description={t(
								"Default Slack workspace for tenant alerts. Requires the Slack bot token to be configured.",
							)}
							endpoint="PATCH /api/v1/tenants/{tenant_id}/notification-preferences"
						/>
						<PlaceholderRow
							icon={<MessageSquare aria-hidden="true" className="h-4 w-4" />}
							title={t("In-app notifications")}
							description={t(
								"Toggle the persistent bell-icon feed shown to every tenant member.",
							)}
							endpoint="PATCH /api/v1/tenants/{tenant_id}/notification-preferences"
						/>
					</CardContent>
				</Card>

				{/* 身份配置 */}
				<Card className="xl:col-span-2">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<CardTitle className="flex items-center gap-2">
								<Shield
									aria-hidden="true"
									className="h-5 w-5"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Identity providers")}
							</CardTitle>
							<Button type="button" size="sm" variant="outline" disabled>
								<Plus aria-hidden="true" className="h-4 w-4" />
								{t("Connect provider")}
							</Button>
						</div>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-xs" style={mutedTextStyle}>
							{t(
								"Register an external identity provider so tenant members can sign in via SSO instead of password authentication.",
							)}
						</p>
						<PanelEmptyHint>
							{t(
								"Identity provider registration is gated on the backend SSO module that has not yet shipped.",
							)}
						</PanelEmptyHint>
						<div className="grid gap-3 md:grid-cols-3">
							<PlaceholderRow
								icon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
								title={t("OIDC / OAuth 2.0")}
								description={t(
									"Connect Google Workspace, Okta, Auth0, or any standards-compliant OIDC issuer.",
								)}
								endpoint="POST /api/v1/tenants/{tenant_id}/idp/oidc"
							/>
							<PlaceholderRow
								icon={<Plug aria-hidden="true" className="h-4 w-4" />}
								title={t("SAML 2.0")}
								description={t(
									"Federate logins through enterprise SAML providers such as Azure AD or Ping Identity.",
								)}
								endpoint="POST /api/v1/tenants/{tenant_id}/idp/saml"
							/>
							<PlaceholderRow
								icon={<Shield aria-hidden="true" className="h-4 w-4" />}
								title={t("Just-in-time provisioning")}
								description={t(
									"Auto-create accounts on first SSO login with the role-tier mapping defined here.",
								)}
								endpoint="PATCH /api/v1/tenants/{tenant_id}/idp/jit"
							/>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export default function TenantSettingsPage() {
	return <TenantSettingsContent />;
}
