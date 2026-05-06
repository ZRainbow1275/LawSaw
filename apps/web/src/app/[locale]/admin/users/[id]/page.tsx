"use client";

/**
 * /[locale]/admin/users/[id] — native user detail page.
 *
 * Wave 5 B5 layout: header card + 2-column body (left: Profile / Roles /
 * Audit; right: metadata rail with timestamps and identifiers). Falls back to
 * a single column below `xl`.
 */

import { AdminDetailErrorCard } from "@/components/admin/detail-error-card";
import { DetailLayout, MetaList } from "@/components/admin/detail-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	deriveRoleTierFromRoles,
	useAdminUserDetail,
	useUserPermissionAudits,
} from "@/hooks/use-admin-users";
import { roleTierLabelKey } from "@/lib/authz";
import { localizeAuditEvent } from "@/lib/audit-event-labels";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import {
	ArrowLeft,
	CheckCircle2,
	Hash,
	History,
	Loader2,
	Mail,
	ShieldCheck,
	UserCog,
	XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function AdminUserDetailPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const userId = typeof params?.id === "string" ? params.id : "";

	const detailQuery = useAdminUserDetail(userId || null);
	const auditQuery = useUserPermissionAudits(userId || null);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const handleBack = () =>
		router.push(withLocalePath(locale, "/admin/users"));

	const handleManage = () => {
		if (!userId) return;
		router.push(
			withLocalePath(locale, `/admin/users?userId=${encodeURIComponent(userId)}`),
		);
	};

	if (!userId) return null;

	const detail = detailQuery.data;
	const tier = detail
		? deriveRoleTierFromRoles(detail.roles, detail.user.display_name)
		: null;
	const audits = auditQuery.data ?? [];

	const dateOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	} as const;

	const header = (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
							<UserCog
								aria-hidden="true"
								className="h-7 w-7"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("User detail")}
						</CardTitle>
						<p className="mt-1 text-sm" style={mutedTextStyle}>
							{t(
								"Inspect the user's profile, roles, and permission audit trail.",
							)}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button type="button" variant="outline" onClick={handleBack}>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
							{t("Back to users")}
						</Button>
						<Button type="button" onClick={handleManage} disabled={!detail}>
							{t("Manage roles")}
						</Button>
					</div>
				</div>
			</CardHeader>
		</Card>
	);

	if (detailQuery.isLoading) {
		return (
			<DetailLayout
				header={header}
				main={
					<Card>
						<CardContent className="flex items-center gap-2 py-8 text-sm">
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading user detail")}
						</CardContent>
					</Card>
				}
			/>
		);
	}

	if (detailQuery.isError || !detail) {
		return (
			<DetailLayout
				header={header}
				main={
					<AdminDetailErrorCard
						resource="user"
						error={detailQuery.error}
						onRetry={() => detailQuery.refetch()}
					/>
				}
			/>
		);
	}

	const main = (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t("Profile")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-start gap-4">
						<div
							className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
							style={{
								backgroundColor: "var(--surface-accent-strong)",
								color: "var(--color-foreground)",
							}}
						>
							{(detail.user.display_name ?? detail.user.email)
								.slice(0, 1)
								.toUpperCase()}
						</div>
						<div className="min-w-0 flex-1 space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<p
									className="truncate text-lg font-semibold"
									style={headingStyle}
								>
									{detail.user.display_name ?? detail.user.email}
								</p>
								{tier ? (
									<Badge variant="secondary">
										{t(roleTierLabelKey(tier))}
									</Badge>
								) : null}
								{detail.user.is_active ? (
									<Badge variant="success">
										<CheckCircle2 aria-hidden="true" className="mr-1 h-3 w-3" />
										{t("Active")}
									</Badge>
								) : (
									<Badge variant="outline">
										<XCircle aria-hidden="true" className="mr-1 h-3 w-3" />
										{t("Disabled")}
									</Badge>
								)}
							</div>
							<p
								className="flex items-center gap-2 text-sm"
								style={mutedTextStyle}
							>
								<Mail aria-hidden="true" className="h-4 w-4" />
								{detail.user.email}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<ShieldCheck aria-hidden="true" className="h-4 w-4" />
						{t("Role memberships")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{detail.roles.length === 0 ? (
						<p className="text-sm" style={mutedTextStyle}>
							{t("No roles assigned.")}
						</p>
					) : (
						<div className="flex flex-wrap gap-2">
							{detail.roles.map((role) => (
								<Badge key={role} variant="outline">
									{role}
								</Badge>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<History aria-hidden="true" className="h-4 w-4" />
						{t("Permission audit trail")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{auditQuery.isLoading ? (
						<p
							className="flex items-center gap-2 text-sm"
							style={mutedTextStyle}
						>
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading audit trail")}
						</p>
					) : auditQuery.isError ? (
						<p className="text-sm" style={mutedTextStyle}>
							{auditQuery.error instanceof Error
								? auditQuery.error.message
								: t("Failed to load audit trail")}
						</p>
					) : audits.length === 0 ? (
						<p className="text-sm" style={mutedTextStyle}>
							{t("No audit entries yet.")}
						</p>
					) : (
						<ul className="space-y-2">
							{audits.slice(0, 20).map((entry) => (
								<li
									key={entry.id}
									className="rounded-2xl border px-4 py-3 text-sm"
									style={surfaceStyle}
								>
									<div
										className="flex flex-wrap items-center justify-between gap-2"
										style={headingStyle}
									>
										<span className="font-medium" title={entry.action}>
											{localizeAuditEvent(locale, entry.action)}
										</span>
										<span className="text-xs" style={mutedTextStyle}>
											{formatDateTime(locale, entry.occurred_at, dateOptions)}
										</span>
									</div>
									<p className="mt-1 text-xs" style={mutedTextStyle}>
										{entry.resource}
										{entry.resource_id ? ` · ${entry.resource_id}` : ""}
									</p>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</>
	);

	const meta = (
		<MetaList
			title={t("Account metadata")}
			icon={<Hash aria-hidden="true" className="h-4 w-4" />}
			items={[
				{
					label: t("User ID"),
					value: (
						<code className="break-all font-mono text-xs">
							{detail.user.id}
						</code>
					),
				},
				{
					label: t("Last login"),
					value: detail.user.last_login
						? formatDateTime(locale, detail.user.last_login, dateOptions)
						: t("Never logged in"),
				},
				{
					label: t("Created at"),
					value: formatDateTime(locale, detail.user.created_at, dateOptions),
				},
			]}
		/>
	);

	return <DetailLayout header={header} main={main} meta={meta} />;
}
