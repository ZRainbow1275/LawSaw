"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useQuery } from "@tanstack/react-query";
import { Check, Download, FileText, Lock, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type RoleTier =
	| "super_admin"
	| "tenant_admin"
	| "premium_user"
	| "verified_user"
	| "basic_user";

interface PermissionRow {
	key: string;
	labelKey: string;
	groupKey: string;
}

interface RolePermissionsMatrix {
	roles: ReadonlyArray<{ tier: RoleTier; labelKey: string }>;
	permissions: ReadonlyArray<PermissionRow>;
	matrix: Record<RoleTier, Record<string, boolean>>;
}

// Default baseline aligned with backend role tier defaults. Used until
// `/api/v1/admin/roles` and `/api/v1/admin/permissions` ship in B.6a.
const DEFAULT_ROLES: ReadonlyArray<{ tier: RoleTier; labelKey: string }> = [
	{ tier: "super_admin", labelKey: "Super admin" },
	{ tier: "tenant_admin", labelKey: "Tenant admin" },
	{ tier: "premium_user", labelKey: "Premium user" },
	{ tier: "verified_user", labelKey: "Verified user" },
	{ tier: "basic_user", labelKey: "Basic user" },
];

const DEFAULT_PERMISSIONS: ReadonlyArray<PermissionRow> = [
	// Articles
	{ key: "articles:read", labelKey: "Read articles", groupKey: "Articles" },
	{ key: "articles:write", labelKey: "Write articles", groupKey: "Articles" },
	{ key: "articles:pin", labelKey: "Pin articles", groupKey: "Articles" },
	{ key: "articles:export", labelKey: "Export articles", groupKey: "Articles" },
	// Sources
	{ key: "sources:read", labelKey: "Read sources", groupKey: "Sources" },
	{ key: "sources:write", labelKey: "Write sources", groupKey: "Sources" },
	// Knowledge
	{
		key: "knowledge:read",
		labelKey: "Read knowledge graph",
		groupKey: "Knowledge",
	},
	{
		key: "knowledge:write",
		labelKey: "Mutate knowledge graph",
		groupKey: "Knowledge",
	},
	{
		key: "knowledge:canvas",
		labelKey: "Knowledge canvas",
		groupKey: "Knowledge",
	},
	// Reports
	{ key: "reports:read", labelKey: "Read reports", groupKey: "Reports" },
	{ key: "reports:write", labelKey: "Generate reports", groupKey: "Reports" },
	// Analytics
	{
		key: "analytics:overview",
		labelKey: "Analytics overview",
		groupKey: "Analytics",
	},
	{
		key: "analytics:regional",
		labelKey: "Regional analytics",
		groupKey: "Analytics",
	},
	{
		key: "analytics:industry",
		labelKey: "Industry analytics",
		groupKey: "Analytics",
	},
	{
		key: "analytics:cross",
		labelKey: "Cross-dimensional analytics",
		groupKey: "Analytics",
	},
	// Admin
	{ key: "users:read", labelKey: "Read users", groupKey: "Admin" },
	{ key: "users:write", labelKey: "Manage users", groupKey: "Admin" },
	{ key: "tenants:read", labelKey: "Read tenants", groupKey: "Admin" },
	{ key: "tenants:write", labelKey: "Manage tenants", groupKey: "Admin" },
	{ key: "audit:read", labelKey: "Read audit log", groupKey: "Admin" },
	{ key: "feedback:resolve", labelKey: "Resolve feedback", groupKey: "Admin" },
	{ key: "banners:write", labelKey: "Manage banners", groupKey: "Admin" },
	// API
	{ key: "apikeys:read", labelKey: "Read API keys", groupKey: "API" },
	{ key: "apikeys:write", labelKey: "Issue API keys", groupKey: "API" },
	// AI
	{ key: "ai:invoke", labelKey: "Invoke AI gateway", groupKey: "AI" },
];

function defaultMatrix(): Record<RoleTier, Record<string, boolean>> {
	const all: Record<string, boolean> = {};
	for (const p of DEFAULT_PERMISSIONS) all[p.key] = true;
	const allFalse: Record<string, boolean> = {};
	for (const p of DEFAULT_PERMISSIONS) allFalse[p.key] = false;

	const tenantAdmin: Record<string, boolean> = { ...all };
	// Tenant admin cannot mutate other tenants by default.
	tenantAdmin["tenants:write"] = false;

	const premium: Record<string, boolean> = { ...allFalse };
	for (const p of DEFAULT_PERMISSIONS) {
		if (p.groupKey === "Articles") premium[p.key] = true;
		if (p.groupKey === "Sources" && p.key === "sources:read")
			premium[p.key] = true;
		if (p.groupKey === "Knowledge") premium[p.key] = true;
		if (p.groupKey === "Reports") premium[p.key] = true;
		if (p.groupKey === "Analytics") premium[p.key] = true;
		if (p.key === "ai:invoke") premium[p.key] = true;
		if (p.key === "apikeys:read" || p.key === "apikeys:write")
			premium[p.key] = true;
	}

	const verified: Record<string, boolean> = { ...allFalse };
	verified["articles:read"] = true;
	verified["articles:export"] = true;
	verified["sources:read"] = true;
	verified["knowledge:read"] = true;
	verified["reports:read"] = true;
	verified["analytics:overview"] = true;
	verified["analytics:regional"] = true;
	verified["analytics:industry"] = true;
	verified["ai:invoke"] = true;

	const basic: Record<string, boolean> = { ...allFalse };
	basic["articles:read"] = true;
	basic["sources:read"] = true;
	basic["knowledge:read"] = true;

	return {
		super_admin: { ...all },
		tenant_admin: tenantAdmin,
		premium_user: premium,
		verified_user: verified,
		basic_user: basic,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RolesPermissionsResponse {
	roles: ReadonlyArray<{ tier: RoleTier; permissions: ReadonlyArray<string> }>;
	permissions: ReadonlyArray<{ key: string; label: string; group: string }>;
}

function assertRolesPermissions(
	value: unknown,
): asserts value is RolesPermissionsResponse {
	if (
		!isRecord(value) ||
		!Array.isArray(value.roles) ||
		!Array.isArray(value.permissions)
	) {
		throw new Error("Invalid roles/permissions response");
	}
}

// ─── CSV / PDF export helpers ───────────────────────────────────────────────

function escapeCsv(value: string): string {
	if (/[,"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
	return value;
}

function buildCsv(matrix: RolePermissionsMatrix): string {
	const header = [
		"permission",
		"group",
		...matrix.roles.map((r) => r.tier),
	].join(",");
	const rows = matrix.permissions.map((p) =>
		[
			p.key,
			p.groupKey,
			...matrix.roles.map((r) =>
				matrix.matrix[r.tier][p.key] ? "true" : "false",
			),
		]
			.map(escapeCsv)
			.join(","),
	);
	return [header, ...rows].join("\r\n");
}

function downloadBlob(filename: string, content: string, mime: string): void {
	const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function buildHtmlForPdf(
	matrix: RolePermissionsMatrix,
	roleLabel: (tier: RoleTier) => string,
	permissionLabel: (key: string) => string,
): string {
	const headers = matrix.roles
		.map((r) => `<th style="padding:6px 10px">${roleLabel(r.tier)}</th>`)
		.join("");
	const rows = matrix.permissions
		.map(
			(p) =>
				`<tr><td style="padding:6px 10px;border-top:1px solid #e5e7eb">${permissionLabel(p.key)} <span style="color:#9ca3af;font-size:11px">(${p.key})</span></td>${matrix.roles
					.map(
						(r) =>
							`<td style="padding:6px 10px;border-top:1px solid #e5e7eb;text-align:center">${matrix.matrix[r.tier][p.key] ? "&#10003;" : "&#10005;"}</td>`,
					)
					.join("")}</tr>`,
		)
		.join("");
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>Permissions matrix</title>
<style>body{font:13px/1.4 system-ui,sans-serif;color:#111827;padding:24px}
h1{font-size:18px;margin:0 0 12px}
table{border-collapse:collapse;width:100%}
th{background:#f9fafb;padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;border-bottom:1px solid #d1d5db}
@media print{body{padding:12px}}
</style></head>
<body><h1>Permissions matrix</h1>
<table><thead><tr><th>Permission</th>${headers}</tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

// ─── Permissions matrix page ────────────────────────────────────────────────

function AdminPermissionsMatrixContent() {
	const t = useT();
	const roles = useAuthStore((s) => s.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const isSuperAdmin = roles.includes("super_admin");
	const isTenantAdmin = roles.includes("tenant_admin");
	const { success: toastSuccess, error: toastError } = useToast();

	// Backend endpoint reserved for B.6a. Until then we render the local
	// baseline so admins can preview and prepare overrides.
	const rolesQuery = useQuery({
		queryKey: ["admin-roles-permissions"],
		enabled: false,
		queryFn: () =>
			apiClient.get<RolesPermissionsResponse>(
				"/api/v1/admin/roles",
				assertRolesPermissions,
			),
	});

	const permissionsQuery = useQuery({
		queryKey: ["admin-permissions"],
		enabled: false,
		queryFn: () =>
			apiClient.get<RolesPermissionsResponse>(
				"/api/v1/admin/permissions",
				assertRolesPermissions,
			),
	});

	const [overrides, setOverrides] = useState<
		Record<RoleTier, Record<string, boolean>>
	>(() => defaultMatrix());

	const matrix: RolePermissionsMatrix = useMemo(
		() => ({
			roles: DEFAULT_ROLES,
			permissions: DEFAULT_PERMISSIONS,
			matrix: overrides,
		}),
		[overrides],
	);

	const groups = useMemo(() => {
		const map = new Map<string, PermissionRow[]>();
		for (const p of DEFAULT_PERMISSIONS) {
			const arr = map.get(p.groupKey) ?? [];
			arr.push(p);
			map.set(p.groupKey, arr);
		}
		return Array.from(map.entries());
	}, []);

	const isCellEditable = (tier: RoleTier): boolean => {
		// Super admin row is read-only (full power, immutable baseline).
		if (tier === "super_admin") return false;
		if (isSuperAdmin) return true;
		if (isTenantAdmin && tier !== "tenant_admin") return true;
		return false;
	};

	const toggleCell = (tier: RoleTier, permKey: string) => {
		if (!isCellEditable(tier)) return;
		setOverrides((prev) => ({
			...prev,
			[tier]: {
				...prev[tier],
				[permKey]: !prev[tier][permKey],
			},
		}));
	};

	const roleLabel = (tier: RoleTier): string => {
		const def = DEFAULT_ROLES.find((r) => r.tier === tier);
		return def ? t(def.labelKey) : tier;
	};
	const permissionLabel = (key: string): string => {
		const def = DEFAULT_PERMISSIONS.find((p) => p.key === key);
		return def ? t(def.labelKey) : key;
	};

	const handleExportCsv = () => {
		try {
			const csv = buildCsv(matrix);
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			downloadBlob(`permissions-${stamp}.csv`, csv, "text/csv");
			toastSuccess(t("Export ready"), t("CSV downloaded"));
		} catch (err) {
			const message = err instanceof Error ? err.message : t("Unknown error");
			toastError(t("Export failed"), message);
		}
	};

	const handleExportPdf = () => {
		try {
			const html = buildHtmlForPdf(matrix, roleLabel, permissionLabel);
			const w = window.open("", "_blank", "noopener,noreferrer");
			if (!w) {
				throw new Error(t("Popup blocked. Allow popups to export PDF."));
			}
			w.document.open();
			w.document.write(html);
			w.document.close();
			toastSuccess(
				t("Print dialog opened"),
				t("Choose 'Save as PDF' from the print dialog."),
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : t("Unknown error");
			toastError(t("Export failed"), message);
		}
	};

	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	if (!isAdmin) {
		return (
			<div className="min-h-screen" style={pageStyle}>
				<Sidebar />
				<MainContent>
					<Header />
					<div className="p-4 md:p-6">
						<EmptyState
							title={t("Access restricted")}
							description={t(
								"You need an administrative role to access this workspace.",
							)}
						/>
					</div>
				</MainContent>
			</div>
		);
	}

	const dataPending = rolesQuery.isFetching || permissionsQuery.isFetching;

	return (
		<div className="min-h-screen" style={pageStyle}>
			<Sidebar />
			<MainContent>
				<Header />
				<div className="space-y-6 p-4 md:p-6">
					<Card>
						<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<CardTitle
									className="flex items-center gap-2 text-3xl font-bold tracking-tight"
									style={headingStyle}
								>
									<ShieldCheck
										aria-hidden="true"
										className="h-7 w-7"
										style={{ color: "var(--color-primary-500)" }}
									/>
									{t("Permission matrix")}
								</CardTitle>
								<CardDescription>
									{t(
										"Visualise role tiers vs permission grants. Tenant admins can adjust their tenant-scoped tiers; super admin baseline is read-only.",
									)}
								</CardDescription>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handleExportPdf}
									disabled={dataPending}
								>
									<FileText aria-hidden="true" className="mr-2 h-4 w-4" />
									{t("Export PDF")}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={handleExportCsv}
									disabled={dataPending}
								>
									<Download aria-hidden="true" className="mr-2 h-4 w-4" />
									{t("Export CSV")}
								</Button>
							</div>
						</CardHeader>
					</Card>

					<Card>
						<CardContent className="overflow-auto p-0">
							<table className="min-w-full border-collapse text-sm">
								<thead>
									<tr
										style={{
											backgroundColor: "var(--surface-muted-bg)",
										}}
									>
										<th
											className="sticky left-0 top-0 z-30 border-b border-r px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]"
											style={{
												borderColor: "var(--surface-muted-border)",
												backgroundColor: "var(--surface-muted-bg)",
												color: "var(--surface-muted-text)",
											}}
										>
											{t("Permission")}
										</th>
										{DEFAULT_ROLES.map((role) => (
											<th
												key={role.tier}
												className="sticky top-0 z-20 border-b px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.08em]"
												style={{
													borderColor: "var(--surface-muted-border)",
													backgroundColor: "var(--surface-muted-bg)",
													color: "var(--surface-muted-text)",
												}}
											>
												<div className="flex flex-col items-center gap-0.5">
													<span>{t(role.labelKey)}</span>
													{role.tier === "super_admin" ? (
														<span
															className="inline-flex items-center gap-0.5 text-[10px]"
															style={{ color: "var(--surface-muted-text)" }}
														>
															<Lock aria-hidden="true" className="h-3 w-3" />
															{t("read-only")}
														</span>
													) : null}
												</div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{groups.map(([groupKey, perms]) => (
										<>
											<tr
												key={`group-${groupKey}`}
												style={{
													backgroundColor:
														"color-mix(in srgb, var(--surface-muted-bg) 60%, transparent)",
												}}
											>
												<td
													colSpan={DEFAULT_ROLES.length + 1}
													className="sticky left-0 z-10 border-b border-t px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
													style={{
														borderColor: "var(--surface-muted-border)",
														color: "var(--surface-muted-text)",
													}}
												>
													{t(groupKey)}
												</td>
											</tr>
											{perms.map((p) => (
												<tr key={p.key} className="hover:bg-neutral-50">
													<td
														className="sticky left-0 z-10 border-b border-r px-4 py-2"
														style={{
															borderColor: "var(--surface-muted-border)",
															backgroundColor: "var(--color-background)",
														}}
													>
														<div
															className="text-sm font-medium"
															style={headingStyle}
														>
															{t(p.labelKey)}
														</div>
														<div
															className="font-mono text-[11px]"
															style={mutedTextStyle}
														>
															{p.key}
														</div>
													</td>
													{DEFAULT_ROLES.map((role) => {
														const checked =
															matrix.matrix[role.tier][p.key] ?? false;
														const editable = isCellEditable(role.tier);
														return (
															<td
																key={`${p.key}-${role.tier}`}
																className="border-b px-3 py-2 text-center"
																style={{
																	borderColor: "var(--surface-muted-border)",
																}}
															>
																<button
																	type="button"
																	disabled={!editable}
																	onClick={() => toggleCell(role.tier, p.key)}
																	aria-pressed={checked}
																	aria-label={`${t(p.labelKey)} — ${t(role.labelKey)}`}
																	className={
																		editable
																			? "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-neutral-100"
																			: "inline-flex h-7 w-7 items-center justify-center rounded-lg cursor-not-allowed opacity-80"
																	}
																	style={{
																		color: checked
																			? "#10b981"
																			: "var(--surface-muted-text)",
																	}}
																>
																	{checked ? (
																		<Check
																			aria-hidden="true"
																			className="h-4 w-4"
																		/>
																	) : (
																		<X aria-hidden="true" className="h-4 w-4" />
																	)}
																</button>
															</td>
														);
													})}
												</tr>
											))}
										</>
									))}
								</tbody>
							</table>
						</CardContent>
					</Card>

					<p className="text-xs" style={mutedTextStyle}>
						{t(
							"Backend endpoints /api/v1/admin/roles and /api/v1/admin/permissions are reserved for B.6a. Edits made here are local previews until the persistence path lands.",
						)}
					</p>
				</div>
			</MainContent>
		</div>
	);
}

export default function AdminPermissionsMatrixPage() {
	return (
		<ProtectedRoute>
			<AdminPermissionsMatrixContent />
		</ProtectedRoute>
	);
}
