"use client";

/**
 * /settings/admin/tenants — super-admin tenants management.
 *
 * Reads `GET /api/v1/super/tenants` for the roster. The hook forwards
 * search/status filters as query params; we also keep client-side filtering
 * for instant feedback while a network request is in flight.
 *
 * Top KPI strip surfaces the four canonical numbers super-admins watch:
 *   - Total tenants
 *   - Active tenants
 *   - Trial tenants
 *   - Suspended tenants
 *
 * Row click opens `<TenantDetailDrawer>` (5 tabs: overview / quota /
 * features / users / actions). Top-right "New tenant" surfaces
 * `<TenantFormModal>` for create.
 *
 * Access control:
 *   - The route is wrapped in `<ProtectedRoute requiredRole="super_admin">`,
 *     which redirects below-tier users to `/admin`.
 *   - The list endpoint itself enforces the `tenants:manage` permission, so
 *     non-super-admin role sneaks raise a clean 403 toast.
 */

import { TenantDetailDrawer } from "@/components/admin/tenant-detail-drawer";
import { TenantFormModal } from "@/components/admin/tenant-form-modal";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
	type TenantRow,
	useAdminTenants,
} from "@/hooks/use-admin-tenants";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	Building2,
	CheckCircle2,
	Filter,
	Loader2,
	Plus,
	Power,
	Search,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

type StatusFilter = "all" | "active" | "trial" | "suspended";

const STATUS_FILTERS: ReadonlyArray<{
	value: StatusFilter;
	labelKey: string;
}> = [
	{ value: "all", labelKey: "All status" },
	{ value: "active", labelKey: "Active" },
	{ value: "trial", labelKey: "Trial" },
	{ value: "suspended", labelKey: "Suspended" },
];

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.04, delayChildren: 0.06 },
	},
} as const;

const rowVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
} as const;

/**
 * Backend exposes a string `status` field on each tenant. Non-canonical
 * values fall back to "active" so the UI stays renderable even if a future
 * backend release introduces a new status that the frontend has not learnt
 * about yet.
 */
function statusOf(row: TenantRow): "active" | "trial" | "suspended" {
	if (row.status === "trial" || row.status === "suspended") return row.status;
	return "active";
}

function statusVariant(
	status: "active" | "trial" | "suspended",
): "outline" | "secondary" | "success" | "warning" {
	switch (status) {
		case "active":
			return "success";
		case "trial":
			return "secondary";
		case "suspended":
			return "warning";
	}
}

function statusLabelKey(status: "active" | "trial" | "suspended"): string {
	switch (status) {
		case "active":
			return "Active";
		case "trial":
			return "Trial";
		case "suspended":
			return "Suspended";
	}
}

function AdminTenantsContent() {
	const t = useT();
	const locale = useLocale();
	const roles = useAuthStore((state) => state.roles);
	const isSuperAdmin = roles.includes("super_admin");

	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [drawerTenant, setDrawerTenant] = useState<TenantRow | null>(null);
	const [formOpen, setFormOpen] = useState(false);

	const tenantsQuery = useAdminTenants({ enabled: isSuperAdmin });

	const allRows = tenantsQuery.data ?? [];

	const filteredRows = useMemo(() => {
		const trimmed = searchQuery.trim().toLowerCase();
		return allRows.filter((row) => {
			if (trimmed.length > 0) {
				const haystack = `${row.name} ${row.slug}`.toLowerCase();
				if (!haystack.includes(trimmed)) return false;
			}
			if (statusFilter !== "all" && statusOf(row) !== statusFilter) {
				return false;
			}
			return true;
		});
	}, [allRows, searchQuery, statusFilter]);

	const counts = useMemo(() => {
		const acc = { total: allRows.length, active: 0, trial: 0, suspended: 0 };
		for (const row of allRows) {
			const status = statusOf(row);
			if (status === "active") acc.active += 1;
			else if (status === "trial") acc.trial += 1;
			else acc.suspended += 1;
		}
		return acc;
	}, [allRows]);

	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	return (
		<div className="min-h-screen" style={pageStyle}>
			<Sidebar />
			<MainContent>
				<Header />
				<div className="space-y-6 p-4 md:p-6">
					<Card>
						<CardHeader>
							<div className="flex flex-wrap items-start justify-between gap-3">
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
										{t("Tenants")}
									</CardTitle>
									<p className="mt-1 text-sm" style={mutedTextStyle}>
										{t(
											"Super-admin only. Manage SaaS tenants, configure quotas, and toggle feature flags across the platform.",
										)}
									</p>
								</div>
								{isSuperAdmin ? (
									<Button type="button" onClick={() => setFormOpen(true)}>
										<Plus aria-hidden="true" className="h-4 w-4" />
										{t("New tenant")}
									</Button>
								) : null}
							</div>
						</CardHeader>
					</Card>

					{!isSuperAdmin ? (
						<EmptyState
							title={t("Access restricted")}
							description={t(
								"Tenants management is restricted to super_admin. Switch to a super-admin account to continue.",
							)}
						/>
					) : (
						<>
							<KpiStrip
								totalCount={counts.total}
								activeCount={counts.active}
								trialCount={counts.trial}
								suspendedCount={counts.suspended}
								pending={tenantsQuery.isLoading}
								t={t}
							/>

							<Card>
								<CardHeader>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<CardTitle className="flex items-center gap-2">
											<Building2 aria-hidden="true" className="h-5 w-5" />
											{t("Tenant roster")}
											<Badge variant="secondary">{counts.total}</Badge>
										</CardTitle>
										<div className="flex flex-wrap items-center gap-2">
											<div className="relative">
												<Search
													aria-hidden="true"
													className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
													style={mutedTextStyle}
												/>
												<Input
													value={searchQuery}
													onChange={(event) =>
														setSearchQuery(event.target.value)
													}
													placeholder={t("Search name or slug")}
													className="pl-9"
													data-testid="admin-tenants-search"
												/>
											</div>
											<div className="flex flex-wrap items-center gap-1">
												<Filter
													aria-hidden="true"
													className="h-4 w-4"
													style={mutedTextStyle}
												/>
												{STATUS_FILTERS.map((option) => (
													<button
														key={option.value}
														type="button"
														onClick={() => setStatusFilter(option.value)}
														className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
														style={
															statusFilter === option.value
																? {
																		backgroundColor:
																			"var(--surface-accent-strong)",
																		borderColor:
																			"var(--color-primary-500)",
																		color: "var(--color-foreground)",
																	}
																: {
																		backgroundColor: "var(--field-surface)",
																		borderColor: "var(--field-border)",
																		color: "var(--surface-muted-text)",
																	}
														}
														aria-pressed={statusFilter === option.value}
													>
														{t(option.labelKey)}
													</button>
												))}
											</div>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									{tenantsQuery.isLoading ? (
										<div
											className="flex items-center gap-2 text-sm"
											style={mutedTextStyle}
										>
											<Loader2
												aria-hidden="true"
												className="h-4 w-4 animate-spin"
											/>
											{t("Loading tenants")}
										</div>
									) : tenantsQuery.isError ? (
										<EmptyState
											variant="error"
											title={t("Failed to load tenants")}
											description={
												tenantsQuery.error instanceof Error
													? tenantsQuery.error.message
													: t("Unknown error")
											}
											action={{
												label: t("Retry"),
												onClick: () => tenantsQuery.refetch(),
											}}
										/>
									) : filteredRows.length === 0 ? (
										<EmptyState
											variant="search"
											title={t("No tenants match your filters")}
											description={t(
												"Try clearing the search box or selecting a different status.",
											)}
										/>
									) : (
										<motion.ul
											className="space-y-2"
											variants={listVariants}
											initial="hidden"
											animate="visible"
											data-testid="admin-tenants-list"
										>
											<li
												className="grid grid-cols-12 gap-2 px-3 text-xs uppercase tracking-wide"
												style={mutedTextStyle}
												aria-hidden="true"
											>
												<span className="col-span-3">{t("Name")}</span>
												<span className="col-span-2">{t("Slug")}</span>
												<span className="col-span-1 text-right">
													{t("Users")}
												</span>
												<span className="col-span-1 text-right">
													{t("Articles")}
												</span>
												<span className="col-span-2 text-right">
													{t("AI tokens / mo")}
												</span>
												<span className="col-span-1 text-center">
													{t("Status")}
												</span>
												<span className="col-span-2 text-right">
													{t("Created")}
												</span>
											</li>
											{filteredRows.map((row) => {
												const status = statusOf(row);
												return (
													<motion.li key={row.id} variants={rowVariants}>
														<button
															type="button"
															onClick={() => setDrawerTenant(row)}
															className="grid w-full grid-cols-12 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_35%,var(--color-border)_65%)]"
															style={surfaceStyle}
															data-testid="admin-tenants-row"
														>
															<div className="col-span-3 min-w-0">
																<p
																	className="truncate font-semibold"
																	style={headingStyle}
																>
																	{row.name}
																</p>
															</div>
															<div className="col-span-2 min-w-0">
																<p
																	className="truncate text-xs"
																	style={mutedTextStyle}
																>
																	/{row.slug}
																</p>
															</div>
															<div
																className="col-span-1 text-right tabular-nums"
																style={mutedTextStyle}
															>
																—
															</div>
															<div
																className="col-span-1 text-right tabular-nums"
																style={mutedTextStyle}
															>
																—
															</div>
															<div
																className="col-span-2 text-right tabular-nums"
																style={mutedTextStyle}
															>
																—
															</div>
															<div className="col-span-1 text-center">
																<Badge variant={statusVariant(status)}>
																	{t(statusLabelKey(status))}
																</Badge>
															</div>
															<div
																className="col-span-2 text-right text-xs"
																style={mutedTextStyle}
															>
																{formatDateTime(locale, row.created_at, {
																	year: "numeric",
																	month: "2-digit",
																	day: "2-digit",
																})}
															</div>
														</button>
													</motion.li>
												);
											})}
										</motion.ul>
									)}
								</CardContent>
							</Card>

							<p className="text-xs" style={mutedTextStyle}>
								{t(
									"Per-tenant user counts, article totals, and AI token meters appear once the tenant_usage rollup endpoint exposes them in the list response. Open a row to read the live usage panel.",
								)}
							</p>
						</>
					)}
				</div>
			</MainContent>

			<TenantDetailDrawer
				open={drawerTenant !== null}
				tenant={drawerTenant}
				onClose={() => setDrawerTenant(null)}
			/>

			<TenantFormModal
				isOpen={formOpen}
				onClose={() => setFormOpen(false)}
			/>
		</div>
	);
}

interface KpiStripProps {
	totalCount: number;
	activeCount: number;
	trialCount: number;
	suspendedCount: number;
	pending: boolean;
	t: ReturnType<typeof useT>;
}

function KpiStrip({
	totalCount,
	activeCount,
	trialCount,
	suspendedCount,
	pending,
	t,
}: KpiStripProps) {
	const tiles: Array<{
		key: string;
		label: string;
		value: string;
		caption: string;
		icon: React.ReactNode;
		gradient: string;
	}> = [
		{
			key: "total",
			label: t("Total tenants"),
			value: pending ? "—" : String(totalCount),
			caption: t("All tenants visible to super-admin."),
			icon: <Building2 aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-primary-gradient)",
		},
		{
			key: "active",
			label: t("Active"),
			value: pending ? "—" : String(activeCount),
			caption: t("Logging in and ingesting on schedule."),
			icon: <CheckCircle2 aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-emerald-gradient)",
		},
		{
			key: "trial",
			label: t("Trial"),
			value: pending ? "—" : String(trialCount),
			caption: t("Tenants currently in trial period."),
			icon: <Sparkles aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-amber-gradient)",
		},
		{
			key: "suspended",
			label: t("Suspended"),
			value: pending ? "—" : String(suspendedCount),
			caption: t("Tenants temporarily blocked from sign-in."),
			icon: <Power aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-rose-gradient)",
		},
	];
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{tiles.map((tile) => (
				<div
					key={tile.key}
					className="rounded-2xl border p-4"
					style={{
						background: tile.gradient,
						borderColor: "var(--surface-muted-border)",
					}}
				>
					<div className="flex items-center gap-3">
						<div
							className="flex h-10 w-10 items-center justify-center rounded-xl"
							style={{
								backgroundColor: "rgba(255,255,255,0.7)",
								color: "var(--color-primary-700, #1d4ed8)",
							}}
						>
							{tile.icon}
						</div>
						<div className="min-w-0">
							<p
								className="text-xs uppercase tracking-wide"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{tile.label}
							</p>
							<p
								className="mt-1 text-2xl font-bold tabular-nums"
								style={{ color: "var(--color-foreground)" }}
							>
								{tile.value}
							</p>
							<p
								className="mt-1 text-xs"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{tile.caption}
							</p>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

export default function AdminTenantsPage() {
	return (
		<ProtectedRoute requiredRole="super_admin">
			<AdminTenantsContent />
		</ProtectedRoute>
	);
}
