"use client";

/**
 * /[locale]/admin/users — tenant-scope user management (P1.2 native page).
 *
 * Mounted under `[locale]/admin/layout.tsx`, which provides the
 * `<AdminShell>` chrome (sidebar + topbar + breadcrumb) + tenant_admin
 * server-side role-tier gate. The legacy `/settings/admin/users` route now
 * 308-redirects here per SPEC-02 §8 dual-panel migration table.
 *
 * Reads `GET /api/v1/users` for the roster (paginated 50/page) and applies
 * search + role-tier filters client-side because the backend list endpoint
 * does not yet expose those query params.
 *
 * Row click opens `<UserDetailDrawer>` (4 tabs: overview / roles / sessions /
 * activity). The drawer drives role membership writes through
 * `PATCH /api/v1/users/:id/roles` with `If-Match` versioning.
 *
 * The "Invite user" button surfaces the placeholder `<InviteUserModal>` —
 * the underlying endpoint is not yet implemented, so the modal renders the
 * action as disabled and explains the gap.
 */

import { InviteUserModal } from "@/components/admin/invite-user-modal";
import { useAdminDeepLink } from "@/hooks/use-admin-deep-link";
import { UserDetailDrawer } from "@/components/admin/user-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
	type AdminUserRow,
	deriveRoleTierFromRoles,
	useAdminUserDetail,
	useAdminUsers,
} from "@/hooks/use-admin-users";
import {
	type RoleTier,
	roleTierLabelKey,
	splitDisplayNameRoleTier,
} from "@/lib/authz";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import {
	CheckCircle2,
	Filter,
	Loader2,
	Search,
	UserPlus,
	UsersRound,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

const TIER_FILTERS: ReadonlyArray<{
	value: "all" | RoleTier;
	labelKey: string;
}> = [
	{ value: "all", labelKey: "All tiers" },
	{ value: "basic_user", labelKey: "Basic user" },
	{ value: "verified_user", labelKey: "Verified user" },
	{ value: "premium_user", labelKey: "Premium user" },
	{ value: "tenant_admin", labelKey: "Tenant admin" },
	{ value: "super_admin", labelKey: "Super admin" },
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

function inferTierFromRow(row: AdminUserRow): RoleTier {
	const { roleTier } = splitDisplayNameRoleTier(row.display_name ?? null);
	return deriveRoleTierFromRoles(
		row.roles.length > 0 ? row.roles : [roleTier ?? row.role_tier],
		row.display_name ?? null,
	);
}

export default function AdminUsersPage() {
	const t = useT();
	const locale = useLocale();
	const { searchParams, clearSearchParams } = useAdminDeepLink();
	// Server-side admin guard at [locale]/admin/layout.tsx — non-admin tiers
	// are redirected to /me/feed before this client component is mounted, so
	// the legacy `isAdmin` early-return is collapsed to a constant `true`.
	const isAdmin = true;

	const [page, setPage] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [tierFilter, setTierFilter] = useState<"all" | RoleTier>("all");
	const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
	const [inviteOpen, setInviteOpen] = useState(false);
	const userIdParam = searchParams.get("userId");

	const usersQuery = useAdminUsers({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
		enabled: isAdmin,
	});
	const deepLinkedUserQuery = useAdminUserDetail(userIdParam);

	const allRows = usersQuery.data?.data ?? [];
	const total = usersQuery.data?.total ?? 0;

	const deepLinkedUser = useMemo<AdminUserRow | null>(() => {
		if (!userIdParam) return null;
		const row = allRows.find((item) => item.id === userIdParam);
		if (row) return row;

		const detail = deepLinkedUserQuery.data;
		if (!detail || detail.user.id !== userIdParam) return null;

		return {
			id: detail.user.id,
			tenant_id: "",
			email: detail.user.email,
			display_name: detail.user.display_name,
			avatar_url: detail.user.avatar_url,
			is_active: detail.user.is_active,
			email_verified_at: null,
			last_login: detail.user.last_login,
			version: detail.user.version,
			created_at: detail.user.created_at,
			roles: detail.roles,
			role_tier: deriveRoleTierFromRoles(
				detail.roles,
				detail.user.display_name,
			),
		};
	}, [allRows, deepLinkedUserQuery.data, userIdParam]);

	useEffect(() => {
		if (!userIdParam || !deepLinkedUser) return;
		setSearchQuery("");
		setTierFilter("all");
		setSelectedUser(deepLinkedUser);
	}, [deepLinkedUser, userIdParam]);

	const closeUserDrawer = () => {
		setSelectedUser(null);
		clearSearchParams(["userId"]);
	};

	const filteredRows = useMemo(() => {
		const trimmed = searchQuery.trim().toLowerCase();
		return allRows.filter((row) => {
			if (trimmed.length > 0) {
				const haystack = [row.email, row.display_name ?? ""]
					.join(" ")
					.toLowerCase();
				if (!haystack.includes(trimmed)) {
					return false;
				}
			}
			if (tierFilter !== "all") {
				if (inferTierFromRow(row) !== tierFilter) {
					return false;
				}
			}
			return true;
		});
	}, [allRows, searchQuery, tierFilter]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
								<UsersRound
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("User management")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t(
									"Browse tenant members, manage role memberships, and review permission history.",
								)}
							</p>
						</div>
						<Button type="button" onClick={() => setInviteOpen(true)}>
							<UserPlus aria-hidden="true" className="h-4 w-4" />
							{t("Invite user")}
						</Button>
					</div>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<CardTitle className="flex items-center gap-2">
							<UsersRound aria-hidden="true" className="h-5 w-5" />
							{t("Tenant users")}
							<Badge variant="secondary">{total}</Badge>
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
									onChange={(event) => setSearchQuery(event.target.value)}
									placeholder={t("Search email or display name")}
									className="pl-9"
									data-testid="admin-users-search"
								/>
							</div>
							<div className="flex flex-wrap items-center gap-1">
								<Filter
									aria-hidden="true"
									className="h-4 w-4"
									style={mutedTextStyle}
								/>
								{TIER_FILTERS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setTierFilter(option.value)}
										className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
										style={
											tierFilter === option.value
												? {
														backgroundColor: "var(--surface-accent-strong)",
														borderColor: "var(--color-primary-500)",
														color: "var(--color-foreground)",
													}
												: {
														backgroundColor: "var(--field-surface)",
														borderColor: "var(--field-border)",
														color: "var(--surface-muted-text)",
													}
										}
										aria-pressed={tierFilter === option.value}
									>
										{t(option.labelKey)}
									</button>
								))}
							</div>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					{usersQuery.isLoading ? (
						<div
							className="flex items-center gap-2 text-sm"
							style={mutedTextStyle}
						>
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading users")}
						</div>
					) : usersQuery.isError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load users")}
							description={
								usersQuery.error instanceof Error
									? usersQuery.error.message
									: t("Unknown error")
							}
							action={{
								label: t("Retry"),
								onClick: () => usersQuery.refetch(),
							}}
						/>
					) : filteredRows.length === 0 ? (
						<EmptyState
							variant="search"
							title={t("No users match your filters")}
							description={t(
								"Try clearing the search box or selecting a different tier.",
							)}
						/>
					) : (
						<motion.ul
							className="space-y-2"
							variants={listVariants}
							initial="hidden"
							animate="visible"
							data-testid="admin-users-list"
						>
							{filteredRows.map((row) => {
								const tier = inferTierFromRow(row);
								return (
									<motion.li key={row.id} variants={rowVariants}>
										<button
											type="button"
											onClick={() => setSelectedUser(row)}
											className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors hover:border-current"
											style={surfaceStyle}
											data-testid="admin-users-row"
										>
											<div
												className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
												style={{
													backgroundColor: "var(--surface-accent-strong)",
													color: "var(--color-foreground)",
												}}
											>
												{(row.display_name ?? row.email)
													.slice(0, 1)
													.toUpperCase()}
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<p
														className="truncate text-sm font-semibold"
														style={headingStyle}
													>
														{row.display_name ?? row.email}
													</p>
													<Badge variant="secondary">
														{t(roleTierLabelKey(tier))}
													</Badge>
													{row.is_active ? (
														<Badge variant="success">
															<CheckCircle2
																aria-hidden="true"
																className="mr-1 h-3 w-3"
															/>
															{t("Active")}
														</Badge>
													) : (
														<Badge variant="outline">
															<XCircle
																aria-hidden="true"
																className="mr-1 h-3 w-3"
															/>
															{t("Disabled")}
														</Badge>
													)}
												</div>
												<p
													className="mt-1 truncate text-xs"
													style={mutedTextStyle}
												>
													{row.email}
													{row.last_login
														? ` · ${t("Last login")} ${formatDateTime(
																locale,
																row.last_login,
																{
																	year: "numeric",
																	month: "2-digit",
																	day: "2-digit",
																},
															)}`
														: ` · ${t("Never logged in")}`}
												</p>
											</div>
										</button>
									</motion.li>
								);
							})}
						</motion.ul>
					)}

					{filteredRows.length > 0 ? (
						<div
							className="flex items-center justify-between pt-2 text-xs"
							style={mutedTextStyle}
						>
							<p>
								{t("Page")} {page + 1} / {totalPages} · {t("Showing")}{" "}
								{filteredRows.length}
							</p>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => setPage((value) => Math.max(0, value - 1))}
									disabled={page === 0 || usersQuery.isFetching}
								>
									{t("Previous")}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() =>
										setPage((value) => Math.min(totalPages - 1, value + 1))
									}
									disabled={page >= totalPages - 1 || usersQuery.isFetching}
								>
									{t("Next")}
								</Button>
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>

			<UserDetailDrawer
				open={selectedUser !== null}
				user={selectedUser}
				onClose={closeUserDrawer}
			/>

			<InviteUserModal
				isOpen={inviteOpen}
				onClose={() => setInviteOpen(false)}
			/>
		</div>
	);
}
