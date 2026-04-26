"use client";

/**
 * Right-slide drawer surfacing the full record of a tenant user.
 *
 * Four tabs:
 *   - 概览 (Overview)        — profile metadata + role tier
 *   - 角色管理 (Roles)       — toggle role memberships via versioned PATCH
 *   - Session                — placeholder (backend endpoint not yet exposed)
 *   - 操作 (Activity)        — `/users/:id/permissions/audit` audit history
 *
 * The roles tab also drives the "tier 升降" workflow: tier-style roles
 * (basic_user / verified_user / premium_user) are mutually exclusive — picking
 * one stages the others for removal in the same PATCH so the backend stays
 * consistent.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	type AdminUserRow,
	deriveRoleTierFromRoles,
	useAdminUserDetail,
	useUpdateUserRoles,
	useUserPermissionAudits,
} from "@/hooks/use-admin-users";
import { ApiClientError } from "@/lib/api";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import {
	type RoleTier,
	roleTierLabelKey,
} from "@/lib/authz";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	ClipboardList,
	History,
	KeyRound,
	Loader2,
	ShieldCheck,
	UserCog,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PANEL_VARIANTS = {
	hidden: { x: "100%", opacity: 0.6 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 },
	},
	exit: {
		x: "100%",
		opacity: 0.6,
		transition: { duration: 0.2 },
	},
} as const;

const TIER_ROLES: readonly RoleTier[] = [
	"basic_user",
	"verified_user",
	"premium_user",
];

const FUNCTIONAL_ROLES: readonly string[] = [
	"tenant_admin",
	"super_admin",
	"editor",
	"reviewer",
	"analyst",
	"auditor",
];

type DrawerTab = "overview" | "roles" | "session" | "activity";

interface UserDetailDrawerProps {
	open: boolean;
	user: AdminUserRow | null;
	onClose: () => void;
}

export function UserDetailDrawer({
	open,
	user,
	onClose,
}: UserDetailDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();

	const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
	const [pendingRoles, setPendingRoles] = useState<Set<string>>(new Set());

	const detailQuery = useAdminUserDetail(user?.id ?? null);
	const auditQuery = useUserPermissionAudits(user?.id ?? null);
	const updateRoles = useUpdateUserRoles();

	useEffect(() => {
		if (open && user) {
			setActiveTab("overview");
		}
	}, [open, user]);

	useEffect(() => {
		if (detailQuery.data?.roles) {
			setPendingRoles(new Set(detailQuery.data.roles));
		}
	}, [detailQuery.data?.roles]);

	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	const detail = detailQuery.data;
	const currentRoles = useMemo(
		() => new Set(detail?.roles ?? []),
		[detail?.roles],
	);

	const currentTier = useMemo(() => {
		const roles = Array.from(pendingRoles);
		return deriveRoleTierFromRoles(roles, user?.display_name ?? null);
	}, [pendingRoles, user?.display_name]);

	const dirty = useMemo(() => {
		if (!detail) return false;
		if (currentRoles.size !== pendingRoles.size) return true;
		for (const role of pendingRoles) {
			if (!currentRoles.has(role)) return true;
		}
		return false;
	}, [currentRoles, detail, pendingRoles]);

	const toggleRole = (role: string) => {
		setPendingRoles((prev) => {
			const next = new Set(prev);
			if (next.has(role)) {
				next.delete(role);
			} else {
				next.add(role);
			}
			return next;
		});
	};

	const setTier = (tier: RoleTier) => {
		setPendingRoles((prev) => {
			const next = new Set(prev);
			for (const candidate of TIER_ROLES) {
				next.delete(candidate);
			}
			if (TIER_ROLES.includes(tier)) {
				next.add(tier);
			}
			return next;
		});
	};

	const handleSave = () => {
		if (!user || !detail) return;
		const addRoles: string[] = [];
		const removeRoles: string[] = [];
		for (const role of pendingRoles) {
			if (!currentRoles.has(role)) addRoles.push(role);
		}
		for (const role of currentRoles) {
			if (!pendingRoles.has(role)) removeRoles.push(role);
		}
		if (addRoles.length === 0 && removeRoles.length === 0) {
			return;
		}
		updateRoles.mutate(
			{
				userId: user.id,
				version: user.version,
				addRoles,
				removeRoles,
			},
			{
				onSuccess: () => {
					success(
						t("Roles updated"),
						t("User role membership has been saved."),
					);
				},
				onError: (cause) => {
					if (cause instanceof ApiClientError && cause.status === 412) {
						error(
							t("Version conflict"),
							t(
								"This user was updated by someone else. Refresh and try again.",
							),
						);
						return;
					}
					error(
						t("Save failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	return (
		<AnimatePresence>
			{open && user ? (
				<div className="fixed inset-0 z-50 flex">
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.aside
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-l shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						role="dialog"
						aria-label={t("User detail")}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="min-w-0">
								<p
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{t("Tenant user")}
								</p>
								<h2
									className="mt-1 truncate text-lg font-semibold"
									style={headingStyle}
								>
									{user.display_name ?? user.email}
								</h2>
								<div className="mt-2 flex flex-wrap gap-2">
									<Badge variant="outline">{user.email}</Badge>
									<Badge
										variant={user.is_active ? "success" : "secondary"}
									>
										{user.is_active ? t("Active") : t("Disabled")}
									</Badge>
									<Badge variant="secondary">
										{t(roleTierLabelKey(currentTier))}
									</Badge>
								</div>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="flex h-9 w-9 items-center justify-center rounded-full border"
								style={fieldStyle}
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</header>

						<nav
							className="flex gap-1 border-b px-2 py-1"
							style={{ borderColor: "var(--surface-muted-border)" }}
							aria-label={t("Detail tabs")}
						>
							<TabButton
								active={activeTab === "overview"}
								onClick={() => setActiveTab("overview")}
								label={t("Overview")}
								icon={<UserCog aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "roles"}
								onClick={() => setActiveTab("roles")}
								label={t("Role management")}
								icon={
									<ShieldCheck aria-hidden="true" className="h-4 w-4" />
								}
							/>
							<TabButton
								active={activeTab === "session"}
								onClick={() => setActiveTab("session")}
								label={t("Sessions")}
								icon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "activity"}
								onClick={() => setActiveTab("activity")}
								label={t("Activity")}
								icon={<History aria-hidden="true" className="h-4 w-4" />}
							/>
						</nav>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							{activeTab === "overview" ? (
								<OverviewTab
									user={user}
									roles={detail?.roles ?? []}
									permissions={detail?.permissions ?? []}
									loading={detailQuery.isLoading}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}

							{activeTab === "roles" ? (
								<RolesTab
									pendingRoles={pendingRoles}
									currentTier={currentTier}
									onToggleRole={toggleRole}
									onSetTier={setTier}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}

							{activeTab === "session" ? (
								<SessionTab
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}

							{activeTab === "activity" ? (
								<ActivityTab
									entries={auditQuery.data ?? []}
									loading={auditQuery.isLoading}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}
						</div>

						{activeTab === "roles" ? (
							<footer
								className="flex items-center justify-between gap-3 border-t px-6 py-3"
								style={{ borderColor: "var(--surface-muted-border)" }}
							>
								<p className="text-xs" style={mutedStyle}>
									{dirty
										? t("You have unsaved role changes.")
										: t("No pending changes.")}
								</p>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() =>
											setPendingRoles(new Set(detail?.roles ?? []))
										}
										disabled={!dirty || updateRoles.isPending}
									>
										{t("Reset")}
									</Button>
									<Button
										type="button"
										size="sm"
										onClick={handleSave}
										disabled={!dirty || updateRoles.isPending}
									>
										{updateRoles.isPending ? (
											<Loader2
												aria-hidden="true"
												className="h-4 w-4 animate-spin"
											/>
										) : (
											<ShieldCheck
												aria-hidden="true"
												className="h-4 w-4"
											/>
										)}
										{t("Save roles")}
									</Button>
								</div>
							</footer>
						) : null}
					</motion.aside>
				</div>
			) : null}
		</AnimatePresence>
	);
}

function TabButton({
	active,
	onClick,
	label,
	icon,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
			style={
				active
					? {
							backgroundColor: "var(--surface-accent-strong)",
							color: "var(--color-foreground)",
						}
					: { color: "var(--surface-muted-text)" }
			}
			aria-pressed={active}
		>
			{icon}
			{label}
		</button>
	);
}

interface OverviewTabProps {
	user: AdminUserRow;
	roles: string[];
	permissions: string[];
	loading: boolean;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function OverviewTab({
	user,
	roles,
	permissions,
	loading,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: OverviewTabProps) {
	return (
		<div className="space-y-5">
			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="user-overview-profile"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Profile")}
				</h3>
				<dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
					<OverviewField
						label={t("Email")}
						value={user.email}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Display name")}
						value={user.display_name ?? "—"}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Email verified")}
						value={
							user.email_verified_at
								? formatDateTime(locale, user.email_verified_at, {
										year: "numeric",
										month: "2-digit",
										day: "2-digit",
									})
								: t("Not verified")
						}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Last login")}
						value={
							user.last_login
								? formatDateTime(locale, user.last_login, {
										year: "numeric",
										month: "2-digit",
										day: "2-digit",
									})
								: t("Never")
						}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Created")}
						value={formatDateTime(locale, user.created_at, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
						})}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Version")}
						value={String(user.version)}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
				</dl>
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="user-overview-roles"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Roles")}
				</h3>
				{loading ? (
					<p className="mt-2 text-sm" style={mutedStyle}>
						{t("Loading")}
					</p>
				) : roles.length === 0 ? (
					<p className="mt-2 text-sm" style={mutedStyle}>
						{t("No roles assigned.")}
					</p>
				) : (
					<div className="mt-2 flex flex-wrap gap-2">
						{roles.map((role) => (
							<Badge key={role} variant="secondary">
								{role}
							</Badge>
						))}
					</div>
				)}
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="user-overview-permissions"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Effective permissions")}
				</h3>
				{loading ? (
					<p className="mt-2 text-sm" style={mutedStyle}>
						{t("Loading")}
					</p>
				) : permissions.length === 0 ? (
					<p className="mt-2 text-sm" style={mutedStyle}>
						{t("No permissions resolved for this user.")}
					</p>
				) : (
					<div className="mt-2 flex flex-wrap gap-2">
						{permissions.map((permission) => (
							<Badge key={permission} variant="outline">
								{permission}
							</Badge>
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function OverviewField({
	label,
	value,
	headingStyle,
	mutedStyle,
}: {
	label: string;
	value: string;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
}) {
	return (
		<div>
			<p
				className="text-xs uppercase tracking-wide"
				style={mutedStyle}
			>
				{label}
			</p>
			<p className="mt-1 truncate text-sm" style={headingStyle}>
				{value}
			</p>
		</div>
	);
}

interface RolesTabProps {
	pendingRoles: Set<string>;
	currentTier: RoleTier;
	onToggleRole: (role: string) => void;
	onSetTier: (tier: RoleTier) => void;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function RolesTab({
	pendingRoles,
	currentTier,
	onToggleRole,
	onSetTier,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: RolesTabProps) {
	return (
		<div className="space-y-5">
			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="user-tier-selector"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3
							className="text-sm font-semibold"
							style={headingStyle}
						>
							{t("Tier")}
						</h3>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{t(
								"Tier roles are mutually exclusive. Selecting one removes the others.",
							)}
						</p>
					</div>
					<Badge variant="secondary">
						{t(roleTierLabelKey(currentTier))}
					</Badge>
				</div>
				<div className="mt-3 grid gap-2 md:grid-cols-3">
					{TIER_ROLES.map((tier) => {
						const active = pendingRoles.has(tier);
						return (
							<button
								key={tier}
								type="button"
								onClick={() => onSetTier(tier)}
								className="rounded-2xl border px-3 py-2 text-left text-sm transition-colors"
								style={
									active
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
								aria-pressed={active}
							>
								<span className="font-medium">
									{t(roleTierLabelKey(tier))}
								</span>
							</button>
						);
					})}
				</div>
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="user-functional-roles"
			>
				<h3
					className="text-sm font-semibold"
					style={headingStyle}
				>
					{t("Functional roles")}
				</h3>
				<p className="mt-1 text-xs" style={mutedStyle}>
					{t(
						"Functional roles grant capabilities (admin, editor, reviewer) on top of the user tier.",
					)}
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					{FUNCTIONAL_ROLES.map((role) => {
						const active = pendingRoles.has(role);
						return (
							<button
								key={role}
								type="button"
								onClick={() => onToggleRole(role)}
								className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
								style={
									active
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
								aria-pressed={active}
							>
								{role}
							</button>
						);
					})}
				</div>
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="user-pending-roles"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Pending roles after save")}
				</h3>
				<div className="mt-2 flex flex-wrap gap-2">
					{pendingRoles.size === 0 ? (
						<p className="text-sm" style={mutedStyle}>
							{t("No roles selected.")}
						</p>
					) : (
						Array.from(pendingRoles)
							.sort()
							.map((role) => (
								<Badge key={role} variant="outline">
									{role}
								</Badge>
							))
					)}
				</div>
			</section>
		</div>
	);
}

interface SessionTabProps {
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function SessionTab({
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: SessionTabProps) {
	return (
		<div className="space-y-3">
			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="user-sessions-placeholder"
			>
				<div className="flex items-start gap-3">
					<KeyRound
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div>
						<h3
							className="text-sm font-semibold"
							style={headingStyle}
						>
							{t("Per-user session listing")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{t(
								"This capability is not yet available on the backend. Once exposed it will surface active sessions, last seen IP, and a remote sign-out action here.",
							)}
						</p>
					</div>
				</div>
			</section>
		</div>
	);
}

interface ActivityTabProps {
	entries: Array<{
		id: string;
		actor_id: string | null;
		action: string;
		resource: string;
		resource_id: string | null;
		occurred_at: string;
		metadata: Record<string, unknown> | null;
	}>;
	loading: boolean;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function ActivityTab({
	entries,
	loading,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: ActivityTabProps) {
	if (loading) {
		return (
			<p className="text-sm" style={mutedStyle}>
				{t("Loading audit history")}
			</p>
		);
	}

	if (entries.length === 0) {
		return (
			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="user-activity-empty"
			>
				<div className="flex items-start gap-3">
					<ClipboardList
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div>
						<h3
							className="text-sm font-semibold"
							style={headingStyle}
						>
							{t("No permission changes recorded")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{t(
								"Audit entries will appear here whenever an admin updates this user's roles or capabilities.",
							)}
						</p>
					</div>
				</div>
			</section>
		);
	}

	return (
		<ul className="space-y-2" data-testid="user-activity-list">
			{entries.map((entry) => (
				<li
					key={entry.id}
					className="rounded-2xl border px-3 py-2"
					style={surfaceStyle}
				>
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm font-medium" style={headingStyle}>
							{entry.action}
						</p>
						<Badge variant="outline">{entry.resource}</Badge>
					</div>
					<p className="mt-1 text-xs" style={mutedStyle}>
						{formatDateTime(locale, entry.occurred_at, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
						})}
						{entry.actor_id ? ` · ${t("Actor")} ${entry.actor_id}` : ""}
					</p>
				</li>
			))}
		</ul>
	);
}
